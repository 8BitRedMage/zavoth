import { PortfolioKind } from "@prisma/client";
import { useEffect, useState } from "react";
import { createPortfolio, updatePortfolio } from "wasp/client/operations";
import type { Portfolio } from "wasp/entities";
import { PORTFOLIO_KIND_LABELS } from "./labels";
import {
  ConsoleInput,
  ConsoleSelect,
  ConsoleTextarea,
  Field,
  FormDialog,
} from "./ui";
import { useSubmit } from "./useSubmit";

/** Creates a portfolio, or edits `portfolio` when one is given. */
export function PortfolioDialog({
  orgId,
  portfolio,
  open,
  onOpenChange,
}: {
  orgId: string;
  portfolio?: Portfolio;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PortfolioKind>(PortfolioKind.COMPETITOR);
  const [description, setDescription] = useState("");
  const { isSubmitting, submit } = useSubmit();

  useEffect(() => {
    if (!open) return;
    setName(portfolio?.name ?? "");
    setKind(portfolio?.kind ?? PortfolioKind.COMPETITOR);
    setDescription(portfolio?.description ?? "");
  }, [open, portfolio]);

  const handleSubmit = async () => {
    const ok = await submit(
      () =>
        portfolio
          ? updatePortfolio({
              orgId,
              portfolioId: portfolio.id,
              name,
              kind,
              description: description.trim() || null,
            })
          : createPortfolio({
              orgId,
              name,
              kind,
              description: description.trim() || undefined,
            }),
      portfolio ? "Could not save the portfolio" : "Could not create it",
    );
    if (ok) onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={portfolio ? "Edit portfolio" : "New portfolio"}
      description="A portfolio is a named group of companies you track together."
      submitLabel={portfolio ? "Save" : "Create portfolio"}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
    >
      <Field label="Name" htmlFor="portfolio-name">
        <ConsoleInput
          id="portfolio-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Direct competitors"
          maxLength={100}
          required
          autoFocus
        />
      </Field>
      <Field label="Kind" htmlFor="portfolio-kind">
        <ConsoleSelect
          id="portfolio-kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as PortfolioKind)}
        >
          {Object.values(PortfolioKind).map((value) => (
            <option key={value} value={value}>
              {PORTFOLIO_KIND_LABELS[value]}
            </option>
          ))}
        </ConsoleSelect>
      </Field>
      <Field label="Description" htmlFor="portfolio-description">
        <ConsoleTextarea
          id="portfolio-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Optional"
          maxLength={1000}
          rows={3}
        />
      </Field>
    </FormDialog>
  );
}
