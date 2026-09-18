import { Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  lookUpEntityFootprint,
  saveEntityFootprint,
} from "wasp/client/operations";
import { toast } from "../../client/hooks/use-toast";
import type { FootprintFindings, SourceStatus } from "../footprint/lookup";
import type { EntityDetail } from "../operations";
import { PrimaryButton, QuietButton } from "./ui";
import { useSubmit } from "./useSubmit";

type Selection = {
  ticker: string;
  careers: boolean;
  subreddits: string[];
  website: boolean;
};

/** Pre-ticks what is safe to accept blind; ambiguous matches start unticked. */
function defaultSelection(findings: FootprintFindings): Selection {
  const [first, ...others] = findings.stock.candidates;
  return {
    ticker: first?.exact && others.length === 0 ? first.ticker : "",
    careers:
      !!findings.hiring.careersUrl && findings.hiring.nameVerified !== false,
    subreddits: [],
    website: !!findings.website.sitemapUrl,
  };
}

const PROVIDER_NAMES = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workable: "Workable",
  unknown: "Careers page",
} as const;

/**
 * The manual twin of the assistant's "want me to look up their footprint?":
 * look up, review what was found, keep only what is right.
 */
export function FootprintSection({
  orgId,
  entity,
}: {
  orgId: string;
  entity: EntityDetail;
}) {
  const [findings, setFindings] = useState<FootprintFindings | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const { isSubmitting, submit } = useSubmit();

  const handleLookUp = () =>
    submit(async () => {
      const found = await lookUpEntityFootprint({ orgId, entityId: entity.id });
      setFindings(found);
      setSelection(defaultSelection(found));
    }, "The lookup failed");

  const handleSave = () =>
    submit(async () => {
      if (!selection) return;
      const { saved, skipped } = await saveEntityFootprint({
        orgId,
        entityId: entity.id,
        ticker: selection.ticker || undefined,
        careers: selection.careers,
        subreddits: selection.subreddits,
        website: selection.website,
      });
      toast({
        title:
          saved.length > 0 ? `Saved: ${saved.join(", ")}` : "Nothing was saved",
        description: skipped.map(({ reason }) => reason).join(" ") || undefined,
      });
      setFindings(null);
      setSelection(null);
    }, "Could not save the footprint");

  if (!findings || !selection) {
    return (
      <div className="border-console-border flex flex-col items-start gap-3 rounded-lg border border-dashed p-4">
        <p className="text-console-muted text-sm">
          {entity.enrichedAt
            ? `Last looked up ${new Date(
                entity.enrichedAt,
              ).toLocaleDateString()}. Look again to pick up changes.`
            : "Zavoth can look up this company's ticker, job board, subreddits and sitemap from public sources. Or fill in the profile below yourself."}
        </p>
        <QuietButton size="sm" onClick={handleLookUp} disabled={isSubmitting}>
          <Search aria-hidden="true" />
          {isSubmitting ? "Looking…" : "Look up footprint"}
        </QuietButton>
      </div>
    );
  }

  const { stock, hiring, communities, website } = findings;
  const nothingSelected =
    !selection.ticker &&
    !selection.careers &&
    selection.subreddits.length === 0 &&
    !selection.website;
  const keyPageKinds = Object.keys(website.keyPages);

  return (
    <div className="border-console-border divide-console-border divide-y rounded-lg border">
      <Source title="Stock" status={stock.status} detail={stock.detail}>
        {stock.candidates.map((candidate) => (
          <Choice
            key={candidate.ticker}
            type="radio"
            name="footprint-ticker"
            checked={selection.ticker === candidate.ticker}
            onChange={() =>
              setSelection({ ...selection, ticker: candidate.ticker })
            }
            label={`${candidate.ticker}${
              candidate.exchange ? ` · ${candidate.exchange}` : ""
            }`}
            hint={`${candidate.secName}${
              candidate.exact
                ? ""
                : " · similar name, check it is the same company"
            }`}
          />
        ))}
        {stock.candidates.length > 0 && (
          <Choice
            type="radio"
            name="footprint-ticker"
            checked={selection.ticker === ""}
            onChange={() => setSelection({ ...selection, ticker: "" })}
            label="None of these"
          />
        )}
      </Source>

      <Source title="Hiring" status={hiring.status} detail={hiring.detail}>
        {hiring.careersUrl && (
          <Choice
            type="checkbox"
            checked={selection.careers}
            onChange={() =>
              setSelection({ ...selection, careers: !selection.careers })
            }
            label={`${PROVIDER_NAMES[hiring.provider ?? "unknown"]}${
              hiring.openRoles !== undefined
                ? ` · ${hiring.openRoles.toLocaleString()} open roles`
                : ""
            }`}
            hint={
              <>
                <a
                  href={hiring.careersUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-console-cyan underline"
                >
                  {hiring.careersUrl.replace(/^https:\/\//, "")}
                </a>
                {hiring.nameVerified === false &&
                  " · matched by web address only, open it to check"}
              </>
            }
          />
        )}
      </Source>

      <Source
        title="Subreddits"
        status={communities.status}
        detail={communities.detail}
      >
        {communities.subreddits.map((subreddit) => (
          <Choice
            key={subreddit.name}
            type="checkbox"
            checked={selection.subreddits.includes(subreddit.name)}
            onChange={() =>
              setSelection({
                ...selection,
                subreddits: selection.subreddits.includes(subreddit.name)
                  ? selection.subreddits.filter((n) => n !== subreddit.name)
                  : [...selection.subreddits, subreddit.name],
              })
            }
            label={`r/${subreddit.name}`}
            hint={`${subreddit.subscribers.toLocaleString()} members${
              subreddit.title ? ` · ${subreddit.title}` : ""
            }`}
          />
        ))}
      </Source>

      <Source title="Website" status={website.status} detail={website.detail}>
        {website.sitemapUrl && (
          <Choice
            type="checkbox"
            checked={selection.website}
            onChange={() =>
              setSelection({ ...selection, website: !selection.website })
            }
            label={`Sitemap · ${(
              website.pageCount ?? 0
            ).toLocaleString()} pages`}
            hint={
              keyPageKinds.length > 0
                ? `Key pages: ${keyPageKinds.join(", ")}`
                : "No pricing, careers or blog pages spotted"
            }
          />
        )}
      </Source>

      <div className="flex justify-end gap-2 p-3">
        <QuietButton
          size="sm"
          onClick={() => {
            setFindings(null);
            setSelection(null);
          }}
        >
          Discard
        </QuietButton>
        <PrimaryButton
          size="sm"
          onClick={handleSave}
          disabled={isSubmitting || nothingSelected}
        >
          Save selected
        </PrimaryButton>
      </div>
    </div>
  );
}

const STATUS_NOTES: Record<Exclude<SourceStatus, "found">, string> = {
  not_found: "Nothing found.",
  not_configured: "Not set up on this server.",
  unavailable: "Could not be read.",
};

function Source({
  title,
  status,
  detail,
  children,
}: {
  title: string;
  status: SourceStatus;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="text-console-fg text-sm font-medium">{title}</p>
      {children}
      {(status !== "found" || detail) && (
        <p className="text-console-subtle text-xs">
          {detail ?? (status !== "found" ? STATUS_NOTES[status] : null)}
        </p>
      )}
    </div>
  );
}

function Choice({
  label,
  hint,
  ...input
}: {
  type: "checkbox" | "radio";
  name?: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        {...input}
        className="border-console-border bg-console-raised text-console-mint focus:ring-console-cyan mt-0.5 size-4 cursor-pointer focus:ring-1 focus:ring-offset-0"
      />
      <span className="min-w-0">
        <span className="text-console-fg block text-sm">{label}</span>
        {hint && (
          <span className="text-console-subtle block text-xs break-words">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}
