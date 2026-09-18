import { ExternalLink } from "lucide-react";
import { useState } from "react";
import {
  getManualSources,
  recordManualData,
  setEntityProfileUrl,
  useQuery,
} from "wasp/client/operations";
import type { ManualSourceState } from "../manualSources/operations";
import {
  formatManualValue,
  type ManualValues,
} from "../manualSources/platforms";
import {
  ConsoleInput,
  ConsoleTextarea,
  PrimaryButton,
  QuietButton,
} from "./ui";
import { useSubmit } from "./useSubmit";

/**
 * Platforms that forbid bots (LinkedIn, G2, ...). Zavoth never visits them:
 * the user opens the page with their own login and types in what it shows.
 * The voice assistant runs this same routine as a conversation.
 */
export function ManualSourcesSection({
  orgId,
  entityId,
  canEdit,
}: {
  orgId: string;
  entityId: string;
  canEdit: boolean;
}) {
  const { data: sources, isLoading } = useQuery(getManualSources, {
    orgId,
    entityId,
  });

  if (isLoading || !sources) {
    return <p className="text-console-subtle text-sm">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-console-muted text-sm">
        These platforms do not allow automated collection, so Zavoth never
        visits them. Open a page with your own login and record what you see,
        here or by asking Zavoth to walk you through it.
      </p>
      <ul className="border-console-border divide-console-border divide-y rounded-lg border">
        {sources.map((source) => (
          <SourceRow
            key={source.platform}
            orgId={orgId}
            entityId={entityId}
            source={source}
            canEdit={canEdit}
          />
        ))}
      </ul>
    </div>
  );
}

const LINK_HINTS: Record<ManualSourceState["link"]["kind"], string> = {
  saved: "",
  guess: "Best guess. Check it is the right company.",
  search: "Opens a search. Pick the company from the results.",
};

function SourceRow({
  orgId,
  entityId,
  source,
  canEdit,
}: {
  orgId: string;
  entityId: string;
  source: ManualSourceState;
  canEdit: boolean;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [latest, previous] = source.captures;

  return (
    <li className="flex flex-col gap-2.5 p-3">
      <div className="flex items-center justify-between gap-3">
        <a
          href={source.link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-console-fg hover:text-console-cyan inline-flex items-center gap-1.5 text-sm font-medium"
        >
          {source.label}
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
        {canEdit && !isRecording && (
          <QuietButton size="sm" onClick={() => setIsRecording(true)}>
            {latest ? "Update" : "Record"}
          </QuietButton>
        )}
      </div>

      {LINK_HINTS[source.link.kind] && (
        <p className="text-console-subtle text-xs">
          {LINK_HINTS[source.link.kind]}
          {source.link.kind === "guess" && (
            <>
              {" "}
              <a
                href={source.link.searchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-console-cyan underline"
              >
                Search instead
              </a>
              .
            </>
          )}
        </p>
      )}

      {latest && !isRecording && (
        <div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
            {source.metrics.flatMap((metric) => {
              const value = latest.values[metric.key];
              if (value === undefined) return [];
              const before = previous?.values[metric.key];
              return [
                <dt key={`${metric.key}-label`} className="text-console-muted">
                  {metric.label}
                </dt>,
                <dd
                  key={`${metric.key}-value`}
                  className="text-console-fg text-right font-mono text-xs"
                >
                  {formatManualValue(metric.kind, value)}
                  {before !== undefined && before !== value && (
                    <span className="text-console-subtle">
                      {" "}
                      was {formatManualValue(metric.kind, before)}
                    </span>
                  )}
                </dd>,
              ];
            })}
          </dl>
          {latest.notes && (
            <p className="text-console-muted mt-1.5 text-xs">{latest.notes}</p>
          )}
          <p className="text-console-subtle mt-1.5 text-xs">
            Recorded {new Date(latest.capturedAt).toLocaleDateString()}
            {latest.recordedBy && ` by ${latest.recordedBy}`}
          </p>
        </div>
      )}

      {isRecording && (
        <RecordForm
          orgId={orgId}
          entityId={entityId}
          source={source}
          onDone={() => setIsRecording(false)}
        />
      )}
    </li>
  );
}

function RecordForm({
  orgId,
  entityId,
  source,
  onDone,
}: {
  orgId: string;
  entityId: string;
  source: ManualSourceState;
  onDone: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [pageAddress, setPageAddress] = useState("");
  const { isSubmitting, submit } = useSubmit();

  const values: ManualValues = Object.fromEntries(
    Object.entries(answers).filter(([, answer]) => answer.trim() !== ""),
  );
  const hasValues = Object.keys(values).length > 0;

  const handleSave = async () => {
    const ok = await submit(async () => {
      // The page address first: if it is rejected, nothing has been recorded
      // and the user can fix it without creating a duplicate capture.
      if (pageAddress.trim()) {
        await setEntityProfileUrl({
          orgId,
          entityId,
          platform: source.platform,
          url: pageAddress,
        });
      }
      if (hasValues) {
        await recordManualData({
          orgId,
          entityId,
          platform: source.platform,
          values,
          notes: notes.trim() || undefined,
        });
      }
    }, `Could not save the ${source.label} data`);
    if (ok) onDone();
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        handleSave();
      }}
    >
      {source.metrics.map((metric) => {
        const id = `${source.platform}-${metric.key}`;
        return (
          <div key={metric.key} className="flex flex-col gap-1">
            <label htmlFor={id} className="text-console-muted text-xs">
              {metric.ask}
            </label>
            <ConsoleInput
              id={id}
              value={answers[metric.key] ?? ""}
              onChange={(event) =>
                setAnswers({ ...answers, [metric.key]: event.target.value })
              }
              inputMode={metric.kind === "text" ? "text" : "decimal"}
              placeholder="Leave blank to skip"
              maxLength={200}
            />
          </div>
        );
      })}
      <ConsoleTextarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        aria-label={`Notes about ${source.label}`}
        placeholder="Anything else worth noting, such as what recent posts or reviews are about"
        maxLength={2000}
        rows={2}
      />
      {source.link.kind !== "saved" && (
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${source.platform}-address`}
            className="text-console-muted text-xs"
          >
            Paste the page's address so the link goes straight there next time
          </label>
          <ConsoleInput
            id={`${source.platform}-address`}
            value={pageAddress}
            onChange={(event) => setPageAddress(event.target.value)}
            placeholder="Optional"
            maxLength={500}
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <QuietButton type="button" size="sm" onClick={onDone}>
          Cancel
        </QuietButton>
        <PrimaryButton
          type="submit"
          size="sm"
          disabled={isSubmitting || (!hasValues && !pageAddress.trim())}
        >
          Save
        </PrimaryButton>
      </div>
    </form>
  );
}
