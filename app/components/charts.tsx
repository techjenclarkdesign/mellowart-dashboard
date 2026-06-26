/** Dependency-free SVG charts for the dashboard: sparkline, trend, donut. */

import { cn } from "~/lib/utils";

/** Tiny inline area+line for the summary cards. Colour via `color` (CSS). */
export function Sparkline({
  data,
  color = "currentColor",
  className,
}: {
  data: number[];
  color?: string;
  className?: string;
}) {
  const W = 100;
  const H = 32;
  const pad = 2;
  if (data.length < 2) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden />
    );
  }
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const x = (i: number) => pad + (i / (data.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / range) * (H - pad * 2);
  const line = data
    .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={className}
      style={{ color }}
      aria-hidden
    >
      <path d={area} fill="currentColor" opacity={0.12} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  if (max <= 5) return Array.from({ length: max + 1 }, (_, i) => i);
  return [0, Math.round(max / 2), max];
}

/** Area + line trend chart with x date labels and y gridlines. */
export function TrendChart({
  data,
  className,
}: {
  data: { date: string; count: number }[];
  className?: string;
}) {
  const W = 640;
  const H = 220;
  const padL = 28;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const max = Math.max(...data.map((d) => d.count), 1);
  const x = (i: number) =>
    padL + (i / (data.length - 1 || 1)) * innerW;
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const line = data
    .map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.count).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${padT + innerH} L${x(0).toFixed(1)},${padT + innerH} Z`;
  const labelEvery = Math.max(1, Math.floor(data.length / 6));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn("w-full", className)}
      role="img"
      aria-label="Application trend over the last 30 days"
    >
      {niceTicks(max).map((t) => (
        <g key={t}>
          <line
            x1={padL}
            x2={W - padR}
            y1={y(t)}
            y2={y(t)}
            className="stroke-border"
            strokeWidth={1}
          />
          <text
            x={padL - 6}
            y={y(t) + 3}
            textAnchor="end"
            className="fill-muted-foreground text-[10px]"
          >
            {t}
          </text>
        </g>
      ))}
      <path d={area} className="fill-foreground/[0.06]" />
      <path
        d={line}
        className="fill-none stroke-foreground"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {data.map((d, i) =>
        i % labelEvery === 0 ? (
          <text
            key={d.date}
            x={x(i)}
            y={H - 8}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {fmtDay(d.date)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** Donut with the total in the centre. */
export function Donut({
  segments,
  total,
  size = 160,
  thickness = 20,
}: {
  segments: { label: string; value: number; color: string }[];
  total: number;
  size?: number;
  thickness?: number;
}) {
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const sum = segments.reduce((a, s) => a + s.value, 0) || 1;
  let acc = 0;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label="Status breakdown"
    >
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        className="stroke-muted"
        strokeWidth={thickness}
      />
      <g transform={`rotate(-90 ${c} ${c})`}>
        {segments.map((s) => {
          const len = (s.value / sum) * circ;
          const el = (
            <circle
              key={s.label}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-acc}
            />
          );
          acc += len;
          return el;
        })}
      </g>
      <text
        x={c}
        y={c - 1}
        textAnchor="middle"
        className="fill-foreground text-2xl font-semibold"
      >
        {total}
      </text>
      <text
        x={c}
        y={c + 15}
        textAnchor="middle"
        className="fill-muted-foreground text-[10px] uppercase tracking-wider"
      >
        Total
      </text>
    </svg>
  );
}
