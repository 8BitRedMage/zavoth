import { OrgRole } from "@prisma/client";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  createOrganization,
  deletePortfolio,
  getPortfolios,
  removeEntityFromPortfolio,
  useQuery,
} from "wasp/client/operations";
import type { PortfolioWithItems } from "../operations";
import { CompanyDialog } from "./CompanyDialog";
import { CompanySheet, type CompanyOption } from "./CompanySheet";
import { PORTFOLIO_KIND_LABELS, PORTFOLIO_TIER_LABELS } from "./labels";
import { PortfolioDialog } from "./PortfolioDialog";
import {
  ConsoleInput,
  ConsoleSelect,
  EntityLogo,
  Field,
  FormDialog,
  Pill,
  PrimaryButton,
  QuietButton,
} from "./ui";
import { useCurrentOrg } from "./useCurrentOrg";
import { useSubmit } from "./useSubmit";

type PortfolioItemWithEntity = PortfolioWithItems["items"][number];

// Which dialog is open, and for what. One at a time.
type Modal =
  | { type: "createPortfolio" }
  | { type: "editPortfolio"; portfolio: PortfolioWithItems }
  | { type: "deletePortfolio"; portfolio: PortfolioWithItems }
  | { type: "addCompany"; portfolio: PortfolioWithItems }
  | {
      type: "editCompany";
      portfolio: PortfolioWithItems;
      item: PortfolioItemWithEntity;
    }
  | {
      type: "removeCompany";
      portfolio: PortfolioWithItems;
      item: PortfolioItemWithEntity;
    };

export function PortfoliosPage() {
  const { orgs, org, setOrgId, isLoading, error, can } = useCurrentOrg();

  if (isLoading) return <PageMessage>Loading…</PageMessage>;
  if (error) {
    return <PageMessage>Your organizations could not be loaded.</PageMessage>;
  }
  if (!org) return <CreateOrganizationCard />;

  return (
    <div className="flex flex-col gap-7 p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-console-muted font-mono text-[11px] font-medium tracking-[1px] uppercase">
            Portfolios
          </p>
          <h1 className="text-console-fg mt-2 text-2xl font-bold">
            {org.name}
          </h1>
        </div>
        {orgs.length > 1 && (
          <ConsoleSelect
            aria-label="Organization"
            value={org.id}
            onChange={(event) => setOrgId(event.target.value)}
            className="w-auto"
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </ConsoleSelect>
        )}
      </header>

      {/* Remount per org so open dialogs never point at another org's data. */}
      <PortfolioList key={org.id} orgId={org.id} can={can} />
    </div>
  );
}

function PortfolioList({
  orgId,
  can,
}: {
  orgId: string;
  can: (minRole: OrgRole) => boolean;
}) {
  const {
    data: portfolios,
    isLoading,
    error,
  } = useQuery(getPortfolios, {
    orgId,
  });
  const [modal, setModal] = useState<Modal | null>(null);
  const [openEntityId, setOpenEntityId] = useState<string | null>(null);
  const { isSubmitting, submit } = useSubmit();

  const companies = useMemo<CompanyOption[]>(() => {
    const byId = new Map<string, CompanyOption>();
    for (const portfolio of portfolios ?? []) {
      for (const { entity } of portfolio.items) {
        byId.set(entity.id, { id: entity.id, name: entity.name });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [portfolios]);

  if (isLoading) return <p className="text-console-muted text-sm">Loading…</p>;
  if (error || !portfolios) {
    return (
      <p className="text-console-orange text-sm">
        Your portfolios could not be loaded.
      </p>
    );
  }

  const canEdit = can(OrgRole.MEMBER);
  const closeModal = () => setModal(null);
  const onModalOpenChange = (open: boolean) => !open && closeModal();

  // The list refetches while a dialog is open (the assistant may be editing
  // too), so dialogs read the live copy rather than the one they opened with.
  const live = (portfolio: PortfolioWithItems) =>
    portfolios.find((p) => p.id === portfolio.id) ?? portfolio;

  const confirmDeletePortfolio = async (portfolio: PortfolioWithItems) => {
    const ok = await submit(
      () => deletePortfolio({ orgId, portfolioId: portfolio.id }),
      "Could not delete the portfolio",
    );
    if (ok) closeModal();
  };

  const confirmRemoveCompany = async (
    portfolio: PortfolioWithItems,
    item: PortfolioItemWithEntity,
  ) => {
    const ok = await submit(
      () =>
        removeEntityFromPortfolio({
          orgId,
          portfolioId: portfolio.id,
          entityId: item.entityId,
        }),
      "Could not remove the company",
    );
    if (ok) closeModal();
  };

  return (
    <>
      {portfolios.length === 0 ? (
        <EmptyState
          canEdit={canEdit}
          onCreate={() => setModal({ type: "createPortfolio" })}
        />
      ) : (
        <>
          {canEdit && (
            <PrimaryButton
              className="self-start"
              onClick={() => setModal({ type: "createPortfolio" })}
            >
              <Plus aria-hidden="true" />
              New portfolio
            </PrimaryButton>
          )}
          {portfolios.map((portfolio) => (
            <PortfolioCard
              key={portfolio.id}
              portfolio={portfolio}
              canEdit={canEdit}
              canDelete={can(OrgRole.ADMIN)}
              onOpenCompany={setOpenEntityId}
              onAction={setModal}
            />
          ))}
        </>
      )}

      <PortfolioDialog
        orgId={orgId}
        portfolio={
          modal?.type === "editPortfolio" ? modal.portfolio : undefined
        }
        open={
          modal?.type === "createPortfolio" || modal?.type === "editPortfolio"
        }
        onOpenChange={onModalOpenChange}
      />

      {(modal?.type === "addCompany" || modal?.type === "editCompany") && (
        <CompanyDialog
          orgId={orgId}
          portfolio={live(modal.portfolio)}
          item={modal.type === "editCompany" ? modal.item : undefined}
          open
          onOpenChange={onModalOpenChange}
          // Straight to the company panel, which offers the footprint lookup.
          onAdded={setOpenEntityId}
        />
      )}

      {modal?.type === "deletePortfolio" && (
        <FormDialog
          open
          onOpenChange={onModalOpenChange}
          title={`Delete ${modal.portfolio.name}?`}
          description={`This permanently deletes the portfolio and stops tracking its ${countCompanies(
            live(modal.portfolio).items.length,
          )} here. It cannot be undone.`}
          submitLabel="Delete portfolio"
          isSubmitting={isSubmitting}
          destructive
          onSubmit={() => confirmDeletePortfolio(modal.portfolio)}
        />
      )}

      {modal?.type === "removeCompany" && (
        <FormDialog
          open
          onOpenChange={onModalOpenChange}
          title={`Remove ${modal.item.entity.name}?`}
          description={`${modal.item.entity.name} leaves ${modal.portfolio.name}, along with its tier and notes there. It stays in any other portfolio it belongs to.`}
          submitLabel="Remove company"
          isSubmitting={isSubmitting}
          destructive
          onSubmit={() => confirmRemoveCompany(modal.portfolio, modal.item)}
        />
      )}

      <CompanySheet
        orgId={orgId}
        entityId={openEntityId}
        companies={companies}
        can={can}
        onClose={() => setOpenEntityId(null)}
      />
    </>
  );
}

const countCompanies = (count: number) =>
  `${count} ${count === 1 ? "company" : "companies"}`;

function PortfolioCard({
  portfolio,
  canEdit,
  canDelete,
  onOpenCompany,
  onAction,
}: {
  portfolio: PortfolioWithItems;
  canEdit: boolean;
  canDelete: boolean;
  onOpenCompany: (entityId: string) => void;
  onAction: (modal: Modal) => void;
}) {
  return (
    <section
      aria-labelledby={`portfolio-${portfolio.id}`}
      className="bg-console-surface border-console-border rounded-lg border"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2
              id={`portfolio-${portfolio.id}`}
              className="text-console-fg text-base font-semibold"
            >
              {portfolio.name}
            </h2>
            <Pill>{PORTFOLIO_KIND_LABELS[portfolio.kind]}</Pill>
            <span className="text-console-subtle font-mono text-[11px]">
              {countCompanies(portfolio.items.length)}
            </span>
          </div>
          {portfolio.description && (
            <p className="text-console-muted mt-1.5 max-w-2xl text-sm">
              {portfolio.description}
            </p>
          )}
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <QuietButton
              size="sm"
              onClick={() => onAction({ type: "addCompany", portfolio })}
            >
              <Plus aria-hidden="true" />
              Add company
            </QuietButton>
            <IconButton
              label={`Edit ${portfolio.name}`}
              onClick={() => onAction({ type: "editPortfolio", portfolio })}
            >
              <Pencil aria-hidden="true" />
            </IconButton>
            {canDelete && (
              <IconButton
                label={`Delete ${portfolio.name}`}
                onClick={() => onAction({ type: "deletePortfolio", portfolio })}
              >
                <Trash2 aria-hidden="true" />
              </IconButton>
            )}
          </div>
        )}
      </div>

      {portfolio.items.length === 0 ? (
        <p className="border-console-border text-console-subtle border-t px-5 py-4 text-sm">
          No companies yet.
          {canEdit && " Add one by its website to start tracking it."}
        </p>
      ) : (
        <ul className="border-console-border divide-console-border divide-y border-t">
          {portfolio.items.map((item) => (
            <li
              key={item.entityId}
              className="hover:bg-console-raised/40 flex items-center gap-3 px-5 py-3 transition-colors"
            >
              <button
                type="button"
                onClick={() => onOpenCompany(item.entityId)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
              >
                <EntityLogo
                  name={item.entity.name}
                  logoUrl={item.entity.logoUrl}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-console-fg truncate text-sm font-semibold">
                      {item.entity.name}
                    </span>
                    <span className="text-console-subtle truncate font-mono text-[11px]">
                      {item.entity.domain}
                    </span>
                  </span>
                  {(item.notes || item.entity.parent) && (
                    <span className="text-console-muted mt-0.5 block truncate text-xs">
                      {[
                        item.entity.parent &&
                          `Part of ${item.entity.parent.name}`,
                        item.notes,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </span>
                {item.tier && (
                  <Pill
                    className={
                      item.tier === "PRIMARY" ? "text-console-cyan" : undefined
                    }
                  >
                    {PORTFOLIO_TIER_LABELS[item.tier]}
                  </Pill>
                )}
              </button>
              {canEdit && (
                <>
                  <IconButton
                    label={`Edit tier and notes for ${item.entity.name}`}
                    onClick={() =>
                      onAction({ type: "editCompany", portfolio, item })
                    }
                  >
                    <Pencil aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label={`Remove ${item.entity.name} from ${portfolio.name}`}
                    onClick={() =>
                      onAction({ type: "removeCompany", portfolio, item })
                    }
                  >
                    <X aria-hidden="true" />
                  </IconButton>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="text-console-subtle hover:text-console-fg hover:bg-console-raised flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}

function EmptyState({
  canEdit,
  onCreate,
}: {
  canEdit: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="border-console-border flex flex-col items-start gap-3 rounded-lg border border-dashed p-8">
      <h2 className="text-console-fg text-base font-semibold">
        No portfolios yet
      </h2>
      <p className="text-console-muted max-w-md text-sm">
        Group the companies you track into competitor, vendor, investor or
        partner portfolios.
        {canEdit
          ? " Create one here, or ask Zavoth to set it up for you."
          : " Ask a member of your organization to create one."}
      </p>
      {canEdit && (
        <PrimaryButton onClick={onCreate}>
          <Plus aria-hidden="true" />
          New portfolio
        </PrimaryButton>
      )}
    </div>
  );
}

function PageMessage({ children }: { children: React.ReactNode }) {
  return <p className="text-console-muted p-8 text-sm">{children}</p>;
}

/** First-run: portfolios live in an organization, so the user needs one. */
function CreateOrganizationCard() {
  const [name, setName] = useState("");
  const { isSubmitting, submit } = useSubmit();

  return (
    <div className="p-8">
      <form
        className="bg-console-surface border-console-border flex max-w-md flex-col gap-5 rounded-lg border p-6"
        onSubmit={(event) => {
          event.preventDefault();
          submit(
            () => createOrganization({ name }),
            "Could not create the organization",
          );
        }}
      >
        <div>
          <h1 className="text-console-fg text-lg font-bold">
            Name your organization
          </h1>
          <p className="text-console-muted mt-1.5 text-sm">
            Portfolios, tags and notes belong to an organization, so your team
            can share them later. You will be its owner.
          </p>
        </div>
        <Field label="Organization name" htmlFor="org-name">
          <ConsoleInput
            id="org-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Acme Inc."
            maxLength={100}
            required
            autoFocus
          />
        </Field>
        <PrimaryButton
          type="submit"
          disabled={isSubmitting}
          className="self-start"
        >
          Create organization
        </PrimaryButton>
      </form>
    </div>
  );
}
