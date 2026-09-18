import { Bell, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "../../client/utils";
import type { BrandTileData } from "../mockData";
import { Sparkline } from "./Sparkline";

export function BrandTile({ brand }: { brand: BrandTileData }) {
  const isUp = brand.deltaPercent >= 0;
  const DeltaIcon = isUp ? TrendingUp : TrendingDown;

  return (
    <div className="bg-console-surface border-console-border flex flex-col gap-5 rounded-lg border p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BrandLogo name={brand.name} logoUrl={brand.logoUrl} />
          <div className="flex flex-col gap-0.5">
            <p className="text-console-fg text-sm font-semibold">
              {brand.name}
            </p>
            <p className="text-console-muted font-mono text-[10px] uppercase tracking-[0.5px]">
              {brand.stage}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pill
            className={brand.isLive ? "text-console-cyan" : "text-console-dim"}
          >
            {brand.isLive ? "LIVE" : "PAUSED"}
          </Pill>
          {brand.alertCount > 0 && (
            <Pill className="text-console-orange">
              <Bell
                className="size-[10.67px]"
                strokeWidth={2}
                aria-hidden="true"
              />
              {brand.alertCount} {brand.alertCount === 1 ? "Alert" : "Alerts"}
            </Pill>
          )}
        </div>
      </div>

      <div className="flex items-end gap-4">
        <div className="flex shrink-0 flex-col gap-1">
          <p className="font-mono text-[10px] font-bold text-white">
            {brand.metricLabel}
          </p>
          <p className="text-console-fg font-mono text-[22px] font-bold leading-tight">
            {brand.metricValue}
          </p>
          <div
            className={cn(
              "flex items-center gap-1.5 font-mono text-xs font-medium",
              isUp ? "text-console-green" : "text-console-orange",
            )}
          >
            <DeltaIcon className="size-2.5" aria-hidden="true" />
            {isUp ? "+" : ""}
            {brand.deltaPercent.toFixed(1)}%
          </div>
        </div>
        <Sparkline
          data={brand.series}
          label={`${brand.name} ${brand.metricLabel.toLowerCase()} trend`}
          className="h-14 min-w-0 flex-1"
        />
      </div>
    </div>
  );
}

function BrandLogo({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  return (
    <div className="border-console-border bg-console-raised flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border">
      {logoUrl ? (
        <img src={logoUrl} alt="" className="size-full object-cover" />
      ) : (
        <span className="text-console-muted text-sm font-semibold">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

function Pill({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "bg-console-raised border-console-border flex items-center gap-[5px] rounded border px-2 py-[3px] font-mono text-[10px] font-bold whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}
