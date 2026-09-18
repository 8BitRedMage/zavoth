import { describe, expect, it } from "vitest";
import {
  MANUAL_PLATFORMS,
  ManualSourceError,
  PLATFORM_DEFINITIONS,
  normalizeProfileUrl,
  profileLinkFor,
  readProfileUrls,
  validateManualValues,
} from "./platforms";

const acme = { name: "Acme Robotics", domain: "acme.co.uk" };

describe("normalizeProfileUrl", () => {
  it.each([
    [
      "linkedin",
      "https://www.linkedin.com/company/acme-robotics/about/?trk=x",
      "https://www.linkedin.com/company/acme-robotics/",
    ],
    [
      "linkedin",
      "uk.linkedin.com/company/Acme-Robotics",
      "https://www.linkedin.com/company/acme-robotics/",
    ],
    [
      "linkedin",
      "acme-robotics",
      "https://www.linkedin.com/company/acme-robotics/",
    ],
    // Speech-to-text hands over words, not a slug.
    [
      "linkedin",
      "Acme Robotics",
      "https://www.linkedin.com/company/acme-robotics/",
    ],
    [
      "g2",
      "https://www.g2.com/products/acme/reviews#survey",
      "https://www.g2.com/products/acme/reviews",
    ],
    [
      "trustpilot",
      "https://uk.trustpilot.com/review/acme.co.uk",
      "https://www.trustpilot.com/review/acme.co.uk",
    ],
    [
      "crunchbase",
      "https://www.crunchbase.com/organization/acme/company_financials",
      "https://www.crunchbase.com/organization/acme",
    ],
    [
      "glassdoor",
      "https://www.glassdoor.co.uk/Overview/Working-at-Acme-EI_IE1234.11,15.htm",
      "https://www.glassdoor.co.uk/Overview/Working-at-Acme-EI_IE1234.11,15.htm",
    ],
  ] as const)("%s: %s", (platform, input, expected) => {
    expect(normalizeProfileUrl(platform, input)).toBe(expected);
  });

  it.each([
    ["linkedin", "https://evil.example/company/acme"],
    ["linkedin", "https://linkedin.com.evil.example/company/acme"],
    ["linkedin", "https://www.linkedin.com/in/some-person"],
    ["linkedin", "javascript:alert(1)"],
    ["linkedin", "https://www.linkedin.com/company/"],
    ["g2", "https://www.g2.com/categories/crm"],
    ["glassdoor", "acme"],
    ["trustpilot", "https://www.trustpilot.com/users/123"],
  ] as const)("rejects %s: %s", (platform, input) => {
    expect(() => normalizeProfileUrl(platform, input)).toThrow(
      ManualSourceError,
    );
  });
});

describe("profileLinkFor", () => {
  it("prefers a saved link", () => {
    const saved = "https://www.linkedin.com/company/acme-robotics/";
    expect(profileLinkFor("linkedin", acme, saved)).toMatchObject({
      url: saved,
      kind: "saved",
    });
  });

  it("guesses from the registrable domain label, flagged as a guess", () => {
    expect(profileLinkFor("linkedin", acme, undefined)).toEqual({
      url: "https://www.linkedin.com/company/acme/",
      kind: "guess",
      searchUrl:
        "https://www.linkedin.com/search/results/companies/?keywords=Acme%20Robotics",
    });
    expect(profileLinkFor("trustpilot", acme, undefined).url).toBe(
      "https://www.trustpilot.com/review/acme.co.uk",
    );
  });

  it("falls back to search where pages cannot be guessed", () => {
    const link = profileLinkFor("glassdoor", acme, undefined);
    expect(link.kind).toBe("search");
    expect(link.url).toBe(link.searchUrl);
  });

  it("only ever produces links on the platform's own host", () => {
    const hostile = {
      name: "x&redirect=https://evil.example",
      domain: "evil.example/../..",
    };
    for (const platform of MANUAL_PLATFORMS) {
      const { url, searchUrl } = profileLinkFor(platform, hostile, undefined);
      for (const href of [url, searchUrl]) {
        const parsed = new URL(href);
        expect(parsed.protocol).toBe("https:");
        expect(PLATFORM_DEFINITIONS[platform].host.test(parsed.hostname)).toBe(
          true,
        );
      }
    }
  });
});

describe("readProfileUrls", () => {
  it("keeps valid links and drops everything else", () => {
    expect(
      readProfileUrls({
        linkedin: "https://www.linkedin.com/company/acme/",
        g2: "https://evil.example/products/acme",
        myspace: "https://myspace.com/acme",
        crunchbase: 42,
      }),
    ).toEqual({ linkedin: "https://www.linkedin.com/company/acme/" });
    expect(readProfileUrls(null)).toEqual({});
    expect(readProfileUrls(["x"])).toEqual({});
  });
});

describe("validateManualValues", () => {
  it("cleans numbers the way people say and type them", () => {
    expect(
      validateManualValues("linkedin", {
        followers: "12,480",
        employees: 530.4,
        openJobs: null,
      }),
    ).toEqual({ followers: 12480, employees: 530 });
    expect(
      validateManualValues("crunchbase", {
        totalFundingUsd: "$1,250,000",
        lastRoundType: " Series B ",
      }),
    ).toEqual({
      totalFundingUsd: 1250000,
      lastRoundType: "Series B",
    });
    expect(validateManualValues("g2", { rating: 4.7 })).toEqual({
      rating: 4.7,
    });
  });

  it.each([
    ["g2", { rating: 47 }, /0 to 5/],
    ["glassdoor", { recommendPercent: 140 }, /0 to 100/],
    ["linkedin", { followers: -5 }, /Followers/],
    ["linkedin", { followers: "lots" }, /Followers/],
    ["linkedin", { stars: 5 }, /no "stars"/],
    ["linkedin", {}, /no values/],
    ["linkedin", { followers: "" }, /no values/],
  ] as const)("rejects %s %j", (platform, values, message) => {
    expect(() => validateManualValues(platform, values)).toThrow(message);
  });
});
