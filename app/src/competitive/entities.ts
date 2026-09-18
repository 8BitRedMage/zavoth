import { Signal } from "@prisma/client";

/**
 * Canonical form used as the Entity dedupe key: lowercase host, no scheme,
 * no `www.`, no path. "https://www.Acme.com/pricing" -> "acme.com".
 */
export function normalizeDomain(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let host: string;
  try {
    host = new URL(withScheme).hostname;
  } catch {
    throw new Error(`Invalid domain: ${input}`);
  }

  return host.replace(/^www\./, "");
}

/** "acme.com" -> "Acme" as a starting point until enrichment fills it in. */
export function guessNameFromDomain(domain: string): string {
  const label = domain.split(".")[0] ?? domain;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// How often each signal is collected, in minutes. These are the initial
// tracker rows created when an entity is first added; collectors can adjust.
export const DEFAULT_TRACKER_INTERVALS_MIN: Record<Signal, number> = {
  [Signal.WEBSITE]: 24 * 60,
  [Signal.HIRING]: 24 * 60,
  [Signal.SENTIMENT]: 6 * 60,
  [Signal.STOCK]: 24 * 60,
  [Signal.NEWS]: 60,
};
