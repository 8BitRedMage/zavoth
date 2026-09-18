import type { TrackedEntity, Signal, Tracker } from "@prisma/client";

/**
 * A collector fetches one signal for one entity from a permitted source
 * (public API, feed, or robots-allowed sitemap — see the scraping policy in
 * the project plan), normalizes it, and reports what changed.
 *
 * Collectors are pure with respect to the database: `runTracker` (Phase 2)
 * persists what they return. This keeps them unit-testable with fixtures.
 */
export interface Collector<Cfg = Record<string, unknown>, Cursor = unknown> {
  signal: Signal;

  /**
   * Pull new data. `cursor` is whatever the previous run returned, so
   * collectors can fetch incrementally (e.g. RSS `lastBuildDate`).
   * Return `{ manualOnly: true }` when the source is unavailable or disallowed
   * (no sitemap, robots.txt denies, no ATS detected); the tracker is then
   * flagged MANUAL_ONLY and the user is prompted to upload instead.
   */
  fetch(
    entity: TrackedEntity,
    tracker: Tracker,
    config: Cfg,
    cursor: Cursor | null,
  ): Promise<FetchResult<Cursor>>;
}

export type FetchResult<Cursor> =
  | { manualOnly: true; reason: string }
  | {
      manualOnly?: false;
      cursor: Cursor;
      /** Raw payload to archive in object storage (HTML, JSON, XML). */
      raw?: { contentType: string; body: Buffer | string };
      metrics: MetricPoint[];
      events: EventCandidate[];
    };

export interface MetricPoint {
  /** Dotted name, e.g. `hiring.openRoles` or `news.count7d`. */
  name: string;
  ts: Date;
  value: number;
}

export interface EventCandidate {
  /** e.g. `news.press_release`, `hiring.surge`, `web.pricing_changed`. */
  kind: string;
  /** 1 (info) .. 5 (act now). */
  severity: 1 | 2 | 3 | 4 | 5;
  ts: Date;
  title: string;
  summary?: string;
  payload?: Record<string, unknown>;
  /** Stable key so re-running a collector never duplicates an event. */
  dedupeKey: string;
}
