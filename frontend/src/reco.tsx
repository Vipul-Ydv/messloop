// The AI recommendation card. It only presents what the backend already validated;
// approval and rejection stay on the Review page, so the manager keeps the final say.

import type { Recommendation } from "./api.ts";
import { Icon } from "./Icon.tsx";
import { IconTile, Lbl, Num, Status, itemIcon } from "./ui.tsx";

export const STRENGTH_RANK = { strong: 0, moderate: 1, limited: 2, insufficient: 3 } as const;
const STRENGTH_TEXT = { strong: "Strong evidence", moderate: "Moderate evidence", limited: "Limited evidence", insufficient: "Not enough evidence" } as const;

export function actionSentence(s: { type: string; target: string; replacement: string | null }) {
  if (s.type === "replace") return s.replacement ? `Replace ${s.target} with ${s.replacement}` : `Replace ${s.target}`;
  if (s.type === "reduce_quantity") return `Prepare a smaller quantity of ${s.target}`;
  if (s.type === "reduce_frequency") return `Serve ${s.target} less often`;
  return `${s.type.replace(/_/g, " ")}: ${s.target}`;
}

export function RecommendationCard({ rec, featured = false }: { rec: Recommendation; featured?: boolean }) {
  const e = rec.evidence;
  const c = rec.content;
  const simulated = rec.isSimulated;
  const running = rec.aiStatus === "running";
  return (
    <article className={`card reco ${featured ? "reco-featured" : ""}`}>
      <div className="row between">
        <span className="row" style={{ gap: 12 }}>
          <IconTile name="sparkle" tone="lav" size={24} />
          <span className="stack" style={{ gap: 2 }}>
            <span className="small muted">Recurring problem</span>
            <strong className="reco-dish row" style={{ gap: 8 }}><Icon name={itemIcon(e.targetItem.name)} size={20} /> {e.targetItem.name}</strong>
          </span>
        </span>
        <span className={`chip chip-strength-${rec.evidenceStrength}`}>{STRENGTH_TEXT[rec.evidenceStrength]}</span>
      </div>

      <p>{c.problem}</p>

      <div className="reco-facts">
        <div><span className="small muted">Baseline waste</span><Num value={e.pooledBaselinePer100} unit="per 100 servings" kind={simulated ? "Simulated" : "Calculated"} /></div>
        <div><span className="small muted">Meals over the limit</span><span className="row" style={{ gap: 6 }}><span className="num">{e.rule.exceeded} of {e.rule.of}</span><Lbl kind={simulated ? "Simulated" : "Calculated"} /></span></div>
        {e.avgRating !== null && e.ratingCount > 0 ? (
          <div><span className="small muted">Student rating ({e.ratingCount})</span><Num value={e.avgRating} unit="/ 5" kind={simulated ? "Simulated" : "Measured"} /></div>
        ) : null}
      </div>

      {c.supportingEvidence.length ? (
        <div className="stack" style={{ gap: 6 }}>
          <h3>Evidence behind it</h3>
          <ul className="ticks">{c.supportingEvidence.map((t, i) => <li key={i}><Icon name="check" size={16} strokeWidth={3} />{t}</li>)}</ul>
        </div>
      ) : null}
      {e.topReasons.length ? <div className="chips" aria-label="Reasons students gave">{e.topReasons.map((r) => <span className="chip" key={r}>{r}</span>)}</div> : null}

      <div className="reco-action">
        <span className="small muted">Proposed change</span>
        <strong>{actionSentence(c.suggestedAction)}</strong>
        <p className="small">{c.reasoning}</p>
      </div>

      {(c.alternatives.length || c.constraintsAndCaveats.length || c.evidenceStrengthNote) ? (
        <details className="more">
          <summary>Alternatives and caveats</summary>
          {c.evidenceStrengthNote ? <p className="small">{c.evidenceStrengthNote}</p> : null}
          {c.alternatives.map((a) => (
            <div key={a.item} className="small"><strong>{a.item}</strong>
              {a.pros.length ? <div>＋ {a.pros.join("; ")}</div> : null}
              {a.cons.length ? <div>－ {a.cons.join("; ")}</div> : null}
            </div>
          ))}
          {c.constraintsAndCaveats.length ? <ul className="small">{c.constraintsAndCaveats.map((t, i) => <li key={i}>{t}</li>)}</ul> : null}
        </details>
      ) : null}

      <div className="row between reco-foot">
        <span className="small muted">
          {running
            ? <span className="running">Writing the AI explanation… the checked rule-based text is shown meanwhile.</span>
            : rec.source === "ai"
              ? "Explained by AI. Every number was checked by code."
              : "Rule-based explanation (the AI answer was not used)."}
        </span>
        {rec.status === "pending" ? (
          <a className="btn" href={`#/review/${rec.recId}`}>Review and decide <Icon name="arrowRight" size={18} /></a>
        ) : (
          <Status value={rec.status} />
        )}
      </div>
      {rec.status === "pending" ? <p className="small muted">Nothing changes until you approve it.</p> : null}
    </article>
  );
}
