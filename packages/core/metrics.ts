// All waste arithmetic lives here, once (Hard Rule R2: numbers come from code).
// Full precision is kept everywhere; round() is for display only.

import type { Direction, QtyRecord } from "./types.ts";

/** leftover ÷ prepared × 100. Caller guarantees prepared > 0 (validated upstream). */
export function wastePct(prepared: number, leftover: number): number {
  return (leftover / prepared) * 100;
}

/** leftover ÷ servings × 100 — the primary KPI, because it normalises for attendance. */
export function wastePer100(leftover: number, servings: number): number {
  return (leftover / servings) * 100;
}

/** What was actually eaten per serving, under the container-leftover definition (R7). */
export function consumptionPerServing(prepared: number, leftover: number, servings: number): number {
  return (prepared - leftover) / servings;
}

/**
 * Pooled, not averaged: sum of leftovers ÷ sum of servings. Averaging per-meal ratios
 * would let a tiny meal count as much as a full one.
 */
export function pooledPer100(records: QtyRecord[]): number {
  const servings = sum(records.map((r) => r.servings));
  if (servings === 0) return 0;
  return (sum(records.map((r) => r.leftoverQty)) / servings) * 100;
}

export function pooledPct(records: QtyRecord[]): number {
  const prepared = sum(records.map((r) => r.preparedQty));
  if (prepared === 0) return 0;
  return (sum(records.map((r) => r.leftoverQty)) / prepared) * 100;
}

/** post − baseline. Negative means less waste. */
export function absoluteChange(post: number, base: number): number {
  return post - base;
}

/** null when the baseline is zero — a reduction from nothing is undefined, not infinite (R8). */
export function reductionPct(base: number, post: number): number | null {
  if (base === 0) return null;
  return ((base - post) / base) * 100;
}

/** A change within 5% of the baseline is reported as "similar" rather than as a trend. */
export function direction(change: number, base: number): Direction {
  if (Math.abs(change) <= 0.05 * base) return "similar";
  return change < 0 ? "decreased" : "increased";
}

/** Estimated, never measured: the per-100 difference applied to post-intervention servings. */
export function estimatedFoodSaved(base: number, post: number, postServings: number): number {
  return ((base - post) / 100) * postServings;
}

/**
 * Food saved, as plates: divided by what one student actually ate per plate in the
 * post-change meals. Null when that can't be worked out.
 */
export function platesEquivalent(savedQty: number, postRecords: QtyRecord[]): number | null {
  const eaten = sum(postRecords.map((r) => r.preparedQty - r.leftoverQty));
  const plates = sum(postRecords.map((r) => r.servings));
  if (eaten <= 0 || plates <= 0) return null;
  return savedQty / (eaten / plates);
}

/**
 * Global average emissions embedded in wasted food: 3.3 Gt CO2e for 1.3 Gt of food
 * (FAO 2013, "Food Wastage Footprint: Impacts on Natural Resources"), about 2.54 kg CO2e
 * per kg. A rough, Estimated figure: it is not specific to this mess or this dish.
 */
export const CO2E_PER_KG_FOOD = 3.3 / 1.3;

export function co2eEstimate(savedQty: number): number {
  return savedQty * CO2E_PER_KG_FOOD;
}

/** A record with its two derived metrics attached, as it is stored. */
export function withMetrics<T extends QtyRecord>(r: T): T & { wastePct: number; wastePer100: number } {
  return { ...r, wastePct: wastePct(r.preparedQty, r.leftoverQty), wastePer100: wastePer100(r.leftoverQty, r.servings) };
}

export function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f + Number.EPSILON * f) / f;
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function mean(values: number[]): number | null {
  return values.length === 0 ? null : sum(values) / values.length;
}
