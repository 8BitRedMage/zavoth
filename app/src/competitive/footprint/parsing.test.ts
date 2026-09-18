import { describe, expect, it } from "vitest";
import {
  atsSlugCandidates,
  isPathAllowed,
  matchTickers,
  namesMatch,
  normalizeCompanyName,
  parseRobots,
  parseSitemap,
  pickKeyPages,
  registrableLabel,
  type SecCompany,
} from "./parsing";

describe("normalizeCompanyName", () => {
  it.each([
    ["Acme Holdings, Inc.", "acme"],
    ["ACME CORP /DE/", "acme"],
    ["Alphabet Inc. Class A", "alphabet"],
    ["Johnson & Johnson", "johnson and johnson"],
    ["The Trade Desk, Inc.", "trade desk"],
    // Stripping every word would leave nothing to match on.
    ["The Group", "the group"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeCompanyName(input)).toBe(expected);
  });
});

describe("registrableLabel", () => {
  it.each([
    ["acme.com", "acme"],
    ["jobs.acme.com", "acme"],
    ["acme.co.uk", "acme"],
    ["shop.acme.com.au", "acme"],
    ["acme.io", "acme"],
  ])("%s -> %s", (domain, expected) => {
    expect(registrableLabel(domain)).toBe(expected);
  });
});

describe("atsSlugCandidates", () => {
  it("offers the domain label and the squashed and hyphenated name", () => {
    expect(atsSlugCandidates("trade.desk.com", "The Trade Desk, Inc.")).toEqual(
      ["desk", "tradedesk", "trade-desk", "trade"],
    );
  });

  it("dedupes when the name is the domain label", () => {
    expect(atsSlugCandidates("acme.com", "Acme")).toEqual(["acme"]);
  });
});

describe("namesMatch", () => {
  it("accepts legal-name variants of the same company", () => {
    expect(namesMatch("Stripe, Inc.", "Stripe")).toBe(true);
    expect(namesMatch("Acme Robotics", "Acme")).toBe(true);
  });

  it("rejects a different company that happens to own the slug", () => {
    expect(namesMatch("Apex Dental Group", "Acme")).toBe(false);
  });
});

describe("matchTickers", () => {
  const companies: SecCompany[] = [
    { cik: 1, name: "Alphabet Inc.", ticker: "GOOGL", exchange: "Nasdaq" },
    { cik: 1, name: "Alphabet Inc.", ticker: "GOOG", exchange: "Nasdaq" },
    { cik: 2, name: "ACME UNITED CORP", ticker: "ACU", exchange: "NYSE" },
    { cik: 3, name: "Acme Robotics Holdings", ticker: "ACMR", exchange: null },
    { cik: 4, name: "Block, Inc.", ticker: "XYZ", exchange: "NYSE" },
  ];

  it("returns one exact candidate per registrant", () => {
    expect(matchTickers(companies, ["Alphabet"])).toEqual([
      {
        ticker: "GOOGL",
        exchange: "Nasdaq",
        secName: "Alphabet Inc.",
        exact: true,
      },
    ]);
  });

  it("matches through an alias", () => {
    expect(matchTickers(companies, ["Square", "Block"])[0]?.ticker).toBe("XYZ");
  });

  it("offers look-alikes as inexact so the user has to confirm", () => {
    const candidates = matchTickers(companies, ["Acme"]);
    expect(candidates.map((c) => c.ticker)).toEqual(["ACU", "ACMR"]);
    expect(candidates.every((c) => !c.exact)).toBe(true);
  });

  it("does not loosely match very short names", () => {
    expect(matchTickers(companies, ["Ac"])).toEqual([]);
  });

  it("finds nothing for a private company", () => {
    expect(matchTickers(companies, ["Initech"])).toEqual([]);
  });
});

describe("robots.txt", () => {
  const robots = `
# comment
User-agent: *
Disallow: /admin
Allow: /admin/public
Disallow: /*.pdf$

User-agent: BadBot
User-agent: ZavothBot
Disallow: /

Sitemap: https://acme.com/sitemap.xml
sitemap: https://acme.com/news-sitemap.xml
`;

  it("collects sitemaps regardless of group or case", () => {
    expect(parseRobots(robots, "OtherBot").sitemaps).toEqual([
      "https://acme.com/sitemap.xml",
      "https://acme.com/news-sitemap.xml",
    ]);
  });

  it("applies the * group with longest-match and wildcards", () => {
    const rules = parseRobots(robots, "OtherBot");
    expect(isPathAllowed(rules, "/")).toBe(true);
    expect(isPathAllowed(rules, "/admin/settings")).toBe(false);
    expect(isPathAllowed(rules, "/admin/public/page")).toBe(true);
    expect(isPathAllowed(rules, "/files/report.pdf")).toBe(false);
    expect(isPathAllowed(rules, "/files/report.pdf?v=2")).toBe(true);
  });

  it("prefers the group that names our bot, so an opt-out is honored", () => {
    const rules = parseRobots(robots, "ZavothBot");
    expect(isPathAllowed(rules, "/")).toBe(false);
    expect(isPathAllowed(rules, "/sitemap.xml")).toBe(false);
  });

  it("treats an empty or missing file as allow-all", () => {
    expect(isPathAllowed(parseRobots("", "ZavothBot"), "/anything")).toBe(true);
    expect(
      isPathAllowed(parseRobots("User-agent: *\nDisallow:", "ZavothBot"), "/x"),
    ).toBe(true);
  });
});

describe("sitemaps", () => {
  it("reads a urlset, including CDATA and escaped ampersands", () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://acme.com/pricing</loc></url>
      <url><loc><![CDATA[https://acme.com/blog]]></loc></url>
      <url><loc> https://acme.com/search?a=1&amp;b=2 </loc></url>
    </urlset>`;
    expect(parseSitemap(xml)).toEqual({
      isIndex: false,
      locs: [
        "https://acme.com/pricing",
        "https://acme.com/blog",
        "https://acme.com/search?a=1&b=2",
      ],
    });
  });

  it("recognizes a sitemap index", () => {
    const xml = `<sitemapindex><sitemap><loc>https://acme.com/pages.xml</loc></sitemap></sitemapindex>`;
    expect(parseSitemap(xml)).toEqual({
      isIndex: true,
      locs: ["https://acme.com/pages.xml"],
    });
  });

  it("picks landing pages, skipping other hosts, locales and deep pages", () => {
    const pages = pickKeyPages(
      [
        "https://acme.com/de/pricing",
        "https://www.acme.com/pricing/",
        "https://acme.com/blog/how-we-price",
        "https://acme.com/blog",
        "https://evil.example/careers",
        "http://acme.com/changelog",
        "https://acme.com/company/careers",
        "not a url",
      ],
      "acme.com",
    );
    expect(pages).toEqual({
      pricing: "https://www.acme.com/pricing/",
      blog: "https://acme.com/blog",
      careers: "https://acme.com/company/careers",
    });
  });
});
