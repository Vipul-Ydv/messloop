// The deterministic recommendation used whenever the model is unavailable or its output
// fails validation (R10). The workflow never waits on AI.

import { round } from "./metrics.ts";
import type { AiRecommendationJson, EvidencePackage } from "./types.ts";

export function buildFallback(e: EvidencePackage): AiRecommendationJson {
  const name = e.targetItem.name;
  const supportingEvidence = [`Pooled waste: ${round(e.pooledBaselinePer100, 1)} ${e.targetItem.unit} per 100 servings.`];
  if (e.avgRating !== null) {
    supportingEvidence.push(`Average rating: ${round(e.avgRating, 1)}/5 (${e.ratingCount} ratings).`);
  }

  // Only candidates with enough history may be put forward (§7.5).
  const eligible = e.candidates
    .filter((c) => c.occurrences >= 3 && c.votePct !== null)
    .sort((a, b) => (b.votePct ?? 0) - (a.votePct ?? 0));
  const best = eligible[0] ?? null;
  if (best) supportingEvidence.push(`Highest-voted alternative: ${best.name} (${best.votePct}%).`);

  const lowRating = e.avgRating !== null && e.avgRating <= 2.5;

  return {
    problem: `${name} exceeded ${e.threshold}% waste in ${e.rule.exceeded} of its last ${e.rule.of} occurrences.`,
    supportingEvidence,
    suggestedAction: best
      ? { type: "replace", target: name, replacement: best.name }
      : { type: "investigate", target: name, replacement: null },
    reasoning: `Based on repeated high waste${lowRating ? " and low ratings" : ""}. Review required.`,
    alternatives: e.candidates
      .filter((c) => !best || c.itemId !== best.itemId)
      .map((c) => ({
        item: c.name,
        pros: c.votePct !== null ? [`${c.votePct}% of votes`] : [],
        cons: c.occurrences < 3 ? ["Limited comparison: fewer than 3 past occurrences"] : [],
      })),
    constraintsAndCaveats: [
      e.constraints.cost === "unknown" ? "Cost impact is unknown." : `Cost per unit: ${e.constraints.cost}.`,
      "Nutrition impact is unknown.",
    ],
    evidenceStrengthNote: `Evidence strength (rule-based): ${e.evidenceStrength}.`,
    requiresHumanApproval: true,
  };
}
