// Test fixtures built only from seed-data.ts, so every test agrees on one dataset.

import { buildEvidence } from "./evidence.ts";
import { withMetrics } from "./metrics.ts";
import { ALOO_GOBI, CHOLE, ITEMS, MIXED_VEG, RATINGS, SLOT, SOYABEAN, VOTES } from "./seed-data.ts";
import type { EvidencePackage } from "./types.ts";

const item = (id: string) => ITEMS.find((i) => i.itemId === id)!;
const rating = (id: string) => RATINGS.find((r) => r.itemId === id)!;

export function demoEvidence(withStudentSignals = true): EvidencePackage {
  const cand = (id: string, recs: typeof CHOLE) => ({
    item: item(id),
    records: recs.map(withMetrics),
    rating: withStudentSignals ? rating(id) : null,
    votePct: withStudentSignals ? VOTES[id] : null,
  });
  return buildEvidence({
    item: item("aloo-gobi"),
    slotId: SLOT,
    threshold: 35,
    recordsNewestFirst: [...ALOO_GOBI].reverse().map(withMetrics),
    rating: withStudentSignals ? rating("aloo-gobi") : null,
    candidates: [cand("chole", CHOLE), cand("mixed-veg", MIXED_VEG), cand("soyabean-curry", SOYABEAN)],
  });
}

/** A model answer that obeys every rule — the shape the validator must accept. */
export function goodAiAnswer() {
  return {
    problem: "Aloo Gobi exceeded 35% waste in 5 of its last 5 occurrences.",
    supportingEvidence: [
      "Pooled waste is 18.2 kg per 100 servings.",
      "Average rating is 2.1 out of 5 from 38 ratings.",
      "Chole received 61% of votes.",
    ],
    suggestedAction: { type: "replace", target: "Aloo Gobi", replacement: "Chole" },
    reasoning: "Aloo Gobi is repeatedly left over and rated low, while Chole has lower past waste and the most votes.",
    alternatives: [
      { item: "Mixed Veg", pros: ["Second most votes"], cons: ["Higher past waste than Chole"] },
      { item: "Soyabean Curry", pros: ["Moderate past waste"], cons: ["Only a few past occurrences"] },
    ],
    constraintsAndCaveats: ["Cost is unknown.", "Nutrition is unknown."],
    evidenceStrengthNote: "Evidence strength is strong according to the rules.",
    requiresHumanApproval: true,
  };
}
