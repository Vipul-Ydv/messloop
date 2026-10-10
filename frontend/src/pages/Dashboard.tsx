// Manager dashboard. Reads top to bottom as the loop: problem → evidence → action →
// status → outcome (§11). Alerts come from the server's rules, never from the AI (R3).

import { useCallback, useEffect, useState } from "react";
import { api, type Recommendation, type Summary } from "../api.ts";
import { Card, ErrorNote, Lbl, Loading, Num, SimBadge, Status, fmt, niceDate } from "../ui.tsx";
import { go } from "../nav.ts";

export default function Dashboard() {
  const [data, setData] = useState<Summary | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [running, setRunning] = useState(false);
  const [runNote, setRunNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([api<Summary>("GET", "/analytics/summary"), api<Recommendation[]>("GET", "/recommendations")]);
      setData(s);
      setRecs(r);
    } catch (e) {
      setError(e);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  // While the agent is working (or a just-logged meal may wake it), refresh quietly.
  useEffect(() => {
    if (!recs.some((r) => r.aiStatus === "running")) return;
    const t = setTimeout(load, 4000);
    return () => clearTimeout(t);
  }, [recs, load]);

  async function runAnalysis() {
    setRunning(true);
    setRunNote(null);
    try {
      const out = await api<any[]>("POST", "/recommendations/generate");
      const made = out.filter((r) => r.recId);
      const thin = out.filter((r) => r.status === "insufficient_evidence");
      setRunNote(
        made.length
          ? `${made.length} new recommendation${made.length > 1 ? "s" : ""} — our AI is writing the explanation now.`
          : thin.length
            ? `No new recommendation. ${thin.map((t) => t.name).join(", ")}: insufficient evidence (fewer than 3 records).`
            : "No new recommendation: nothing new crossed the rule, or it already has a pending suggestion or active change.",
      );
      if (made.length === 1) go(`/review/${made[0].recId}`);
      else await load();
    } catch (e) {
      setError(e);
    } finally {
      setRunning(false);
    }
  }

  async function resetDemo() {
    if (!window.confirm("Reset the demo? All logged meals, suggestions and trials go back to the starting simulated data.")) return;
    setRunning(true);
    try {
      await api("POST", "/admin/seed?includeLatest=false");
      setRunNote("Demo reset. Log Aloo Gobi for 8 Oct (50 kg cooked, 23 kg left, 115 plates) to start the story.");
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setRunning(false);
    }
  }

  if (error) return <ErrorNote error={error} />;
  if (!data) return <Loading what="Loading dashboard" />;

  const top = data.topWastefulItems[0];
  const pending = recs.filter((r) => r.status === "pending");

  return (
    <>
      <div className="row between" style={{ alignItems: "flex-end" }}>
        <div className="stack" style={{ gap: 4 }}>
          <p className="small muted" style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Demo hostel · Lunch dry sabzi</p>
          <h1>Mess dashboard</h1>
        </div>
        <div className="row">
          <SimBadge show={data.isSimulated} />
          {data.isSimulated && <button className="btn btn-ghost" onClick={resetDemo} disabled={running}>Reset demo</button>}
          <button className="btn" onClick={runAnalysis} disabled={running}>
            {running ? <><span className="spinner" aria-hidden="true" /> Checking rules…</> : "Run analysis"}
          </button>
        </div>
      </div>
      {runNote && <p className="note note-info" role="status">{runNote}</p>}
      {data.latestDate !== new Date().toLocaleDateString("en-CA") && (
        <p className="note note-warn" role="status">
          <span aria-hidden="true">⏰</span> Today's meal isn't logged yet. Mess staff can use <a href="#/entry">Voice log</a> (answer out loud in Hindi) or the form.
        </p>
      )}

      <div className="grid grid-4">
        <Card delay={0}>
          <p className="stat-label">Wasted on {data.latestDate ? niceDate(data.latestDate) : "—"}</p>
          <p className="stat-value num">{fmt(data.latestWasteQty)}<small>kg</small></p>
          <Lbl kind="Calculated" />
        </Card>
        <Card delay={70}>
          <p className="stat-label">Per 100 plates, that day</p>
          <p className="stat-value num">{fmt(data.latestWastePer100)}<small>kg</small></p>
          <Lbl kind="Calculated" />
        </Card>
        <Card delay={140}>
          <p className="stat-label">Most wasted dish (last 5 meals)</p>
          <p className="stat-value" style={{ fontSize: 30 }}>{top?.name ?? "—"}</p>
          {top && <span className="small muted"><Num value={top.pooledWastePer100} unit="kg / 100 plates" kind="Calculated" /></span>}
        </Card>
        <Card delay={210}>
          <p className="stat-label">Waiting for your decision</p>
          <p className="stat-value num">{data.pendingRecommendations}</p>
          {pending[0] ? <a href={`#/review/${pending[0].recId}`}>Review now →</a> : <span className="small muted">Nothing pending</span>}
        </Card>
      </div>

      {data.alerts.length === 0 && <p className="note note-good">✓ No dish is over the {data.threshold}% waste rule right now.</p>}
      {data.alerts.map((a) => {
        const rec = recs.find((r) => r.targetItemId === a.itemId && r.slotId === a.slotId);
        const isActive = data.activeInterventions.some((i) => i.action.fromItemId === a.itemId);
        return (
          <Card key={a.itemId + a.slotId} delay={260} style={{ borderLeft: "6px solid var(--bad)" }}>
            <div className="row between">
              <h2><span aria-hidden="true">⚠</span> Recurring waste: {a.name}</h2>
              {rec ? <Status value={rec.status} /> : isActive ? <Status value="active" /> : <span className="status status-pending">No suggestion yet</span>}
            </div>
            <p>
              Over <strong>{data.threshold}%</strong> wasted in <strong>{a.exceeded} of its last {a.n}</strong> meals.
              Pooled: <Num value={a.pooledWastePer100} unit="kg per 100 plates" kind="Calculated" />
            </p>
            <p className="small muted">Flagged by a fixed rule (over {data.threshold}% in at least 3 of the last 5), not by AI.</p>
            {rec ? (
              <div className="row between">
                <p>
                  Evidence strength: <strong>{rec.evidenceStrength}</strong> · Suggested
                  {rec.aiStatus === "running" ? " (agent investigating…)" : rec.source === "ai" ? " (our AI agent)" : " (template)"}:{" "}
                  <strong>{describe(rec)}</strong>
                </p>
                <a className="btn btn-ghost" href={`#/review/${rec.recId}`}>{rec.status === "pending" ? "Review ▸" : "Open ▸"}</a>
              </div>
            ) : !isActive && (
              <p className="small">Press <strong>Run analysis</strong> to build the evidence and get a suggestion.</p>
            )}
          </Card>
        );
      })}

      <div className="grid grid-2">
        <Card delay={320}>
          <div className="row between">
            <h2>Waste per 100 plates, meal by meal</h2>
            <Lbl kind="Calculated" />
          </div>
          <TrendChart data={data} />
        </Card>
        <Card delay={380}>
          <h2>Dishes by waste (last 5 meals each)</h2>
          <div className="stack" style={{ gap: 10 }}>
            {data.topWastefulItems.map((t, i) => {
              const max = Math.max(...data.topWastefulItems.map((x) => x.pooledWastePer100), 1);
              return (
                <div key={t.itemId} className="grid" style={{ gridTemplateColumns: "minmax(90px, 130px) 1fr auto", alignItems: "center", gap: 10 }}>
                  <span>{t.name}{t.alert && <span className="sr-only"> (flagged)</span>}</span>
                  <div className="hbar"><div style={{ width: `${(t.pooledWastePer100 / max) * 100}%`, background: t.alert ? "var(--bad)" : "var(--muted)", animationDelay: `${450 + i * 80}ms` }} /></div>
                  <span className="num small">{fmt(t.pooledWastePer100)}{t.alert ? " ⚠" : ""}</span>
                </div>
              );
            })}
          </div>
          <p className="small muted">kg left over per 100 plates. ⚠ = over the rule.</p>
        </Card>
      </div>

      <div className="grid grid-2">
        <Card delay={440}>
          <h2>Changes being tried</h2>
          {data.activeInterventions.length === 0 && <p className="muted">None yet. Approving a suggestion starts one.</p>}
          {data.activeInterventions.map((i) => (
            <div key={i.interventionId} className="stack" style={{ gap: 4, paddingBottom: 10, borderBottom: "1px solid var(--line)" }}>
              <div className="row between"><strong>{actionText(i.action, recs)}</strong><Status value="active" /></div>
              <p className="small muted">Since {niceDate(i.startDate)} · baseline <Num value={i.baseline.pooledWastePer100} kind="Calculated" /> kg / 100 plates from {i.baseline.nRecords} meals</p>
              <a href={`#/impact/${i.interventionId}`}>See impact →</a>
            </div>
          ))}
        </Card>
        <Card delay={500}>
          <h2>Recent outcomes</h2>
          {data.recentOutcomes.length === 0 && <p className="muted">No outcome measured yet. Log a meal after a change to see one.</p>}
          {data.recentOutcomes.map((o) => (
            <a key={o.interventionId} href={`#/impact/${o.interventionId}`} className="row between" style={{ textDecoration: "none", color: "inherit", padding: "6px 0" }}>
              <span className="num"><strong>{fmt(o.baselineWastePer100)} → {fmt(o.postWastePer100)}</strong> kg / 100 plates</span>
              <span>{o.direction === "decreased" ? "▼" : o.direction === "increased" ? "▲" : "≈"} {o.direction} · n = {o.postRecordCount}</span>
            </a>
          ))}
          {data.recentOutcomes.length > 0 && <p className="small muted">Observed change, not proof of cause.</p>}
        </Card>
      </div>
    </>
  );
}

function describe(rec: Recommendation) {
  const s = rec.content.suggestedAction;
  if (s.type === "replace") return `replace ${s.target} with ${s.replacement}`;
  if (s.type === "investigate") return `look into ${s.target}`;
  return `${s.type.replace("_", " ")} of ${s.target}`;
}

function actionText(a: { type: string; fromItemId: string; toItemId?: string }, recs: Recommendation[]) {
  const names = new Map<string, string>();
  for (const r of recs) {
    names.set(r.evidence.targetItem.itemId, r.evidence.targetItem.name);
    for (const c of r.evidence.candidates) names.set(c.itemId, c.name);
  }
  const n = (id?: string) => (id ? names.get(id) ?? id : "");
  return a.type === "replace" ? `${n(a.fromItemId)} → ${n(a.toItemId)}` : `${a.type.replace("_", " ")}: ${n(a.fromItemId)}`;
}

/** One bar per logged meal. Colour plus a pattern word in the legend, never colour alone. */
function TrendChart({ data }: { data: Summary }) {
  const pts = data.trend;
  if (pts.length === 0) return <p className="muted">No meals logged yet.</p>;
  const flagged = new Set(data.alerts.map((a) => a.itemId));
  const baseline = data.activeInterventions[0]?.baseline.pooledWastePer100 ?? data.alerts[0]?.pooledWastePer100;
  const W = 640, H = 240, padL = 34, padB = 34, padT = 12;
  const max = Math.max(...pts.map((p) => p.wastePer100), baseline ?? 0) * 1.15;
  const bw = (W - padL) / pts.length;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0, max / 2, max].map((v) => Math.round(v));
  const colour = (p: (typeof pts)[number]) => (p.interventionId ? "var(--good)" : flagged.has(p.itemId) ? "var(--bad)" : "var(--line)");

  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Waste per 100 plates for ${pts.length} meals. Highest ${fmt(Math.max(...pts.map((p) => p.wastePer100)))}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{t}</text>
          </g>
        ))}
        {pts.map((p, i) => {
          const h = H - padB - y(p.wastePer100);
          return (
            <g key={i}>
              <rect x={padL + i * bw + bw * 0.15} y={y(p.wastePer100)} width={bw * 0.7} height={h} rx="3" fill={colour(p)}
                style={{ transformOrigin: `0 ${H - padB}px`, animation: `growY 700ms cubic-bezier(.2,.8,.2,1) ${300 + i * 35}ms both` }}>
                <title>{`${p.name}, ${niceDate(p.date)}: ${fmt(p.wastePer100)} kg per 100 plates${p.interventionId ? " (after change)" : ""}`}</title>
              </rect>
              {(i % Math.ceil(pts.length / 8) === 0 || i === pts.length - 1) && (
                <text x={padL + i * bw + bw / 2} y={H - padB + 16} textAnchor="middle" fontSize="11" fill="var(--muted)">{niceDate(p.date)}</text>
              )}
            </g>
          );
        })}
        {baseline !== undefined && (
          <g>
            <line x1={padL} x2={W} y1={y(baseline)} y2={y(baseline)} stroke="var(--ink)" strokeDasharray="6 4" strokeWidth="1.5" />
            <text x={padL + 6} y={y(baseline) - 6} textAnchor="start" fontSize="12" fill="var(--ink)" fontWeight="600">baseline {fmt(baseline)}</text>
          </g>
        )}
      </svg>
      <figcaption className="row small muted" style={{ gap: 14, marginTop: 6 }}>
        <span className="row" style={{ gap: 6 }}><Swatch c="var(--bad)" /> Flagged dish</span>
        <span className="row" style={{ gap: 6 }}><Swatch c="var(--good)" /> After a change</span>
        <span className="row" style={{ gap: 6 }}><Swatch c="var(--line)" /> Other dishes</span>
        <span className="row" style={{ gap: 6 }}><span aria-hidden="true" style={{ width: 18, borderTop: "2px dashed var(--ink)" }} /> Baseline</span>
      </figcaption>
    </figure>
  );
}

const Swatch = ({ c }: { c: string }) => <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: c, display: "inline-block" }} />;
