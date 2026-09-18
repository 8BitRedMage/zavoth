// Pure helpers behind the footprint lookup. No I/O, so they are unit-tested
// with fixtures (see parsing.test.ts).

//#region Names and slugs

const COMPANY_SUFFIXES = new Set([
  "the",
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "co",
  "company",
  "ltd",
  "limited",
  "llc",
  "lp",
  "plc",
  "sa",
  "nv",
  "ag",
  "se",
  "holdings",
  "holding",
  "group",
  "com",
]);

/** "Acme Holdings, Inc." -> "acme", so legal-name noise never blocks a match. */
export function normalizeCompanyName(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/&/g, " and ")
    // SEC appends share classes and states: "Acme Corp /DE/", "Acme Inc Class A".
    .replace(/\/[a-z]{2,3}\/?/g, " ")
    .replace(/\bclass [a-c]\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const kept = words.filter((word) => !COMPANY_SUFFIXES.has(word));
  // A company literally called "The Group" should not normalize to nothing.
  return (kept.length > 0 ? kept : words).join(" ");
}

const SECOND_LEVEL_TLDS = new Set(["co", "com", "org", "net", "gov", "ac"]);

/** "jobs.acme.co.uk" -> "acme": the label a company registered. */
export function registrableLabel(domain: string): string {
  const labels = domain.toLowerCase().split(".").filter(Boolean);
  if (labels.length <= 1) return labels[0] ?? "";
  const last = labels[labels.length - 1];
  const secondLast = labels[labels.length - 2];
  const usesSecondLevelTld =
    labels.length >= 3 &&
    last.length === 2 &&
    SECOND_LEVEL_TLDS.has(secondLast);
  return labels[labels.length - (usesSecondLevelTld ? 3 : 2)];
}

/**
 * Job boards live at `boards.greenhouse.io/<slug>` and the like, where the
 * slug is almost always the domain label or the squashed company name.
 */
export function atsSlugCandidates(domain: string, name: string): string[] {
  const words = normalizeCompanyName(name).split(" ").filter(Boolean);
  const candidates = [
    registrableLabel(domain),
    words.join(""),
    words.join("-"),
    words[0],
  ];
  return [
    ...new Set(
      candidates.filter(
        (slug): slug is string => !!slug && /^[a-z0-9-]{2,60}$/.test(slug),
      ),
    ),
  ].slice(0, 4);
}

/** Whether a job board's self-reported name plausibly is this company. */
export function namesMatch(a: string, b: string): boolean {
  const left = normalizeCompanyName(a).replace(/ /g, "");
  const right = normalizeCompanyName(b).replace(/ /g, "");
  if (!left || !right) return false;
  return left === right || left.startsWith(right) || right.startsWith(left);
}

//#endregion

//#region SEC tickers

export type SecCompany = {
  cik: number;
  name: string;
  ticker: string;
  exchange: string | null;
};

export type TickerCandidate = {
  ticker: string;
  exchange: string | null;
  /** The registrant's name as filed with the SEC. */
  secName: string;
  /** True when the normalized names are identical, not merely similar. */
  exact: boolean;
};

/**
 * Finds the listed companies that could be `names` (the display name plus
 * aliases). Exact matches win outright; otherwise "Acme" also offers
 * "Acme Robotics" as a weaker candidate for the user to confirm or reject.
 */
export function matchTickers(
  companies: SecCompany[],
  names: string[],
  limit = 3,
): TickerCandidate[] {
  const targets = [
    ...new Set(names.map(normalizeCompanyName).filter((n) => n.length >= 2)),
  ];
  if (targets.length === 0) return [];

  const exact: SecCompany[] = [];
  const loose: SecCompany[] = [];
  for (const company of companies) {
    const normalized = normalizeCompanyName(company.name);
    if (targets.includes(normalized)) {
      exact.push(company);
    } else if (
      targets.some((t) => t.length >= 4 && normalized.startsWith(`${t} `))
    ) {
      loose.push(company);
    }
  }

  // One registrant can list several share classes (GOOG, GOOGL): keep the
  // first, which the SEC orders by market cap.
  const seenCiks = new Set<number>();
  const pick = (list: SecCompany[], isExact: boolean) =>
    list
      .filter((company) => {
        if (seenCiks.has(company.cik)) return false;
        seenCiks.add(company.cik);
        return true;
      })
      .map((company) => ({
        ticker: company.ticker,
        exchange: company.exchange,
        secName: company.name,
        exact: isExact,
      }));

  const matches = pick(exact, true);
  return (matches.length > 0 ? matches : pick(loose, false)).slice(0, limit);
}

//#endregion

//#region robots.txt

export type RobotsRules = {
  allow: string[];
  disallow: string[];
  sitemaps: string[];
};

/**
 * Reads the rules that apply to `userAgentToken`, falling back to the `*`
 * group. `Sitemap:` lines are global, so they are collected from everywhere.
 */
export function parseRobots(text: string, userAgentToken: string): RobotsRules {
  const token = userAgentToken.toLowerCase();
  const groups = new Map<string, { allow: string[]; disallow: string[] }>();
  const sitemaps: string[] = [];

  let agents: string[] = [];
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "sitemap") {
      if (value) sitemaps.push(value);
    } else if (field === "user-agent") {
      // Consecutive User-agent lines share the rules that follow them.
      if (!lastWasAgent) agents = [];
      agents.push(value.toLowerCase());
      for (const agent of agents) {
        if (!groups.has(agent)) groups.set(agent, { allow: [], disallow: [] });
      }
      lastWasAgent = true;
      continue;
    } else if (field === "allow" || field === "disallow") {
      // An empty Disallow means "nothing is disallowed".
      if (value) {
        for (const agent of agents) groups.get(agent)?.[field].push(value);
      }
    }
    lastWasAgent = false;
  }

  const specific = [...groups.entries()].find(
    ([agent]) => agent !== "*" && token.includes(agent),
  )?.[1];
  const rules = specific ?? groups.get("*") ?? { allow: [], disallow: [] };
  return { ...rules, sitemaps };
}

function robotsPatternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/** Longest matching rule wins; Allow wins a tie (Google's documented rule). */
export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  const longestMatch = (patterns: string[]) =>
    Math.max(
      -1,
      ...patterns
        .filter((pattern) => robotsPatternToRegExp(pattern).test(path))
        .map((pattern) => pattern.length),
    );
  return longestMatch(rules.allow) >= longestMatch(rules.disallow);
}

//#endregion

//#region Sitemaps

export function parseSitemap(xml: string): {
  isIndex: boolean;
  locs: string[];
} {
  const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^<\]]+)/gi)].map(
    (match) => match[1].trim().replace(/&amp;/g, "&"),
  );
  return { isIndex: /<sitemapindex[\s>]/i.test(xml), locs };
}

export const KEY_PAGE_KINDS = [
  "careers",
  "pricing",
  "blog",
  "news",
  "changelog",
  "customers",
] as const;
export type KeyPageKind = (typeof KEY_PAGE_KINDS)[number];
export type KeyPages = Partial<Record<KeyPageKind, string>>;

const KEY_PAGE_PATTERNS: Record<KeyPageKind, RegExp> = {
  careers:
    /^\/(?:company\/|about\/)?(?:careers?|jobs|join-us|work-with-us)\/?$/,
  pricing: /^\/(?:pricing|plans)\/?$/,
  blog: /^\/blog\/?$/,
  news: /^\/(?:company\/|about\/)?(?:news|newsroom|press|media)\/?$/,
  changelog: /^\/(?:changelog|release-notes|releases|whats-new)\/?$/,
  customers: /^\/(?:customers|case-studies)\/?$/,
};

/**
 * Picks the landing page for each kind out of a sitemap, ignoring other
 * hosts and locale copies (`/de/pricing` loses to `/pricing`).
 */
export function pickKeyPages(urls: string[], domain: string): KeyPages {
  const pages: KeyPages = {};
  for (const raw of urls) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    const host = url.hostname.replace(/^www\./, "");
    if (url.protocol !== "https:" || host !== domain) continue;

    for (const kind of KEY_PAGE_KINDS) {
      if (!pages[kind] && KEY_PAGE_PATTERNS[kind].test(url.pathname)) {
        pages[kind] = url.href;
      }
    }
  }
  return pages;
}

//#endregion
