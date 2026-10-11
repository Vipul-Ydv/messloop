// What the agent sent by itself: suggestions waiting, trial results, missed-day reminders.

import { useState } from "react";
import { api } from "./api.ts";
import { Icon, type IconName } from "./Icon.tsx";
import { Card, EmptyState } from "./ui.tsx";

export interface AgentAlert { alertId: string; kind: "suggestion" | "outcome" | "reminder"; title: string; body: string; link?: string; createdAt: string; emailed: boolean }

const ALERT_ICON: Record<AgentAlert["kind"], IconName> = { suggestion: "sparkle", outcome: "trendDown", reminder: "clock" };
const ALERT_TONE: Record<AgentAlert["kind"], string> = { suggestion: "lav", outcome: "forest", reminder: "sun" };

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

export default function AgentAlerts({ alerts, onChecked, delay = 0 }: { alerts: AgentAlert[]; onChecked: () => void; delay?: number }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function checkNow() {
    setBusy(true);
    setNote(null);
    try {
      const r = await api<{ message: string }>("POST", "/alerts/check-now");
      setNote(r.message);
      onChecked();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not run the check.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card delay={delay}>
      <div className="row between">
        <div className="row" style={{ gap: 12 }}>
          <span className="tile tile-sky" aria-hidden="true"><Icon name="info" size={22} /></span>
          <h2>Agent notifications</h2>
        </div>
        <button type="button" className="btn btn-ghost" onClick={checkNow} disabled={busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="clock" size={16} />} Run today's check now
        </button>
      </div>
      <p className="small muted">The agent emails these to the committee (Amazon SNS). Every day at 3 pm it checks whether the meal was logged (EventBridge Scheduler).</p>
      {note && <p className="note note-info" role="status">{note}</p>}
      {alerts.length === 0 ? (
        <EmptyState icon="sprout" title="Nothing yet">Log a meal and the agent will report here.</EmptyState>
      ) : (
        <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 10 }}>
          {alerts.map((a) => (
            <li key={a.alertId} style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: 12, paddingBottom: 10, borderBottom: "1px solid var(--line)" }}>
              <span className={`tile tile-${ALERT_TONE[a.kind]}`} aria-hidden="true"><Icon name={ALERT_ICON[a.kind]} size={20} /></span>
              <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                <span className="row between" style={{ gap: 8 }}>
                  <strong>{a.title}</strong>
                  <span className="small muted">{ago(a.createdAt)}{a.emailed ? " · emailed" : ""}</span>
                </span>
                <span className="small">{a.body}</span>
                {a.link && <a className="small" href={a.link}>Open <Icon name="arrowRight" size={14} /></a>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
