// Lightweight SVG/HTML charts. They only draw what they are given: every value comes from
// the API / packages/core, nothing is computed or invented here (R2).

import type { Impact, LabelKind, Summary } from "./api.ts";
import { Icon, type IconName } from "./Icon.tsx";
import { Lbl, fmt, niceDate } from "./ui.tsx";

const COLORS = ["#236B45", "#E2523A", "#6D55D6", "#1F86BD", "#B58A00"];

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

function Marker({ i, x, y, color, ring }: { i: number; x: number; y: number; color: string; ring: boolean }) {
  const s = 5;
  const shape = [
    <circle key="c" cx={x} cy={y} r={s} />,
    <rect key="r" x={x - s} y={y - s} width={s * 2} height={s * 2} rx={1.5} />,
    <polygon key="d" points={`${x},${y - s - 1} ${x + s + 1},${y} ${x},${y + s + 1} ${x - s - 1},${y}`} />,
    <polygon key="t" points={`${x},${y - s - 1} ${x + s + 1},${y + s} ${x - s - 1},${y + s}`} />,
  ][i % 4];
  return (
    <g fill={color} stroke="#fff" strokeWidth={1.5}>
      {ring ? <circle cx={x} cy={y} r={10} fill="none" stroke="#FF7058" strokeWidth={2.5} /> : null}
      {shape}
    </g>
  );
}

/** Waste per 100 servings over time, one line per dish. */
export function TrendChart({ points, kind }: { points: Summary["trend"]; kind: LabelKind }) {
  if (!points.length) return null;
  const W = 640, H = 300, L = 54, R = 16, T = 18, B = 50;
  const dates = [...new Set(points.map((p) => p.date))].sort();
  const groups = new Map<string, Summary["trend"]>();
  for (const p of points) {
    const k = p.itemId + "|" + p.slotId;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const series = [...groups.values()]
    .sort((a, b) => b.length - a.length)
    .slice(0, 5)
    .map((v) => v.slice().sort((a, b) => a.date.localeCompare(b.date)));
  const nameCount = new Map<string, number>();
  series.forEach((s) => nameCount.set(s[0].name, (nameCount.get(s[0].name) ?? 0) + 1));
  const labelOf = (s: Summary["trend"]) => (nameCount.get(s[0].name)! > 1 ? `${s[0].name} (${s[0].slotId})` : s[0].name);

  const maxV = niceMax(Math.max(...series.flatMap((s) => s.map((p) => p.wastePer100)), 0.0001) * 1.05);
  const iw = W - L - R, ih = H - T - B;
  const x = (d: string) => (dates.length === 1 ? L + iw / 2 : L + (dates.indexOf(d) / (dates.length - 1)) * iw);
  const y = (v: number) => T + (1 - v / maxV) * ih;
  const step = Math.ceil(dates.length / 6);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxV);
  const anyRing = series.some((s) => s.some((p) => p.interventionId));

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Line chart of waste per 100 servings by date, one line per dish. A table with the same data follows.">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid-line" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="ax">{fmt(t, maxV < 5 ? 1 : 0)}</text>
          </g>
        ))}
        <text transform={`translate(14 ${T + ih / 2}) rotate(-90)`} textAnchor="middle" className="ax ax-title">Waste per 100 servings</text>
        {dates.map((d, i) => (i % step === 0 ? <text key={d} x={x(d)} y={H - B + 20} textAnchor="middle" className="ax">{niceDate(d)}</text> : null))}
        <text x={L + iw / 2} y={H - 6} textAnchor="middle" className="ax ax-title">Date</text>
        <g className="chart-reveal">
          {series.map((s, i) => (
            <g key={s[0].itemId + s[0].slotId}>
              <polyline fill="none" stroke={COLORS[i]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" points={s.map((p) => `${x(p.date)},${y(p.wastePer100)}`).join(" ")} />
              {s.map((p) => <Marker key={p.date} i={i} x={x(p.date)} y={y(p.wastePer100)} color={COLORS[i]} ring={!!p.interventionId} />)}
            </g>
          ))}
        </g>
      </svg>
      <ul className="chart-legend">
        {series.map((s, i) => (
          <li key={s[0].itemId + s[0].slotId}>
            <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true"><line x1="0" x2="22" y1="7" y2="7" stroke={COLORS[i]} strokeWidth="3" /><Marker i={i} x={11} y={7} color={COLORS[i]} ring={false} /></svg>
            {labelOf(s)}
          </li>
        ))}
        {anyRing ? <li><svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true"><circle cx="11" cy="7" r="6" fill="none" stroke="#FF7058" strokeWidth="2.5" /></svg>Recorded after an approved change</li> : null}
        <li><Lbl kind={kind} /></li>
      </ul>
      <details className="chart-table">
        <summary>View chart data as a table</summary>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Dish</th><th className="r">Waste per 100 servings</th></tr></thead>
            <tbody>
              {points.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(0, 80).map((p, i) => (
                <tr key={i}><td>{niceDate(p.date)}</td><td>{p.name}</td><td className="r num">{fmt(p.wastePer100)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export interface BarRow { key: string; label: string; value: number; sub?: string; icon?: IconName; flag?: string }

/** Horizontal comparison bars (dish-wise waste). */
export function HBars({ rows, unit, kind }: { rows: BarRow[]; unit: string; kind: LabelKind }) {
  const max = Math.max(...rows.map((r) => r.value), 0.0001);
  return (
    <div className="bars">
      {rows.map((r, i) => (
        <div className="bar-row" key={r.key}>
          <div className="row between bar-head">
            <span className="row" style={{ gap: 8 }}>
              {r.icon ? <span className="bar-ico" aria-hidden="true"><Icon name={r.icon} size={18} /></span> : null}
              <strong>{r.label}</strong>
              {r.flag ? <span className="chip chip-coral"><Icon name="alert" size={13} /> {r.flag}</span> : null}
            </span>
            <span className="num"><strong>{fmt(r.value)}</strong> <span className="muted">{unit}</span></span>
          </div>
          <div className="hbar" role="img" aria-label={`${r.label}: ${fmt(r.value)} ${unit}`}>
            <div style={{ width: `${(r.value / max) * 100}%`, background: r.flag ? "var(--coral)" : "var(--forest)", animationDelay: `${i * 70}ms` }} />
          </div>
          {r.sub ? <span className="small muted">{r.sub}</span> : null}
        </div>
      ))}
      <div className="chart-legend"><span className="lbl-wrap"><Lbl kind={kind} /></span></div>
    </div>
  );
}

/** Baseline vs post-intervention waste per 100 servings. */
export function BeforeAfter({ impact, kind, compact = false }: { impact: Pick<Impact, "baselineWastePer100" | "postWastePer100" | "direction">; kind: LabelKind; compact?: boolean }) {
  const b = impact.baselineWastePer100;
  const p = impact.postWastePer100;
  const W = 320, H = compact ? 190 : 240, base = H - 40, top = 34;
  const max = niceMax(Math.max(b, p ?? 0, 0.0001) * 1.1);
  const h = (v: number) => ((v / max) * (base - top));
  const postColor = impact.direction === "decreased" ? "#236B45" : "#FF7058";
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Waste per 100 servings: ${fmt(b)} before the change, ${p === undefined ? "not measured yet" : fmt(p) + " after"}.`}>
        <line x1="20" x2={W - 20} y1={base} y2={base} className="grid-line" />
        <rect x="55" y={base - h(b)} width="84" height={h(b)} rx="10" fill="#B9A7FF" className="bar-grow" />
        <text x="97" y={base - h(b) - 8} textAnchor="middle" className="ax ax-value">{fmt(b)}</text>
        <text x="97" y={base + 20} textAnchor="middle" className="ax">Before change</text>
        {p === undefined ? (
          <>
            <rect x="181" y={top + 20} width="84" height={base - top - 20} rx="10" fill="none" stroke="#9AA79F" strokeWidth="2" strokeDasharray="6 5" />
            <text x="223" y={(base + top) / 2 + 14} textAnchor="middle" className="ax">Not yet</text>
          </>
        ) : (
          <>
            <rect x="181" y={base - h(p)} width="84" height={h(p)} rx="10" fill={postColor} className="bar-grow" style={{ animationDelay: "150ms" }} />
            <text x="223" y={base - h(p) - 8} textAnchor="middle" className="ax ax-value">{fmt(p)}</text>
          </>
        )}
        <text x="223" y={base + 20} textAnchor="middle" className="ax">After change</text>
      </svg>
      <div className="chart-legend"><span className="muted small">per 100 servings</span><Lbl kind={kind} /></div>
    </div>
  );
}
