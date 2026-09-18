import { OrgRole } from "@prisma/client";
import { ExternalLink, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  createTag,
  getEntity,
  getTags,
  setEntityTags,
  updateEntity,
  useQuery,
} from "wasp/client/operations";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../client/components/ui/sheet";
import { cn } from "../../client/utils";
import type { EntityDetail } from "../operations";
import { FootprintSection } from "./FootprintSection";
import { ManualSourcesSection } from "./ManualSourcesSection";
import { SIGNAL_LABELS, TRACKER_STATUS_LABELS } from "./labels";
import {
  ConsoleInput,
  ConsoleSelect,
  consoleOverlayClass,
  EntityLogo,
  Field,
  Pill,
  PrimaryButton,
  QuietButton,
} from "./ui";
import { useSubmit } from "./useSubmit";

export type CompanyOption = { id: string; name: string };

/** Side panel with everything known about one tracked company. */
export function CompanySheet({
  orgId,
  entityId,
  companies,
  can,
  onClose,
}: {
  orgId: string;
  /** The company to show; null keeps the sheet closed. */
  entityId: string | null;
  /** Every company the org tracks, offered as possible parent companies. */
  companies: CompanyOption[];
  can: (minRole: OrgRole) => boolean;
  onClose: () => void;
}) {
  const {
    data: entity,
    isLoading,
    error,
  } = useQuery(
    getEntity,
    { orgId, entityId: entityId ?? "" },
    { enabled: !!entityId },
  );

  return (
    <Sheet open={!!entityId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className={cn(
          consoleOverlayClass,
          "flex w-full flex-col gap-7 overflow-y-auto sm:max-w-md",
        )}
      >
        {entity ? (
          <>
            <SheetHeader className="flex-row items-center gap-3 space-y-0 text-left">
              <EntityLogo name={entity.name} logoUrl={entity.logoUrl} />
              <div className="min-w-0">
                <SheetTitle className="text-console-fg truncate text-base">
                  {entity.name}
                </SheetTitle>
                <SheetDescription asChild>
                  <a
                    href={`https://${entity.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-console-muted hover:text-console-cyan inline-flex items-center gap-1 font-mono text-xs"
                  >
                    {entity.domain}
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                </SheetDescription>
              </div>
            </SheetHeader>

            <Section title="In portfolios">
              <div className="flex flex-wrap gap-1.5">
                {entity.portfolios.map((portfolio) => (
                  <Pill key={portfolio.id}>{portfolio.name}</Pill>
                ))}
              </div>
            </Section>

            <TagsSection
              orgId={orgId}
              entity={entity}
              canEdit={can(OrgRole.MEMBER)}
            />

            {can(OrgRole.MEMBER) && (
              <Section title="Footprint">
                {/* Remount per company so findings never carry over. */}
                <FootprintSection
                  key={entity.id}
                  orgId={orgId}
                  entity={entity}
                />
              </Section>
            )}

            <Section title="Read by you">
              <ManualSourcesSection
                key={entity.id}
                orgId={orgId}
                entityId={entity.id}
                canEdit={can(OrgRole.MEMBER)}
              />
            </Section>

            <ProfileSection
              // Remount when another company is opened so the form resets.
              key={entity.id}
              orgId={orgId}
              entity={entity}
              companies={companies}
              canEdit={can(OrgRole.ADMIN)}
            />

            <TrackersSection entity={entity} />
          </>
        ) : (
          <SheetHeader className="text-left">
            <SheetTitle className="text-console-fg text-base">
              {isLoading ? "Loading…" : "Company unavailable"}
            </SheetTitle>
            <SheetDescription className="text-console-muted">
              {error
                ? "This company could not be loaded. It may have been removed from your portfolios."
                : " "}
            </SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-console-muted font-mono text-[10px] font-bold tracking-[1px] uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function TagsSection({
  orgId,
  entity,
  canEdit,
}: {
  orgId: string;
  entity: EntityDetail;
  canEdit: boolean;
}) {
  const { data: orgTags } = useQuery(getTags, { orgId });
  const [newTag, setNewTag] = useState("");
  const { isSubmitting, submit } = useSubmit();

  const saveTags = (tagIds: string[]) =>
    setEntityTags({ orgId, entityId: entity.id, tagIds });

  const handleAdd = async () => {
    const name = newTag.trim();
    if (!name) return;
    const ok = await submit(async () => {
      // createTag returns the existing tag when the name is already taken.
      const tag = await createTag({ orgId, name });
      await saveTags([...new Set([...entity.tags.map((t) => t.id), tag.id])]);
    }, "Could not add the tag");
    if (ok) setNewTag("");
  };

  const handleRemove = (tagId: string) =>
    submit(
      () =>
        saveTags(entity.tags.filter((t) => t.id !== tagId).map((t) => t.id)),
      "Could not remove the tag",
    );

  return (
    <Section title="Tags">
      {entity.tags.length === 0 && !canEdit && (
        <p className="text-console-subtle text-sm">No tags.</p>
      )}
      {entity.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {entity.tags.map((tag) => (
            <li key={tag.id}>
              <Pill className="text-console-cyan normal-case">
                {tag.name}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleRemove(tag.id)}
                    disabled={isSubmitting}
                    aria-label={`Remove tag ${tag.name}`}
                    className="hover:text-console-fg cursor-pointer"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                )}
              </Pill>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            handleAdd();
          }}
        >
          <ConsoleInput
            value={newTag}
            onChange={(event) => setNewTag(event.target.value)}
            placeholder="Add a tag"
            aria-label="New tag name"
            maxLength={50}
            list="org-tag-options"
          />
          <datalist id="org-tag-options">
            {orgTags?.map((tag) => <option key={tag.id} value={tag.name} />)}
          </datalist>
          <QuietButton type="submit" disabled={isSubmitting || !newTag.trim()}>
            Add
          </QuietButton>
        </form>
      )}
    </Section>
  );
}

const splitList = (value: string) =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

function ProfileSection({
  orgId,
  entity,
  companies,
  canEdit,
}: {
  orgId: string;
  entity: EntityDetail;
  companies: CompanyOption[];
  canEdit: boolean;
}) {
  const [form, setForm] = useState(() => toForm(entity));
  const { isSubmitting, submit } = useSubmit();

  // Pick up edits made elsewhere, such as by the voice assistant. Keyed on
  // `updatedAt` so an unrelated refetch does not wipe what is being typed.
  const version = new Date(entity.updatedAt).getTime();
  useEffect(() => {
    setForm(toForm(entity));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  if (!canEdit) {
    return (
      <Section title="Profile">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <Fact label="Also known as" value={entity.aliases.join(", ")} />
          <Fact
            label="Ticker"
            value={[entity.ticker, entity.exchange].filter(Boolean).join(" · ")}
          />
          <Fact label="Careers" value={entity.careersUrl} />
          <Fact
            label="Subreddits"
            value={entity.subreddits.map((s) => `r/${s}`).join(", ")}
          />
          <Fact label="Parent" value={entity.parent?.name} />
        </dl>
        <p className="text-console-subtle text-xs">
          Company profiles are shared, so only organization admins can edit
          them.
        </p>
      </Section>
    );
  }

  const set =
    (key: keyof typeof form) => (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  const handleSave = () =>
    submit(
      () =>
        updateEntity({
          orgId,
          entityId: entity.id,
          name: form.name,
          aliases: splitList(form.aliases),
          ticker: form.ticker.trim() || null,
          exchange: form.exchange.trim() || null,
          careersUrl: form.careersUrl.trim() || null,
          subreddits: splitList(form.subreddits).map((s) =>
            s.replace(/^\/?r\//i, ""),
          ),
          parentId: form.parentId || null,
        }),
      "Could not save the profile",
    );

  return (
    <Section title="Profile">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          handleSave();
        }}
      >
        <Field label="Name" htmlFor="entity-name">
          <ConsoleInput
            id="entity-name"
            value={form.name}
            onChange={set("name")}
            maxLength={200}
            required
          />
        </Field>
        <Field
          label="Also known as"
          htmlFor="entity-aliases"
          hint="Comma-separated. Used to match news and mentions."
        >
          <ConsoleInput
            id="entity-aliases"
            value={form.aliases}
            onChange={set("aliases")}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ticker" htmlFor="entity-ticker">
            <ConsoleInput
              id="entity-ticker"
              value={form.ticker}
              onChange={set("ticker")}
              placeholder="ACME"
              maxLength={12}
            />
          </Field>
          <Field label="Exchange" htmlFor="entity-exchange">
            <ConsoleInput
              id="entity-exchange"
              value={form.exchange}
              onChange={set("exchange")}
              placeholder="NASDAQ"
              maxLength={20}
            />
          </Field>
        </div>
        <Field label="Careers page" htmlFor="entity-careers">
          <ConsoleInput
            id="entity-careers"
            type="url"
            value={form.careersUrl}
            onChange={set("careersUrl")}
            placeholder="https://acme.com/careers"
          />
        </Field>
        <Field
          label="Subreddits"
          htmlFor="entity-subreddits"
          hint="Comma-separated. Watched for sentiment."
        >
          <ConsoleInput
            id="entity-subreddits"
            value={form.subreddits}
            onChange={set("subreddits")}
          />
        </Field>
        <Field label="Parent company" htmlFor="entity-parent">
          <ConsoleSelect
            id="entity-parent"
            value={form.parentId}
            onChange={set("parentId")}
          >
            <option value="">None</option>
            {companies
              .filter((company) => company.id !== entity.id)
              .map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
          </ConsoleSelect>
        </Field>
        <PrimaryButton
          type="submit"
          disabled={isSubmitting}
          className="self-start"
        >
          Save profile
        </PrimaryButton>
      </form>
    </Section>
  );
}

function toForm(entity: EntityDetail) {
  return {
    name: entity.name,
    aliases: entity.aliases.join(", "),
    ticker: entity.ticker ?? "",
    exchange: entity.exchange ?? "",
    careersUrl: entity.careersUrl ?? "",
    subreddits: entity.subreddits.join(", "),
    parentId: entity.parentId ?? "",
  };
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  return (
    <>
      <dt className="text-console-muted">{label}</dt>
      <dd className="text-console-fg min-w-0 break-words">{value || "—"}</dd>
    </>
  );
}

function TrackersSection({ entity }: { entity: EntityDetail }) {
  return (
    <Section title="Trackers">
      <ul className="border-console-border divide-console-border divide-y rounded-lg border">
        {entity.trackers.map((tracker) => (
          <li
            key={tracker.id}
            className="flex items-center justify-between gap-3 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-console-fg text-sm font-medium">
                {SIGNAL_LABELS[tracker.signal]}
              </p>
              <p className="text-console-subtle truncate text-xs">
                {tracker.lastError ??
                  (tracker.lastRunAt
                    ? `Last run ${new Date(tracker.lastRunAt).toLocaleString()}`
                    : "Not collected yet")}
              </p>
            </div>
            <Pill
              className={cn(
                !tracker.enabled
                  ? "text-console-dim"
                  : tracker.lastStatus === "ERROR" ||
                      tracker.lastStatus === "RATE_LIMITED"
                    ? "text-console-orange"
                    : "text-console-cyan",
              )}
            >
              {!tracker.enabled
                ? "Off"
                : tracker.lastStatus
                  ? TRACKER_STATUS_LABELS[tracker.lastStatus]
                  : "Queued"}
            </Pill>
          </li>
        ))}
      </ul>
    </Section>
  );
}
