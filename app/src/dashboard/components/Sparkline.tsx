import { useId } from "react";

// Single-series trend line for a stat tile. Points are normalized into the
// viewBox so any series length fills the available width.
export function Sparkline({
  data,
  label,
  className,
}: {
  data: number[];
  label: string;
  className?: string;
}) {
  const titleId = useId();
  const width = 200;
  const height = 56;
  const pad = 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((value, i) => {
      const x = pad + (i / (data.length - 1)) * (width - pad * 2);
      const y = pad + (1 - (value - min) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-labelledby={titleId}
      className={className}
    >
      <title id={titleId}>{label}</title>
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-console-chart)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
