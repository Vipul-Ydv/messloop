// Recommendation review (manager). The only screen that can change a recommendation's
// status, and only through the decision endpoint, always with a reason (R1).

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, api, type Recommendation } from "../api.ts";
import { Card, ErrorNote, Lbl, Loading, Num, SimBadge, Status, fmt, niceDate } from "../ui.tsx";
import { go } from "../nav.ts";

type Decision = "approve" | "modify" | "reject";

export default function Review({ recId }: { recId: string }) {
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      const all = await api<Recommendation[]>("GET", "/recommendations");
      const found = all.find((r) => r.recId === recId);
      if (!found) throw new Error("This recommendation was not found. It may have been cleared by a re-seed.");
      setRec(found);
    } catch (e) {
      setError(e);
    }
  }, [recId]);

  useEffect(() => { load(); }, [load]);

  // Our model writes in the background (~25 s on CPU). Poll until it is done.
  useEffect(() => {
    if (rec?.aiStatus !== "running") return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [rec, load]);

  if (error) return <ErrorNote error={error} />;
  if (!rec) return <Loading what="Loading recommendation" />;

  const e = rec.evidence;
  const c = rec.content;
  const unit = e.targetItem.unit;

  return (
    <>
      <div className="row between" style={{ alignItems: "flex-end" }}>
        <div className="stack" style={{ gap: 4 }}>
          <a href="#/dashboard" className="small">← Dashboard</a>
          <h1>{e.targetItem.name}: what should change?</h1>
        </div>
        <div className="row"><SimBadge show={rec.isSimulated} /><Status value={rec.status} /></div>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="stack" style={{ gap: 16 }}>
          <Card>
            <div className="row between">
              <h2>The problem</h2>
              <span className="small muted">Found by rule, not AI</span>
            </div>
            <p style={{ fontSize: 18 }}>
              Over <strong>{e.threshold}%</strong> wasted in <strong>{e.rule.exceeded} of the last {e.rule.of}</strong> meals.
            </p>
            <p>Pooled waste: <Num value={e.pooledBaselinePer100} digits={2} unit={`${unit} per 100 plates`} kind="Calculated" /></p>
            <p className="small muted">
              Evidence strength: <strong>{rec.evidenceStrength}</strong> — set by fixed rules from the number of meals, ratings and votes. It is not a probability.
            </p>
          </Card>

          <Card delay={60}>
            <h2>Evidence</h2>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Recent meals of {e.targetItem.name}</caption>
                <thead><tr><th>Date</th><th className="r">Cooked</th><th className="r">Left</th><th className="r">Plates</th><th className="r">Wasted</th><th className="r">Per 100</th></tr></thead>
                <tbody>
                  {e.history.map((h) => (
                    <tr key={h.date} className={h.wastePct > e.threshold ? "hot" : undefined}>
                      <td>{niceDate(h.date)}</td>
                      <td className="r num">{h.prepared}</td>
                      <td className="r num">{h.leftover}</td>
                      <td className="r num">{h.servings}</td>
                      <td className="r num">{fmt(h.wastePct)}%{h.wastePct > e.threshold ? " ⚠" : ""}</td>
                      <td className="r num">{fmt(h.per100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">Quantities in {unit}. ⚠ = over {e.threshold}%. Cooked, left and plates are <Lbl kind="Measured" /> (seeded demo rows are <Lbl kind="Simulated" />); the rest <Lbl kind="Calculated" />.</p>
            {e.avgRating !== null && (
              <p>Students rated it <strong className="num">{fmt(e.avgRating)} / 5</strong> from {e.ratingCount} ratings{e.topReasons.length ? <> · top reasons: {e.topReasons.join(", ")}</> : null}.</p>
            )}
          </Card>

          <Card delay={120}>
            <h2>Options</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Dish</th><th className="r">Times served</th><th className="r">Avg wasted</th><th className="r">Rating</th><th className="r">Votes</th></tr></thead>
                <tbody>
                  {e.candidates.map((x) => (
                    <tr key={x.itemId}>
                      <td>{x.name}{x.occurrences < 3 ? " (limited)" : ""}</td>
                      <td className="r num">{x.occurrences}</td>
                      <td className="r num">{x.avgWastePct === null ? "—" : `${fmt(x.avgWastePct, 0)}%`}</td>
                      <td className="r num">{fmt(x.avgRating)}</td>
                      <td className="r num">{x.votePct === null ? "—" : `${x.votePct}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">Cost: {e.constraints.cost === "unknown" ? "unknown" : e.constraints.cost} · Nutrition: unknown. Dishes served fewer than 3 times are a limited comparison.</p>
          </Card>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <AgentTrail rec={rec} />

          <Card delay={40} aria-live="polite" aria-busy={rec.aiStatus === "running"}>
            <div className="row between">
              <h2>Suggestion</h2>
              <SourceTag rec={rec} />
            </div>
            {rec.aiStatus === "running" && (
              <p className="note note-info row running"><span className="spinner" aria-hidden="true" /> The agent is investigating. Showing the rule-based version until its answer is checked.</p>
            )}
            <p style={{ fontSize: 18 }}><strong>{suggestionText(rec)}</strong></p>
            <p>{c.problem}</p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>{c.supportingEvidence.map((s, i) => <li key={i}>{s}</li>)}</ul>
            <p><strong>Why:</strong> {c.reasoning}</p>
            {c.alternatives.length > 0 && (
              <div className="stack" style={{ gap: 6 }}>
                <h3>Alternatives</h3>
                {c.alternatives.map((a) => (
                  <p key={a.item} className="small"><strong>{a.item}</strong> — {[...a.pros.map((p) => "+ " + p), ...a.cons.map((x) => "− " + x)].join("  ")}</p>
                ))}
              </div>
            )}
            {c.constraintsAndCaveats.length > 0 && (
              <p className="small muted"><strong>Caveats:</strong> {c.constraintsAndCaveats.join(" ")}</p>
            )}
            <p className="small muted">{c.evidenceStrengthNote}</p>
          </Card>

          {rec.status === "pending" ? (
            <DecisionForm rec={rec} onDone={(interventionId) => (interventionId ? go(`/impact/${interventionId}`) : load())} />
          ) : (
            <Card delay={80}>
              <h2>Decision</h2>
              <p><Status value={rec.status} /> {rec.decisionReason && <>— “{rec.decisionReason}”</>}</p>
              {rec.interventionId && <a className="btn" href={`#/impact/${rec.interventionId}`}>See impact →</a>}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

const TOOL_LABEL: Record<string, string> = {
  get_waste_history: "Looked at the dish's waste history",
  get_student_feedback: "Looked at student ratings and reasons",
  get_replacement_options: "Compared dishes that could replace it",
};

/** What the agent did, step by step. Runs on Step Functions; every step is also in its console. */
function AgentTrail({ rec }: { rec: Recommendation }) {
  const steps = rec.agent?.trace ?? [];
  const running = rec.aiStatus === "running";
  const decided = rec.status !== "pending";
  const Row = ({ icon, text, sub, live = false }: { icon: string; text: string; sub?: string; live?: boolean }) => (
    <li className={live ? "running" : undefined} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 10, alignItems: "start" }}>
      <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--brand-soft)", color: "var(--brand)", fontSize: 14, fontWeight: 700 }}>{icon}</span>
      <span><span>{text}</span>{sub && <><br /><span className="small muted">{sub}</span></>}</span>
    </li>
  );
  return (
    <Card delay={20}>
      <div className="row between">
        <h2>Agent activity</h2>
        <span className="small muted">AWS Step Functions</span>
      </div>
      <ol className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 12 }}>
        <Row icon="⚡" text={rec.agent?.trigger === "meal_logged" ? "Woke up when a meal was logged" : "Started by Run analysis"} sub={`A fixed rule flagged ${rec.evidence.targetItem.name}, not the AI`} />
        {steps.filter((s) => s.step === "tool").map((s, i) => (
          <Row key={i} icon="🔍" text={TOOL_LABEL[s.name ?? ""] ?? s.name ?? "Used a tool"} sub="Our model chose this step itself" />
        ))}
        {steps.filter((s) => s.step === "note").map((s, i) => <Row key={"n" + i} icon="!" text={s.detail ?? "Note"} />)}
        {running && <Row icon="…" text="Investigating with our own model (Qwen3-4B on EC2)" sub="Usually under a minute" live />}
        {steps.filter((s) => s.step === "write").map((s, i) => (
          <Row key={"w" + i} icon={rec.source === "ai" ? "✓" : "↺"} text={rec.source === "ai" ? "Wrote the suggestion · every number checked by code" : "Its answer failed a check, so the rule-based template is shown"} sub={rec.source === "ai" ? undefined : rec.fallbackReason} />
        ))}
        {!running && <Row icon={decided ? "✓" : "⏸"} text={decided ? `You decided: ${rec.status}. The run resumed and finished.` : "Paused — waiting for your decision"} sub={decided ? undefined : "Nothing changes until you approve, modify or reject"} live={!decided} />}
      </ol>
    </Card>
  );
}

function SourceTag({ rec }: { rec: Recommendation }) {
  if (rec.aiStatus === "running") return <span className="status status-pending">Template · agent working…</span>;
  if (rec.source === "ai") {
    return (
      <span className="status status-approved" title={`Model ${rec.model ?? ""}, ${rec.aiMs ? Math.round(rec.aiMs / 1000) + " s" : ""}. Every number was checked against the evidence.`}>
        ✓ Our AI · checked
      </span>
    );
  }
  return <span className="status status-rejected" title={rec.fallbackReason}>Template · AI not used</span>;
}

function suggestionText(rec: Recommendation) {
  const s = rec.content.suggestedAction;
  if (s.type === "replace") return `Replace ${s.target} with ${s.replacement}`;
  if (s.type === "investigate") return `Look into why ${s.target} is left over`;
  return `${s.type === "reduce_quantity" ? "Cook less" : "Serve less often"}: ${s.target}`;
}

function DecisionForm({ rec, onDone }: { rec: Recommendation; onDone: (interventionId?: string) => void }) {
  const [decision, setDecision] = useState<Decision>(rec.suggestedAction ? "approve" : "modify");
  const [reason, setReason] = useState("");
  const [type, setType] = useState<"replace" | "reduce_quantity" | "reduce_frequency">("replace");
  const [toItemId, setToItemId] = useState(rec.suggestedAction?.toItemId ?? rec.evidence.candidates[0]?.itemId ?? "");
  const [newQuantity, setNewQuantity] = useState("");
  const [needsConfirm, setNeedsConfirm] = useState<string | null>(null);
  const [confirmLimited, setConfirmLimited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const aiRunning = rec.aiStatus === "running";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: any = { decision, reason, confirmLimited };
      if (decision === "modify") body.modifiedAction = { type, toItemId: type === "replace" ? toItemId : undefined, newQuantity: type === "reduce_quantity" ? Number(newQuantity) : undefined };
      const out = await api<{ intervention: { interventionId: string } | null }>("POST", `/recommendations/${rec.recId}/decision`, body);
      onDone(out.intervention?.interventionId);
    } catch (err) {
      if (err instanceof ApiError && err.code === "LIMITED_BASELINE") setNeedsConfirm(err.message);
      else setError(err instanceof ApiError ? err : new ApiError(0, "NETWORK", "Could not reach the server."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card delay={80}>
      <h2>Your decision</h2>
      <p className="small muted">Nothing changes until you decide. Approving starts a trial and freezes today's baseline for comparison.</p>
      <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sr-only">Decision</legend>
          <div className="seg">
            {(["approve", "modify", "reject"] as Decision[]).map((d) => (
              <label key={d}><input type="radio" name="decision" value={d} checked={decision === d} disabled={d === "approve" && !rec.suggestedAction} onChange={() => setDecision(d)} /><span>{d === "approve" ? "✓ Approve" : d === "modify" ? "✎ Modify" : "✕ Reject"}</span></label>
            ))}
          </div>
        </fieldset>

        {decision === "modify" && (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <div className="field">
              <label htmlFor="mtype">Change</label>
              <select id="mtype" className="input" value={type} onChange={(e) => setType(e.target.value as any)}>
                <option value="replace">Replace the dish</option>
                <option value="reduce_quantity">Cook less</option>
                <option value="reduce_frequency">Serve less often</option>
              </select>
            </div>
            {type === "replace" && (
              <div className="field">
                <label htmlFor="mto">With</label>
                <select id="mto" className="input" value={toItemId} onChange={(e) => setToItemId(e.target.value)}>
                  {rec.evidence.candidates.map((c) => <option key={c.itemId} value={c.itemId}>{c.name}</option>)}
                </select>
              </div>
            )}
            {type === "reduce_quantity" && (
              <div className="field">
                <label htmlFor="mq">New amount ({rec.evidence.targetItem.unit})</label>
                <input id="mq" className="input num" type="number" min="0" step="0.5" inputMode="decimal" value={newQuantity} onChange={(e) => setNewQuantity(e.target.value)} required />
              </div>
            )}
          </div>
        )}

        <div className="field">
          <label htmlFor="reason">Reason (required)</label>
          <textarea id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="e.g. Left over again and again; students voted for Chole." aria-invalid={error?.field === "reason"} />
          {error?.field === "reason" && <span className="field-error">{error.message}</span>}
        </div>

        {needsConfirm && (
          <label className="note note-warn row" style={{ alignItems: "flex-start" }}>
            <input type="checkbox" checked={confirmLimited} onChange={(e) => setConfirmLimited(e.target.checked)} style={{ marginTop: 5 }} />
            <span>{needsConfirm} I understand the comparison will be weak.</span>
          </label>
        )}
        {error && error.field !== "reason" && <ErrorNote error={error} />}
        {aiRunning && <p className="small muted">You can decide once the AI explanation has been checked (a few seconds).</p>}

        <button className={decision === "reject" ? "btn btn-bad" : "btn"} type="submit" disabled={busy || aiRunning || !reason.trim() || (!!needsConfirm && !confirmLimited)}>
          {busy ? "Saving…" : decision === "approve" ? "Approve and start the trial" : decision === "modify" ? "Start the modified trial" : "Reject"}
        </button>
      </form>
    </Card>
  );
}
