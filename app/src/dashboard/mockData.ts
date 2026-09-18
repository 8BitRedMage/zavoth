// Placeholder data until the portfolio/entity backend lands.
import veloraLogo from "../client/static/mock/velora-logo.png";

export interface PortfolioSummary {
  label: string;
  value: string;
  changePercent: number;
  comparedTo: string;
}

export interface BrandTileData {
  id: string;
  name: string;
  stage: string;
  logoUrl: string | null;
  isLive: boolean;
  alertCount: number;
  metricLabel: string;
  metricValue: string;
  deltaPercent: number;
  series: number[];
}

export const mockSummary: PortfolioSummary = {
  label: "Total Portfolio Revenue",
  value: "$450,690",
  changePercent: 14.2,
  comparedTo: "vs last quarter",
};

const veloraSeries = [0, 32, 30, 24, 28, 22, 26, 50, 42, 54, 60, 68, 100];

export const mockBrands: BrandTileData[] = [
  {
    id: "velora",
    name: "Velora",
    stage: "Series B",
    logoUrl: veloraLogo,
    isLive: true,
    alertCount: 2,
    metricLabel: "Activity index",
    metricValue: "1.27",
    deltaPercent: 12.4,
    series: veloraSeries,
  },
  {
    id: "northwind",
    name: "Northwind",
    stage: "Public",
    logoUrl: null,
    isLive: true,
    alertCount: 0,
    metricLabel: "Activity index",
    metricValue: "0.94",
    deltaPercent: -3.1,
    series: [60, 58, 64, 55, 50, 52, 48, 46, 51, 44, 40, 42, 38],
  },
  {
    id: "kestrel",
    name: "Kestrel Labs",
    stage: "Seed",
    logoUrl: null,
    isLive: false,
    alertCount: 1,
    metricLabel: "Activity index",
    metricValue: "1.08",
    deltaPercent: 5.6,
    series: [20, 24, 22, 30, 28, 36, 34, 40, 38, 46, 44, 52, 58],
  },
];
