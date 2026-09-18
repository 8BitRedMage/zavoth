// Placeholder data until the dashboard reads tracker results. The companies
// are real book-writing software makers, the same ones the
// `seedBookWritingCompetitors` seed adds; every number here is invented.

export interface BrandTileData {
  id: string;
  name: string;
  /** What kind of product it is, shown under the name. */
  category: string;
  logoUrl: string | null;
  isLive: boolean;
  alertCount: number;
  metricLabel: string;
  metricValue: string;
  deltaPercent: number;
  series: number[];
}

const SERIES_LENGTH = 13;

/**
 * A wobbly line that ends `deltaPercent` away from where it started. Seeded,
 * so a company's sparkline is the same on every render.
 */
function makeSeries(seed: number, deltaPercent: number): number[] {
  let state = seed;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };

  const start = 50;
  const end = start * (1 + deltaPercent / 100);
  return Array.from({ length: SERIES_LENGTH }, (_, i) => {
    const progress = i / (SERIES_LENGTH - 1);
    const isEndpoint = i === 0 || i === SERIES_LENGTH - 1;
    // The sparkline scales to its own range, so noise has to be relative to
    // the overall move or a small change would read as pure static.
    const wobble = isEndpoint ? 0 : (random() - 0.5) * Math.abs(end - start);
    return Math.round((start + (end - start) * progress + wobble) * 100) / 100;
  });
}

const brands: Omit<BrandTileData, "logoUrl" | "metricLabel" | "series">[] = [
  {
    id: "literatureandlatte.com",
    name: "Literature & Latte",
    category: "Scrivener · Drafting",
    isLive: true,
    alertCount: 2,
    metricValue: "1.27",
    deltaPercent: 12.4,
  },
  {
    id: "atticus.io",
    name: "Atticus",
    category: "Drafting · Formatting",
    isLive: true,
    alertCount: 1,
    metricValue: "1.41",
    deltaPercent: 18.9,
  },
  {
    id: "sudowrite.com",
    name: "Sudowrite",
    category: "AI-assisted drafting",
    isLive: true,
    alertCount: 3,
    metricValue: "1.63",
    deltaPercent: 27.2,
  },
  {
    id: "dabblewriter.com",
    name: "Dabble",
    category: "Drafting · Plotting",
    isLive: true,
    alertCount: 0,
    metricValue: "1.08",
    deltaPercent: 5.6,
  },
  {
    id: "livingwriter.com",
    name: "LivingWriter",
    category: "Drafting · Plotting",
    isLive: true,
    alertCount: 1,
    metricValue: "0.97",
    deltaPercent: -2.3,
  },
  {
    id: "reedsy.com",
    name: "Reedsy",
    category: "Marketplace · Drafting",
    isLive: true,
    alertCount: 0,
    metricValue: "1.19",
    deltaPercent: 8.1,
  },
  {
    id: "prowritingaid.com",
    name: "ProWritingAid",
    category: "Editing",
    isLive: true,
    alertCount: 2,
    metricValue: "1.32",
    deltaPercent: 10.7,
  },
  {
    id: "vellum.pub",
    name: "Vellum",
    category: "Formatting",
    isLive: true,
    alertCount: 0,
    metricValue: "0.88",
    deltaPercent: -4.6,
  },
  {
    id: "novlr.org",
    name: "Novlr",
    category: "Drafting",
    isLive: true,
    alertCount: 0,
    metricValue: "1.02",
    deltaPercent: 3.4,
  },
  {
    id: "plottr.com",
    name: "Plottr",
    category: "Plotting",
    isLive: true,
    alertCount: 0,
    metricValue: "0.94",
    deltaPercent: -3.1,
  },
  {
    id: "novelcrafter.com",
    name: "Novelcrafter",
    category: "AI-assisted drafting",
    isLive: true,
    alertCount: 1,
    metricValue: "1.48",
    deltaPercent: 21.5,
  },
  {
    id: "ulysses.app",
    name: "Ulysses",
    category: "Drafting",
    isLive: false,
    alertCount: 0,
    metricValue: "0.91",
    deltaPercent: -1.8,
  },
];

export const mockBrands: BrandTileData[] = brands.map((brand, index) => ({
  ...brand,
  logoUrl: null,
  metricLabel: "Activity index",
  series: makeSeries(index + 1, brand.deltaPercent),
}));
