// The AI module (§10). Code has already found the problem and computed the evidence;
// our own model only turns it into words. Its output is validated before it is stored,
// and any failure falls back to the deterministic template (R10). This module has no
// database access at all (R1): it returns content, nothing more.

import { buildFallback } from "../../packages/core/fallback.ts";
import { validateAiOutput } from "../../packages/core/validate.ts";
import type { AiRecommendationJson, EvidencePackage } from "../../packages/core/types.ts";

// Verbatim from the spec (§10.3).
export const SYSTEM_PROMPT = `You help a hostel mess manager decide what to change to reduce food waste.
You receive a JSON evidence package. Rules:
1. Use ONLY values present in the evidence. Never invent, estimate, or compute new
   historical values. You may restate values, rounded to at most one decimal place.
2. If a candidate has fewer than 3 occurrences, say the comparison is limited and do
   not present it as the best option.
3. If a constraint is "unknown", say it is unknown. Do not assume.
4. Do not state probabilities or certainty. Do not promise outcomes.
5. You recommend; a human decides. Set requiresHumanApproval to true.
6. Respond with a single JSON object only, no markdown, matching this schema:
{
 "problem": string,
 "supportingEvidence": string[],
 "suggestedAction": {"type": "replace"|"reduce_quantity"|"reduce_frequency"|"investigate",
                      "target": string, "replacement": string|null},
 "reasoning": string,
 "alternatives": [{"item": string, "pros": string[], "cons": string[]}],
 "constraintsAndCaveats": string[],
 "evidenceStrengthNote": string,
 "requiresHumanApproval": true
}`;

/** The same schema, given to llama.cpp so it can only emit well-formed JSON. */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    problem: { type: "string" },
    supportingEvidence: { type: "array", items: { type: "string" } },
    suggestedAction: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["replace", "reduce_quantity", "reduce_frequency", "investigate"] },
        target: { type: "string" },
        replacement: { type: ["string", "null"] },
      },
      required: ["type", "target", "replacement"],
    },
    reasoning: { type: "string" },
    alternatives: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string" },
          pros: { type: "array", items: { type: "string" } },
          cons: { type: "array", items: { type: "string" } },
        },
        required: ["item", "pros", "cons"],
      },
    },
    constraintsAndCaveats: { type: "array", items: { type: "string" } },
    evidenceStrengthNote: { type: "string" },
    requiresHumanApproval: { type: "boolean", const: true },
  },
  required: [
    "problem", "supportingEvidence", "suggestedAction", "reasoning", "alternatives",
    "constraintsAndCaveats", "evidenceStrengthNote", "requiresHumanApproval",
  ],
};

/**
 * Small local models follow structure far better with a worked shape to copy. The
 * placeholders carry no numbers of their own, so anything the model fills in still has
 * to come from the evidence and pass the numeric check. The system prompt above stays
 * verbatim; this guidance travels in the user message, ahead of the evidence, so the
 * whole prefix is cached between calls.
 */
const SHAPE_GUIDE = `Write the answer in this shape. Replace every <placeholder> with a value taken from the evidence. Keep every string short (under 25 words). At most 2 alternatives. For a replace action, the replacement is the candidate name only: choose the one with the most votes among those with at least 3 occurrences. In pros and cons, state that dish's own numbers; do not compare dishes there.
{"problem":"<targetItem.name> exceeded <threshold>% waste in <rule.exceeded> of its last <rule.of> occurrences.","supportingEvidence":["Pooled waste is <pooledBaselinePer100> kg per 100 servings.","Average rating is <avgRating> out of 5 from <ratingCount> ratings.","<candidate name> received <votePct>% of votes."],"suggestedAction":{"type":"replace","target":"<targetItem.name>","replacement":"<candidate name>"},"reasoning":"<one or two sentences using only the evidence>","alternatives":[{"item":"<another candidate name>","pros":["Average waste is <its avgWastePct>%."],"cons":["It received <its votePct>% of votes."]}],"constraintsAndCaveats":["Cost is unknown.","Nutrition is unknown."],"evidenceStrengthNote":"Evidence strength is <evidenceStrength>, as computed by rules.","requiresHumanApproval":true}

Evidence:
`;

export function buildRequest(evidence: EvidencePackage, model: string) {
  return {
    model,
    temperature: 0.1,
    max_tokens: 450,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: SHAPE_GUIDE + JSON.stringify(evidence) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "recommendation", schema: RESPONSE_SCHEMA } },
    // Qwen3 reasons at length before answering unless told not to; the evidence is
    // already computed, so that time buys nothing here. Ignored by other templates.
    chat_template_kwargs: { enable_thinking: false },
  };
}

export interface Explanation {
  content: AiRecommendationJson;
  source: "ai" | "fallback_template";
  /** Why the model's answer was not used — reasons only, never model text (§10.6). */
  fallbackReason?: string;
  model?: string;
  ms: number;
}

export async function explain(evidence: EvidencePackage): Promise<Explanation> {
  const started = Date.now();
  const base = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL ?? "qwen3-4b";
  const fallback = (reason: string): Explanation => {
    const ms = Date.now() - started;
    console.log(JSON.stringify({ event: "ai_call", outcome: "fallback", reason, ms }));
    return { content: buildFallback(evidence), source: "fallback_template", fallbackReason: reason, ms };
  };

  if (!base) return fallback("AI_BASE_URL not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.AI_TIMEOUT_MS ?? 22000));
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.AI_API_KEY ?? ""}` },
      body: JSON.stringify(buildRequest(evidence, model)),
    });
    if (!res.ok) return fallback(`model HTTP ${res.status}`);
    const data: any = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string") return fallback("model returned no text");

    const checked = validateAiOutput(text, evidence);
    if (!checked.ok) return fallback(`validation failed (${checked.error.length} problems: ${checked.error.slice(0, 3).join("; ")})`);

    const ms = Date.now() - started;
    console.log(JSON.stringify({ event: "ai_call", outcome: "ai", model, ms }));
    return { content: checked.value, source: "ai", model, ms };
  } catch (e: any) {
    return fallback(e?.name === "AbortError" ? "model timed out" : "model unreachable");
  } finally {
    clearTimeout(timeout);
  }
}
