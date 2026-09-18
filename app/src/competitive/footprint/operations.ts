import { OrgRole, Signal, type Prisma } from "@prisma/client";
import type { TrackedEntity } from "wasp/entities";
import { env, HttpError, prisma } from "wasp/server";
import type {
  LookUpEntityFootprint,
  SaveEntityFootprint,
} from "wasp/server/operations";
import * as z from "zod";
import { ensureArgsSchemaOrThrowHttpError } from "../../server/validation";
import { requireEntityInOrg, requireOrgMember } from "../authz";
import { hasOrgRole } from "../roles";
import { lookUpFootprint, type FootprintFindings } from "./lookup";

// "Look up their footprint" is two steps on purpose. Looking up saves
// nothing, so the user (or the assistant, out loud) can review what was found;
// saving then writes only values the server found itself, never values sent
// by the client. That is what lets MEMBERs use it even though free-form edits
// to a shared company (`updateEntity`) are reserved for ADMINs.

const FINDINGS_TTL_MS = 15 * 60 * 1000;
const MAX_CACHED_FINDINGS = 500;
// Per server process. A miss (restart, another instance) just looks up again.
const findingsCache = new Map<string, FootprintFindings>();

async function getFindings(
  entity: TrackedEntity,
  { fresh }: { fresh: boolean },
): Promise<FootprintFindings> {
  const cached = findingsCache.get(entity.id);
  if (
    !fresh &&
    cached &&
    Date.now() - cached.lookedUpAt.getTime() < FINDINGS_TTL_MS
  ) {
    return cached;
  }

  const findings = await lookUpFootprint(entity, {
    contactEmail: env.COLLECTOR_CONTACT_EMAIL,
    redditClientId: env.REDDIT_CLIENT_ID,
    redditClientSecret: env.REDDIT_CLIENT_SECRET,
  });
  if (findingsCache.size >= MAX_CACHED_FINDINGS) {
    // Maps iterate in insertion order, so this drops the oldest entry.
    findingsCache.delete(findingsCache.keys().next().value!);
  }
  findingsCache.delete(entity.id);
  findingsCache.set(entity.id, findings);
  return findings;
}

const entityRefSchema = z.object({
  orgId: z.string().uuid(),
  entityId: z.string().uuid(),
});

export const lookUpEntityFootprint: LookUpEntityFootprint<
  z.infer<typeof entityRefSchema>,
  FootprintFindings
> = async (rawArgs, context) => {
  const { orgId, entityId } = ensureArgsSchemaOrThrowHttpError(
    entityRefSchema,
    rawArgs,
  );
  // Costs outbound requests, so not for VIEWERs, who could not save it anyway.
  await requireOrgMember(context, orgId, OrgRole.MEMBER);
  await requireEntityInOrg(orgId, entityId);

  const entity = await context.entities.TrackedEntity.findUniqueOrThrow({
    where: { id: entityId },
  });
  return getFindings(entity, { fresh: true });
};

const saveEntityFootprintInputSchema = entityRefSchema.extend({
  /** One of the tickers the lookup offered. */
  ticker: z.string().trim().max(12).optional(),
  careers: z.boolean().optional(),
  /** A subset of the subreddits the lookup offered. */
  subreddits: z.array(z.string().trim().max(50)).max(10).optional(),
  website: z.boolean().optional(),
});

export type FootprintPart = "ticker" | "careers" | "subreddits" | "website";

export type SaveFootprintResult = {
  saved: FootprintPart[];
  skipped: { part: FootprintPart; reason: string }[];
  entity: TrackedEntity;
};

const ALREADY_SET =
  "is already set, and only an organization admin can replace it";

export const saveEntityFootprint: SaveEntityFootprint<
  z.infer<typeof saveEntityFootprintInputSchema>,
  SaveFootprintResult
> = async (rawArgs, context) => {
  const { orgId, entityId, ...wanted } = ensureArgsSchemaOrThrowHttpError(
    saveEntityFootprintInputSchema,
    rawArgs,
  );
  const membership = await requireOrgMember(context, orgId, OrgRole.MEMBER);
  await requireEntityInOrg(orgId, entityId);

  const entity = await context.entities.TrackedEntity.findUniqueOrThrow({
    where: { id: entityId },
  });
  const findings = await getFindings(entity, { fresh: false });
  // Members fill in blanks; replacing a curated value stays an admin call.
  const mayReplace = hasOrgRole(membership.role, OrgRole.ADMIN);

  const saved: FootprintPart[] = [];
  const skipped: SaveFootprintResult["skipped"] = [];
  const entityData: Prisma.TrackedEntityUpdateInput = {};
  const trackerUpdates: Prisma.PrismaPromise<unknown>[] = [];
  const updateTracker = (signal: Signal, data: Prisma.TrackerUpdateInput) =>
    trackerUpdates.push(
      prisma.tracker.update({
        where: { entityId_signal: { entityId, signal } },
        data,
      }),
    );

  if (wanted.ticker) {
    const symbol = wanted.ticker.toUpperCase();
    const match = findings.stock.candidates.find((c) => c.ticker === symbol);
    if (!match) {
      throw new HttpError(
        400,
        `${symbol} is not one of the tickers the lookup found`,
      );
    }
    if (entity.ticker && entity.ticker !== match.ticker && !mayReplace) {
      skipped.push({ part: "ticker", reason: `The ticker ${ALREADY_SET}.` });
    } else {
      entityData.ticker = match.ticker;
      entityData.exchange = match.exchange;
      updateTracker(Signal.STOCK, { enabled: true });
      saved.push("ticker");
    }
  }

  if (wanted.careers) {
    const { careersUrl, provider, slug } = findings.hiring;
    if (!careersUrl) {
      skipped.push({ part: "careers", reason: "No careers page was found." });
    } else if (
      entity.careersUrl &&
      entity.careersUrl !== careersUrl &&
      !mayReplace
    ) {
      skipped.push({
        part: "careers",
        reason: `The careers page ${ALREADY_SET}.`,
      });
    } else {
      entityData.careersUrl = careersUrl;
      entityData.atsProvider = provider ?? "unknown";
      if (slug && provider && provider !== "unknown") {
        // Saves the hiring collector from detecting the board again.
        updateTracker(Signal.HIRING, { config: { provider, slug } });
      }
      saved.push("careers");
    }
  }

  if (wanted.subreddits && wanted.subreddits.length > 0) {
    const offered = new Map(
      findings.communities.subreddits.map((s) => [
        s.name.toLowerCase(),
        s.name,
      ]),
    );
    const accepted = wanted.subreddits.flatMap((name) => {
      const found = offered.get(name.replace(/^\/?r\//i, "").toLowerCase());
      return found ? [found] : [];
    });
    if (accepted.length === 0) {
      skipped.push({
        part: "subreddits",
        reason: "None of those subreddits were in the lookup results.",
      });
    } else {
      // Additive, so nothing anyone curated is lost.
      entityData.subreddits = [
        ...new Set([...entity.subreddits, ...accepted]),
      ].slice(0, 20);
      saved.push("subreddits");
    }
  }

  if (wanted.website) {
    const { sitemapUrl, keyPages } = findings.website;
    if (!sitemapUrl) {
      skipped.push({ part: "website", reason: "No sitemap was found." });
    } else {
      updateTracker(Signal.WEBSITE, { config: { sitemapUrl, keyPages } });
      saved.push("website");
    }
  }

  const [updated] = await prisma.$transaction([
    prisma.trackedEntity.update({
      where: { id: entityId },
      data: { ...entityData, enrichedAt: findings.lookedUpAt },
    }),
    ...trackerUpdates,
  ]);

  return { saved, skipped, entity: updated };
};
