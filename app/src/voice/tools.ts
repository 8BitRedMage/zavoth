import { PortfolioKind, PortfolioTier, TouchpointKind } from "@prisma/client";
import type { ExecuteVoiceTool } from "wasp/server/operations";
import * as z from "zod";
import { normalizeDomain } from "../competitive/entities";
import {
  lookUpEntityFootprint,
  saveEntityFootprint,
} from "../competitive/footprint/operations";
import {
  addEntityToPortfolio,
  createOrganization,
  createPortfolio,
  createTag,
  createTouchpoint,
  deletePortfolio,
  deleteTag,
  deleteTouchpoint,
  getEntity,
  getMyOrganizations,
  getPortfolios,
  getTags,
  getTouchpoints,
  removeEntityFromPortfolio,
  setEntityTags,
  updateEntity,
  updatePortfolio,
  updatePortfolioItem,
  updateTouchpoint,
  type PortfolioWithItems,
} from "../competitive/operations";
import {
  getManualSources,
  recordManualData,
  setEntityProfileUrl,
  type ManualSourceState,
} from "../competitive/manualSources/operations";
import {
  MANUAL_PLATFORMS,
  PLATFORM_DEFINITIONS,
  formatManualValue,
} from "../competitive/manualSources/platforms";
import {
  VOICE_PAGES,
  type ClientToolName,
  type Json,
  type RealtimeToolDefinition,
  type VoiceLink,
} from "./shared";

// Voice tools are a thin, speech-friendly skin over the competitive
// operations. They never touch Prisma themselves: every read and write goes
// through an operation, so `requireOrgMember` stays the only authz boundary.
//
// The one thing they add is name resolution. People say "my competitors
// portfolio", not a UUID, so tools take names and resolve them server-side.

export type VoiceToolContext = Parameters<ExecuteVoiceTool<any, any>>[1];

/** An error whose message is safe and useful to hand back to the model. */
export class VoiceToolError extends Error {}

/**
 * A tool result that also puts a link on the user's screen. The link travels
 * beside the model's copy of the output, not through it.
 */
export class OutputWithLink {
  constructor(
    readonly output: unknown,
    readonly link: VoiceLink,
  ) {}
}

interface VoiceTool {
  definition: RealtimeToolDefinition;
  run: (rawArgs: unknown, context: VoiceToolContext) => Promise<unknown>;
}

function defineTool<Schema extends z.ZodObject>(tool: {
  name: string;
  description: string;
  schema: Schema;
  run: (args: z.infer<Schema>, context: VoiceToolContext) => Promise<unknown>;
}): VoiceTool {
  const { $schema: _, ...parameters } = z.toJSONSchema(tool.schema, {
    io: "input",
  });

  return {
    definition: {
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: parameters as { [key: string]: Json },
    },
    run: (rawArgs, context) => {
      const parsed = tool.schema.safeParse(rawArgs ?? {});
      if (!parsed.success) {
        throw new VoiceToolError(
          `Invalid arguments:\n${z.prettifyError(parsed.error)}`,
        );
      }
      return tool.run(parsed.data, context);
    },
  };
}

//#region Name resolution

const normalize = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Finds the one candidate the speaker meant: by id, then exact name, then a
 * loose contains-match. Ambiguity and misses throw with the available options
 * so the model can ask the user instead of guessing.
 */
function resolveByName<T extends { id: string }>(
  kind: string,
  ref: string,
  candidates: T[],
  keysOf: (candidate: T) => (string | null | undefined)[],
  labelOf: (candidate: T) => string,
): T {
  const byId = candidates.find((candidate) => candidate.id === ref);
  if (byId) return byId;

  const target = normalize(ref);
  const keys = (candidate: T) =>
    keysOf(candidate)
      .filter((key): key is string => !!key)
      .map(normalize)
      .filter((key) => key.length > 0);

  let matches = candidates.filter((c) => keys(c).includes(target));
  if (matches.length === 0 && target.length >= 3) {
    matches = candidates.filter((c) =>
      keys(c).some((key) => key.includes(target) || target.includes(key)),
    );
  }

  if (matches.length === 1) return matches[0];

  const options = (matches.length > 0 ? matches : candidates)
    .slice(0, 15)
    .map(labelOf)
    .join(", ");
  if (matches.length > 1) {
    throw new VoiceToolError(
      `"${ref}" matches more than one ${kind}: ${options}. Ask the user which one they mean.`,
    );
  }
  throw new VoiceToolError(
    candidates.length === 0
      ? `There are no ${kind}s yet.`
      : `No ${kind} matches "${ref}". Available: ${options}.`,
  );
}

async function resolveOrgId(
  context: VoiceToolContext,
  org: string | undefined,
): Promise<string> {
  const orgs = await getMyOrganizations(undefined, context);
  if (org) {
    return resolveByName(
      "organization",
      org,
      orgs,
      (o) => [o.name],
      (o) => o.name,
    ).id;
  }
  if (orgs.length === 1) return orgs[0].id;
  if (orgs.length === 0) {
    throw new VoiceToolError(
      "The user does not belong to an organization yet. Offer to create one.",
    );
  }
  throw new VoiceToolError(
    `The user belongs to several organizations: ${orgs
      .map((o) => o.name)
      .join(", ")}. Ask which one, then pass it as "org".`,
  );
}

function resolvePortfolio(portfolios: PortfolioWithItems[], ref: string) {
  return resolveByName(
    "portfolio",
    ref,
    portfolios,
    (p) => [p.name],
    (p) => p.name,
  );
}

type PortfolioEntity = PortfolioWithItems["items"][number]["entity"];

function resolveCompany(portfolios: PortfolioWithItems[], ref: string) {
  const companies = new Map<string, PortfolioEntity>();
  for (const portfolio of portfolios) {
    for (const { entity } of portfolio.items) {
      companies.set(entity.id, entity);
    }
  }

  // "https://www.acme.com/pricing" should still find acme.com.
  let domainRef: string | undefined;
  try {
    domainRef = ref.includes(".") ? normalizeDomain(ref) : undefined;
  } catch {
    domainRef = undefined;
  }
  const byDomain =
    domainRef && [...companies.values()].find((c) => c.domain === domainRef);
  if (byDomain) return byDomain;

  return resolveByName(
    "company",
    ref,
    [...companies.values()],
    (c) => [c.name, c.domain, c.ticker, ...c.aliases],
    (c) => `${c.name} (${c.domain})`,
  );
}

/** Resolves the org and one of its tracked companies in a single step. */
async function resolveOrgAndCompany(
  context: VoiceToolContext,
  org: string | undefined,
  company: string,
) {
  const orgId = await resolveOrgId(context, org);
  const portfolios = await getPortfolios({ orgId }, context);
  return { orgId, portfolios, entity: resolveCompany(portfolios, company) };
}

function requireConfirmation(confirmed: boolean, action: string): void {
  if (!confirmed) {
    throw new VoiceToolError(
      `Not done. Tell the user you are about to ${action} and that it cannot be undone. Only after they clearly say yes, call this tool again with confirmed set to true.`,
    );
  }
}

function parseOccurredAt(value: string | undefined): Date {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new VoiceToolError(
      `"${value}" is not a valid date. Use ISO 8601, for example 2026-03-14T15:00:00.`,
    );
  }
  return date;
}

//#endregion

//#region Tool definitions

const org = z
  .string()
  .optional()
  .describe(
    "Organization name. Omit it unless the user belongs to several organizations.",
  );
const portfolioRef = z
  .string()
  .describe("Portfolio name as the user said it, e.g. 'Competitors'.");
const companyRef = z
  .string()
  .describe("Tracked company, by name, domain or ticker, e.g. 'Acme'.");
const confirmed = z
  .boolean()
  .describe(
    "True only once the user has verbally confirmed this exact action in this conversation.",
  );

const manualPlatform = z
  .enum(MANUAL_PLATFORMS)
  .describe("A platform that forbids bots, which the user reads for us.");

const METRIC_KIND_HINTS = {
  count: "a whole number",
  rating: "a number from 0 to 5",
  percent: "a percentage from 0 to 100",
  usd: "an amount in US dollars, as a plain number",
  text: "a short phrase",
} as const;

/** One recorded capture in a shape that is easy to say out loud. */
function describeCapture(source: ManualSourceState, index: number) {
  const capture = source.captures[index];
  if (!capture) return null;
  return {
    when: capture.capturedAt,
    by: capture.recordedBy,
    values: Object.fromEntries(
      source.metrics.flatMap((metric) => {
        const value = capture.values[metric.key];
        return value === undefined
          ? []
          : [[metric.label, formatManualValue(metric.kind, value)]];
      }),
    ),
    notes: capture.notes,
  };
}

const summarizePortfolio = (portfolio: PortfolioWithItems) => ({
  name: portfolio.name,
  kind: portfolio.kind,
  description: portfolio.description,
  companies: portfolio.items.map(({ entity, tier, notes }) => ({
    name: entity.name,
    domain: entity.domain,
    tier,
    notes,
    parentCompany: entity.parent?.name,
  })),
});

const serverTools: VoiceTool[] = [
  defineTool({
    name: "list_organizations",
    description:
      "List the organizations (teams) the user belongs to, with their role in each.",
    schema: z.object({}),
    run: async (_args, context) => {
      const orgs = await getMyOrganizations(undefined, context);
      return orgs.map(({ name, role }) => ({ name, role }));
    },
  }),

  defineTool({
    name: "create_organization",
    description: "Create a new organization owned by the user.",
    schema: z.object({ name: z.string().describe("Organization name.") }),
    run: async ({ name }, context) => {
      const created = await createOrganization({ name }, context);
      return { created: created.name };
    },
  }),

  defineTool({
    name: "list_portfolios",
    description:
      "List every portfolio with the companies tracked in it. Use this to answer questions about what is being tracked.",
    schema: z.object({ org }),
    run: async (args, context) => {
      const orgId = await resolveOrgId(context, args.org);
      const portfolios = await getPortfolios({ orgId }, context);
      return portfolios.map(summarizePortfolio);
    },
  }),

  defineTool({
    name: "create_portfolio",
    description: "Create a new, empty portfolio.",
    schema: z.object({
      org,
      name: z.string().describe("Portfolio name."),
      kind: z
        .enum(PortfolioKind)
        .optional()
        .describe("What the portfolio groups. Defaults to COMPETITOR."),
      description: z.string().optional(),
    }),
    run: async ({ org, kind, ...data }, context) => {
      const orgId = await resolveOrgId(context, org);
      const created = await createPortfolio(
        { orgId, kind: kind ?? PortfolioKind.COMPETITOR, ...data },
        context,
      );
      return { created: created.name, kind: created.kind };
    },
  }),

  defineTool({
    name: "update_portfolio",
    description: "Rename a portfolio or change its kind or description.",
    schema: z.object({
      org,
      portfolio: portfolioRef,
      newName: z.string().optional(),
      kind: z.enum(PortfolioKind).optional(),
      description: z
        .string()
        .nullable()
        .optional()
        .describe("New description, or null to clear it."),
    }),
    run: async ({ org, portfolio, newName, kind, description }, context) => {
      const orgId = await resolveOrgId(context, org);
      const portfolios = await getPortfolios({ orgId }, context);
      const target = resolvePortfolio(portfolios, portfolio);
      const updated = await updatePortfolio(
        { orgId, portfolioId: target.id, name: newName, kind, description },
        context,
      );
      return {
        updated: updated.name,
        kind: updated.kind,
        description: updated.description,
      };
    },
  }),

  defineTool({
    name: "delete_portfolio",
    description:
      "Permanently delete a portfolio and everything tracked inside it. Requires verbal confirmation.",
    schema: z.object({ org, portfolio: portfolioRef, confirmed }),
    run: async ({ org, portfolio, confirmed }, context) => {
      const orgId = await resolveOrgId(context, org);
      const portfolios = await getPortfolios({ orgId }, context);
      const target = resolvePortfolio(portfolios, portfolio);
      requireConfirmation(
        confirmed,
        `delete the portfolio "${target.name}" with ${target.items.length} companies`,
      );
      await deletePortfolio({ orgId, portfolioId: target.id }, context);
      return { deleted: target.name };
    },
  }),

  defineTool({
    name: "add_company_to_portfolio",
    description:
      "Start tracking a company by adding it to a portfolio. Companies are identified by their website domain.",
    schema: z.object({
      org,
      portfolio: portfolioRef,
      domain: z
        .string()
        .describe(
          "The company's website domain, e.g. 'acme.com'. Convert spoken forms like 'acme dot com'.",
        ),
      name: z.string().optional().describe("Company display name."),
      tier: z
        .enum(PortfolioTier)
        .optional()
        .describe("How closely to watch this company."),
      notes: z.string().optional(),
    }),
    run: async ({ org, portfolio, ...data }, context) => {
      const orgId = await resolveOrgId(context, org);
      const portfolios = await getPortfolios({ orgId }, context);
      const target = resolvePortfolio(portfolios, portfolio);
      const entity = await addEntityToPortfolio(
        { orgId, portfolioId: target.id, ...data },
        context,
      );
      return {
        added: entity.name,
        domain: entity.domain,
        portfolio: target.name,
        // Set once someone has been through the footprint lookup.
        footprintLookedUp: entity.enrichedAt !== null,
      };
    },
  }),

  defineTool({
    name: "look_up_company_footprint",
    description:
      "Research a tracked company's public footprint: its stock ticker, job board and open roles, subreddits, and website sitemap. Takes up to ten seconds, so tell the user you are looking first. Saves nothing: report what was found, then call save_company_footprint with the parts the user wants to keep.",
    schema: z.object({ org, company: companyRef }),
    run: async ({ org, company }, context) => {
      const { orgId, entity } = await resolveOrgAndCompany(
        context,
        org,
        company,
      );
      const { stock, hiring, communities, website } =
        await lookUpEntityFootprint({ orgId, entityId: entity.id }, context);
      return {
        company: entity.name,
        stock: {
          status: stock.status,
          note: stock.detail,
          candidates: stock.candidates,
          needsUserChoice:
            stock.candidates.length > 1 ||
            stock.candidates.some((candidate) => !candidate.exact),
        },
        hiring: {
          status: hiring.status,
          note: hiring.detail,
          jobBoard: hiring.provider,
          openRoles: hiring.openRoles,
          careersUrl: hiring.careersUrl,
          // An unverified board was matched by its web address alone.
          verifiedByName: hiring.nameVerified,
        },
        subreddits: {
          status: communities.status,
          note: communities.detail,
          found: communities.subreddits,
        },
        website: {
          status: website.status,
          note: website.detail,
          pagesInSitemap: website.pageCount,
          keyPagesFound: Object.keys(website.keyPages),
        },
        alreadySaved: {
          ticker: entity.ticker,
          subreddits: entity.subreddits,
        },
      };
    },
  }),

  defineTool({
    name: "save_company_footprint",
    description:
      "Save parts of the most recent look_up_company_footprint result to the company. Only pass the parts the user agreed to keep. Values come from the lookup itself, so this cannot store anything the lookup did not find.",
    schema: z.object({
      org,
      company: companyRef,
      ticker: z
        .string()
        .optional()
        .describe("The ticker symbol to keep, one of the lookup's candidates."),
      careers: z
        .boolean()
        .optional()
        .describe("True to keep the job board or careers page."),
      subreddits: z
        .array(z.string())
        .optional()
        .describe("Names of the found subreddits to keep."),
      website: z
        .boolean()
        .optional()
        .describe(
          "True to keep the sitemap and key pages for website tracking.",
        ),
    }),
    run: async ({ org, company, ...parts }, context) => {
      const { orgId, entity } = await resolveOrgAndCompany(
        context,
        org,
        company,
      );
      const {
        saved,
        skipped,
        entity: updated,
      } = await saveEntityFootprint(
        { orgId, entityId: entity.id, ...parts },
        context,
      );
      return {
        company: updated.name,
        saved,
        skipped,
        ticker: updated.ticker,
        careersUrl: updated.careersUrl,
        subreddits: updated.subreddits,
      };
    },
  }),

  defineTool({
    name: "update_company_in_portfolio",
    description:
      "Change how closely a company is watched in one portfolio (its tier) or the team's notes about it there. Only pass the fields that should change.",
    schema: z.object({
      org,
      portfolio: portfolioRef,
      company: companyRef,
      tier: z
        .enum(PortfolioTier)
        .nullable()
        .optional()
        .describe("New tier, or null to clear it."),
      notes: z
        .string()
        .nullable()
        .optional()
        .describe("Replaces the notes, or null to clear them."),
    }),
    run: async ({ org, portfolio, company, tier, notes }, context) => {
      const orgId = await resolveOrgId(context, org);
      const portfolios = await getPortfolios({ orgId }, context);
      const target = resolvePortfolio(portfolios, portfolio);
      const entity = resolveCompany([target], company);
      const updated = await updatePortfolioItem(
        { orgId, portfolioId: target.id, entityId: entity.id, tier, notes },
        context,
      );
      return {
        updated: entity.name,
        portfolio: target.name,
        tier: updated.tier,
        notes: updated.notes,
      };
    },
  }),

  defineTool({
    name: "remove_company_from_portfolio",
    description:
      "Stop tracking a company in one portfolio. The company stays in any other portfolio it belongs to.",
    schema: z.object({ org, portfolio: portfolioRef, company: companyRef }),
    run: async ({ org, portfolio, company }, context) => {
      const orgId = await resolveOrgId(context, org);
      const portfolios = await getPortfolios({ orgId }, context);
      const target = resolvePortfolio(portfolios, portfolio);
      const entity = resolveCompany([target], company);
      await removeEntityFromPortfolio(
        { orgId, portfolioId: target.id, entityId: entity.id },
        context,
      );
      return { removed: entity.name, portfolio: target.name };
    },
  }),

  defineTool({
    name: "get_company",
    description:
      "Get the full profile of a tracked company: identifiers, tags, portfolios, related companies and the status of each data tracker.",
    schema: z.object({ org, company: companyRef }),
    run: async ({ org, company }, context) => {
      const { orgId, entity } = await resolveOrgAndCompany(
        context,
        org,
        company,
      );
      const detail = await getEntity({ orgId, entityId: entity.id }, context);
      return {
        name: detail.name,
        domain: detail.domain,
        aliases: detail.aliases,
        ticker: detail.ticker,
        exchange: detail.exchange,
        careersUrl: detail.careersUrl,
        subreddits: detail.subreddits,
        parentCompany: detail.parent?.name,
        subsidiaries: detail.children.map((child) => child.name),
        tags: detail.tags.map((tag) => tag.name),
        portfolios: detail.portfolios.map((p) => p.name),
        trackers: detail.trackers.map((tracker) => ({
          signal: tracker.signal,
          enabled: tracker.enabled,
          lastStatus: tracker.lastStatus,
          lastRunAt: tracker.lastRunAt,
          lastError: tracker.lastError,
        })),
      };
    },
  }),

  defineTool({
    name: "update_company",
    description:
      "Edit a tracked company's profile. Only pass the fields that should change. Setting a ticker turns on stock tracking.",
    schema: z.object({
      org,
      company: companyRef,
      name: z.string().optional(),
      aliases: z
        .array(z.string())
        .optional()
        .describe("Replaces the full list of alternative names."),
      ticker: z
        .string()
        .nullable()
        .optional()
        .describe("Stock ticker symbol, or null to clear it."),
      exchange: z.string().nullable().optional(),
      careersUrl: z.string().nullable().optional(),
      subreddits: z
        .array(z.string())
        .optional()
        .describe("Replaces the list of subreddits watched for sentiment."),
      parentCompany: z
        .string()
        .nullable()
        .optional()
        .describe("Another tracked company that owns this one, or null."),
    }),
    run: async ({ org, company, parentCompany, ...data }, context) => {
      const { orgId, portfolios, entity } = await resolveOrgAndCompany(
        context,
        org,
        company,
      );
      const parentId =
        parentCompany == null
          ? parentCompany
          : resolveCompany(portfolios, parentCompany).id;
      const updated = await updateEntity(
        { orgId, entityId: entity.id, parentId, ...data },
        context,
      );
      return {
        updated: updated.name,
        aliases: updated.aliases,
        ticker: updated.ticker,
        exchange: updated.exchange,
        careersUrl: updated.careersUrl,
        subreddits: updated.subreddits,
      };
    },
  }),

  defineTool({
    name: "list_tags",
    description: "List the organization's tags.",
    schema: z.object({ org }),
    run: async (args, context) => {
      const orgId = await resolveOrgId(context, args.org);
      const tags = await getTags({ orgId }, context);
      return tags.map((tag) => tag.name);
    },
  }),

  defineTool({
    name: "tag_company",
    description:
      "Add tags to and/or remove tags from a tracked company. Tags that do not exist yet are created.",
    schema: z.object({
      org,
      company: companyRef,
      add: z.array(z.string()).optional().describe("Tag names to add."),
      remove: z.array(z.string()).optional().describe("Tag names to remove."),
    }),
    run: async ({ org, company, add = [], remove = [] }, context) => {
      const { orgId, entity } = await resolveOrgAndCompany(
        context,
        org,
        company,
      );
      const [orgTags, detail] = await Promise.all([
        getTags({ orgId }, context),
        getEntity({ orgId, entityId: entity.id }, context),
      ]);

      const tagIds = new Set(detail.tags.map((tag) => tag.id));
      for (const name of remove) {
        const tag = resolveByName(
          "tag",
          name,
          detail.tags,
          (t) => [t.name],
          (t) => t.name,
        );
        tagIds.delete(tag.id);
      }
      for (const name of add) {
        const existing = orgTags.find(
          (tag) => normalize(tag.name) === normalize(name),
        );
        const tag = existing ?? (await createTag({ orgId, name }, context));
        tagIds.add(tag.id);
      }

      const tags = await setEntityTags(
        { orgId, entityId: entity.id, tagIds: [...tagIds] },
        context,
      );
      return { company: entity.name, tags: tags.map((tag) => tag.name) };
    },
  }),

  defineTool({
    name: "delete_tag",
    description:
      "Permanently delete a tag from the organization, removing it from every company. Requires verbal confirmation.",
    schema: z.object({ org, tag: z.string().describe("Tag name."), confirmed }),
    run: async ({ org, tag, confirmed }, context) => {
      const orgId = await resolveOrgId(context, org);
      const tags = await getTags({ orgId }, context);
      const target = resolveByName(
        "tag",
        tag,
        tags,
        (t) => [t.name],
        (t) => t.name,
      );
      requireConfirmation(confirmed, `delete the tag "${target.name}"`);
      await deleteTag({ orgId, tagId: target.id }, context);
      return { deleted: target.name };
    },
  }),

  defineTool({
    name: "list_touchpoints",
    description:
      "List the team's logged interactions with a company (calls, meetings, emails, demos, notes, won and lost deals), newest first.",
    schema: z.object({
      org,
      company: companyRef,
      limit: z.number().int().min(1).max(50).optional().describe("Default 10."),
    }),
    run: async ({ org, company, limit = 10 }, context) => {
      const { orgId, entity } = await resolveOrgAndCompany(
        context,
        org,
        company,
      );
      const touchpoints = await getTouchpoints(
        { orgId, entityId: entity.id },
        context,
      );
      return {
        company: entity.name,
        total: touchpoints.length,
        touchpoints: touchpoints.slice(0, limit).map((touchpoint) => ({
          id: touchpoint.id,
          kind: touchpoint.kind,
          occurredAt: touchpoint.occurredAt,
          title: touchpoint.title,
          body: touchpoint.body,
          author: touchpoint.author.username ?? touchpoint.author.email,
          attachments: touchpoint.files.length,
        })),
      };
    },
  }),

  defineTool({
    name: "log_touchpoint",
    description:
      "Record an interaction with, or a note about, a tracked company.",
    schema: z.object({
      org,
      company: companyRef,
      title: z.string().describe("Short summary, a few words."),
      kind: z.enum(TouchpointKind).optional().describe("Defaults to NOTE."),
      body: z.string().optional().describe("The details, in full sentences."),
      occurredAt: z
        .string()
        .optional()
        .describe("When it happened, ISO 8601. Defaults to now."),
    }),
    run: async ({ org, company, occurredAt, kind, ...data }, context) => {
      const { orgId, entity } = await resolveOrgAndCompany(
        context,
        org,
        company,
      );
      const created = await createTouchpoint(
        {
          orgId,
          entityId: entity.id,
          occurredAt: parseOccurredAt(occurredAt),
          kind: kind ?? TouchpointKind.NOTE,
          fileIds: [],
          ...data,
        },
        context,
      );
      return {
        logged: created.title,
        kind: created.kind,
        company: entity.name,
        occurredAt: created.occurredAt,
      };
    },
  }),

  defineTool({
    name: "update_touchpoint",
    description:
      "Edit a logged touchpoint. Only pass the fields that should change.",
    schema: z.object({
      org,
      company: companyRef,
      touchpoint: z
        .string()
        .describe("The touchpoint's id from list_touchpoints, or its title."),
      title: z.string().optional(),
      kind: z.enum(TouchpointKind).optional(),
      body: z.string().nullable().optional(),
      occurredAt: z.string().optional().describe("ISO 8601."),
    }),
    run: async ({ org, company, touchpoint, occurredAt, ...data }, context) => {
      const { orgId, entity } = await resolveOrgAndCompany(
        context,
        org,
        company,
      );
      const touchpoints = await getTouchpoints(
        { orgId, entityId: entity.id },
        context,
      );
      const target = resolveByName(
        "touchpoint",
        touchpoint,
        touchpoints,
        (t) => [t.title],
        (t) => `"${t.title}"`,
      );
      const updated = await updateTouchpoint(
        {
          orgId,
          touchpointId: target.id,
          ...(occurredAt && { occurredAt: parseOccurredAt(occurredAt) }),
          ...data,
        },
        context,
      );
      return {
        updated: updated.title,
        kind: updated.kind,
        occurredAt: updated.occurredAt,
      };
    },
  }),

  defineTool({
    name: "delete_touchpoint",
    description:
      "Permanently delete a logged touchpoint. Requires verbal confirmation.",
    schema: z.object({
      org,
      company: companyRef,
      touchpoint: z
        .string()
        .describe("The touchpoint's id from list_touchpoints, or its title."),
      confirmed,
    }),
    run: async ({ org, company, touchpoint, confirmed }, context) => {
      const { orgId, entity } = await resolveOrgAndCompany(
        context,
        org,
        company,
      );
      const touchpoints = await getTouchpoints(
        { orgId, entityId: entity.id },
        context,
      );
      const target = resolveByName(
        "touchpoint",
        touchpoint,
        touchpoints,
        (t) => [t.title],
        (t) => `"${t.title}"`,
      );
      requireConfirmation(
        confirmed,
        `delete the touchpoint "${target.title}" on ${entity.name}`,
      );
      await deleteTouchpoint({ orgId, touchpointId: target.id }, context);
      return { deleted: target.title };
    },
  }),

  defineTool({
    name: "list_manual_sources",
    description:
      "For one company, list the platforms that forbid automated collection (LinkedIn, G2, Glassdoor, Trustpilot, Crunchbase), what the team last recorded from each and when, and whether the company's page there is already known. Use it to decide which platforms are worth walking through with the user.",
    schema: z.object({ org, company: companyRef }),
    run: async ({ org, company }, context) => {
      const { orgId, entity } = await resolveOrgAndCompany(
        context,
        org,
        company,
      );
      const sources = await getManualSources(
        { orgId, entityId: entity.id },
        context,
      );
      return {
        company: entity.name,
        // Spelled out because a bare null has been read as "not tracked".
        toCollectOrUpdate:
          "Call open_company_profile for the platform. The company is tracked; a platform with nothing recorded just has not been read yet.",
        platforms: sources.map((source) => ({
          platform: source.platform,
          name: source.label,
          pageKnown: source.link.kind === "saved",
          lastRecorded: describeCapture(source, 0) ?? "nothing yet",
        })),
      };
    },
  }),

  defineTool({
    name: "open_company_profile",
    description:
      "Always the first step when the user wants anything from LinkedIn, G2, Glassdoor, Trustpilot or Crunchbase, such as followers, employees, ratings, reviews or funding. Puts a link to the company's page in the chat, which the user clicks to open in a new tab with their own login; Zavoth itself never visits the platform. Returns the steps to follow, the exact questions to ask about what they see, and what was recorded last time. With useSearch, links to the platform's search results instead, for when the first link opened the wrong page.",
    schema: z.object({
      org,
      company: companyRef,
      platform: manualPlatform,
      useSearch: z
        .boolean()
        .optional()
        .describe(
          "True to link to a search for the company instead of a specific page.",
        ),
    }),
    run: async ({ org, company, platform, useSearch }, context) => {
      const { orgId, entity } = await resolveOrgAndCompany(
        context,
        org,
        company,
      );
      const sources = await getManualSources(
        { orgId, entityId: entity.id },
        context,
      );
      const source = sources.find((s) => s.platform === platform)!;
      const searching = useSearch || source.link.kind === "search";

      // The walkthrough lives in the result, not only in the system prompt:
      // the model follows steps it has just been handed far more reliably,
      // and without them it has claimed to save answers it never sent.
      const label = `${entity.name} on ${source.label}`;
      return new OutputWithLink(
        {
          shownOnScreen: `A card in the chat labelled "${label}", listing the questions below. Clicking it opens the page in a new browser tab. You have not opened anything.`,
          steps: [
            "Tell the user the link is in the chat, and to click it to open the page in a new tab. Then wait until they say it is open.",
            searching
              ? "The link shows search results. Ask them to pick the right company from the list, and to say when its page is open."
              : source.link.kind === "saved"
                ? "This is the company's confirmed page, so do not ask whether it is the right one."
                : "The link is a best guess. Ask whether it opened the right company. If yes, call set_company_profile_link with confirmGuess before the first question. If no, call open_company_profile again with useSearch.",
            "Ask the questions one at a time, in order, saying where on the page to look. Move on when they say skip or cannot see it.",
            "After the last question, ask once whether anything else stood out. Whatever they reply, your next action is to call record_manual_data with every answer, and their remark as notes. Do not ask permission to save. Nothing is saved until that call succeeds, so do not say it is recorded before then.",
          ],
          questions: source.metrics.map((metric) => ({
            key: metric.key,
            ask: metric.ask,
            answerIs: METRIC_KIND_HINTS[metric.kind],
          })),
          lastRecorded: describeCapture(source, 0),
        },
        {
          url: searching ? source.link.searchUrl : source.link.url,
          label,
          hint: searching
            ? "Search results · opens in a new tab with your login"
            : "Opens in a new tab with your login",
          checklist: source.metrics.map((metric) => metric.ask),
        },
      );
    },
  }),

  defineTool({
    name: "set_company_profile_link",
    description:
      "Remember which page is a company's on a platform, so future links go straight to it. Either confirm the guess that open_company_profile just showed, or give the page's handle: the last part of its address, such as 'acme-robotics' in linkedin.com/company/acme-robotics.",
    schema: z.object({
      org,
      company: companyRef,
      platform: manualPlatform,
      confirmGuess: z
        .boolean()
        .optional()
        .describe(
          "True when the user confirmed that the guessed link opened the right company.",
        ),
      handle: z
        .string()
        .optional()
        .describe("The handle the user read out from the page's address."),
    }),
    run: async ({ org, company, platform, confirmGuess, handle }, context) => {
      const { orgId, entity } = await resolveOrgAndCompany(
        context,
        org,
        company,
      );

      let url = handle;
      if (!url && confirmGuess) {
        const sources = await getManualSources(
          { orgId, entityId: entity.id },
          context,
        );
        const { link } = sources.find((s) => s.platform === platform)!;
        if (link.kind === "saved") {
          return { alreadySaved: true, company: entity.name, platform };
        }
        if (link.kind !== "guess") {
          throw new VoiceToolError(
            `There is no guessed page for ${PLATFORM_DEFINITIONS[platform].label}. Its pages cannot be worked out from a name, so the link can only be saved from the company panel on the Portfolios page, by pasting the address.`,
          );
        }
        url = link.url;
      }
      if (!url) {
        throw new VoiceToolError("Pass either confirmGuess or a handle.");
      }

      await setEntityProfileUrl(
        { orgId, entityId: entity.id, platform, url },
        context,
      );
      return { saved: true, company: entity.name, platform };
    },
  }),

  defineTool({
    name: "record_manual_data",
    description:
      "Record what the user read off a company's page on a platform. Use the keys from open_company_profile's questions, and only include what the user actually told you. Numbers must be plain numbers: convert '12.5 thousand' to 12500 and '4 and a half stars' to 4.5. Returns the change since the last recording.",
    schema: z.object({
      org,
      company: companyRef,
      platform: manualPlatform,
      values: z
        .record(z.string(), z.union([z.number(), z.string()]))
        .describe('Answers keyed by question key, e.g. {"followers": 12500}.'),
      notes: z
        .string()
        .optional()
        .describe(
          "Anything else worth keeping that the user mentioned, such as what recent posts or reviews are about.",
        ),
      capturedAt: z
        .string()
        .optional()
        .describe("When the user looked, ISO 8601. Defaults to now."),
    }),
    run: async (
      { org, company, platform, values, notes, capturedAt },
      context,
    ) => {
      const { orgId, entity } = await resolveOrgAndCompany(
        context,
        org,
        company,
      );
      const result = await recordManualData(
        {
          orgId,
          entityId: entity.id,
          platform,
          values,
          notes,
          ...(capturedAt && { capturedAt: parseOccurredAt(capturedAt) }),
        },
        context,
      );

      const { metrics, label } = PLATFORM_DEFINITIONS[platform];
      return {
        recorded: entity.name,
        platform: label,
        values: result.values,
        notAskedYet: metrics
          .filter((metric) => !(metric.key in result.values))
          .map((metric) => metric.key),
        changeSinceLast: result.previous && {
          lastRecordedAt: result.previous.capturedAt,
          changes: metrics.flatMap((metric) => {
            const before = result.previous!.values[metric.key];
            const now = result.values[metric.key];
            if (before === undefined || now === undefined || before === now) {
              return [];
            }
            return [
              {
                what: metric.label,
                before: formatManualValue(metric.kind, before),
                now: formatManualValue(metric.kind, now),
                ...(typeof before === "number" &&
                  typeof now === "number" &&
                  before !== 0 && {
                    percentChange:
                      Math.round(((now - before) / before) * 1000) / 10,
                  }),
              },
            ];
          }),
        },
      };
    },
  }),
];

// Declared here so the model sees one tool list, but executed in the browser.
const clientToolDefinitions: Record<ClientToolName, RealtimeToolDefinition> = {
  navigate_to: {
    type: "function",
    name: "navigate_to",
    description:
      "Open a page of the app on the user's screen. Use it when they ask to go to, open or show a page.",
    parameters: {
      type: "object",
      properties: { page: { type: "string", enum: [...VOICE_PAGES] } },
      required: ["page"],
      additionalProperties: false,
    },
  },
  end_conversation: {
    type: "function",
    name: "end_conversation",
    description:
      "Hang up. Call this after saying goodbye when the user says they are done.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
};

//#endregion

const serverToolsByName = new Map(
  serverTools.map((tool) => [tool.definition.name, tool]),
);

export const voiceToolDefinitions: RealtimeToolDefinition[] = [
  ...serverTools.map((tool) => tool.definition),
  ...Object.values(clientToolDefinitions),
];

export async function runVoiceTool(
  name: string,
  args: unknown,
  context: VoiceToolContext,
): Promise<unknown> {
  const tool = serverToolsByName.get(name);
  if (!tool) {
    throw new VoiceToolError(`There is no tool called "${name}".`);
  }
  return tool.run(args, context);
}
