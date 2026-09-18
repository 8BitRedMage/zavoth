import type { PortfolioSummary } from "../mockData";

export function SummaryCard({ summary }: { summary: PortfolioSummary }) {
  const isUp = summary.changePercent >= 0;

  return (
    <div className="bg-console-surface border-console-border flex flex-col gap-4 rounded-lg border p-5">
      <div className="flex items-center gap-3">
        <p className="text-console-muted font-mono text-[11px] font-medium uppercase tracking-[1px]">
          {summary.label}
        </p>
        <span
          aria-hidden="true"
          className="bg-console-cyan size-1.5 rounded-[1px]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-console-fg font-mono text-[28px] font-bold leading-none">
          {summary.value}
        </p>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-console-green font-mono font-bold">
            {isUp ? "▲" : "▼"} {isUp ? "+" : ""}
            {summary.changePercent.toFixed(1)}%
          </span>
          <span className="text-console-dim">{summary.comparedTo}</span>
        </div>
      </div>
    </div>
  );
}
