// Builds the evidence package (§10.2): the only thing the language model ever sees.
// Every number in it is computed here (R2).

import { mean, pooledPer100, round, sum } from "./metrics.ts";
import { evidenceStrength, recurringWaste } from "./rules.ts";
import type { EvidenceCandidate, EvidencePackage, FoodItem, RatingAggregate } from "./types.ts";

export interface HistoryRecord {
  date: string;
  preparedQty: number;
  leftoverQty: number;
  servings: number;
  wastePct: number;
  wastePer100: number;
}

export interface CandidateInput {
  item: FoodItem;
  records: { wastePct: number }[];
  rating: RatingAggregate | null;
  votePct: number | null;
}

export interface EvidenceInput {
  item: FoodItem;
  slotId: string;
  threshold: number;
  /** The target item's records in this slot, newest first. */
  recordsNewestFirst: HistoryRecord[];
  rating: RatingAggregate | null;
  candidates: CandidateInput[];
  costPerUnit?: number;
}

export function ratingStats(agg: RatingAggregate | null): { avg: number | null; count: number } {
  if (!agg) return { avg: null, count: 0 };
  const count = sum(agg.counts);
  if (count === 0) return { avg: null, count: 0 };
  const weighted = agg.counts.reduce((acc, c, i) => acc + c * (i + 1), 0);
  return { avg: weighted / count, count };
}

export function buildEvidence(input: EvidenceInput): EvidencePackage {
  const window = input.recordsNewestFirst.slice(0, 5);
  const rule = recurringWaste(window, input.threshold);
  const { avg, count } = ratingStats(input.rating);

  const candidates: EvidenceCandidate[] = input.candidates.map((c) => {
    const r = ratingStats(c.rating);
    const avgWaste = mean(c.records.map((x) => x.wastePct));
    return {
      itemId: c.item.itemId,
      name: c.item.name,
      occurrences: c.records.length,
      avgWastePct: avgWaste === null ? null : round(avgWaste, 1),
      avgRating: r.avg === null ? null : round(r.avg, 2),
      votePct: c.votePct,
    };
  });

  const votes = candidates.map((c) => c.votePct).filter((v): v is number => v !== null);
  const topVoteShare = votes.length ? Math.max(...votes) : null;

  return {
    targetItem: { itemId: input.item.itemId, name: input.item.name, unit: input.item.unit },
    slotId: input.slotId,
    threshold: input.threshold,
    // Oldest first, so the model reads it the way a person would.
    history: [...window].reverse().map((r) => ({
      date: r.date,
      prepared: r.preparedQty,
      leftover: r.leftoverQty,
      servings: r.servings,
      wastePct: round(r.wastePct, 2),
      per100: round(r.wastePer100, 2),
    })),
    rule: { exceeded: rule.exceeded, of: rule.n },
    pooledBaselinePer100: round(pooledPer100(window), 2),
    avgRating: avg === null ? null : round(avg, 2),
    ratingCount: count,
    topReasons: input.rating?.topReasons ?? [],
    candidates,
    constraints: { cost: input.costPerUnit ?? "unknown", nutrition: "unknown" },
    evidenceStrength: evidenceStrength({
      n: rule.n,
      exceeded: rule.exceeded,
      ratingCount: count,
      avgRating: avg,
      topVoteShare,
    }),
  };
}
