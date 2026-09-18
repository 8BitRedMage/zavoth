import {
  OrgRole,
  PortfolioKind,
  PortfolioTier,
  Signal,
  TouchpointKind,
  type PrismaClient,
} from "@prisma/client";
import { DEFAULT_TRACKER_INTERVALS_MIN } from "../../competitive/entities";
import {
  PLATFORM_DEFINITIONS,
  type ManualPlatform,
} from "../../competitive/manualSources/platforms";

// Demo data for a team that makes book-writing software. The companies and
// their domains are real; every number, touchpoint and capture is made up.
// Nothing here says anything happened at a company: the touchpoints are only
// ever our own team's (invented) activity.

type DemoCompany = {
  domain: string;
  name: string;
  /** Product names people actually say, so voice and search find the company. */
  aliases: string[];
  tier: PortfolioTier;
  notes: string;
  tags: string[];
  linkedin: { followers: number; employees: number; openJobs: number };
  g2?: { rating: number; reviewCount: number };
  trustpilot?: { trustScore: number; reviewCount: number };
  touchpoints: [
    kind: TouchpointKind,
    daysAgo: number,
    title: string,
    body?: string,
  ][];
};

const { PRIMARY, SECONDARY, WATCH } = PortfolioTier;
const { NOTE, DEMO, CALL, MEETING, EMAIL, WON_DEAL, LOST_DEAL } =
  TouchpointKind;

const COMPANIES: DemoCompany[] = [
  {
    domain: "literatureandlatte.com",
    name: "Literature & Latte",
    aliases: ["Scrivener", "Scapple"],
    tier: PRIMARY,
    notes:
      "Makers of Scrivener. Desktop-first drafting with a research binder, sold as a one-time licence. The tool most of our users have already tried.",
    tags: ["Drafting", "Desktop", "One-time licence"],
    linkedin: { followers: 4_180, employees: 14, openJobs: 0 },
    g2: { rating: 4.6, reviewCount: 212 },
    trustpilot: { trustScore: 4.4, reviewCount: 388 },
    touchpoints: [
      [
        DEMO,
        41,
        "Walked through Scrivener 3 compile",
        "Compile is powerful but took two of us 40 minutes to get a clean EPUB. Onboarding is the gap we can win on.",
      ],
      [
        LOST_DEAL,
        18,
        "Writing group stayed on Scrivener",
        "Twelve-seat group. They own licences already and did not want a subscription.",
      ],
      [NOTE, 6, "Feature comparison: corkboard vs our outline view"],
    ],
  },
  {
    domain: "atticus.io",
    name: "Atticus",
    aliases: [],
    tier: PRIMARY,
    notes:
      "Writing and book formatting in one app, browser-based with offline support, one-time price. Closest overlap with our export story.",
    tags: ["Drafting", "Formatting", "One-time licence"],
    linkedin: { followers: 1_240, employees: 9, openJobs: 1 },
    trustpilot: { trustScore: 4.7, reviewCount: 1_026 },
    touchpoints: [
      [
        DEMO,
        33,
        "Formatted a sample manuscript in Atticus",
        "Print themes are good out of the box. Drafting side is thin: no real plotting tools.",
      ],
      [
        LOST_DEAL,
        12,
        "Indie press chose Atticus for print formatting",
        "They wanted one purchase covering writing and print-ready PDF.",
      ],
    ],
  },
  {
    domain: "vellum.pub",
    name: "Vellum",
    aliases: ["180g"],
    tier: SECONDARY,
    notes:
      "Mac-only ebook and print formatting. Not a drafting tool, but it sets the bar for how finished books should look.",
    tags: ["Formatting", "Desktop", "One-time licence"],
    linkedin: { followers: 610, employees: 4, openJobs: 0 },
    touchpoints: [
      [
        NOTE,
        27,
        "Benchmarked our EPUB output against Vellum",
        "Their drop caps and scene breaks are still cleaner than ours.",
      ],
    ],
  },
  {
    domain: "reedsy.com",
    name: "Reedsy",
    aliases: ["Reedsy Studio", "Reedsy Book Editor"],
    tier: SECONDARY,
    notes:
      "Marketplace for editors and designers, with a free browser writing tool that feeds it. Competes for the same first-time authors.",
    tags: ["Drafting", "Cloud", "Marketplace"],
    linkedin: { followers: 38_400, employees: 61, openJobs: 4 },
    trustpilot: { trustScore: 4.8, reviewCount: 2_140 },
    touchpoints: [
      [
        MEETING,
        48,
        "Partnership intro with their marketplace team",
        "Friendly. Open to a referral link from our export screen; no commitment yet.",
      ],
      [EMAIL, 9, "Followed up on the referral idea"],
    ],
  },
  {
    domain: "dabblewriter.com",
    name: "Dabble",
    aliases: ["Dabble Writer"],
    tier: PRIMARY,
    notes:
      "Cloud novel-writing app with a plot grid and goal tracking, sold by subscription. Same audience and the same pricing model as us.",
    tags: ["Drafting", "Plotting", "Cloud", "Subscription"],
    linkedin: { followers: 1_870, employees: 11, openJobs: 2 },
    g2: { rating: 4.5, reviewCount: 38 },
    trustpilot: { trustScore: 4.3, reviewCount: 164 },
    touchpoints: [
      [
        DEMO,
        36,
        "Ran the Dabble free trial end to end",
        "Plot grid is the standout. Goal tracking and NaNoWriMo-style streaks drive habit.",
      ],
      [
        WON_DEAL,
        15,
        "Author collective moved over from Dabble",
        "Eight seats. Deciding factor was shared comments for their editor.",
      ],
      [NOTE, 3, "Pricing comparison: their tiers against ours"],
    ],
  },
  {
    domain: "novlr.org",
    name: "Novlr",
    aliases: [],
    tier: SECONDARY,
    notes:
      "Browser-based writing app that is part-owned by its writers. Strong community goodwill; lighter on plotting.",
    tags: ["Drafting", "Cloud", "Subscription"],
    linkedin: { followers: 2_960, employees: 8, openJobs: 0 },
    trustpilot: { trustScore: 4.5, reviewCount: 97 },
    touchpoints: [
      [
        NOTE,
        22,
        "Reviewed Novlr's free tier limits",
        "Generous free plan is their top-of-funnel. Worth testing a similar cap.",
      ],
    ],
  },
  {
    domain: "livingwriter.com",
    name: "LivingWriter",
    aliases: ["Living Writer"],
    tier: PRIMARY,
    notes:
      "Cloud writing app with story-structure templates and a board view. Goes after Scrivener switchers, as we do.",
    tags: ["Drafting", "Plotting", "Cloud", "Subscription"],
    linkedin: { followers: 920, employees: 7, openJobs: 1 },
    g2: { rating: 4.4, reviewCount: 21 },
    trustpilot: { trustScore: 4.1, reviewCount: 212 },
    touchpoints: [
      [
        DEMO,
        30,
        "Tried the story-structure templates",
        "Hero's Journey and Save the Cat templates get a new user to a full outline in minutes.",
      ],
      [
        CALL,
        11,
        "Customer call: why they left LivingWriter",
        "Sync conflicts on mobile. They liked the templates and miss them.",
      ],
    ],
  },
  {
    domain: "plottr.com",
    name: "Plottr",
    aliases: [],
    tier: SECONDARY,
    notes:
      "Visual outlining and series timelines. Writers pair it with a separate drafting tool, often ours.",
    tags: ["Plotting", "Desktop", "Subscription"],
    linkedin: { followers: 1_130, employees: 12, openJobs: 0 },
    trustpilot: { trustScore: 4.6, reviewCount: 143 },
    touchpoints: [
      [
        MEETING,
        44,
        "Talked about an outline import format",
        "They export to Word and Scrivener today. An import on our side would be cheap to build.",
      ],
    ],
  },
  {
    domain: "ulysses.app",
    name: "Ulysses",
    aliases: [],
    tier: WATCH,
    notes:
      "Markdown writing app for Mac, iPad and iPhone, sold by subscription. General long-form rather than fiction-specific.",
    tags: ["Drafting", "Desktop", "Subscription"],
    linkedin: { followers: 3_350, employees: 24, openJobs: 1 },
    g2: { rating: 4.5, reviewCount: 46 },
    touchpoints: [[NOTE, 52, "Noted their publishing-to-blog integrations"]],
  },
  {
    domain: "sudowrite.com",
    name: "Sudowrite",
    aliases: ["Story Engine"],
    tier: PRIMARY,
    notes:
      "AI writing partner built for fiction. The reference point whenever a prospect asks what our AI features do.",
    tags: ["AI-assisted", "Drafting", "Cloud", "Subscription"],
    linkedin: { followers: 5_720, employees: 19, openJobs: 3 },
    g2: { rating: 4.3, reviewCount: 57 },
    trustpilot: { trustScore: 4.0, reviewCount: 301 },
    touchpoints: [
      [
        DEMO,
        25,
        "Generated a chapter outline with Story Engine",
        "Impressive first draft of beats. Voice drifts after a few thousand words.",
      ],
      [
        LOST_DEAL,
        8,
        "Romance author picked Sudowrite",
        "Wanted AI-first drafting. We were second choice on everything else.",
      ],
      [NOTE, 2, "Collected prospect questions about AI and manuscript privacy"],
    ],
  },
  {
    domain: "prowritingaid.com",
    name: "ProWritingAid",
    aliases: ["Pro Writing Aid"],
    tier: SECONDARY,
    notes:
      "Grammar and style editing with fiction-specific reports. Used alongside a drafting tool rather than instead of one.",
    tags: ["Editing", "AI-assisted", "Subscription"],
    linkedin: { followers: 12_900, employees: 74, openJobs: 6 },
    g2: { rating: 4.4, reviewCount: 468 },
    trustpilot: { trustScore: 4.5, reviewCount: 5_230 },
    touchpoints: [
      [
        CALL,
        39,
        "Explored an editor integration",
        "They have a desktop add-in model. API access would need a partnership agreement.",
      ],
    ],
  },
  {
    domain: "novelcrafter.com",
    name: "Novelcrafter",
    aliases: ["Novel Crafter"],
    tier: WATCH,
    notes:
      "Newer AI-assisted novel tool built around a story codex, where writers bring their own model keys. Growing fast by word of mouth.",
    tags: ["AI-assisted", "Plotting", "Cloud", "Subscription"],
    linkedin: { followers: 480, employees: 5, openJobs: 0 },
    trustpilot: { trustScore: 4.6, reviewCount: 58 },
    touchpoints: [
      [
        NOTE,
        14,
        "Watched their codex walkthrough",
        "Character and lore entries feed the AI context automatically. Clever, and sticky.",
      ],
    ],
  },
];

const TAG_COLORS: Record<string, string> = {
  Drafting: "#38bdf8",
  Plotting: "#a78bfa",
  Formatting: "#f472b6",
  Editing: "#facc15",
  "AI-assisted": "#34d399",
  Marketplace: "#fb923c",
  Cloud: "#94a3b8",
  Desktop: "#94a3b8",
  Subscription: "#64748b",
  "One-time licence": "#64748b",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

const SCORE_KEYS = new Set(["rating", "trustScore"]);

/** An earlier reading: a little lower, so the latest one shows growth. */
function earlier<T extends Record<string, number>>(
  values: T,
  shrink: number,
): T {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      // Scores out of five barely move; counts shrink by the full factor.
      SCORE_KEYS.has(key)
        ? Math.round((value - 0.1) * 10) / 10
        : Math.round(value * shrink),
    ]),
  ) as T;
}

/**
 * Fills one organization's competitors portfolio with real book-writing
 * software companies and invented data. Safe to run again: companies are
 * upserted, and touchpoints and captures are only added where there are none.
 *
 * Seeds the oldest organization, or the one named by SEED_ORG_NAME.
 */
export async function seedBookWritingCompetitors(prisma: PrismaClient) {
  const orgName = process.env.SEED_ORG_NAME;
  const org = await prisma.organization.findFirst({
    where: orgName ? { name: orgName } : undefined,
    orderBy: { createdAt: "asc" },
    include: {
      members: { where: { role: OrgRole.OWNER }, take: 1 },
    },
  });
  if (!org) {
    throw new Error(
      orgName
        ? `No organization is called "${orgName}".`
        : "There is no organization yet. Sign up and create one first.",
    );
  }
  const owner = org.members[0];
  if (!owner) {
    throw new Error(`${org.name} has no owner to attribute the data to.`);
  }
  const orgId = org.id;
  const userId = owner.userId;

  const portfolio =
    (await prisma.portfolio.findFirst({
      where: { orgId, kind: PortfolioKind.COMPETITOR },
      orderBy: { createdAt: "asc" },
    })) ??
    (await prisma.portfolio.create({
      data: {
        orgId,
        name: "Competitors",
        kind: PortfolioKind.COMPETITOR,
        description: "Book-writing software we compete with.",
      },
    }));

  const tagIds = new Map<string, string>();
  for (const name of new Set(COMPANIES.flatMap((company) => company.tags))) {
    const tag = await prisma.tag.upsert({
      where: { orgId_name: { orgId, name } },
      update: {},
      create: { orgId, name, color: TAG_COLORS[name] },
    });
    tagIds.set(name, tag.id);
  }

  for (const company of COMPANIES) {
    const existing = await prisma.trackedEntity.findUnique({
      where: { domain: company.domain },
      select: { aliases: true },
    });
    const entity = await prisma.trackedEntity.upsert({
      where: { domain: company.domain },
      // Entities are shared between organizations, so a curated name stays.
      update: existing?.aliases.length ? {} : { aliases: company.aliases },
      create: {
        domain: company.domain,
        name: company.name,
        aliases: company.aliases,
        trackers: {
          create: Object.values(Signal).map((signal) => ({
            signal,
            intervalMin: DEFAULT_TRACKER_INTERVALS_MIN[signal],
            enabled: signal !== Signal.STOCK,
          })),
        },
      },
    });
    const entityId = entity.id;

    await prisma.portfolioItem.upsert({
      where: {
        portfolioId_entityId: { portfolioId: portfolio.id, entityId },
      },
      update: {},
      create: {
        portfolioId: portfolio.id,
        entityId,
        addedById: userId,
        tier: company.tier,
        notes: company.notes,
      },
    });

    for (const tag of company.tags) {
      const tagId = tagIds.get(tag)!;
      await prisma.entityTag.upsert({
        where: { tagId_entityId: { tagId, entityId } },
        update: {},
        create: { tagId, entityId },
      });
    }

    if ((await prisma.touchpoint.count({ where: { orgId, entityId } })) === 0) {
      await prisma.touchpoint.createMany({
        data: company.touchpoints.map(([kind, days, title, body]) => ({
          orgId,
          entityId,
          authorId: userId,
          kind,
          occurredAt: daysAgo(days),
          title,
          body,
        })),
      });
    }

    if (
      (await prisma.manualImport.count({ where: { orgId, entityId } })) === 0
    ) {
      const readings: [ManualPlatform, Record<string, number> | undefined][] = [
        ["linkedin", company.linkedin],
        ["g2", company.g2],
        ["trustpilot", company.trustpilot],
      ];
      await prisma.manualImport.createMany({
        data: readings.flatMap(([platform, values]) =>
          values
            ? [
                { capturedAt: daysAgo(64), data: earlier(values, 0.93) },
                { capturedAt: daysAgo(5), data: values },
              ].map((capture) => ({
                ...capture,
                orgId,
                entityId,
                createdById: userId,
                signal: PLATFORM_DEFINITIONS[platform].signal,
                source: platform,
              }))
            : [],
        ),
      });
    }
  }

  console.log(
    `Seeded ${COMPANIES.length} book-writing companies into "${portfolio.name}" for ${org.name}.`,
  );
}
