// Business operations. Every number here comes from packages/core (R2); this file only
// loads, combines and stores. recordDecision() is the ONLY code path that changes a
// recommendation's status or creates an intervention (R1, §8.3).

import { randomUUID } from "node:crypto";
import {
  absoluteChange, direction, estimatedFoodSaved, pooledPct, pooledPer100, reductionPct, sum, withMetrics,
} from "../../packages/core/metrics.ts";
import { DEFAULT_THRESHOLD, MIN_RECORDS, recurringWaste } from "../../packages/core/rules.ts";
import { buildEvidence } from "../../packages/core/evidence.ts";
import { validateWasteInput } from "../../packages/core/validate.ts";
import { buildFallback } from "../../packages/core/fallback.ts";
import type { EvidencePackage, FoodItem, InterventionAction, RatingAggregate } from "../../packages/core/types.ts";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import * as seedData from "../../packages/core/seed-data.ts";
import { HPK, deleteAllUnder, get, put, putMany, putNew, query } from "./db.ts";
import { HttpError } from "./http.ts";
import { explain, type Explanation } from "./ai.ts";
import type { Role } from "./auth.ts";

const lambda = new LambdaClient({});

const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const strip = <T extends Record<string, any>>(x: T) => {
  const { PK, SK, ...rest } = x;
  return rest;
};

// ---------------------------------------------------------------- loading

export async function loadAll() {
  const rows = await query(HPK);
  const by = (prefix: string) => rows.filter((r) => String(r.SK).startsWith(prefix)).map(strip);
  return {
    meta: rows.find((r) => r.SK === "META") ?? { threshold: DEFAULT_THRESHOLD },
    items: by("ITEM#") as FoodItem[],
    waste: by("WASTE#") as any[],
    ratings: by("RATING#") as (RatingAggregate & { isSimulated: boolean })[],
    polls: by("POLL#") as any[],
    recs: by("REC#") as any[],
    interventions: by("INT#") as any[],
    impacts: by("IMPACT#") as any[],
  };
}

const newestFirst = (a: { date: string }, b: { date: string }) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

// ---------------------------------------------------------------- waste records

export async function createWasteRecord(body: unknown, role: Role) {
  const itemId = (body as any)?.itemId;
  const item = typeof itemId === "string" ? await get<FoodItem>(HPK, `ITEM#${itemId}`) : null;
  const v = validateWasteInput(body, item ? strip(item as any) as FoodItem : null);
  if (!v.ok) throw new HttpError(400, v.error.code, v.error.message, v.error.field);
  const input = v.value;

  // Tag records that belong to an active intervention (§8.4).
  const interventions = (await query(HPK, "INT#")).filter((i) => i.status === "active");
  const tagged = interventions.find((i) => {
    const resulting = i.action.type === "replace" ? i.action.toItemId : i.action.fromItemId;
    return i.slotId === input.slotId && resulting === input.itemId && input.date >= i.startDate;
  });

  const record = {
    PK: HPK,
    SK: `WASTE#${input.date}#${input.period}#${input.itemId}`,
    recordId: randomUUID(),
    ...withMetrics(input),
    interventionId: tagged?.interventionId,
    loggedBy: role,
    loggedAt: now(),
    isSimulated: false,
  };
  await putNew(record, `A record for ${item!.name} at ${input.period} on ${input.date} already exists.`);
  return withLabels(strip(record));
}

export function withLabels(record: any) {
  return {
    ...record,
    labels: {
      preparedQty: record.isSimulated ? "Simulated" : "Measured",
      leftoverQty: record.isSimulated ? "Simulated" : "Measured",
      servings: record.isSimulated ? "Simulated" : "Measured",
      wastePct: "Calculated",
      wastePer100: "Calculated",
    },
  };
}

export async function listWasteRecords(q: Record<string, string>) {
  const all = (await query(HPK, "WASTE#")).map(strip);
  return all
    .filter((r) => !q.itemId || r.itemId === q.itemId)
    .filter((r) => !q.slotId || r.slotId === q.slotId)
    .filter((r) => !q.from || r.date >= q.from)
    .filter((r) => !q.to || r.date <= q.to)
    .sort(newestFirst)
    .map(withLabels);
}

// ---------------------------------------------------------------- analytics

export async function summary() {
  const d = await loadAll();
  const threshold = d.meta.threshold ?? DEFAULT_THRESHOLD;
  const name = (id: string) => d.items.find((i) => i.itemId === id)?.name ?? id;
  const latestDate = d.waste.map((r) => r.date).sort().at(-1) ?? null;
  const latest = d.waste.filter((r) => r.date === latestDate);

  const groups = new Map<string, any[]>();
  for (const r of d.waste) {
    const k = `${r.slotId}|${r.itemId}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  const perItem = [...groups.entries()].map(([k, recs]) => {
    const [slotId, itemId] = k.split("|");
    const window = [...recs].sort(newestFirst).slice(0, 5);
    const rule = recurringWaste(window, threshold);
    return {
      itemId, name: name(itemId), slotId, n: window.length,
      pooledWastePct: pooledPct(window), pooledWastePer100: pooledPer100(window),
      exceeded: rule.exceeded, alert: rule.alert,
    };
  });

  return {
    isSimulated: d.waste.some((r) => r.isSimulated),
    threshold,
    latestDate,
    latestWasteQty: sum(latest.map((r) => r.leftoverQty)),
    latestWastePer100: latest.length ? pooledPer100(latest) : null,
    topWastefulItems: [...perItem].sort((a, b) => b.pooledWastePer100 - a.pooledWastePer100).slice(0, 5),
    alerts: perItem.filter((p) => p.alert),
    trend: [...d.waste].sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => ({
      date: r.date, itemId: r.itemId, name: name(r.itemId), slotId: r.slotId,
      wastePer100: r.wastePer100, wastePct: r.wastePct, interventionId: r.interventionId ?? null,
    })),
    pendingRecommendations: d.recs.filter((r) => r.status === "pending").length,
    activeInterventions: d.interventions.filter((i) => i.status === "active"),
    recentOutcomes: d.impacts,
    labels: {
      latestWasteQty: "Calculated", latestWastePer100: "Calculated",
      pooledWastePct: "Calculated", pooledWastePer100: "Calculated",
    },
  };
}

// ---------------------------------------------------------------- recommendations

export async function generateRecommendations() {
  const d = await loadAll();
  const threshold = d.meta.threshold ?? DEFAULT_THRESHOLD;
  const itemById = new Map(d.items.map((i) => [i.itemId, i]));
  const ratingOf = (id: string) => d.ratings.find((r) => r.itemId === id) ?? null;
  const results: any[] = [];

  const groups = new Map<string, any[]>();
  for (const r of d.waste) {
    const k = `${r.slotId}|${r.itemId}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  for (const [k, recs] of groups) {
    const [slotId, itemId] = k.split("|");
    const item = itemById.get(itemId);
    if (!item) continue;
    // Post-intervention records describe a change already made; they are not new history.
    const history = recs.filter((r) => !r.interventionId).sort(newestFirst);
    const rule = recurringWaste(history, threshold);
    if (rule.n < MIN_RECORDS) {
      results.push({ itemId, name: item.name, slotId, status: "insufficient_evidence", n: rule.n });
      continue; // R9: no AI call, no recommendation
    }
    if (!rule.alert) continue;
    if (d.recs.some((r) => r.targetItemId === itemId && r.slotId === slotId && r.status === "pending")) continue;
    if (d.interventions.some((i) => i.slotId === slotId && i.status === "active")) continue;

    // Candidates: the poll's options for this item if there is a poll, else the slot's other dishes.
    const poll = d.polls.find((p) => p.targetItemId === itemId);
    const candidateIds: string[] = poll
      ? Object.keys(poll.counts)
      : [...new Set(d.waste.filter((r) => r.slotId === slotId && r.itemId !== itemId).map((r) => r.itemId))];
    const totalVotes = poll ? sum(Object.values(poll.counts) as number[]) : 0;

    const evidence = buildEvidence({
      item, slotId, threshold,
      recordsNewestFirst: history,
      rating: ratingOf(itemId),
      candidates: candidateIds.filter((id) => itemById.has(id)).map((id) => ({
        item: itemById.get(id)!,
        records: d.waste.filter((r) => r.slotId === slotId && r.itemId === id && !r.interventionId),
        rating: ratingOf(id),
        votePct: poll && totalVotes ? Math.round((poll.counts[id] / totalVotes) * 100) : null,
      })),
    });
    if (evidence.evidenceStrength === "insufficient") {
      results.push({ itemId, name: item.name, slotId, status: "insufficient_evidence", n: rule.n });
      continue;
    }

    // Stored straight away with the deterministic template, so there is always something
    // correct to show. Our model's wording replaces it in the background (explainLater):
    // a CPU-hosted model takes longer than API Gateway's 30-second limit allows.
    const aiConfigured = Boolean(process.env.AI_BASE_URL);
    const createdAt = now();
    const rec = {
      PK: HPK,
      SK: `REC#${createdAt}#${itemId}`,
      recId: randomUUID(),
      targetItemId: itemId,
      slotId,
      evidence,
      ...contentFields(evidence, { content: buildFallback(evidence), source: "fallback_template", fallbackReason: aiConfigured ? undefined : "AI_BASE_URL not configured", ms: 0 }),
      aiStatus: aiConfigured ? "running" : "done",
      evidenceStrength: evidence.evidenceStrength,
      status: "pending",
      createdAt,
      isSimulated: history.some((r) => r.isSimulated),
    };
    await put(rec);
    if (aiConfigured) await startExplanation(rec.SK);
    results.push(strip(rec));
  }
  return results;
}

/** The parts of a recommendation that come from its explanation, whichever wrote it. */
function contentFields(evidence: EvidencePackage, ai: Explanation) {
  const itemId = evidence.targetItem.itemId;
  const s = ai.content.suggestedAction;
  const replacement = s.replacement
    ? evidence.candidates.find((c) => [c.name, c.itemId].map((x) => x.toLowerCase()).includes(s.replacement!.toLowerCase()))
    : undefined;
  const suggestedAction: InterventionAction | null =
    s.type === "investigate" ? null
    : s.type === "replace" ? (replacement ? { type: "replace", fromItemId: itemId, toItemId: replacement.itemId } : null)
    : { type: s.type, fromItemId: itemId };
  return {
    type: s.type,
    content: ai.content,
    source: ai.source,
    fallbackReason: ai.fallbackReason,
    model: ai.model,
    aiMs: ai.ms,
    suggestedAction,
  };
}

/** Asks this same function, asynchronously, to write the AI explanation for one recommendation. */
async function startExplanation(SK: string) {
  try {
    await lambda.send(new InvokeCommand({
      FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
      InvocationType: "Event",
      Payload: Buffer.from(JSON.stringify({ kind: "explain", SK })),
    }));
  } catch (e: any) {
    // The template is already stored, so the manager can still act; just stop waiting.
    console.error(JSON.stringify({ event: "explain_invoke_failed", message: e?.message }));
    const rec = await get(HPK, SK);
    if (rec) await put({ ...rec, aiStatus: "done", fallbackReason: "background AI call could not start" });
  }
}

/** Background half of generateRecommendations. Never touches status: that stays with recordDecision (R1). */
export async function explainLater(SK: string) {
  const rec = await get(HPK, SK);
  if (!rec || rec.aiStatus !== "running") return;
  const ai = await explain(rec.evidence);
  const latest = await get(HPK, SK); // the manager may not decide while running, but re-read anyway
  if (!latest || latest.status !== "pending") return;
  await put({ ...latest, ...contentFields(latest.evidence, ai), aiStatus: "done" });
}

/** A background run that never reported back should not block the manager forever. */
const AI_STALE_MS = 120_000;
const aiStillRunning = (rec: any) => rec.aiStatus === "running" && Date.now() - Date.parse(rec.createdAt) < AI_STALE_MS;

export async function listRecommendations(status?: string) {
  const recs = (await query(HPK, "REC#")).map(strip).map((r) =>
    r.aiStatus === "running" && !aiStillRunning(r) ? { ...r, aiStatus: "done", fallbackReason: "background AI call did not finish" } : r,
  );
  return recs.filter((r) => !status || r.status === status).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function findRec(recId: string) {
  const rec = (await query(HPK, "REC#")).find((r) => r.recId === recId);
  if (!rec) throw new HttpError(404, "NOT_FOUND", "No such recommendation.");
  return rec;
}

function validateAction(a: any, rec: any): InterventionAction {
  const types = ["replace", "reduce_quantity", "reduce_frequency"];
  if (!a || !types.includes(a.type)) throw new HttpError(400, "VALIDATION_ERROR", "modifiedAction.type must be replace, reduce_quantity or reduce_frequency.", "modifiedAction");
  if (a.type === "replace" && typeof a.toItemId !== "string") throw new HttpError(400, "VALIDATION_ERROR", "A replace action needs toItemId.", "modifiedAction");
  if (a.type === "reduce_quantity" && !(typeof a.newQuantity === "number" && a.newQuantity > 0)) {
    throw new HttpError(400, "VALIDATION_ERROR", "A reduce_quantity action needs a positive newQuantity.", "modifiedAction");
  }
  return { type: a.type, fromItemId: rec.targetItemId, toItemId: a.toItemId, newQuantity: a.newQuantity };
}

/** The only place a recommendation's status changes or an intervention is created. */
export async function recordDecision(recId: string, body: any, role: Role) {
  const decision = body?.decision;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!["approve", "reject", "modify"].includes(decision)) throw new HttpError(400, "VALIDATION_ERROR", "decision must be approve, reject or modify.", "decision");
  if (!reason) throw new HttpError(400, "VALIDATION_ERROR", "A reason is required.", "reason");

  const rec = await findRec(recId);
  if (rec.status !== "pending") throw new HttpError(409, "CONFLICT", `This recommendation is already ${rec.status}.`);
  if (aiStillRunning(rec)) throw new HttpError(409, "AI_RUNNING", "The explanation is still being written. Try again in a few seconds.");
  const decided = { decidedBy: role, decidedAt: now(), decisionReason: reason };

  if (decision === "reject") {
    const updated = { ...rec, ...decided, status: "rejected" };
    await put(updated);
    return { recommendation: strip(updated), intervention: null };
  }

  const action: InterventionAction | null = decision === "modify" ? validateAction(body.modifiedAction, rec) : rec.suggestedAction;
  if (!action) throw new HttpError(400, "VALIDATION_ERROR", "This recommendation has no concrete action. Use modify with an action.", "decision");

  const active = (await query(HPK, "INT#")).find((i) => i.slotId === rec.slotId && i.status === "active");
  if (active) throw new HttpError(409, "CONFLICT", "There is already an active intervention in this slot.");

  const startDate = typeof body.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate) ? body.startDate : today();
  // Baseline: the target dish's own records in this slot before the change (§6.3).
  const before = (await query(HPK, "WASTE#"))
    .filter((r) => r.slotId === rec.slotId && r.itemId === action.fromItemId && r.date < startDate && !r.interventionId)
    .sort(newestFirst)
    .slice(0, 5);
  if (before.length < MIN_RECORDS && !body.confirmLimited) {
    throw new HttpError(409, "LIMITED_BASELINE", `Only ${before.length} baseline record(s). Confirm to continue with a limited baseline.`);
  }
  const dates = before.map((r) => r.date).sort();

  const interventionId = randomUUID();
  const intervention = {
    PK: HPK,
    SK: `INT#${startDate}#${action.fromItemId}`,
    interventionId,
    recId,
    slotId: rec.slotId,
    action,
    startDate,
    baseline: {
      pooledWastePer100: pooledPer100(before),
      pooledWastePct: pooledPct(before),
      nRecords: before.length,
      dateFrom: dates[0] ?? null,
      dateTo: dates.at(-1) ?? null,
      unit: before[0]?.unit ?? "kg",
      strength: before.length < MIN_RECORDS ? "limited" : "ok",
    },
    status: "active",
    decisionReason: reason,
    isSimulated: before.some((r) => r.isSimulated),
  };
  await putNew(intervention, "An intervention for this dish already starts on that date.");
  const updated = { ...rec, ...decided, status: decision === "modify" ? "modified" : "approved", modifiedAction: decision === "modify" ? action : undefined, interventionId };
  await put(updated);
  return { recommendation: strip(updated), intervention: strip(intervention) };
}

// ---------------------------------------------------------------- interventions & impact

export async function listInterventions() {
  return (await query(HPK, "INT#")).map(strip);
}

export async function computeImpact(interventionId: string) {
  const intervention = (await query(HPK, "INT#")).find((i) => i.interventionId === interventionId);
  if (!intervention) throw new HttpError(404, "NOT_FOUND", "No such intervention.");
  const post = (await query(HPK, "WASTE#")).filter((r) => r.interventionId === interventionId);
  const base = intervention.baseline.pooledWastePer100;
  if (post.length === 0) {
    return { interventionId, baselineWastePer100: base, postRecordCount: 0, label: "observed change", message: "No post-intervention meals logged yet." };
  }
  const postPer100 = pooledPer100(post);
  const change = absoluteChange(postPer100, base);
  const impact = {
    PK: HPK,
    SK: `IMPACT#${interventionId}`,
    interventionId,
    baselineWastePer100: base,
    baselineRecordCount: intervention.baseline.nRecords,
    postWastePer100: postPer100,
    postRecordCount: post.length,
    absoluteChange: change,
    reductionPct: reductionPct(base, postPer100),
    direction: direction(change, base),
    estimatedFoodSavedQty: estimatedFoodSaved(base, postPer100, sum(post.map((r) => r.servings))),
    unit: intervention.baseline.unit,
    label: "observed change",
    caveat: `Observed change from ${post.length} post-intervention meal(s). Other factors such as attendance may also have changed.`,
    computedAt: now(),
    isSimulated: intervention.isSimulated || post.some((r) => r.isSimulated),
  };
  await put(impact);
  return {
    ...strip(impact),
    labels: {
      baselineWastePer100: "Calculated", postWastePer100: "Calculated", absoluteChange: "Calculated",
      reductionPct: "Calculated", estimatedFoodSavedQty: "Estimated",
    },
  };
}

// ---------------------------------------------------------------- seed

/** Wipes this hostel's data and loads the simulated dataset (§9). Demo only. */
export async function seed(includeLatest: boolean) {
  if (process.env.ALLOW_SEED !== "true") throw new HttpError(403, "FORBIDDEN", "Seeding is disabled.");
  const removed = await deleteAllUnder(HPK);
  const items: Record<string, unknown>[] = [
    { PK: HPK, SK: "META", hostelId: seedData.HOSTEL_ID, name: "Demo Hostel", threshold: DEFAULT_THRESHOLD, isSimulated: true },
    ...seedData.ITEMS.map((i) => ({ PK: HPK, SK: `ITEM#${i.itemId}`, ...i })),
    ...seedData.seedRecords(includeLatest).map((r) => ({
      PK: HPK,
      SK: `WASTE#${r.date}#${seedData.PERIOD}#${r.itemId}`,
      recordId: randomUUID(),
      ...withMetrics({ ...r, period: seedData.PERIOD, slotId: seedData.SLOT, unit: seedData.UNIT }),
      loggedBy: "seed",
      loggedAt: now(),
      isSimulated: true,
    })),
    ...seedData.RATINGS.map((r) => ({ PK: HPK, SK: `RATING#${r.itemId}`, ...r, isSimulated: true })),
    { PK: HPK, SK: "POLL#replace-aloo-gobi", pollId: "replace-aloo-gobi", targetItemId: "aloo-gobi", counts: seedData.VOTES, isSimulated: true },
  ];
  await putMany(items);
  return { removed, written: items.length, includeLatest };
}

export async function listItems() {
  return (await query(HPK, "ITEM#")).map(strip);
}
