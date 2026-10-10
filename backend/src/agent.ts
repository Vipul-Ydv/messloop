// The waste agent (AI side). Our own model decides which evidence to look at, using
// tools that return slices of the evidence package code already computed (R2). The
// final answer may only use what the agent actually looked at: the validator is given
// exactly those slices. Like ai.ts, this module has no database access (R1).

import type { EvidencePackage } from "../../packages/core/types.ts";
import { FORBIDDEN_PHRASES, isKnownNumber } from "../../packages/core/validate.ts";
import { explain, type Explanation } from "./ai.ts";

export interface TraceStep {
  step: "tool" | "write" | "note";
  name?: string;
  ms: number;
  detail?: string;
}

const AGENT_PROMPT = `You are MessLoop's waste agent for a hostel mess. A fixed rule flagged a dish that keeps getting wasted. Before anyone suggests a change, gather the evidence you need with the tools, one call at a time. Do not call a tool twice. When you have enough to recommend a change, reply with the single word DONE.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_waste_history",
      description: "Recent meals of the flagged dish: cooked, left over, plates, waste % and kg per 100 plates, plus the rule result.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_student_feedback",
      description: "Students' average rating (out of 5), number of ratings and top reasons for the flagged dish.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_replacement_options",
      description: "Other dishes that could replace it: times served, average waste %, rating and share of student votes.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

type ToolName = "get_waste_history" | "get_student_feedback" | "get_replacement_options";

function runTool(name: ToolName, e: EvidencePackage) {
  if (name === "get_waste_history") return { dish: e.targetItem.name, threshold: e.threshold, rule: e.rule, pooledBaselinePer100: e.pooledBaselinePer100, history: e.history };
  if (name === "get_student_feedback") return { avgRating: e.avgRating, ratingCount: e.ratingCount, topReasons: e.topReasons };
  return { candidates: e.candidates };
}

/** Only the parts of the evidence the agent asked for, plus what defines the task. */
function evidenceSeen(e: EvidencePackage, seen: Set<ToolName>): EvidencePackage {
  return {
    targetItem: e.targetItem,
    slotId: e.slotId,
    threshold: e.threshold,
    rule: e.rule, // the trigger itself, given to the agent up front
    evidenceStrength: e.evidenceStrength,
    constraints: e.constraints,
    history: seen.has("get_waste_history") ? e.history : [],
    pooledBaselinePer100: seen.has("get_waste_history") ? e.pooledBaselinePer100 : (undefined as unknown as number),
    avgRating: seen.has("get_student_feedback") ? e.avgRating : null,
    ratingCount: seen.has("get_student_feedback") ? e.ratingCount : 0,
    topReasons: seen.has("get_student_feedback") ? e.topReasons : [],
    candidates: seen.has("get_replacement_options") ? e.candidates : [],
  };
}

export async function chat(body: unknown, timeoutMs: number) {
  const base = process.env.AI_BASE_URL;
  if (!base) throw new Error("AI_BASE_URL not configured");
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.AI_API_KEY ?? ""}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`model HTTP ${res.status}`);
    return (await res.json()) as any;
  } finally {
    clearTimeout(t);
  }
}

export interface Investigation {
  explanation: Explanation;
  trace: TraceStep[];
  toolsUsed: ToolName[];
}

export async function investigate(evidence: EvidencePackage): Promise<Investigation> {
  const trace: TraceStep[] = [];
  const seen = new Set<ToolName>();
  const messages: any[] = [
    { role: "system", content: AGENT_PROMPT },
    { role: "user", content: `The rule flagged ${evidence.targetItem.name}: over ${evidence.threshold}% wasted in ${evidence.rule.exceeded} of its last ${evidence.rule.of} meals. Investigate.` },
  ];

  try {
    for (let turn = 0; turn < 5; turn++) {
      const t0 = Date.now();
      const data = await chat({
        model: process.env.AI_MODEL ?? "qwen3-4b",
        temperature: 0.1,
        max_tokens: 120,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        chat_template_kwargs: { enable_thinking: false },
      }, 30_000);
      const msg = data?.choices?.[0]?.message;
      const calls: any[] = msg?.tool_calls ?? [];
      if (!calls.length) break;
      messages.push(msg);
      for (const c of calls) {
        const name = c?.function?.name as ToolName;
        const known = TOOLS.some((t) => t.function.name === name);
        const result = known ? runTool(name, evidence) : { error: "unknown tool" };
        if (known) seen.add(name);
        trace.push({ step: "tool", name: known ? name : "unknown", ms: Date.now() - t0 });
        messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(result) });
      }
    }
  } catch (e: any) {
    trace.push({ step: "note", ms: 0, detail: `agent stopped early: ${e?.name === "AbortError" ? "model timed out" : e?.message ?? "error"}` });
  }

  // An agent that looked at nothing has nothing to explain from; code gathers the evidence instead.
  let used = evidenceSeen(evidence, seen);
  if (seen.size === 0) {
    trace.push({ step: "note", ms: 0, detail: "agent gathered no evidence; code gathered it instead" });
    used = evidence;
  }
  const explanation = await explain(used);
  trace.push({ step: "write", ms: explanation.ms, detail: explanation.source === "ai" ? "checked by code: passed" : `template used: ${explanation.fallbackReason ?? ""}` });
  return { explanation, trace, toolsUsed: [...seen] };
}

// ---------------------------------------------------------------- outcome report

export interface ImpactFacts {
  dishBefore: string;
  dishAfter: string;
  baselineWastePer100: number;
  postWastePer100: number;
  absoluteChange: number;
  reductionPct: number | null;
  direction: string;
  postRecordCount: number;
  baselineRecordCount: number;
  estimatedFoodSavedQty: number;
  unit: string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The honesty caveat is always written by code, never left to the model (R5). */
const caveat = (f: ImpactFacts) =>
  `This is an observed change from ${f.postRecordCount} meal(s); other factors such as attendance may also have changed.`;

export function templateSummary(f: ImpactFacts): string {
  return `After switching ${f.dishBefore} to ${f.dishAfter}, waste went from ${r1(f.baselineWastePer100)} to ${r1(f.postWastePer100)} ${f.unit} per 100 plates (${f.direction}). ${caveat(f)}`;
}

/** The agent reports back on a trial. Numbers are checked; anything off falls back to the template. */
export async function writeOutcome(f: ImpactFacts): Promise<{ text: string; source: "ai" | "fallback_template"; reason?: string }> {
  const facts = { ...f, baselineWastePer100: r1(f.baselineWastePer100), postWastePer100: r1(f.postWastePer100), absoluteChange: r1(f.absoluteChange), reductionPct: f.reductionPct === null ? null : r1(f.reductionPct), estimatedFoodSavedQty: Math.round(f.estimatedFoodSavedQty * 100) / 100 };
  try {
    const data = await chat({
      model: process.env.AI_MODEL ?? "qwen3-4b",
      temperature: 0.1,
      max_tokens: 120,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        { role: "system", content: "You report the result of a menu trial in a hostel mess to students and the manager. Write ONE short, plain sentence saying what changed after the switch. Use only numbers from the facts. Waste is always measured in kg per 100 plates: write it exactly that way. Do not add caveats; the app adds them. Never promise or claim certainty. Reply as JSON {\"summary\": string}." },
        { role: "user", content: JSON.stringify(facts) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "outcome", schema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] } } },
    }, 45_000);
    const text: string = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}").summary ?? "";
    const known = [...Object.values(facts).filter((v): v is number => typeof v === "number"), 100];
    const bad = (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => !isKnownNumber(n, known));
    const lower = text.toLowerCase();
    if (!text.trim()) return { text: templateSummary(f), source: "fallback_template", reason: "empty answer" };
    if (bad.length) return { text: templateSummary(f), source: "fallback_template", reason: `numbers not in the facts: ${bad.join(", ")}` };
    if (FORBIDDEN_PHRASES.some((p) => lower.includes(p))) return { text: templateSummary(f), source: "fallback_template", reason: "certainty language" };
    if (!lower.includes("per 100 plates")) return { text: templateSummary(f), source: "fallback_template", reason: "did not state the measure as per 100 plates" };
    return { text: `${text.trim()} ${caveat(f)}`, source: "ai" };
  } catch (e: any) {
    return { text: templateSummary(f), source: "fallback_template", reason: e?.name === "AbortError" ? "model timed out" : "model unreachable" };
  }
}
