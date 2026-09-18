import { PortfolioTier } from "@prisma/client";
import { useEffect, useState } from "react";
import {
  addEntityToPortfolio,
  updatePortfolioItem,
} from "wasp/client/operations";
import type { PortfolioWithItems } from "../operations";
import { PORTFOLIO_TIER_LABELS } from "./labels";
import {
  ConsoleInput,
  ConsoleSelect,
  ConsoleTextarea,
  Field,
  FormDialog,
} from "./ui";
import { useSubmit } from "./useSubmit";

type PortfolioItemWithEntity = PortfolioWithItems["items"][number];

/**
 * Adds a company to `portfolio` by domain, or, given `item`, edits how the
 * team tracks a company that is already there (tier and notes).
 */
export function CompanyDialog({
  orgId,
  portfolio,
  item,
  open,
  onOpenChange,
  onAdded,
}: {
  orgId: string;
  portfolio: PortfolioWithItems;
  item?: PortfolioItemWithEntity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new company's id, so the caller can show it. */
  onAdded?: (entityId: string) => void;
}) {
  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const [tier, setTier] = useState<PortfolioTier | "">("");
  const [notes, setNotes] = useState("");
  const { isSubmitting, submit } = useSubmit();

  useEffect(() => {
    if (!open) return;
    setDomain("");
    setName("");
    setTier(item?.tier ?? "");
    setNotes(item?.notes ?? "");
  }, [open, item]);

  const handleSubmit = async () => {
    const ok = await submit(
      async () => {
        if (item) {
          await updatePortfolioItem({
            orgId,
            portfolioId: portfolio.id,
            entityId: item.entityId,
            tier: tier || null,
            notes: notes.trim() || null,
          });
          return;
        }
        const entity = await addEntityToPortfolio({
          orgId,
          portfolioId: portfolio.id,
          domain,
          name: name.trim() || undefined,
          tier: tier || undefined,
          notes: notes.trim() || undefined,
        });
        onAdded?.(entity.id);
      },
      item ? "Could not save the company" : "Could not add the company",
    );
    if (ok) onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={item ? `${item.entity.name} in ${portfolio.name}` : "Add company"}
      description={
        item
          ? "How your team tracks this company in this portfolio."
          : `Start tracking a company in ${portfolio.name}. Companies are identified by their website.`
      }
      submitLabel={item ? "Save" : "Add company"}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
    >
      {!item && (
        <>
          <Field
            label="Website"
            htmlFor="company-domain"
            hint="A domain or any URL on the company's site."
          >
            <ConsoleInput
              id="company-domain"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder="acme.com"
              minLength={3}
              maxLength={253}
              required
              autoFocus
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <Field
            label="Name"
            htmlFor="company-name"
            hint="Optional. Guessed from the domain if left blank."
          >
            <ConsoleInput
              id="company-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Acme"
              maxLength={200}
            />
          </Field>
        </>
      )}
      <Field label="Tier" htmlFor="company-tier">
        <ConsoleSelect
          id="company-tier"
          value={tier}
          onChange={(event) =>
            setTier(event.target.value as PortfolioTier | "")
          }
        >
          <option value="">No tier</option>
          {Object.values(PortfolioTier).map((value) => (
            <option key={value} value={value}>
              {PORTFOLIO_TIER_LABELS[value]}
            </option>
          ))}
        </ConsoleSelect>
      </Field>
      <Field label="Notes" htmlFor="company-notes">
        <ConsoleTextarea
          id="company-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Why this company matters to you"
          maxLength={2000}
          rows={3}
        />
      </Field>
    </FormDialog>
  );
}
