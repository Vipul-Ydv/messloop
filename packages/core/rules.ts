// Deterministic rules (R3, R11). No model ever decides whether something is a problem,
// or how strong the evidence is.

import type { Strength } from "./types.ts";

export const DEFAULT_THRESHOLD = 35;
export const RULE_WINDOW = 5;
export const MIN_RECORDS = 3;

export interface RuleResult {
  n: number;
  exceeded: number;
  alert: boolean;
}

/**
 * Recurring waste: of the last RULE_WINDOW records (newest first), at least MIN_RECORDS
 * must exceed the threshold, and there must be at least MIN_RECORDS records at all.
 */
export function recurringWaste(recordsNewestFirst: { wastePct: number }[], threshold = DEFAULT_THRESHOLD): RuleResult {
  const window = recordsNewestFirst.slice(0, RULE_WINDOW);
  const n = window.length;
  const exceeded = window.filter((r) => r.wastePct > threshold).length;
  return { n, exceeded, alert: n >= MIN_RECORDS && exceeded >= MIN_RECORDS };
}

export interface StrengthInput {
  n: number;
  exceeded: number;
  ratingCount: number;
  avgRating: number | null;
  /** Highest vote share among candidates, 0–100, or null when there was no poll. */
  topVoteShare: number | null;
}

/** Rule-derived scale. Never a probability, never produced by the model. */
export function evidenceStrength(s: StrengthInput): Strength {
  if (s.n < MIN_RECORDS) return "insufficient";
  if (s.n === MIN_RECORDS) return "limited";
  if (s.exceeded / s.n < 0.8) return "limited";
  const studentsAgree =
    s.ratingCount >= 10 &&
    s.avgRating !== null &&
    s.avgRating <= 2.5 &&
    s.topVoteShare !== null &&
    s.topVoteShare >= 50;
  return studentsAgree ? "strong" : "moderate";
}
