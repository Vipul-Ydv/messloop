// Small shared pieces. Every displayed number goes through <Num> so it always carries
// its label (R4), and colour is never the only signal (§11.2).

import type { ReactNode } from "react";
import type { LabelKind } from "./api.ts";

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
  return <span className="sim-badge"><span aria-hidden="true">○</span> Simulated data</span>;
}

const STATUS_ICON: Record<string, string> = { pending: "⏳", approved: "✓", modified: "✓", rejected: "✕", active: "●" };
export function Status({ value }: { value: string }) {
  return <span className={`status status-${value}`}><span aria-hidden="true">{STATUS_ICON[value] ?? "•"}</span>{value[0].toUpperCase() + value.slice(1)}</span>;
}

export function Card({ children, delay = 0, className = "", ...rest }: { children: ReactNode; delay?: number; className?: string; [k: string]: unknown }) {
  return <section className={`card ${className}`} style={{ animationDelay: `${delay}ms` }} {...rest}>{children}</section>;
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return <p className="note note-bad" role="alert">{message}</p>;
}

export function Loading({ what = "Loading" }: { what?: string }) {
  return <p className="muted row" role="status"><span className="spinner" aria-hidden="true" /> {what}…</p>;
}

export const niceDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
