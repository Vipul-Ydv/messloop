// Waste Experiment: the signature loop, shown as a stepper plus a before/after comparison.
// Uses GET /interventions, GET /interventions/:id/impact and GET /items, which students may read.
// Success styling appears only when measurements show a decrease; the caveat is always shown.

import { api, type Action, type Impact, type Intervention, type Item } from "../api.ts";
import { BeforeAfter } from "../charts.tsx";
import { asList, useLoad } from "../hooks.ts";
import { Icon } from "../Icon.tsx";
import { Card, EmptyState, ErrorNote, Hero, IconTile, Kpi, Lbl, Num, SimBadge, Skeleton, Stepper, itemIcon, niceDate, type Step } from "../ui.tsx";
import type { Role } from "../api.ts";

type NameOf = (id: string) => string;

function actionText(a: Action, nameOf: NameOf) {
  if (a.type === "replace" && a.toItemId) return `${nameOf(a.fromItemId)} swapped for ${nameOf(a.toItemId)}`;
  if (a.type === "reduce_quantity") return `Smaller batches of ${nameOf(a.fromItemId)}`;
  if (a.type === "reduce_frequency") return `${nameOf(a.fromItemId)} served less often`;
  return `${a.type.replace(/_/g, " ")}: ${nameOf(a.fromItemId)}`;
}

function experimentSteps(iv: Intervention, impact: Impact | null): Step[] {
  const hasPost = !!impact && impact.postRecordCount > 0;
  const compared = !!impact && impact.postWastePer100 !== undefined;
  const raw: [string, React.ReactNode, boolean][] = [
    ["Measure baseline", `${iv.baseline.nRecords} meals${iv.baseline.dateFrom ? `, ${niceDate(iv.baseline.dateFrom)} to ${iv.baseline.dateTo ? niceDate(iv.baseline.dateTo) : "now"}` : ""}`, iv.baseline.nRecords > 0],
    ["Identify waste", "Repeat waste flagged by the rule", true],
    ["Recommend action", "AI explains, code checks", true],
    ["Manager approval", `Started ${niceDate(iv.startDate)}`, true],
    ["Measure again", impact ? `${impact.postRecordCount} meals since the change` : "Counting…", hasPost],
    ["Compare outcome", compared ? "Comparison ready" : "Needs more meals", compared],
  ];
  const firstOpen = raw.findIndex((r) => !r[2]);
  return raw.map(([label, note, done], i) => ({ label, note, state: done ? "done" : i === firstOpen ? "current" : "todo" }));
}

function Outcome({ impact }: { impact: Impact }) {
  const sim = impact.isSimulated;
  const post = impact.postWastePer100;
  if (post === undefined) {
    return <p className="note note-info" role="status"><Icon name="clock" size={16} /> {impact.message ?? "Still collecting meals after the change. The comparison appears once there are enough."}</p>;
  }
  const before = impact.baselineWastePer100.toFixed(1);
  const after = post.toFixed(1);
  const caveat = <span className="small">This is an observed change. Other things may have changed too, so it does not prove the change caused it.{sim ? " These are simulated demo records." : ""}</span>;
  if (impact.direction === "decreased") {
    return (
      <div className="note note-good celebrate" role="status">
        <span className="pop" aria-hidden="true"><Icon name="sparkle" size={22} /></span>
        <div className="stack" style={{ gap: 4 }}>
          <strong>Waste per 100 servings went from {before} to {after} in the records so far.</strong>
          {caveat}
        </div>
      </div>
    );
  }
  return (
    <div className="note note-info" role="status">
      <div className="stack" style={{ gap: 4 }}>
        <strong>{impact.direction === "increased" ? `Waste per 100 servings is higher so far (${before} before, ${after} after).` : `Waste per 100 servings looks about the same (${before} before, ${after} after).`}</strong>
        <span className="small">That is useful to know too. More meals will make the picture clearer.</span>
        {caveat}
      </div>
    </div>
  );
}

function TrialCard({ iv, nameOf, detail = false }: { iv: Intervention; nameOf: NameOf; detail?: boolean }) {
  const imp = useLoad(() => api<Impact>("GET", `/interventions/${iv.interventionId}/impact`), [iv.interventionId]);
  const i = imp.data;
  const sim = !!(i?.isSimulated ?? iv.isSimulated);
  const kind = sim ? "Simulated" : "Calculated";
  const dish = nameOf(iv.action.fromItemId);
  return (
    <Card className="trial">
      <div className="row between">
        <span className="row" style={{ gap: 12 }}>
          <IconTile name={itemIcon(dish)} tone="accent" size={24} />
          <span className="stack" style={{ gap: 2 }}>
            <h2>{actionText(iv.action, nameOf)}</h2>
            <span className="small muted">Started {niceDate(iv.startDate)} · {iv.status}</span>
          </span>
        </span>
        {!detail ? <a className="btn btn-ghost" href={`#/impact/${iv.interventionId}`}>Details <Icon name="arrowRight" size={16} /></a> : null}
      </div>
      <Stepper steps={experimentSteps(iv, i)} />
      {imp.loading && !i ? <Skeleton h={120} /> : null}
      <ErrorNote error={imp.error} />
      {i ? (
        <div className="trial-body">
          <BeforeAfter impact={i} kind={kind} />
          <div className="stack">
            <Outcome impact={i} />
            {detail && i.postWastePer100 !== undefined ? (
              <div className="grid grid-2-sm">
                <Kpi icon="bowl" tone="lav" label="Before"><Num value={i.baselineWastePer100} unit="per 100" kind={kind} /></Kpi>
                <Kpi icon="tray" tone="lime" label="After"><Num value={i.postWastePer100} unit="per 100" kind={kind} /></Kpi>
                <Kpi icon="trendDown" tone="coral" label="Change"><Num value={i.absoluteChange} digits={2} kind={kind} /></Kpi>
                <Kpi icon="leaf" tone="forest" label="Reduction"><span className="num">{i.reductionPct === null || i.reductionPct === undefined ? "—" : `${i.reductionPct.toFixed(1)}%`}</span><Lbl kind={kind} /></Kpi>
              </div>
            ) : null}
            {detail && i.estimatedFoodSavedQty !== undefined ? (
              <p className="small muted">Estimated food difference: <Num value={i.estimatedFoodSavedQty} unit={i.unit} kind="Estimated" />. A projection, not a measured saving{sim ? ", and based on simulated data" : ""}.</p>
            ) : null}
            {detail && i.caveat ? <p className="small muted">{i.caveat}</p> : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export default function ImpactPage({ interventionId, role }: { interventionId?: string; role: Role }) {
  const ivs = useLoad(() => api("GET", "/interventions"));
  const items = useLoad(() => api("GET", "/items"));
  const list = asList<Intervention>(ivs.data, "interventions");
  const itemList = asList<Item>(items.data, "items");
  const nameOf: NameOf = (id) => itemList.find((x) => x.itemId === id)?.name ?? id;
  const student = role === "student";
  const one = interventionId ? list.find((x) => x.interventionId === interventionId) : undefined;
  const anySim = list.some((x) => x.isSimulated) || itemList.some((x) => x.isSimulated);

  return (
    <>
      <Hero
        icon={student ? "cap" : "flask"}
        title={student ? "What the mess is trying" : "Waste Experiment"}
        sub={student ? "When the mess changes a dish to waste less, we measure again and compare. Here is what's happening." : "Measure, explain, approve, measure again, compare. Here is how each approved change is doing."}
        decor={student ? ["apple", "chapati", "drop"] : ["sprout", "scale", "leaf"]}
      >
        <div className="row"><SimBadge show={anySim} /></div>
      </Hero>

      {ivs.loading && !ivs.data ? <Card><Skeleton h={22} w="50%" /><Skeleton h={90} /></Card> : null}
      <ErrorNote error={ivs.error} />

      {interventionId ? (
        <>
          <a className="back" href="#/impact"><Icon name="arrowLeft" size={16} /> All experiments</a>
          {one ? <TrialCard iv={one} nameOf={nameOf} detail /> : !ivs.loading && !ivs.error ? (
            <Card><EmptyState icon="flask" title="We couldn't find that experiment" action={<a className="btn" href="#/impact">Back to all experiments</a>} /></Card>
          ) : null}
          {one && role === "manager" ? <p><a href={`#/review/${one.recId}`}>See the recommendation behind this experiment</a></p> : null}
        </>
      ) : list.length ? (
        <div className="stack" style={{ gap: 16 }}>{list.map((iv) => <TrialCard key={iv.interventionId} iv={iv} nameOf={nameOf} />)}</div>
      ) : !ivs.loading && !ivs.error ? (
        <Card>
          <EmptyState icon="sprout" title="No experiments yet">
            {student ? "When the mess manager approves a change, you'll see it here, along with how it's going." : "Approve a recommendation from the dashboard and its experiment will appear here."}
          </EmptyState>
        </Card>
      ) : null}

      {itemList.length ? (
        <Card>
          <h2>{student ? "Dishes the mess keeps track of" : "Dishes in the catalogue"}</h2>
          <div className="chips">
            {itemList.map((it) => <span className="chip chip-dish" key={it.itemId}><Icon name={itemIcon(it.name)} size={15} /> {it.name}</span>)}
          </div>
        </Card>
      ) : null}
    </>
  );
}
