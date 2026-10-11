// Manager dashboard: KPIs, next best action, trend + dish-wise charts, Waste Experiments.
// Data comes from GET /analytics/summary and GET /recommendations (manager-only, enforced server-side).

import { useEffect, useState } from "react";
import { api, type Item, type Recommendation, type Summary } from "../api.ts";
import { BeforeAfter, HBars, TrendChart } from "../charts.tsx";
import { asList, useLoad } from "../hooks.ts";
import { Icon } from "../Icon.tsx";
import AgentAlerts, { type AgentAlert } from "../AgentAlerts.tsx";
import { RecommendationCard, STRENGTH_RANK, actionSentence } from "../reco.tsx";
import { Card, EmptyState, ErrorNote, Hero, Kpi, Lbl, Num, SimBadge, SkeletonGrid, Skeleton, itemIcon, niceDate } from "../ui.tsx";

export default function Dashboard() {
  const sum = useLoad(() => api<Summary>("GET", "/analytics/summary"));
  const recs = useLoad(() => api("GET", "/recommendations?status=pending"));
  const items = useLoad(() => api("GET", "/items"));
  const alerts = useLoad(() => api<AgentAlert[]>("GET", "/alerts"));
  const [resetNote, setResetNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [genError, setGenError] = useState<unknown>(null);
  const [genDone, setGenDone] = useState(false);

  const list = asList<Recommendation>(recs.data, "recommendations").filter((r) => r.status === "pending");
  const sorted = list.slice().sort((a, b) => STRENGTH_RANK[a.evidenceStrength] - STRENGTH_RANK[b.evidenceStrength] || b.createdAt.localeCompare(a.createdAt));
  const next = sorted[0];
  const anyRunning = list.some((r) => r.aiStatus === "running");

  // The agent works in the background; poll until its answer lands, and pick up its alerts.
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => { recs.reload(); alerts.reload(); }, 4000);
    return () => clearInterval(t);
  }, [anyRunning, recs.reload, alerts.reload]);

  // Demo only (all data simulated): back to the starting story, ready to record again.
  async function resetDemo() {
    if (!window.confirm("Reset the demo? All logged meals, suggestions, trials and notifications go back to the starting simulated data.")) return;
    setBusy(true); setResetNote(null);
    try {
      await api("POST", "/admin/seed?includeLatest=false");
      setResetNote("Demo reset. Log Aloo Gobi for 8 Oct (50 kg cooked, 23 kg left, 115 plates) to start the story.");
      sum.reload(); recs.reload(); alerts.reload();
    } catch (e) { setGenError(e); } finally { setBusy(false); }
  }

  async function generate() {
    setBusy(true); setGenError(null); setGenDone(false);
    try {
      await api("POST", "/recommendations/generate");
      setGenDone(true);
      recs.reload(); sum.reload();
    } catch (e) { setGenError(e); } finally { setBusy(false); }
  }

  const s = sum.data;
  const nameOf = (id: string) => asList<Item>(items.data, "items").find((i) => i.itemId === id)?.name ?? id;
  const simulated = !!s?.isSimulated;
  const calc = simulated ? "Simulated" : "Calculated";
  const latestSim = s?.latestIsSimulated ?? simulated;

  return (
    <>
      <Hero icon="chart" title="Your mess at a glance" sub="The agent gathers the evidence. You decide what changes." decor={["leaf", "bowl", "carrot"]}>
        <div className="row">
          <SimBadge show={simulated || !s} />
          {simulated ? <button type="button" className="btn btn-ghost" onClick={resetDemo} disabled={busy}><Icon name="refresh" size={16} /> Reset demo</button> : null}
        </div>
      </Hero>
      {resetNote ? <p className="note note-info" role="status">{resetNote}</p> : null}
      {s && s.latestDate !== new Date().toLocaleDateString("en-CA") ? (
        <p className="note note-warn" role="status">
          <Icon name="clock" size={16} /> Today's meal isn't logged yet. Mess staff can <a href="#/entry">bol ke batao</a> (answer out loud in Hindi) or type it in.
        </p>
      ) : null}

      {sum.loading && !s ? <SkeletonGrid count={4} what="Loading the dashboard" /> : null}
      <ErrorNote error={sum.error} />
      {sum.error ? <button className="btn btn-ghost" type="button" onClick={sum.reload}><Icon name="refresh" size={16} /> Try again</button> : null}

      {s ? (
        s.latestDate === null && !s.trend.length ? (
          <Card><EmptyState icon="scale" title="No meals logged yet" action={<a className="btn" href="#/entry">Log the first meal</a>}>
            Once the mess logs what was cooked and what was left, your charts will appear here.
          </EmptyState></Card>
        ) : (
          <>
            <div className="grid grid-4">
              <Kpi icon="tray" tone="coral" label="Latest waste per 100 servings" hint="Leftover food per 100 servings on the latest day." foot={s.latestDate ? `On ${niceDate(s.latestDate)}` : undefined}>
                <Num value={s.latestWastePer100} kind={latestSim ? "Simulated" : "Calculated"} />
              </Kpi>
              <Kpi icon="scale" tone="sun" label="Latest food wasted" hint="Total leftover quantity on the latest day." foot={s.latestDate ? `On ${niceDate(s.latestDate)}` : undefined}>
                <Num value={s.latestWasteQty} digits={1} kind={latestSim ? "Simulated" : "Measured"} />
              </Kpi>
              <Kpi icon="alert" tone="coral" label="Dishes above the limit" hint="Dishes flagged by the repeat-waste rule.">
                <span className="num">{s.alerts.length}</span>
              </Kpi>
              <Kpi icon="sparkle" tone="lav" label="Recommendations waiting" hint="The agent's suggestions that need your decision.">
                <span className="num">{s.pendingRecommendations}</span>
              </Kpi>
            </div>

            <Card className="next-action" delay={60}>
              <div className="row between">
                <div className="row" style={{ gap: 12 }}>
                  <span className="tile tile-lav" aria-hidden="true"><Icon name="sparkle" size={22} /></span>
                  <h2>Your next best action</h2>
                </div>
                <button type="button" className="btn btn-ghost" onClick={generate} disabled={busy}>
                  {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="refresh" size={16} />} Look for new recommendations
                </button>
              </div>
              <ErrorNote error={genError} />
              {genDone && !busy ? <p className="note note-info" role="status">Done. If a dish crossed the rule, the agent is investigating it now; its suggestion shows up below.</p> : null}
              {recs.loading && !recs.data ? <Skeleton h={160} /> : null}
              <ErrorNote error={recs.error} />
              {next ? (
                <>
                  <RecommendationCard rec={next} featured />
                  {sorted.length > 1 ? (
                    <div className="stack">
                      <h3>Also waiting ({sorted.length - 1})</h3>
                      {sorted.slice(1).map((r) => (
                        <a key={r.recId} className="mini-row" href={`#/review/${r.recId}`}>
                          <Icon name={itemIcon(r.evidence.targetItem.name)} size={20} />
                          <span><strong>{r.evidence.targetItem.name}</strong> · {actionSentence(r.content.suggestedAction)}</span>
                          <Icon name="arrowRight" size={16} />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : !recs.loading && !recs.error ? (
                <EmptyState icon="sprout" title="Nothing needs your decision">
                  When a dish keeps being wasted, a recommendation will wait here for you.
                </EmptyState>
              ) : null}
            </Card>

            <AgentAlerts alerts={alerts.data ?? []} onChecked={() => { alerts.reload(); sum.reload(); }} delay={90} />

            <div className="grid grid-2">
              <Card delay={120}>
                <h2>Waste trend by dish</h2>
                <p className="small muted">Leftover food per 100 servings, by meal date. Lower is better.</p>
                {s.trend.length ? <TrendChart points={s.trend} kind={calc} /> : <EmptyState icon="chart" title="No trend yet">Log a few meals to see how waste moves.</EmptyState>}
              </Card>
              <Card delay={160}>
                <h2>Most wasted dishes</h2>
                <p className="small muted">Pooled waste per 100 servings across all logged meals.</p>
                {s.topWastefulItems.length ? (
                  <HBars
                    unit="per 100 servings"
                    kind={calc}
                    rows={s.topWastefulItems.map((it) => ({
                      key: it.itemId + it.slotId, label: it.name, value: it.pooledWastePer100, icon: itemIcon(it.name),
                      sub: `${it.n} meals logged · above the limit in ${it.exceeded}`, flag: it.alert ? "Above limit" : undefined,
                    }))}
                  />
                ) : <EmptyState icon="plate" title="No dishes to compare yet" />}
              </Card>
            </div>

            <Card delay={200}>
              <div className="row between">
                <div className="row" style={{ gap: 12 }}><span className="tile tile-forest" aria-hidden="true"><Icon name="flask" size={22} /></span><h2>Waste Experiments</h2></div>
                <a className="btn btn-ghost" href="#/impact">See all <Icon name="arrowRight" size={16} /></a>
              </div>
              {s.activeInterventions.length === 0 && s.recentOutcomes.length === 0 ? (
                <EmptyState icon="flask" title="No experiments running">Approve a recommendation to start one. We measure again afterwards and compare.</EmptyState>
              ) : null}
              {s.activeInterventions.length ? (
                <div className="stack">
                  <h3>Running now</h3>
                  {s.activeInterventions.map((iv) => (
                    <a key={iv.interventionId} className="mini-row" href={`#/impact/${iv.interventionId}`}>
                      <Icon name={itemIcon(nameOf(iv.action.fromItemId))} size={20} />
                      <span><strong>{nameOf(iv.action.fromItemId)}</strong> · {iv.action.type === "replace" && iv.action.toItemId ? `swapped for ${nameOf(iv.action.toItemId)}` : iv.action.type.replace(/_/g, " ")} · since {niceDate(iv.startDate)}</span>
                      <Icon name="arrowRight" size={16} />
                    </a>
                  ))}
                </div>
              ) : null}
              {s.recentOutcomes.length ? (
                <div className="stack">
                  <h3>Latest measured comparisons</h3>
                  <div className="grid grid-3">
                    {s.recentOutcomes.map((o) => (
                      <a key={o.interventionId} className="outcome-tile" href={`#/impact/${o.interventionId}`}>
                        <BeforeAfter impact={o} kind={o.isSimulated || simulated ? "Simulated" : "Calculated"} compact />
                        <span className="small">{o.postWastePer100 === undefined ? "Waiting for post-change meals" : `${o.direction === "decreased" ? "Lower" : o.direction === "increased" ? "Higher" : "About the same"} after the change`}</span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
              <p className="small muted">Before-and-after numbers show what changed, not proof of why.</p>
            </Card>
          </>
        )
      ) : null}
    </>
  );
}
