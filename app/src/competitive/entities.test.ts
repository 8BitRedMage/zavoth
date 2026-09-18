import { describe, expect, it } from "vitest";
import { guessNameFromDomain, normalizeDomain } from "./entities";

describe("normalizeDomain", () => {
  it.each([
    ["acme.com", "acme.com"],
    ["ACME.com", "acme.com"],
    ["  acme.com  ", "acme.com"],
    ["www.acme.com", "acme.com"],
    ["https://www.acme.com", "acme.com"],
    ["http://acme.com/pricing?plan=pro#top", "acme.com"],
    ["https://acme.com:8443/", "acme.com"],
    // Sub-brands on subdomains are distinct entities, so keep the subdomain.
    ["https://jobs.acme.com/open", "jobs.acme.com"],
    ["acme.co.uk", "acme.co.uk"],
  ])("normalizes %s -> %s", (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  it("maps every spelling of a company to the same dedupe key", () => {
    const spellings = [
      "acme.com",
      "WWW.ACME.COM",
      "https://acme.com/",
      "http://www.acme.com/about",
    ];
    expect(new Set(spellings.map(normalizeDomain)).size).toBe(1);
  });

  it.each(["", "   ", "http://", "not a domain"])("rejects %j", (input) => {
    expect(() => normalizeDomain(input)).toThrow();
  });
});

describe("guessNameFromDomain", () => {
  it("capitalizes the first label", () => {
    expect(guessNameFromDomain("acme.com")).toBe("Acme");
    expect(guessNameFromDomain("jobs.acme.com")).toBe("Jobs");
  });
});
