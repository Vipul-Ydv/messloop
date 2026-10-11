// Shared pieces. Every displayed number goes through <Num> so it always carries
// its label (R4), and colour is never the only signal (§11.2).

import type { ReactNode } from "react";
import type { LabelKind } from "./api.ts";
import { Icon, type IconName } from "./Icon.tsx";

export const GLYPH: Record<LabelKind, string> = { Measured: "●", Calculated: "◆", Estimated: "▲", Simulated: "○" };

export function Lbl({ kind }: { kind: LabelKind }) {
  return (
    <span className="lbl" title={`${kind} value`}>
      <span className="lbl-glyph" aria-hidden="true">{GLYPH[kind]}</span>
      {kind}
    </span>
  );
}

export const fmt = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toFixed(digits);

export function Num({ value, digits = 1, unit, kind }: { value: number | null | undefined; digits?: number; unit?: string; kind: LabelKind }) {
  return (
    <span className="row" style={{ gap: 6, display: "inline-flex" }}>
      <span className="num">{fmt(value, digits)}{unit ? <span className="muted"> {unit}</span> : null}</span>
      <Lbl kind={kind} />
    </span>
  );
}

export function Legend() {
  return (
    <div className="legend" role="note" aria-label="What the labels mean">
      <span><strong>●</strong> Measured — entered by mess staff</span>
      <span><strong>◆</strong> Calculated — computed by code</span>
      <span><strong>▲</strong> Estimated — a projection</span>
      <span><strong>○</strong> Simulated — demo data</span>
    </div>
  );
}

export function SimBadge({ show = true }: { show?: boolean }) {
  if (!show) return null;
  return (
    <span className="sim-badge" title="Demo data for the hackathon. Not real measurements.">
      <Icon name="flask" size={15} /> Simulated data
    </span>
  );
}

const STATUS_ICON: Record<string, string> = { pending: "⏳", approved: "✓", modified: "✓", rejected: "✕", active: "●", running: "…" };
export function Status({ value }: { value: string }) {
  return <span className={`status status-${value}`}><span aria-hidden="true">{STATUS_ICON[value] ?? "•"}</span>{value[0].toUpperCase() + value.slice(1)}</span>;
}

export function Card({ children, delay = 0, className = "", ...rest }: { children: ReactNode; delay?: number; className?: string; [k: string]: unknown }) {
  return <section className={`card ${className}`} style={{ animationDelay: `${delay}ms` }} {...rest}>{children}</section>;
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return <p className="note note-bad" role="alert"><Icon name="alert" size={16} /> {message}</p>;
}

export function Loading({ what = "Loading" }: { what?: string }) {
  return <p className="muted row" role="status"><span className="spinner" aria-hidden="true" /> {what}…</p>;
}

export const niceDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });

// ------------------------------------------------------------------ new building blocks

export type Tone = "accent" | "lime" | "forest" | "coral" | "sun" | "sky" | "lav";

export function IconTile({ name, tone = "accent", size = 22 }: { name: IconName; tone?: Tone; size?: number }) {
  return <span className={`tile tile-${tone}`} aria-hidden="true"><Icon name={name} size={size} /></span>;
}

export function Kpi({ icon, tone = "accent", label, hint, foot, delay = 0, children }: {
  icon: IconName; tone?: Tone; label: string; hint?: string; foot?: ReactNode; delay?: number; children: ReactNode;
}) {
  return (
    <section className="card kpi" style={{ animationDelay: `${delay}ms` }}>
      <div className="row kpi-top">
        <IconTile name={icon} tone={tone} />
        <span className="stat-label" title={hint}>{label}</span>
      </div>
      <div className="stat-value">{children}</div>
      {foot ? <div className="small muted">{foot}</div> : null}
    </section>
  );
}

export function Skeleton({ h = 20, w = "100%" }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} aria-hidden="true" />;
}

export function SkeletonGrid({ count = 4, what = "Loading" }: { count?: number; what?: string }) {
  return (
    <div className="grid grid-4" role="status">
      <span className="sr-only">{what}…</span>
      {Array.from({ length: count }, (_, i) => (
        <div className="card" key={i} aria-hidden="true"><Skeleton h={22} w={44} /><Skeleton h={14} w="60%" /><Skeleton h={36} w="40%" /></div>
      ))}
    </div>
  );
}

export function EmptyState({ icon = "bowl", title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-art" aria-hidden="true"><Icon name={icon} size={40} /></span>
      <h3>{title}</h3>
      {children ? <p className="muted">{children}</p> : null}
      {action}
    </div>
  );
}

export function Hero({ icon, title, sub, decor = ["leaf", "carrot", "tomato"], as: Tag = "h1", children }: {
  icon: IconName; title: string; sub?: ReactNode; decor?: IconName[]; as?: "h1" | "p"; children?: ReactNode;
}) {
  return (
    <section className="hero">
      <div className="hero-deco" aria-hidden="true">
        {decor.map((d, i) => <span key={d + i} className={`deco deco-${i}`}><Icon name={d} size={46} strokeWidth={1.6} /></span>)}
      </div>
      <IconTile name={icon} tone="accent" size={30} />
      <div className="stack" style={{ gap: 6 }}>
        <Tag className={Tag === "p" ? "hero-title" : undefined}>{title}</Tag>
        {sub ? <p className="hero-sub">{sub}</p> : null}
        {children}
      </div>
    </section>
  );
}

export interface Step { label: string; note?: ReactNode; state: "done" | "current" | "todo" }

export function Stepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="stepper" aria-label="Waste Experiment progress">
      {steps.map((s, i) => (
        <li key={s.label} className={`step step-${s.state}`} aria-current={s.state === "current" ? "step" : undefined}>
          <span className="step-dot" aria-hidden="true">{s.state === "done" ? <Icon name="check" size={16} strokeWidth={3} /> : i + 1}</span>
          <span className="step-label">{s.label}<span className="sr-only">{s.state === "done" ? " (done)" : s.state === "current" ? " (in progress)" : " (not started)"}</span></span>
          {s.note ? <span className="step-note">{s.note}</span> : null}
        </li>
      ))}
    </ol>
  );
}

const ICON_RULES: [RegExp, IconName][] = [
  [/rice|biryani|pulao|khichdi|poha|upma/i, "bowl"],
  [/roti|chapati|paratha|naan|puri|dosa/i, "chapati"],
  [/dal|curry|sabzi|paneer|chole|rajma|gobi|aloo|sambar|kadhi|masala/i, "pot"],
  [/salad|veg|bhindi|palak|carrot|gajar/i, "carrot"],
  [/fruit|apple|banana/i, "apple"],
  [/tomato/i, "tomato"],
  [/soup|tea|milk|juice|lassi|chai/i, "drop"],
];
export const itemIcon = (name: string): IconName => ICON_RULES.find(([re]) => re.test(name))?.[1] ?? "plate";
