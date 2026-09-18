import type {
  PortfolioKind,
  PortfolioTier,
  Signal,
  TrackerStatus,
} from "@prisma/client";

export const PORTFOLIO_KIND_LABELS: Record<PortfolioKind, string> = {
  COMPETITOR: "Competitors",
  VENDOR: "Vendors",
  INVESTOR: "Investors",
  PARTNER: "Partners",
  CUSTOM: "Custom",
};

export const PORTFOLIO_TIER_LABELS: Record<PortfolioTier, string> = {
  PRIMARY: "Primary",
  SECONDARY: "Secondary",
  WATCH: "Watch",
};

export const SIGNAL_LABELS: Record<Signal, string> = {
  WEBSITE: "Website",
  HIRING: "Hiring",
  SENTIMENT: "Sentiment",
  STOCK: "Stock",
  NEWS: "News",
};

export const TRACKER_STATUS_LABELS: Record<TrackerStatus, string> = {
  OK: "OK",
  ERROR: "Error",
  RATE_LIMITED: "Rate limited",
  MANUAL_ONLY: "Manual only",
};

/** Pulls the server's message out of a failed operation call. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}
