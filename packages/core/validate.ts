// Server-side validation (R15) for waste records, and for anything the model returns
// (§10.4). Both return a result instead of throwing, so callers decide what happens.

import type { AiRecommendationJson, EvidencePackage, FoodItem, Period } from "./types.ts";

const PERIODS: Period[] = ["breakfast", "lunch", "snacks", "dinner"];

export interface FieldError {
  code: "VALIDATION_ERROR";
  message: string;
  field: string;
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export interface WasteInput {
  date: string;
  period: Period;
  slotId: string;
  itemId: string;
  preparedQty: number;
  leftoverQty: number;
  unit: string;
  servings: number;
}

const fail = (field: string, message: string): Result<never, FieldError> => ({
  ok: false,
  error: { code: "VALIDATION_ERROR", message, field },
});

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** `item` is the stored FoodItem for body.itemId, or null if unknown. */
export function validateWasteInput(body: unknown, item: FoodItem | null): Result<WasteInput, FieldError> {
  if (!body || typeof body !== "object") return fail("body", "Request body must be a JSON object.");
  const b = body as Record<string, unknown>;

  if (!item) return fail("itemId", "Unknown itemId.");
  if (!isIsoDate(b.date)) return fail("date", "date must be a real date in YYYY-MM-DD format.");
  if (typeof b.period !== "string" || !PERIODS.includes(b.period as Period)) {
    return fail("period", `period must be one of ${PERIODS.join(", ")}.`);
  }
  if (typeof b.slotId !== "string" || b.slotId.trim() === "") return fail("slotId", "slotId is required.");

  for (const f of ["preparedQty", "leftoverQty", "servings"] as const) {
    if (!isFiniteNumber(b[f])) return fail(f, `${f} is required and must be a number.`);
  }
  const prepared = b.preparedQty as number;
  const leftover = b.leftoverQty as number;
  const servings = b.servings as number;

  if (prepared <= 0) return fail("preparedQty", "preparedQty must be greater than 0.");
  if (servings <= 0) return fail("servings", "servings must be greater than 0.");
  if (leftover < 0) return fail("leftoverQty", "leftoverQty cannot be negative.");
  if (leftover > prepared) return fail("leftoverQty", "leftoverQty cannot be more than preparedQty.");
  if (b.unit !== item.unit) {
    return fail("unit", `${item.name} is measured in ${item.unit}; got ${String(b.unit)}. Units are never mixed.`);
  }

  return {
    ok: true,
    value: {
      date: b.date,
      period: b.period as Period,
      slotId: b.slotId.trim(),
      itemId: item.itemId,
      preparedQty: prepared,
      leftoverQty: leftover,
      unit: item.unit,
      servings,
    },
  };
}

// ---------------------------------------------------------------- AI output

export const FORBIDDEN_PHRASES = ["definitely", "guarantee", "will reduce", "% chance", "probability"];

/**
 * Numbers the model may write without them appearing in the evidence: the "100" in
 * "per 100 servings", the "5" in "out of 5", and the minimum of 3 records the rules use.
 */
export const ALLOWED_CONSTANTS = [100, 5, 3];

const NUMBER_RE = /\d+(?:\.\d+)?/g;

function numbersIn(text: string): number[] {
  return (text.match(NUMBER_RE) ?? []).map(Number);
}

/** Every number appearing anywhere in the evidence, including inside strings such as dates. */
export function evidenceNumbers(evidence: EvidencePackage): number[] {
  const out: number[] = [...ALLOWED_CONSTANTS];
  const walk = (v: unknown) => {
    if (typeof v === "number") out.push(v);
    else if (typeof v === "string") out.push(...numbersIn(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(evidence);
  return out;
}

/** Restating a value rounded to one decimal is allowed; anything further off is invented. */
export function isKnownNumber(n: number, known: number[]): boolean {
  return known.some((k) => Math.abs(Math.abs(k) - n) <= 0.05 + 1e-9);
}

const isString = (v: unknown): v is string => typeof v === "string";
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

/**
 * Small models sometimes wrap JSON in prose or code fences. We accept the outermost
 * {...} block, but everything inside it must still pass every check below.
 */
export function parseModelJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("no JSON object in model output");
    return JSON.parse(raw.slice(start, end + 1));
  }
}

type Candidate = EvidencePackage["candidates"][number];

const MEASURES: { key: "avgWastePct" | "votePct" | "avgRating"; noun: string; plural: string; up: string[]; down: string[] }[] = [
  { key: "avgWastePct", noun: "waste", plural: "waste", up: ["higher", "more"], down: ["lower", "less"] },
  { key: "votePct", noun: "votes?", plural: "votes", up: ["more", "higher"], down: ["fewer", "lower", "less"] },
  { key: "avgRating", noun: "ratings?", plural: "rating", up: ["higher", "better"], down: ["lower", "worse"] },
];

/**
 * Finds "X has lower waste than Y" or "X has the most votes" claims that the candidate
 * numbers contradict. Each claim is about the dish named closest before it; pros and
 * cons with no dish before the claim are about their own alternative. Dishes without
 * numbers (such as the flagged item) are skipped: those claims are left to the reviewer.
 */
function falseComparisons(text: string, ownItem: string | undefined, evidence: EvidencePackage): string[] {
  const lower = text.toLowerCase();
  const find = (name: string) => evidence.candidates.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  const dishes = [evidence.targetItem.name, ...evidence.candidates.map((c) => c.name)];
  const mentions = dishes.flatMap((name) =>
    [...lower.matchAll(new RegExp(name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))].map((x) => ({ name, end: x.index! + name.length })),
  );
  const subjectAt = (pos: number): Candidate | undefined => {
    const before = mentions.filter((x) => x.end <= pos).sort((a, b) => b.end - a.end)[0];
    return before ? find(before.name) : ownItem ? find(ownItem) : undefined;
  };
  const out: string[] = [];

  for (const m of MEASURES) {
    for (const [words, sign] of [[m.up, 1], [m.down, -1]] as const) {
      // "lower waste than Chole"
      const rel = new RegExp(`\\b(${words.join("|")})\\s+(?:(?:average|past)\\s+)?${m.noun}\\s+than\\s+([a-z ]+?)(?=[.,;]|$|\\s+(?:and|but|while|which)\\b)`, "g");
      for (const hit of lower.matchAll(rel)) {
        const subject = subjectAt(hit.index!);
        const other = find(hit[2]);
        if (!subject || !other || other === subject) continue;
        if (Math.sign(subject[m.key] - other[m.key]) !== sign) {
          out.push(`false comparison: ${subject.name} does not have ${hit[1]} ${m.plural} than ${other.name}`);
        }
      }
    }
    // "the lowest waste", "the most votes"; "second most votes" is a ranking, not a claim to be first.
    const values = evidence.candidates.map((c) => c[m.key]);
    for (const [words, extreme, label] of [["most|highest|best", Math.max(...values), "highest"], ["least|lowest|fewest|worst", Math.min(...values), "lowest"]] as const) {
      const sup = new RegExp(`(?<!second |third |2nd |3rd )\\b(?:${words})\\s+(?:(?:average|past)\\s+)?${m.noun}\\b`, "g");
      for (const hit of lower.matchAll(sup)) {
        const subject = subjectAt(hit.index!);
        if (subject && subject[m.key] !== extreme) out.push(`false comparison: ${subject.name} does not have the ${label} ${m.plural}`);
      }
    }
  }
  return out;
}

export function validateAiOutput(raw: unknown, evidence: EvidencePackage): Result<AiRecommendationJson, string[]> {
  let o: unknown = raw;
  if (typeof raw === "string") {
    try {
      o = parseModelJson(raw);
    } catch {
      return { ok: false, error: ["output is not valid JSON"] };
    }
  }
  if (!o || typeof o !== "object") return { ok: false, error: ["output is not a JSON object"] };
  const r = o as Record<string, unknown>;
  const problems: string[] = [];

  // 1. Shape
  if (!isString(r.problem)) problems.push("problem must be a string");
  if (!isStringArray(r.supportingEvidence)) problems.push("supportingEvidence must be a string array");
  if (!isString(r.reasoning)) problems.push("reasoning must be a string");
  if (!isStringArray(r.constraintsAndCaveats)) problems.push("constraintsAndCaveats must be a string array");
  if (!isString(r.evidenceStrengthNote)) problems.push("evidenceStrengthNote must be a string");
  const action = r.suggestedAction as Record<string, unknown> | undefined;
  const actionTypes = ["replace", "reduce_quantity", "reduce_frequency", "investigate"];
  if (!action || typeof action !== "object") problems.push("suggestedAction must be an object");
  else {
    if (!isString(action.type) || !actionTypes.includes(action.type)) problems.push("suggestedAction.type is invalid");
    if (!isString(action.target)) problems.push("suggestedAction.target must be a string");
    if (action.replacement !== null && !isString(action.replacement)) problems.push("suggestedAction.replacement must be a string or null");
  }
  const alts = r.alternatives;
  const altsOk =
    Array.isArray(alts) &&
    alts.every((a) => a && typeof a === "object" && isString((a as any).item) && isStringArray((a as any).pros) && isStringArray((a as any).cons));
  if (!altsOk) problems.push("alternatives must be [{item, pros[], cons[]}]");
  if (problems.length) return { ok: false, error: problems };

  // 2. Human approval is not optional (R1)
  if (r.requiresHumanApproval !== true) problems.push("requiresHumanApproval must be true");

  // 3–4, 7. Names must refer to things that exist
  const norm = (s: string) => s.trim().toLowerCase();
  const target = evidence.targetItem;
  const candidateKeys = new Set(evidence.candidates.flatMap((c) => [norm(c.name), norm(c.itemId)]));
  if (![norm(target.name), norm(target.itemId)].includes(norm(action!.target as string))) {
    problems.push("suggestedAction.target is not the flagged item");
  }
  if (isString(action!.replacement) && !candidateKeys.has(norm(action!.replacement))) {
    problems.push("suggestedAction.replacement is not one of the candidates");
  }
  for (const a of alts as { item: string }[]) {
    if (!candidateKeys.has(norm(a.item))) problems.push(`alternative "${a.item}" is not a candidate`);
  }

  // The action must be internally consistent, and never rest on a thin comparison (§10.3 rule 2).
  if (action!.type === "replace" && !isString(action!.replacement)) problems.push("a replace action needs a replacement");
  if (action!.type !== "replace" && action!.replacement !== null) problems.push("only a replace action may name a replacement");
  if (isString(action!.replacement)) {
    const c = evidence.candidates.find((x) => [norm(x.name), norm(x.itemId)].includes(norm(action!.replacement as string)));
    if (c && c.occurrences < 3) problems.push(`replacement ${c.name} has fewer than 3 occurrences`);
  }

  // Vote shares must belong to the dish they are attributed to. A small model can
  // quote the right number about the wrong dish, which the numeric check alone misses.
  const sentences = [...(r.supportingEvidence as string[]), ...String(r.reasoning).split(/(?<=[.!?])\s+/)];
  const dishes = [
    { name: target.name, votePct: null as number | null },
    ...evidence.candidates.map((c) => ({ name: c.name, votePct: c.votePct })),
  ];
  for (const s of sentences) {
    if (!/vote/i.test(s)) continue;
    const named = dishes.filter((d) => s.toLowerCase().includes(d.name.toLowerCase()));
    if (named.length !== 1) continue; // several dishes: cannot attribute safely, leave to the numeric check
    for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {
      const n = Number(m[1]);
      const share = named[0].votePct;
      if (share === null || Math.abs(share - n) > 0.5) problems.push(`vote share ${n}% does not belong to ${named[0].name}`);
    }
  }

  // Comparisons between candidates must match their numbers. Pros and cons are read as
  // being about their own alternative; other sentences as being about the dish named first.
  const claims: { subject?: string; text: string }[] = [
    ...sentences.map((text) => ({ text })),
    ...(alts as { item: string; pros: string[]; cons: string[] }[]).flatMap((a) =>
      [...a.pros, ...a.cons].map((text) => ({ subject: a.item, text })),
    ),
  ];
  for (const c of claims) problems.push(...falseComparisons(c.text, c.subject, evidence));

  // 5. Numbers must come from the evidence (R2)
  const known = evidenceNumbers(evidence);
  const prose = [r.problem as string, ...(r.supportingEvidence as string[]), r.reasoning as string].join(" ");
  for (const n of numbersIn(prose)) {
    if (!isKnownNumber(n, known)) problems.push(`number ${n} does not appear in the evidence`);
  }

  // 6. No certainty language
  const allText = JSON.stringify(r).toLowerCase();
  for (const phrase of FORBIDDEN_PHRASES) {
    if (allText.includes(phrase)) problems.push(`forbidden phrase "${phrase}"`);
  }

  if (problems.length) return { ok: false, error: problems };
  return { ok: true, value: r as unknown as AiRecommendationJson };
}
