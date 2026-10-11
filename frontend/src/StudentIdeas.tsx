// What students want instead: votes for other dishes (the agent reads these) and their
// own ideas in their words (for the manager; the agent only compares dishes already cooked).

import { Icon } from "./Icon.tsx";
import { Card, EmptyState, Lbl } from "./ui.tsx";

export interface Suggestions {
  polls: { targetItemId: string; target: string; totalVotes: number; realVotes: number; isSimulated: boolean; options: { itemId: string; name: string; votes: number; pct: number }[] }[];
  ideas: { text: string; count: number; forItem: string }[];
}

export default function StudentIdeas({ data, delay = 0 }: { data: Suggestions | null; delay?: number }) {
  const polls = data?.polls ?? [];
  const ideas = data?.ideas ?? [];
  return (
    <Card delay={delay}>
      <div className="row" style={{ gap: 12 }}>
        <span className="tile tile-sky" aria-hidden="true"><Icon name="cap" size={22} /></span>
        <h2>What students want instead</h2>
      </div>
      <p className="small muted">Votes from the student page. The agent uses these when it picks a replacement.</p>
      {polls.length === 0 && ideas.length === 0 ? (
        <EmptyState icon="thumbsUp" title="No student votes yet">Students can vote from "Rate today's food".</EmptyState>
      ) : null}
      {polls.map((p) => (
        <div key={p.targetItemId} className="stack" style={{ gap: 8 }}>
          <div className="row between">
            <strong>Instead of {p.target}</strong>
            <span className="small muted">
              {p.totalVotes} votes{p.isSimulated ? <> · {p.realVotes} from real students · <Lbl kind="Simulated" /></> : null}
            </span>
          </div>
          {p.options.map((o) => (
            <div key={o.itemId} className="grid" style={{ gridTemplateColumns: "minmax(90px, 140px) 1fr 48px", alignItems: "center", gap: 10 }}>
              <span>{o.name}</span>
              <div className="hbar" style={{ height: 18 }}><div style={{ width: `${o.pct}%`, background: "var(--accent-strong)" }} /></div>
              <span className="num small" style={{ textAlign: "right" }}>{o.pct}%</span>
            </div>
          ))}
        </div>
      ))}
      {ideas.length > 0 && (
        <div className="stack" style={{ gap: 6, paddingTop: 8, borderTop: "1px solid var(--line)" }}>
          <strong>Students' own ideas</strong>
          <div className="chips">
            {ideas.map((i) => (
              <span key={i.forItem + i.text} className="chip chip-dish" title={`Suggested instead of ${i.forItem}`}>
                {i.text}{i.count > 1 ? ` ×${i.count}` : ""} <span className="small muted">for {i.forItem}</span>
              </span>
            ))}
          </div>
          <p className="small muted">New dishes have no waste history yet, so the agent can't compare them.</p>
        </div>
      )}
    </Card>
  );
}
