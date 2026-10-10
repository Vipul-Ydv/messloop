// Impact: baseline vs after, always worded as an observed change with its n (R5).
// Without an id it lists every trial — this is also the students' view.

import { useEffect, useState } from "react";
import { api, type Impact, type Intervention, type Item, type Role } from "../api.ts";
import { Card, ErrorNote, Lbl, Loading, SimBadge, Status, fmt, niceDate } from "../ui.tsx";

export default function ImpactPage({ interventionId, role }: { interventionId?: string; role: Role }) {
  const [list, setList] = useState<Intervention[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [impacts, setImpacts] = useState<Record<string, Impact>>({});
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    (async () => {
      try {
        const [ints, its] = await Promise.all([api<Intervention[]>("GET", "/interventions"), api<Item[]>("GET", "/items")]);
        setItems(its);
        const shown = interventionId ? ints.filter((i) => i.interventionId === interventionId) : ints;
        if (interventionId && shown.length === 0) throw new Error("This trial was not found. It may have been cleared by a re-seed.");
        setList(shown.sort((a, b) => (a.startDate < b.startDate ? 1 : -1)));
        const pairs = await Promise.all(shown.map(async (i) => [i.interventionId, await api<Impact>("GET", `/interventions/${i.interventionId}/impact`)] as const));
        setImpacts(Object.fromEntries(pairs));
      } catch (e) {
        setError(e);
      }
    })();
  }, [interventionId]);

  if (error) return <ErrorNote error={error} />;
  if (!list) return <Loading what="Measuring impact" />;

  const name = (id?: string) => items.find((i) => i.itemId === id)?.name ?? id ?? "";

  return (
    <>
      <div className="row between" style={{ alignItems: "flex-end" }}>
        <div className="stack" style={{ gap: 4 }}>
          {interventionId && role === "manager" && <a href="#/impact" className="small">← All trials</a>}
          <h1>{interventionId ? "Did the change help?" : role === "student" ? "What changed in the mess" : "Trials and their impact"}</h1>
        </div>
        <SimBadge show={list.some((i) => i.isSimulated)} />
      </div>

      {list.length === 0 && (
        <Card><p className="muted">No changes have been tried yet. When the manager approves a suggestion, it will show up here with its before-and-after numbers.</p></Card>
      )}

      {list.map((i, idx) => {
        const imp = impacts[i.interventionId];
        const title = i.action.type === "replace" ? `${name(i.action.fromItemId)} → ${name(i.action.toItemId)}` : `${i.action.type === "reduce_quantity" ? "Cook less" : "Serve less often"}: ${name(i.action.fromItemId)}`;
        return (
          <Card key={i.interventionId} delay={idx * 80} style={{ gap: 18 }}>
            <div className="row between">
              <div className="stack" style={{ gap: 2 }}>
                <h2 style={{ fontSize: 24 }}>{title}</h2>
                <p className="small muted">Started {niceDate(i.startDate)} · approved by the manager: “{i.decisionReason}”</p>
              </div>
              <Status value={i.status} />
            </div>
            {!imp ? <Loading what="Calculating" /> : imp.postRecordCount === 0 ? (
              <>
                <BeforeAfter base={imp.baselineWastePer100} baseN={i.baseline.nRecords} unit={i.baseline.unit} />
                <p className="note note-info">No meals logged since the change yet. {role !== "student" && <a href="#/entry">Log the next meal →</a>}</p>
              </>
            ) : (
              <>
                <BeforeAfter base={imp.baselineWastePer100} baseN={imp.baselineRecordCount ?? i.baseline.nRecords} post={imp.postWastePer100} postN={imp.postRecordCount} unit={imp.unit ?? i.baseline.unit} />
                <div className="grid grid-4">
                  <div>
                    <p className="stat-label">Change</p>
                    <p className="stat-value num" style={{ fontSize: 32 }}>
                      <span aria-hidden="true">{imp.direction === "decreased" ? "▼" : imp.direction === "increased" ? "▲" : "≈"}</span>
                      {imp.absoluteChange !== undefined && (imp.absoluteChange > 0 ? "+" : "")}{fmt(imp.absoluteChange, 2)}
                    </p>
                    <p className="small">{imp.direction} · <Lbl kind="Calculated" /></p>
                  </div>
                  <div>
                    <p className="stat-label">Reduction</p>
                    <p className="stat-value num" style={{ fontSize: 32 }}>{imp.reductionPct === null || imp.reductionPct === undefined ? "not defined" : `${fmt(imp.reductionPct)}%`}</p>
                    <Lbl kind="Calculated" />
                  </div>
                  <div>
                    <p className="stat-label">Food saved over these meals</p>
                    <p className="stat-value num" style={{ fontSize: 32 }}>{fmt(imp.estimatedFoodSavedQty, 2)}<small>{imp.unit}</small></p>
                    <Lbl kind="Estimated" />
                  </div>
                  <div>
                    <p className="stat-label">Meals since the change</p>
                    <p className="stat-value num" style={{ fontSize: 32 }}>n = {imp.postRecordCount}</p>
                    <span className="small muted">Observed change</span>
                  </div>
                </div>
                <AgentReport imp={imp} />
                <p className="note note-warn"><strong>Observed change</strong> — {imp.caveat}</p>
              </>
            )}
          </Card>
        );
      })}
    </>
  );
}

function AgentReport({ imp }: { imp: Impact }) {
  const [report, setReport] = useState(imp.agentSummary);
  useEffect(() => {
    // The agent writes its report a few seconds after the meal is logged; check back for up to a minute.
    if (report?.forPostRecordCount === imp.postRecordCount) return;
    let tries = 0;
    const t = setInterval(async () => {
      tries++;
      try {
        const fresh = await api<Impact>("GET", `/interventions/${imp.interventionId}/impact`);
        if (fresh.agentSummary) { setReport(fresh.agentSummary); clearInterval(t); }
      } catch { /* keep the page as it is */ }
      if (tries >= 20) clearInterval(t);
    }, 3000);
    return () => clearInterval(t);
  }, [imp.interventionId, imp.postRecordCount, report]);

  return (
    <div className="stack" style={{ gap: 6, padding: 16, borderRadius: 12, background: "var(--brand-soft)" }}>
      <div className="row between">
        <strong>Agent's report</strong>
        {report && <span className="small muted">{report.source === "ai" ? "Our AI · numbers checked" : "Template · AI answer failed a check"}</span>}
      </div>
      {report ? <p>{report.text}</p> : <p className="muted row running"><span className="spinner" aria-hidden="true" /> The agent is writing its report…</p>}
    </div>
  );
}

function BeforeAfter({ base, baseN, post, postN, unit }: { base: number; baseN: number; post?: number; postN?: number; unit: string }) {
  const max = Math.max(base, post ?? 0, 0.01);
  const Row = ({ label, value, n, colour, delay }: { label: string; value?: number; n?: number; colour: string; delay: number }) => (
    <div className="grid" style={{ gridTemplateColumns: "minmax(80px, 110px) 1fr minmax(110px, auto)", alignItems: "center", gap: 12 }}>
      <span><strong>{label}</strong><br /><span className="small muted">{n !== undefined ? `${n} meal${n === 1 ? "" : "s"}` : ""}</span></span>
      <div className="hbar" style={{ height: 34 }}>{value !== undefined && <div style={{ width: `${(value / max) * 100}%`, background: colour, animationDelay: `${delay}ms` }} />}</div>
      <span className="num" style={{ fontFamily: "var(--display)", fontSize: 26, fontWeight: 800 }}>{value === undefined ? "—" : fmt(value)} <span className="small muted" style={{ fontFamily: "var(--body)", fontWeight: 500 }}>{unit}</span></span>
    </div>
  );
  return (
    <div className="stack" style={{ gap: 10 }}>
      <p className="small muted">{unit} left over per 100 plates <Lbl kind="Calculated" /></p>
      <Row label="Before" value={base} n={baseN} colour="var(--bad)" delay={200} />
      <Row label="After" value={post} n={postN} colour="var(--good)" delay={500} />
      <span className="sr-only">{`Before ${fmt(base)}${post !== undefined ? `, after ${fmt(post)}` : ", no meals after yet"}, ${unit} per 100 plates.`}</span>
    </div>
  );
}
