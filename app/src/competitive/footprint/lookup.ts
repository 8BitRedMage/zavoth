import {
  atsSlugCandidates,
  isPathAllowed,
  matchTickers,
  namesMatch,
  normalizeCompanyName,
  parseRobots,
  parseSitemap,
  pickKeyPages,
  type KeyPages,
  type SecCompany,
  type TickerCandidate,
} from "./parsing";
import { safeFetchText } from "./safeFetch";

// Looks up a company's public footprint from the sources the scraping policy
// allows: SEC EDGAR, public ATS job-board APIs, the Reddit API, and the
// company's own robots.txt + sitemap. It only reports findings; saving them
// is a separate, explicit step (see ./operations.ts).

const BOT_TOKEN = "ZavothBot";
const API_TIMEOUT_MS = 8_000;

/** Operator settings, passed in so this module never reads the env itself. */
export type FootprintConfig = {
  contactEmail?: string;
  redditClientId?: string;
  redditClientSecret?: string;
};

function userAgentFor({ contactEmail }: FootprintConfig): string {
  return `${BOT_TOKEN}/1.0 (competitive intelligence${
    contactEmail ? `; ${contactEmail}` : ""
  })`;
}

export type SourceStatus =
  | "found"
  | "not_found"
  // Missing credentials on our side; an operator has to fix it.
  | "not_configured"
  // The source errored, timed out or (for websites) opted out via robots.txt.
  | "unavailable";

export type AtsProvider = "greenhouse" | "lever" | "ashby" | "workable";

export type FootprintFindings = {
  lookedUpAt: Date;
  stock: {
    status: SourceStatus;
    detail?: string;
    /** Best first. More than one, or `exact: false`, needs the user's pick. */
    candidates: TickerCandidate[];
  };
  hiring: {
    status: SourceStatus;
    detail?: string;
    provider?: AtsProvider | "unknown";
    slug?: string;
    careersUrl?: string;
    openRoles?: number;
    /** False when the board was matched by slug alone, not by its name. */
    nameVerified?: boolean;
  };
  communities: {
    status: SourceStatus;
    detail?: string;
    subreddits: { name: string; subscribers: number; title: string }[];
  };
  website: {
    status: SourceStatus;
    detail?: string;
    sitemapUrl?: string;
    /** Pages read from the sitemap; a floor when the sitemap is huge. */
    pageCount?: number;
    keyPages: KeyPages;
  };
};

export type FootprintSubject = {
  name: string;
  domain: string;
  aliases: string[];
};

export async function lookUpFootprint(
  subject: FootprintSubject,
  config: FootprintConfig,
): Promise<FootprintFindings> {
  const userAgent = userAgentFor(config);
  const getJson = jsonClient(userAgent);
  const guard = async <T extends { status: SourceStatus; detail?: string }>(
    run: () => Promise<T>,
    empty: Omit<T, "status" | "detail">,
  ): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      console.warn(`Footprint source failed for ${subject.domain}:`, error);
      return {
        ...empty,
        status: "unavailable",
        detail: "The source could not be reached.",
      } as T;
    }
  };

  const [stock, atsHiring, communities, website] = await Promise.all([
    guard(() => lookUpStock(subject, config, getJson), { candidates: [] }),
    guard(() => lookUpAts(subject, getJson), {}),
    guard(() => lookUpSubreddits(subject, config, getJson), { subreddits: [] }),
    guard(() => lookUpWebsite(subject, userAgent), { keyPages: {} }),
  ]);

  // No hosted job board, but the sitemap names a careers page: still useful
  // as a link, even though there is no API behind it to collect from.
  const hiring: FootprintFindings["hiring"] =
    atsHiring.status !== "found" && website.keyPages.careers
      ? {
          status: "found",
          provider: "unknown",
          careersUrl: website.keyPages.careers,
          detail:
            "Found a careers page but no supported job board, so open roles cannot be counted automatically.",
        }
      : atsHiring;

  return { lookedUpAt: new Date(), stock, hiring, communities, website };
}

type GetJson = (
  url: string,
  init?: RequestInit,
) => Promise<{ status: number; json: unknown }>;

/** A JSON GET/POST bound to our User-Agent; non-2xx yields `json: null`. */
function jsonClient(userAgent: string): GetJson {
  return async (url, init = {}) => {
    const response = await fetch(url, {
      ...init,
      headers: {
        "user-agent": userAgent,
        accept: "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { status: response.status, json: null };
    }
    return { status: response.status, json: await response.json() };
  };
}

//#region Stock: SEC EDGAR

const SEC_TICKERS_URL =
  "https://www.sec.gov/files/company_tickers_exchange.json";
const SEC_CACHE_MS = 24 * 60 * 60 * 1000;
let secCache: { at: number; companies: SecCompany[] } | undefined;

async function loadSecCompanies(getJson: GetJson): Promise<SecCompany[]> {
  if (secCache && Date.now() - secCache.at < SEC_CACHE_MS) {
    return secCache.companies;
  }
  const { status, json } = await getJson(SEC_TICKERS_URL);
  const table = json as { fields?: string[]; data?: unknown[][] } | null;
  if (!table?.fields || !table.data) {
    throw new Error(`SEC ticker list returned ${status}`);
  }

  const column = (field: string) => table.fields!.indexOf(field);
  const [cik, name, ticker, exchange] = [
    "cik",
    "name",
    "ticker",
    "exchange",
  ].map(column);
  const companies = table.data.flatMap((row): SecCompany[] =>
    typeof row[name] === "string" && typeof row[ticker] === "string"
      ? [
          {
            cik: Number(row[cik]),
            name: row[name],
            ticker: row[ticker],
            exchange: typeof row[exchange] === "string" ? row[exchange] : null,
          },
        ]
      : [],
  );
  secCache = { at: Date.now(), companies };
  return companies;
}

async function lookUpStock(
  { name, aliases }: FootprintSubject,
  config: FootprintConfig,
  getJson: GetJson,
): Promise<FootprintFindings["stock"]> {
  if (!config.contactEmail) {
    return {
      status: "not_configured",
      detail:
        "Stock lookup needs COLLECTOR_CONTACT_EMAIL to be set on the server.",
      candidates: [],
    };
  }
  const candidates = matchTickers(await loadSecCompanies(getJson), [
    name,
    ...aliases,
  ]);
  return candidates.length > 0
    ? { status: "found", candidates }
    : {
        status: "not_found",
        detail:
          "No US-listed company by that name. It may be private or listed abroad.",
        candidates,
      };
}

//#endregion

//#region Hiring: public ATS job-board APIs

type AtsProbe = { openRoles: number; boardName?: string } | null;

const ATS_BOARDS: {
  provider: AtsProvider;
  careersUrl: (slug: string) => string;
  probe: (slug: string, getJson: GetJson) => Promise<AtsProbe>;
}[] = [
  {
    provider: "greenhouse",
    careersUrl: (slug) => `https://boards.greenhouse.io/${slug}`,
    probe: async (slug, getJson) => {
      const base = `https://boards-api.greenhouse.io/v1/boards/${slug}`;
      const [board, jobs] = await Promise.all([
        getJson(base),
        getJson(`${base}/jobs`),
      ]);
      if (!jobs.json) return null;
      const { meta, jobs: list } = jobs.json as {
        meta?: { total?: number };
        jobs?: unknown[];
      };
      return {
        openRoles: meta?.total ?? list?.length ?? 0,
        boardName: (board.json as { name?: string } | null)?.name,
      };
    },
  },
  {
    provider: "lever",
    careersUrl: (slug) => `https://jobs.lever.co/${slug}`,
    probe: async (slug, getJson) => {
      const { json } = await getJson(
        `https://api.lever.co/v0/postings/${slug}?mode=json`,
      );
      return Array.isArray(json) ? { openRoles: json.length } : null;
    },
  },
  {
    provider: "ashby",
    careersUrl: (slug) => `https://jobs.ashbyhq.com/${slug}`,
    probe: async (slug, getJson) => {
      const { json } = await getJson(
        `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
      );
      const jobs = (json as { jobs?: unknown[] } | null)?.jobs;
      return Array.isArray(jobs) ? { openRoles: jobs.length } : null;
    },
  },
  {
    provider: "workable",
    careersUrl: (slug) => `https://apply.workable.com/${slug}`,
    probe: async (slug, getJson) => {
      const { json } = await getJson(
        `https://apply.workable.com/api/v1/widget/accounts/${slug}`,
      );
      const account = json as { name?: string; jobs?: unknown[] } | null;
      return Array.isArray(account?.jobs)
        ? { openRoles: account.jobs.length, boardName: account.name }
        : null;
    },
  },
];

async function lookUpAts(
  { name, domain }: FootprintSubject,
  getJson: GetJson,
): Promise<FootprintFindings["hiring"]> {
  const slugs = atsSlugCandidates(domain, name);
  const probes = await Promise.all(
    ATS_BOARDS.flatMap((board) =>
      slugs.map(async (slug) => {
        const result = await board.probe(slug, getJson).catch(() => null);
        return result && { board, slug, ...result };
      }),
    ),
  );

  const hits = probes
    .filter((hit) => hit !== null)
    // A board whose own name says it is someone else is a slug collision.
    .filter((hit) => !hit.boardName || namesMatch(hit.boardName, name))
    // Boards with postings first: an empty one is usually abandoned, or a
    // namesake's, even when its name matches. Then name-verified, then size.
    .sort(
      (a, b) =>
        Number(b.openRoles > 0) - Number(a.openRoles > 0) ||
        Number(!!b.boardName) - Number(!!a.boardName) ||
        b.openRoles - a.openRoles,
    );

  const best = hits[0];
  if (!best) {
    return {
      status: "not_found",
      detail: "No Greenhouse, Lever, Ashby or Workable job board was found.",
    };
  }
  return {
    status: "found",
    provider: best.board.provider,
    slug: best.slug,
    careersUrl: best.board.careersUrl(best.slug),
    openRoles: best.openRoles,
    nameVerified: !!best.boardName,
  };
}

//#endregion

//#region Communities: Reddit API (app-only OAuth)

let redditToken: { value: string; expiresAt: number } | undefined;

async function getRedditToken(
  id: string,
  secret: string,
  getJson: GetJson,
): Promise<string> {
  if (redditToken && Date.now() < redditToken.expiresAt)
    return redditToken.value;

  const { status, json } = await getJson(
    "https://www.reddit.com/api/v1/access_token",
    {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString(
          "base64",
        )}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    },
  );
  const token = json as { access_token?: string; expires_in?: number } | null;
  if (!token?.access_token)
    throw new Error(`Reddit token request returned ${status}`);

  redditToken = {
    value: token.access_token,
    expiresAt: Date.now() + ((token.expires_in ?? 3600) - 60) * 1000,
  };
  return redditToken.value;
}

const MIN_SUBREDDIT_SUBSCRIBERS = 200;

async function lookUpSubreddits(
  { name }: FootprintSubject,
  config: FootprintConfig,
  getJson: GetJson,
): Promise<FootprintFindings["communities"]> {
  const { redditClientId: id, redditClientSecret: secret } = config;
  if (!id || !secret) {
    return {
      status: "not_configured",
      detail:
        "Subreddit lookup needs REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET to be set on the server.",
      subreddits: [],
    };
  }

  const token = await getRedditToken(id, secret, getJson);
  const { status, json } = await getJson(
    `https://oauth.reddit.com/subreddits/search?limit=25&include_over_18=false&q=${encodeURIComponent(
      name,
    )}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const listing = json as {
    data?: {
      children?: {
        data?: {
          display_name?: string;
          title?: string;
          subscribers?: number;
          over18?: boolean;
          subreddit_type?: string;
        };
      }[];
    };
  } | null;
  if (!listing?.data?.children)
    throw new Error(`Reddit search returned ${status}`);

  // Search is fuzzy ("Notion" also returns r/nationalism), so keep only
  // communities that actually carry the company's name.
  const target = normalizeCompanyName(name).replace(/ /g, "");
  const subreddits = listing.data.children
    .flatMap(({ data }) =>
      data?.display_name &&
      data.subreddit_type === "public" &&
      !data.over18 &&
      (data.subscribers ?? 0) >= MIN_SUBREDDIT_SUBSCRIBERS &&
      data.display_name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .includes(target)
        ? [
            {
              name: data.display_name,
              subscribers: data.subscribers ?? 0,
              title: data.title ?? "",
            },
          ]
        : [],
    )
    .sort((a, b) => b.subscribers - a.subscribers)
    .slice(0, 5);

  return subreddits.length > 0
    ? { status: "found", subreddits }
    : {
        status: "not_found",
        detail: "No subreddit is named after this company.",
        subreddits,
      };
}

//#endregion

//#region Website: robots.txt + sitemap

const MAX_CHILD_SITEMAPS = 3;
const MAX_SITEMAP_URLS = 20_000;
// For the whole website lookup, not per request: someone is waiting on the
// other end of a voice call.
const WEBSITE_BUDGET_MS = 9_000;

async function lookUpWebsite(
  { domain }: FootprintSubject,
  userAgent: string,
): Promise<FootprintFindings["website"]> {
  const deadline = Date.now() + WEBSITE_BUDGET_MS;
  const options = () => ({
    userAgent,
    timeoutMs: Math.max(1, deadline - Date.now()),
  });
  const origin = `https://${domain}`;

  const robotsResponse = await safeFetchText(`${origin}/robots.txt`, options());
  // No robots.txt means no restrictions. A 5xx is not permission, though.
  if (robotsResponse.status >= 500) {
    return {
      status: "unavailable",
      detail: "The site's robots.txt could not be read.",
      keyPages: {},
    };
  }
  const robots = parseRobots(robotsResponse.body, BOT_TOKEN);
  const mayFetch = (url: string) => {
    const { pathname, search } = new URL(url);
    return isPathAllowed(robots, pathname + search);
  };

  if (!mayFetch(`${origin}/`)) {
    return {
      status: "unavailable",
      detail:
        "The site's robots.txt asks crawlers to stay out, so website changes will need manual uploads.",
      keyPages: {},
    };
  }

  const sitemapUrls = (
    robots.sitemaps.length > 0 ? robots.sitemaps : [`${origin}/sitemap.xml`]
  ).filter((url) => !url.endsWith(".gz") && mayFetch(url));

  const pages: string[] = [];
  let sitemapUrl: string | undefined;
  const queue = sitemapUrls.slice(0, MAX_CHILD_SITEMAPS);
  let fetched = 0;
  while (
    queue.length > 0 &&
    fetched < MAX_CHILD_SITEMAPS + 1 &&
    pages.length < MAX_SITEMAP_URLS &&
    Date.now() < deadline
  ) {
    const url = queue.shift()!;
    fetched++;
    // Big sites split sitemaps into multi-megabyte partitions. The part that
    // fits is plenty for spotting landing pages.
    const response = await safeFetchText(url, {
      ...options(),
      truncate: true,
    }).catch(() => null);
    if (!response || response.status !== 200) continue;

    sitemapUrl ??= url;
    const { isIndex, locs } = parseSitemap(response.body);
    if (isIndex) {
      // Page sitemaps hold the landing pages; post/product ones are huge and
      // never contain them.
      const children = locs
        .filter((loc) => !loc.endsWith(".gz") && mayFetch(loc))
        .sort((a, b) => Number(/page/i.test(b)) - Number(/page/i.test(a)));
      queue.unshift(...children.slice(0, MAX_CHILD_SITEMAPS));
    } else {
      pages.push(...locs.slice(0, MAX_SITEMAP_URLS - pages.length));
    }
  }

  if (!sitemapUrl) {
    return {
      status: "not_found",
      detail:
        "The site has no readable sitemap, so website changes will need manual uploads.",
      keyPages: {},
    };
  }
  return {
    status: "found",
    sitemapUrl,
    pageCount: pages.length,
    keyPages: pickKeyPages(pages.filter(mayFetch), domain),
  };
}

//#endregion
