import {
  OrgRole,
  PortfolioKind,
  PortfolioTier,
  Signal,
  TouchpointKind,
  type Prisma,
} from "@prisma/client";
import type {
  TrackedEntity,
  Organization,
  Portfolio,
  PortfolioItem,
  Tag,
  Touchpoint,
} from "wasp/entities";
import { HttpError, prisma } from "wasp/server";
import type {
  AddEntityToPortfolio,
  CreateOrganization,
  CreatePortfolio,
  CreateTag,
  CreateTouchpoint,
  DeletePortfolio,
  DeleteTag,
  DeleteTouchpoint,
  GetEntity,
  GetMyOrganizations,
  GetPortfolios,
  GetTags,
  GetTouchpoints,
  RemoveEntityFromPortfolio,
  SetEntityTags,
  UpdateEntity,
  UpdatePortfolio,
  UpdatePortfolioItem,
  UpdateTouchpoint,
} from "wasp/server/operations";
import * as z from "zod";
import { ensureArgsSchemaOrThrowHttpError } from "../server/validation";
import { requireEntityInOrg, requireOrgMember } from "./authz";
import {
  DEFAULT_TRACKER_INTERVALS_MIN,
  guessNameFromDomain,
  normalizeDomain,
} from "./entities";

const orgIdSchema = z.string().uuid();
const idSchema = z.string().uuid();

//#region Organizations

export type OrganizationWithRole = Organization & { role: OrgRole };

export const getMyOrganizations: GetMyOrganizations<
  void,
  OrganizationWithRole[]
> = async (_args, context) => {
  if (!context.user) {
    throw new HttpError(401);
  }

  const memberships = await context.entities.Membership.findMany({
    where: { userId: context.user.id },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map(({ organization, role }) => ({
    ...organization,
    role,
  }));
};

const createOrganizationInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export const createOrganization: CreateOrganization<
  z.infer<typeof createOrganizationInputSchema>,
  Organization
> = async (rawArgs, context) => {
  if (!context.user) {
    throw new HttpError(401);
  }
  const { name } = ensureArgsSchemaOrThrowHttpError(
    createOrganizationInputSchema,
    rawArgs,
  );

  return context.entities.Organization.create({
    data: {
      name,
      members: { create: { userId: context.user.id, role: OrgRole.OWNER } },
    },
  });
};

//#endregion

//#region Portfolios

const portfolioWithItems = {
  items: {
    include: {
      entity: {
        include: { parent: { select: { id: true, name: true } } },
      },
    },
    orderBy: { addedAt: "asc" as const },
  },
} satisfies Prisma.PortfolioInclude;

export type PortfolioWithItems = Prisma.PortfolioGetPayload<{
  include: typeof portfolioWithItems;
}>;

const getPortfoliosInputSchema = z.object({ orgId: orgIdSchema });

export const getPortfolios: GetPortfolios<
  z.infer<typeof getPortfoliosInputSchema>,
  PortfolioWithItems[]
> = async (rawArgs, context) => {
  const { orgId } = ensureArgsSchemaOrThrowHttpError(
    getPortfoliosInputSchema,
    rawArgs,
  );
  await requireOrgMember(context, orgId);

  return context.entities.Portfolio.findMany({
    where: { orgId },
    include: portfolioWithItems,
    orderBy: { createdAt: "asc" },
  });
};

const createPortfolioInputSchema = z.object({
  orgId: orgIdSchema,
  name: z.string().trim().min(1).max(100),
  kind: z.nativeEnum(PortfolioKind).default(PortfolioKind.COMPETITOR),
  description: z.string().trim().max(1000).optional(),
});

export const createPortfolio: CreatePortfolio<
  z.infer<typeof createPortfolioInputSchema>,
  Portfolio
> = async (rawArgs, context) => {
  const { orgId, ...data } = ensureArgsSchemaOrThrowHttpError(
    createPortfolioInputSchema,
    rawArgs,
  );
  await requireOrgMember(context, orgId, OrgRole.MEMBER);

  return context.entities.Portfolio.create({ data: { orgId, ...data } });
};

const updatePortfolioInputSchema = z.object({
  orgId: orgIdSchema,
  portfolioId: idSchema,
  name: z.string().trim().min(1).max(100).optional(),
  kind: z.nativeEnum(PortfolioKind).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
});

export const updatePortfolio: UpdatePortfolio<
  z.infer<typeof updatePortfolioInputSchema>,
  Portfolio
> = async (rawArgs, context) => {
  const { orgId, portfolioId, ...data } = ensureArgsSchemaOrThrowHttpError(
    updatePortfolioInputSchema,
    rawArgs,
  );
  await requireOrgMember(context, orgId, OrgRole.MEMBER);

  // `orgId` in the where clause is what stops cross-tenant edits by id.
  const { count } = await context.entities.Portfolio.updateMany({
    where: { id: portfolioId, orgId },
    data,
  });
  if (count === 0) {
    throw new HttpError(404, "Portfolio not found");
  }

  return context.entities.Portfolio.findUniqueOrThrow({
    where: { id: portfolioId },
  });
};

const deletePortfolioInputSchema = z.object({
  orgId: orgIdSchema,
  portfolioId: idSchema,
});

export const deletePortfolio: DeletePortfolio<
  z.infer<typeof deletePortfolioInputSchema>,
  void
> = async (rawArgs, context) => {
  const { orgId, portfolioId } = ensureArgsSchemaOrThrowHttpError(
    deletePortfolioInputSchema,
    rawArgs,
  );
  await requireOrgMember(context, orgId, OrgRole.ADMIN);

  const { count } = await context.entities.Portfolio.deleteMany({
    where: { id: portfolioId, orgId },
  });
  if (count === 0) {
    throw new HttpError(404, "Portfolio not found");
  }
};

//#endregion

//#region Entities

const addEntityToPortfolioInputSchema = z.object({
  orgId: orgIdSchema,
  portfolioId: idSchema,
  domain: z.string().trim().min(3).max(253),
  name: z.string().trim().min(1).max(200).optional(),
  tier: z.nativeEnum(PortfolioTier).optional(),
  notes: z.string().trim().max(2000).optional(),
});

/**
 * Finds or creates the global TrackedEntity for `domain`, links it into the
 * portfolio, and seeds one Tracker per signal so the scheduler (Phase 2)
 * picks it up. STOCK starts disabled until a ticker is known.
 */
export const addEntityToPortfolio: AddEntityToPortfolio<
  z.infer<typeof addEntityToPortfolioInputSchema>,
  TrackedEntity
> = async (rawArgs, context) => {
  const { orgId, portfolioId, domain, name, tier, notes } =
    ensureArgsSchemaOrThrowHttpError(addEntityToPortfolioInputSchema, rawArgs);
  const membership = await requireOrgMember(context, orgId, OrgRole.MEMBER);

  const portfolio = await context.entities.Portfolio.findFirst({
    where: { id: portfolioId, orgId },
    select: { id: true },
  });
  if (!portfolio) {
    throw new HttpError(404, "Portfolio not found");
  }

  let normalizedDomain: string;
  try {
    normalizedDomain = normalizeDomain(domain);
  } catch {
    throw new HttpError(400, "Invalid domain");
  }

  return prisma.$transaction(async (tx) => {
    const entity = await tx.trackedEntity.upsert({
      where: { domain: normalizedDomain },
      // Existing entities keep their curated name; the caller's name only
      // applies when we're the first to add this domain.
      update: {},
      create: {
        domain: normalizedDomain,
        name: name ?? guessNameFromDomain(normalizedDomain),
        trackers: {
          create: Object.values(Signal).map((signal) => ({
            signal,
            intervalMin: DEFAULT_TRACKER_INTERVALS_MIN[signal],
            enabled: signal !== Signal.STOCK,
          })),
        },
      },
    });

    await tx.portfolioItem.upsert({
      where: { portfolioId_entityId: { portfolioId, entityId: entity.id } },
      update: { tier, notes },
      create: {
        portfolioId,
        entityId: entity.id,
        addedById: membership.userId,
        tier,
        notes,
      },
    });

    return entity;
  });
};

const updatePortfolioItemInputSchema = z.object({
  orgId: orgIdSchema,
  portfolioId: idSchema,
  entityId: idSchema,
  tier: z.nativeEnum(PortfolioTier).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

/** Edits the team's own view of a company: its tier and notes in one portfolio. */
export const updatePortfolioItem: UpdatePortfolioItem<
  z.infer<typeof updatePortfolioItemInputSchema>,
  PortfolioItem
> = async (rawArgs, context) => {
  const { orgId, portfolioId, entityId, tier, notes } =
    ensureArgsSchemaOrThrowHttpError(updatePortfolioItemInputSchema, rawArgs);
  await requireOrgMember(context, orgId, OrgRole.MEMBER);

  const { count } = await context.entities.PortfolioItem.updateMany({
    where: { portfolioId, entityId, portfolio: { orgId } },
    // An empty note is a cleared note.
    data: { tier, notes: notes === "" ? null : notes },
  });
  if (count === 0) {
    throw new HttpError(404, "Company is not in this portfolio");
  }

  return context.entities.PortfolioItem.findUniqueOrThrow({
    where: { portfolioId_entityId: { portfolioId, entityId } },
  });
};

const removeEntityFromPortfolioInputSchema = z.object({
  orgId: orgIdSchema,
  portfolioId: idSchema,
  entityId: idSchema,
});

export const removeEntityFromPortfolio: RemoveEntityFromPortfolio<
  z.infer<typeof removeEntityFromPortfolioInputSchema>,
  void
> = async (rawArgs, context) => {
  const { orgId, portfolioId, entityId } = ensureArgsSchemaOrThrowHttpError(
    removeEntityFromPortfolioInputSchema,
    rawArgs,
  );
  await requireOrgMember(context, orgId, OrgRole.MEMBER);

  const { count } = await context.entities.PortfolioItem.deleteMany({
    where: { portfolioId, entityId, portfolio: { orgId } },
  });
  if (count === 0) {
    throw new HttpError(404, "TrackedEntity is not in this portfolio");
  }
};

const entityDetail = {
  parent: { select: { id: true, name: true, domain: true } },
  children: { select: { id: true, name: true, domain: true } },
  trackers: true,
} satisfies Prisma.TrackedEntityInclude;

export type EntityDetail = Prisma.TrackedEntityGetPayload<{
  include: typeof entityDetail;
}> & {
  tags: Tag[];
  portfolios: Pick<Portfolio, "id" | "name" | "kind">[];
};

const getEntityInputSchema = z.object({
  orgId: orgIdSchema,
  entityId: idSchema,
});

export const getEntity: GetEntity<
  z.infer<typeof getEntityInputSchema>,
  EntityDetail
> = async (rawArgs, context) => {
  const { orgId, entityId } = ensureArgsSchemaOrThrowHttpError(
    getEntityInputSchema,
    rawArgs,
  );
  await requireOrgMember(context, orgId);
  await requireEntityInOrg(orgId, entityId);

  const [entity, entityTags, items] = await Promise.all([
    context.entities.TrackedEntity.findUniqueOrThrow({
      where: { id: entityId },
      include: entityDetail,
    }),
    // Tags are per-org, so only this org's tags on the entity are visible.
    context.entities.EntityTag.findMany({
      where: { entityId, tag: { orgId } },
      include: { tag: true },
    }),
    context.entities.PortfolioItem.findMany({
      where: { entityId, portfolio: { orgId } },
      select: { portfolio: { select: { id: true, name: true, kind: true } } },
    }),
  ]);

  return {
    ...entity,
    tags: entityTags.map(({ tag }) => tag),
    portfolios: items.map(({ portfolio }) => portfolio),
  };
};

const updateEntityInputSchema = z.object({
  orgId: orgIdSchema,
  entityId: idSchema,
  name: z.string().trim().min(1).max(200).optional(),
  aliases: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  ticker: z.string().trim().max(12).nullable().optional(),
  exchange: z.string().trim().max(20).nullable().optional(),
  careersUrl: z.string().trim().url().nullable().optional(),
  subreddits: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  parentId: idSchema.nullable().optional(),
});

/**
 * Entities are shared, so edits are limited to org admins who track the
 * entity. Setting a ticker also enables the STOCK tracker.
 */
export const updateEntity: UpdateEntity<
  z.infer<typeof updateEntityInputSchema>,
  TrackedEntity
> = async (rawArgs, context) => {
  const { orgId, entityId, parentId, ...data } =
    ensureArgsSchemaOrThrowHttpError(updateEntityInputSchema, rawArgs);
  await requireOrgMember(context, orgId, OrgRole.ADMIN);
  await requireEntityInOrg(orgId, entityId);

  if (parentId === entityId) {
    throw new HttpError(400, "An entity cannot be its own parent");
  }

  return prisma.$transaction(async (tx) => {
    const entity = await tx.trackedEntity.update({
      where: { id: entityId },
      data: { ...data, ...(parentId !== undefined && { parentId }) },
    });

    if (data.ticker !== undefined) {
      await tx.tracker.updateMany({
        where: { entityId, signal: Signal.STOCK },
        data: { enabled: data.ticker !== null },
      });
    }

    return entity;
  });
};

//#endregion

//#region Tags

const getTagsInputSchema = z.object({ orgId: orgIdSchema });

export const getTags: GetTags<
  z.infer<typeof getTagsInputSchema>,
  Tag[]
> = async (rawArgs, context) => {
  const { orgId } = ensureArgsSchemaOrThrowHttpError(
    getTagsInputSchema,
    rawArgs,
  );
  await requireOrgMember(context, orgId);

  return context.entities.Tag.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
  });
};

const createTagInputSchema = z.object({
  orgId: orgIdSchema,
  name: z.string().trim().min(1).max(50),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
});

export const createTag: CreateTag<
  z.infer<typeof createTagInputSchema>,
  Tag
> = async (rawArgs, context) => {
  const { orgId, name, color } = ensureArgsSchemaOrThrowHttpError(
    createTagInputSchema,
    rawArgs,
  );
  await requireOrgMember(context, orgId, OrgRole.MEMBER);

  return context.entities.Tag.upsert({
    where: { orgId_name: { orgId, name } },
    update: { ...(color && { color }) },
    create: { orgId, name, color },
  });
};

const deleteTagInputSchema = z.object({ orgId: orgIdSchema, tagId: idSchema });

export const deleteTag: DeleteTag<
  z.infer<typeof deleteTagInputSchema>,
  void
> = async (rawArgs, context) => {
  const { orgId, tagId } = ensureArgsSchemaOrThrowHttpError(
    deleteTagInputSchema,
    rawArgs,
  );
  await requireOrgMember(context, orgId, OrgRole.ADMIN);

  const { count } = await context.entities.Tag.deleteMany({
    where: { id: tagId, orgId },
  });
  if (count === 0) {
    throw new HttpError(404, "Tag not found");
  }
};

const setEntityTagsInputSchema = z.object({
  orgId: orgIdSchema,
  entityId: idSchema,
  tagIds: z.array(idSchema).max(50),
});

/** Replaces this org's tags on the entity with exactly `tagIds`. */
export const setEntityTags: SetEntityTags<
  z.infer<typeof setEntityTagsInputSchema>,
  Tag[]
> = async (rawArgs, context) => {
  const { orgId, entityId, tagIds } = ensureArgsSchemaOrThrowHttpError(
    setEntityTagsInputSchema,
    rawArgs,
  );
  await requireOrgMember(context, orgId, OrgRole.MEMBER);
  await requireEntityInOrg(orgId, entityId);

  const tags = await context.entities.Tag.findMany({
    where: { id: { in: tagIds }, orgId },
  });
  if (tags.length !== new Set(tagIds).size) {
    throw new HttpError(
      400,
      "One or more tags do not belong to this organization",
    );
  }

  await prisma.$transaction([
    prisma.entityTag.deleteMany({ where: { entityId, tag: { orgId } } }),
    prisma.entityTag.createMany({
      data: tags.map((tag) => ({ entityId, tagId: tag.id })),
    }),
  ]);

  return tags;
};

//#endregion

//#region Touchpoints

const getTouchpointsInputSchema = z.object({
  orgId: orgIdSchema,
  entityId: idSchema,
});

export type TouchpointWithAuthor = Prisma.TouchpointGetPayload<{
  include: {
    author: { select: { id: true; username: true; email: true } };
    files: { select: { id: true; name: true; type: true } };
  };
}>;

export const getTouchpoints: GetTouchpoints<
  z.infer<typeof getTouchpointsInputSchema>,
  TouchpointWithAuthor[]
> = async (rawArgs, context) => {
  const { orgId, entityId } = ensureArgsSchemaOrThrowHttpError(
    getTouchpointsInputSchema,
    rawArgs,
  );
  await requireOrgMember(context, orgId);

  return context.entities.Touchpoint.findMany({
    where: { orgId, entityId },
    include: {
      author: { select: { id: true, username: true, email: true } },
      files: { select: { id: true, name: true, type: true } },
    },
    orderBy: { occurredAt: "desc" },
  });
};

const touchpointFieldsSchema = {
  kind: z.nativeEnum(TouchpointKind),
  occurredAt: z.coerce.date(),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(10_000).nullable(),
  fileIds: z.array(idSchema).max(20),
};

const createTouchpointInputSchema = z.object({
  orgId: orgIdSchema,
  entityId: idSchema,
  kind: touchpointFieldsSchema.kind.default(TouchpointKind.NOTE),
  occurredAt: touchpointFieldsSchema.occurredAt,
  title: touchpointFieldsSchema.title,
  body: touchpointFieldsSchema.body.optional(),
  fileIds: touchpointFieldsSchema.fileIds.default([]),
});

export const createTouchpoint: CreateTouchpoint<
  z.infer<typeof createTouchpointInputSchema>,
  Touchpoint
> = async (rawArgs, context) => {
  const { orgId, entityId, fileIds, ...data } =
    ensureArgsSchemaOrThrowHttpError(createTouchpointInputSchema, rawArgs);
  const membership = await requireOrgMember(context, orgId, OrgRole.MEMBER);
  await requireEntityInOrg(orgId, entityId);
  await ensureFilesBelongToUser(fileIds, membership.userId);

  return context.entities.Touchpoint.create({
    data: {
      orgId,
      entityId,
      authorId: membership.userId,
      ...data,
      files: { connect: fileIds.map((id) => ({ id })) },
    },
  });
};

const updateTouchpointInputSchema = z.object({
  orgId: orgIdSchema,
  touchpointId: idSchema,
  kind: touchpointFieldsSchema.kind.optional(),
  occurredAt: touchpointFieldsSchema.occurredAt.optional(),
  title: touchpointFieldsSchema.title.optional(),
  body: touchpointFieldsSchema.body.optional(),
  fileIds: touchpointFieldsSchema.fileIds.optional(),
});

export const updateTouchpoint: UpdateTouchpoint<
  z.infer<typeof updateTouchpointInputSchema>,
  Touchpoint
> = async (rawArgs, context) => {
  const { orgId, touchpointId, fileIds, ...data } =
    ensureArgsSchemaOrThrowHttpError(updateTouchpointInputSchema, rawArgs);
  const membership = await requireOrgMember(context, orgId, OrgRole.MEMBER);

  const existing = await context.entities.Touchpoint.findFirst({
    where: { id: touchpointId, orgId },
    select: { authorId: true },
  });
  if (!existing) {
    throw new HttpError(404, "Touchpoint not found");
  }
  // Members edit their own notes; admins can edit anyone's.
  if (
    existing.authorId !== membership.userId &&
    membership.role !== OrgRole.ADMIN &&
    membership.role !== OrgRole.OWNER
  ) {
    throw new HttpError(403, "You can only edit your own touchpoints");
  }

  if (fileIds) {
    await ensureFilesBelongToUser(fileIds, membership.userId);
  }

  return context.entities.Touchpoint.update({
    where: { id: touchpointId },
    data: {
      ...data,
      ...(fileIds && { files: { set: fileIds.map((id) => ({ id })) } }),
    },
  });
};

const deleteTouchpointInputSchema = z.object({
  orgId: orgIdSchema,
  touchpointId: idSchema,
});

export const deleteTouchpoint: DeleteTouchpoint<
  z.infer<typeof deleteTouchpointInputSchema>,
  void
> = async (rawArgs, context) => {
  const { orgId, touchpointId } = ensureArgsSchemaOrThrowHttpError(
    deleteTouchpointInputSchema,
    rawArgs,
  );
  const membership = await requireOrgMember(context, orgId, OrgRole.MEMBER);

  const isAdmin =
    membership.role === OrgRole.ADMIN || membership.role === OrgRole.OWNER;
  const { count } = await context.entities.Touchpoint.deleteMany({
    where: {
      id: touchpointId,
      orgId,
      ...(!isAdmin && { authorId: membership.userId }),
    },
  });
  if (count === 0) {
    throw new HttpError(404, "Touchpoint not found");
  }
};

async function ensureFilesBelongToUser(
  fileIds: string[],
  userId: string,
): Promise<void> {
  if (fileIds.length === 0) return;
  const owned = await prisma.file.count({
    where: { id: { in: fileIds }, userId },
  });
  if (owned !== new Set(fileIds).size) {
    throw new HttpError(400, "One or more files are not yours");
  }
}

//#endregion
