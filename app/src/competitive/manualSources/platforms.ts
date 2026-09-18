import { registrableLabel } from "../footprint/parsing";

// Platforms whose terms forbid automated access. Zavoth never requests
// anything from them: it builds a link, a person opens it in their own
// browser with their own login, and reports what they see. Everything here is
// pure (no I/O) and shared by the server, the UI and the voice tools.

export const MANUAL_PLATFORMS = [
  "linkedin",
  "g2",
  "glassdoor",
  "trustpilot",
  "crunchbase",
] as const;
export type ManualPlatform = (typeof MANUAL_PLATFORMS)[number];

export function isManualPlatform(value: string): value is ManualPlatform {
  return (MANUAL_PLATFORMS as readonly string[]).includes(value);
}

export type MetricKind =
  /** A whole number of things: followers, reviews, employees. */
  | "count"
  /** A score out of five. */
  | "rating"
  /** 0 to 100. */
  | "percent"
  /** US dollars. */
  | "usd"
  | "text";

export type ManualMetric = {
  key: string;
  label: string;
  /** How to ask a person for it, including where on the page it is. */
  ask: string;
  kind: MetricKind;
};

export type ManualValue = number | string;
export type ManualValues = { [key: string]: ManualValue };

type Subject = { name: string; domain: string };

type PlatformDefinition = {
  label: string;
  /** Which tracker signal this data feeds. Matches the Prisma `Signal` enum. */
  signal: "HIRING" | "SENTIMENT" | "NEWS";
  host: RegExp;
  /** The pathname of a company's page; group 1 is its handle, if it has one. */
  profilePath: RegExp;
  fromHandle?: (handle: string) => string;
  /** A likely profile URL. May be wrong, so it is always offered as a guess. */
  guess?: (subject: Subject) => string;
  search: (subject: Subject) => string;
  metrics: ManualMetric[];
};

const HANDLE = "([a-z0-9][a-z0-9._-]{0,99})";
const q = encodeURIComponent;

export const PLATFORM_DEFINITIONS: Record<ManualPlatform, PlatformDefinition> =
  {
    linkedin: {
      label: "LinkedIn",
      signal: "HIRING",
      host: /^(?:[a-z]{2,3}\.)?linkedin\.com$/,
      profilePath: new RegExp(`^/company/${HANDLE}(?:/.*)?$`, "i"),
      fromHandle: (handle) => `https://www.linkedin.com/company/${handle}/`,
      guess: ({ domain }) =>
        `https://www.linkedin.com/company/${registrableLabel(domain)}/`,
      search: ({ name }) =>
        `https://www.linkedin.com/search/results/companies/?keywords=${q(
          name,
        )}`,
      metrics: [
        {
          key: "followers",
          label: "Followers",
          ask: "How many followers does the page show, under the company name?",
          kind: "count",
        },
        {
          key: "employees",
          label: "Employees on LinkedIn",
          ask: "How many employees does it say are on LinkedIn?",
          kind: "count",
        },
        {
          key: "openJobs",
          label: "Open jobs",
          ask: "On the Jobs tab, how many open jobs are listed?",
          kind: "count",
        },
      ],
    },
    g2: {
      label: "G2",
      signal: "SENTIMENT",
      host: /^(?:www\.)?g2\.com$/,
      profilePath: new RegExp(`^/products/${HANDLE}(?:/.*)?$`, "i"),
      fromHandle: (handle) => `https://www.g2.com/products/${handle}/reviews`,
      guess: ({ domain }) =>
        `https://www.g2.com/products/${registrableLabel(domain)}/reviews`,
      search: ({ name }) => `https://www.g2.com/search?query=${q(name)}`,
      metrics: [
        {
          key: "rating",
          label: "Star rating",
          ask: "What is the star rating out of five?",
          kind: "rating",
        },
        {
          key: "reviewCount",
          label: "Reviews",
          ask: "How many reviews is that based on?",
          kind: "count",
        },
      ],
    },
    glassdoor: {
      label: "Glassdoor",
      signal: "HIRING",
      host: /^(?:www\.)?glassdoor\.(?:com|ca|de|fr|ie|nl|sg|co\.uk|co\.in|com\.au)$/,
      // Glassdoor pages carry an opaque employer id, so there is no handle.
      profilePath: /^\/(?:Overview|Reviews)\/[\w.,-]+\.htm$/i,
      search: ({ name }) =>
        `https://www.glassdoor.com/Search/results.htm?keyword=${q(name)}`,
      metrics: [
        {
          key: "rating",
          label: "Overall rating",
          ask: "What is the overall rating out of five?",
          kind: "rating",
        },
        {
          key: "reviewCount",
          label: "Reviews",
          ask: "How many reviews are there?",
          kind: "count",
        },
        {
          key: "recommendPercent",
          label: "Recommend to a friend",
          ask: "What percentage would recommend it to a friend?",
          kind: "percent",
        },
        {
          key: "ceoApprovalPercent",
          label: "CEO approval",
          ask: "What is the CEO approval percentage?",
          kind: "percent",
        },
      ],
    },
    trustpilot: {
      label: "Trustpilot",
      signal: "SENTIMENT",
      host: /^(?:[a-z]{2}\.|www\.)?trustpilot\.com$/,
      profilePath: new RegExp(`^/review/${HANDLE}/?$`, "i"),
      fromHandle: (handle) => `https://www.trustpilot.com/review/${handle}`,
      // Trustpilot files companies under their domain, so this guess is reliable.
      guess: ({ domain }) => `https://www.trustpilot.com/review/${domain}`,
      search: ({ name }) =>
        `https://www.trustpilot.com/search?query=${q(name)}`,
      metrics: [
        {
          key: "trustScore",
          label: "TrustScore",
          ask: "What is the TrustScore out of five?",
          kind: "rating",
        },
        {
          key: "reviewCount",
          label: "Reviews",
          ask: "How many reviews does it have?",
          kind: "count",
        },
      ],
    },
    crunchbase: {
      label: "Crunchbase",
      signal: "NEWS",
      host: /^(?:www\.)?crunchbase\.com$/,
      profilePath: new RegExp(`^/organization/${HANDLE}(?:/.*)?$`, "i"),
      fromHandle: (handle) =>
        `https://www.crunchbase.com/organization/${handle}`,
      guess: ({ domain }) =>
        `https://www.crunchbase.com/organization/${registrableLabel(domain)}`,
      search: ({ name }) =>
        `https://www.crunchbase.com/textsearch?q=${q(name)}`,
      metrics: [
        {
          key: "totalFundingUsd",
          label: "Total funding",
          ask: "What is the total funding amount, in US dollars?",
          kind: "usd",
        },
        {
          key: "lastRoundType",
          label: "Last round",
          ask: "What was the last funding round, for example Series B?",
          kind: "text",
        },
        {
          key: "lastRoundDate",
          label: "Last round date",
          ask: "When was that round announced?",
          kind: "text",
        },
      ],
    },
  };

export class ManualSourceError extends Error {}

/**
 * Accepts what a person pastes or says, a full URL or just a handle such as
 * "acme-robotics", and returns the canonical https profile URL. Rejects
 * anything that is not a company page on that platform, so a saved link can
 * never lead anywhere else.
 */
export function normalizeProfileUrl(
  platform: ManualPlatform,
  input: string,
): string {
  const definition = PLATFORM_DEFINITIONS[platform];
  const trimmed = input.trim();

  const looksLikeUrl = /^https?:\/\//i.test(trimmed) || trimmed.includes("/");
  if (!looksLikeUrl) {
    // Speech-to-text tends to hand over "Acme Robotics" for "acme-robotics".
    const handle = trimmed.toLowerCase().replace(/\s+/g, "-");
    if (!definition.fromHandle || !new RegExp(`^${HANDLE}$`).test(handle)) {
      throw new ManualSourceError(
        definition.fromHandle
          ? `"${input}" is not a valid ${definition.label} handle.`
          : `${definition.label} pages have no simple handle. Paste the page's full address instead.`,
      );
    }
    return definition.fromHandle(handle);
  }

  let url: URL;
  try {
    url = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
  } catch {
    throw new ManualSourceError(`"${input}" is not a valid web address.`);
  }
  if (!definition.host.test(url.hostname.toLowerCase())) {
    throw new ManualSourceError(`That is not a ${definition.label} address.`);
  }
  const match = definition.profilePath.exec(url.pathname);
  if (!match) {
    throw new ManualSourceError(
      `That is not a company page on ${definition.label}.`,
    );
  }
  // Rebuild from the handle where there is one: drops tracking parameters,
  // sub-pages and regional hosts.
  return definition.fromHandle && match[1]
    ? definition.fromHandle(match[1].toLowerCase())
    : `https://${url.hostname.toLowerCase()}${url.pathname}`;
}

export type ProfileLink = {
  url: string;
  /**
   * saved: confirmed earlier. guess: probably right, ask the person to check.
   * search: a results page where they pick the company themselves.
   */
  kind: "saved" | "guess" | "search";
  searchUrl: string;
};

/** Reads the saved profile URLs off an entity, dropping anything invalid. */
export function readProfileUrls(
  raw: unknown,
): Partial<Record<ManualPlatform, string>> {
  const urls: Partial<Record<ManualPlatform, string>> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [platform, url] of Object.entries(raw)) {
      if (isManualPlatform(platform) && typeof url === "string") {
        try {
          urls[platform] = normalizeProfileUrl(platform, url);
        } catch {
          // A link that no longer validates is treated as not saved.
        }
      }
    }
  }
  return urls;
}

export function profileLinkFor(
  platform: ManualPlatform,
  subject: Subject,
  savedUrl: string | undefined,
): ProfileLink {
  const definition = PLATFORM_DEFINITIONS[platform];
  const searchUrl = definition.search(subject);
  if (savedUrl) return { url: savedUrl, kind: "saved", searchUrl };
  if (definition.guess) {
    return { url: definition.guess(subject), kind: "guess", searchUrl };
  }
  return { url: searchUrl, kind: "search", searchUrl };
}

const NUMBER_LIMITS: Record<Exclude<MetricKind, "text">, [number, number]> = {
  count: [0, 10_000_000_000],
  rating: [0, 5],
  percent: [0, 100],
  usd: [0, 10_000_000_000_000],
};

/**
 * Checks reported values against the platform's metrics. Unknown keys and
 * out-of-range numbers are errors rather than silently dropped: a rating of
 * 47 is someone misspeaking "4.7", and they should be asked again.
 */
export function validateManualValues(
  platform: ManualPlatform,
  values: { [key: string]: unknown },
): ManualValues {
  const { label, metrics } = PLATFORM_DEFINITIONS[platform];
  const clean: ManualValues = {};

  for (const [key, raw] of Object.entries(values)) {
    if (raw === null || raw === undefined || raw === "") continue;
    const metric = metrics.find((m) => m.key === key);
    if (!metric) {
      throw new ManualSourceError(
        `${label} has no "${key}". Its values are: ${metrics
          .map((m) => m.key)
          .join(", ")}.`,
      );
    }

    if (metric.kind === "text") {
      clean[key] = String(raw).trim().slice(0, 200);
      continue;
    }
    const number =
      typeof raw === "number"
        ? raw
        : Number(String(raw).replace(/[$,%\s]/g, ""));
    const [min, max] = NUMBER_LIMITS[metric.kind];
    if (!Number.isFinite(number) || number < min || number > max) {
      throw new ManualSourceError(
        `${metric.label} must be a number from ${min} to ${max.toLocaleString(
          "en-US",
        )}, not "${String(raw)}".`,
      );
    }
    clean[key] = metric.kind === "count" ? Math.round(number) : number;
  }

  if (Object.keys(clean).length === 0) {
    throw new ManualSourceError("There were no values to record.");
  }
  return clean;
}

export function formatManualValue(
  kind: MetricKind,
  value: ManualValue,
): string {
  if (typeof value === "string") return value;
  switch (kind) {
    case "rating":
      return `${value} / 5`;
    case "percent":
      return `${value}%`;
    case "usd":
      return `$${value.toLocaleString("en-US")}`;
    default:
      return value.toLocaleString("en-US");
  }
}
