import { OrgRole, type Prisma } from "@prisma/client";
import { HttpError } from "wasp/server";
import type {
  GetManualSources,
  RecordManualData,
  SetEntityProfileUrl,
} from "wasp/server/operations";
import * as z from "zod";
import { ensureArgsSchemaOrThrowHttpError } from "../../server/validation";
import { requireEntityInOrg, requireOrgMember } from "../authz";
import { hasOrgRole } from "../roles";
import {
  MANUAL_PLATFORMS,
  ManualSourceError,
  PLATFORM_DEFINITIONS,
  normalizeProfileUrl,
  profileLinkFor,
  readProfileUrls,
  validateManualValues,
  type ManualMetric,
  type ManualPlatform,
  type ManualValues,
  type ProfileLink,
} from "./platforms";

// Data from platforms that forbid bots. The server never contacts those
// platforms: it hands out links for a person to open, and stores what that
// person reports as ManualImport rows, scoped to their organization.

const entityRefSchema = z.object({
  orgId: z.string().uuid(),
  entityId: z.string().uuid(),
});
const platformSchema = z.enum(MANUAL_PLATFORMS);

/** Reported values are user input, so bad ones are a 400, not a crash. */
function orBadRequest<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof ManualSourceError) {
      throw new HttpError(400, error.message);
    }
    throw error;
  }
}

export type ManualCapture = {
  capturedAt: Date;
  values: ManualValues;
  notes: string | null;
  recordedBy: string | null;
};

export type ManualSourceState = {
  platform: ManualPlatform;
  label: string;
  link: ProfileLink;
  metrics: ManualMetric[];
  /** Newest first; at most the last two, enough to show a change. */
  captures: ManualCapture[];
};

function toValues(data: Prisma.JsonValue | null): ManualValues {
  const values: ManualValues = {};
  if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "number" || typeof value === "string") {
        values[key] = value;
      }
    }
  }
  return values;
}

export const getManualSources: GetManualSources<
  z.infer<typeof entityRefSchema>,
  ManualSourceState[]
> = async (rawArgs, context) => {
  const { orgId, entityId } = ensureArgsSchemaOrThrowHttpError(
    entityRefSchema,
    rawArgs,
  );
  await requireOrgMember(context, orgId);
  await requireEntityInOrg(orgId, entityId);

  const [entity, imports] = await Promise.all([
    context.entities.TrackedEntity.findUniqueOrThrow({
      where: { id: entityId },
      select: { name: true, domain: true, profileUrls: true },
    }),
    // `orgId` keeps one team's observations out of another team's view.
    context.entities.ManualImport.findMany({
      where: { orgId, entityId, source: { in: [...MANUAL_PLATFORMS] } },
      orderBy: { capturedAt: "desc" },
      take: 200,
      select: {
        source: true,
        capturedAt: true,
        data: true,
        text: true,
        createdBy: { select: { username: true, email: true } },
      },
    }),
  ]);

  const savedUrls = readProfileUrls(entity.profileUrls);
  return MANUAL_PLATFORMS.map((platform) => ({
    platform,
    label: PLATFORM_DEFINITIONS[platform].label,
    link: profileLinkFor(platform, entity, savedUrls[platform]),
    metrics: PLATFORM_DEFINITIONS[platform].metrics,
    captures: imports
      .filter((row) => row.source === platform)
      .slice(0, 2)
      .map((row) => ({
        capturedAt: row.capturedAt,
        values: toValues(row.data),
        notes: row.text,
        recordedBy: row.createdBy.username ?? row.createdBy.email,
      })),
  }));
};

const recordManualDataInputSchema = entityRefSchema.extend({
  platform: platformSchema,
  values: z.record(
    z.string().max(50),
    z.union([z.number(), z.string().max(200)]),
  ),
  notes: z.string().trim().max(2000).optional(),
  /** When the person looked. Defaults to now. */
  capturedAt: z.coerce.date().optional(),
});

export type RecordManualDataResult = {
  platform: ManualPlatform;
  capturedAt: Date;
  values: ManualValues;
  /** The capture before this one, so callers can describe what changed. */
  previous: { capturedAt: Date; values: ManualValues } | null;
};

export const recordManualData: RecordManualData<
  z.infer<typeof recordManualDataInputSchema>,
  RecordManualDataResult
> = async (rawArgs, context) => {
  const { orgId, entityId, platform, notes, ...args } =
    ensureArgsSchemaOrThrowHttpError(recordManualDataInputSchema, rawArgs);
  const membership = await requireOrgMember(context, orgId, OrgRole.MEMBER);
  await requireEntityInOrg(orgId, entityId);

  const values = orBadRequest(() =>
    validateManualValues(platform, args.values),
  );
  const capturedAt = args.capturedAt ?? new Date();
  if (capturedAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    throw new HttpError(400, "The capture date cannot be in the future");
  }

  const previous = await context.entities.ManualImport.findFirst({
    where: {
      orgId,
      entityId,
      source: platform,
      capturedAt: { lt: capturedAt },
    },
    orderBy: { capturedAt: "desc" },
    select: { capturedAt: true, data: true },
  });

  await context.entities.ManualImport.create({
    data: {
      orgId,
      entityId,
      createdById: membership.userId,
      signal: PLATFORM_DEFINITIONS[platform].signal,
      source: platform,
      capturedAt,
      data: values,
      text: notes || null,
      // Left PENDING like any other import: the import job (Phase 2) turns
      // `data` into the same metric rows the collectors produce.
    },
  });

  return {
    platform,
    capturedAt,
    values,
    previous: previous && {
      capturedAt: previous.capturedAt,
      values: toValues(previous.data),
    },
  };
};

const setEntityProfileUrlInputSchema = entityRefSchema.extend({
  platform: platformSchema,
  /** A full URL or a bare handle. Null forgets the saved link. */
  url: z.string().trim().max(500).nullable(),
});

/**
 * Remembers which page is this company's on a platform. The link lives on the
 * shared entity, so, like the footprint, MEMBERs may set it when it is empty
 * while changing or clearing an existing one takes an ADMIN.
 */
export const setEntityProfileUrl: SetEntityProfileUrl<
  z.infer<typeof setEntityProfileUrlInputSchema>,
  { platform: ManualPlatform; url: string | null }
> = async (rawArgs, context) => {
  const { orgId, entityId, platform, url } = ensureArgsSchemaOrThrowHttpError(
    setEntityProfileUrlInputSchema,
    rawArgs,
  );
  const membership = await requireOrgMember(context, orgId, OrgRole.MEMBER);
  await requireEntityInOrg(orgId, entityId);

  const entity = await context.entities.TrackedEntity.findUniqueOrThrow({
    where: { id: entityId },
    select: { profileUrls: true },
  });
  const urls = readProfileUrls(entity.profileUrls);
  const next =
    url === null
      ? null
      : orBadRequest(() => normalizeProfileUrl(platform, url));

  const current = urls[platform];
  if (
    current &&
    current !== next &&
    !hasOrgRole(membership.role, OrgRole.ADMIN)
  ) {
    throw new HttpError(
      403,
      `A ${PLATFORM_DEFINITIONS[platform].label} link is already saved, and only an organization admin can change it`,
    );
  }

  if (next) {
    urls[platform] = next;
  } else {
    delete urls[platform];
  }
  await context.entities.TrackedEntity.update({
    where: { id: entityId },
    data: { profileUrls: urls },
  });
  return { platform, url: next };
};
