// The canonical simulated dataset (spec §9). Every value here is SIMULATED and is
// flagged isSimulated: true wherever it is stored (R4). Tests and the backend seed
// both read from this one file, so the demo and the golden tests cannot drift apart.

import type { FoodItem, Period, RatingAggregate, Unit } from "./types.ts";

export const HOSTEL_ID = "demo-hostel";
export const SLOT = "lunch_dry_sabzi";
export const PERIOD: Period = "lunch";
export const UNIT: Unit = "kg";

export const ITEMS: FoodItem[] = [
  { itemId: "aloo-gobi", name: "Aloo Gobi", unit: "kg", category: "dry sabzi", isSimulated: true },
  { itemId: "chole", name: "Chole", unit: "kg", category: "dry sabzi", isSimulated: true },
  { itemId: "mixed-veg", name: "Mixed Veg", unit: "kg", category: "dry sabzi", isSimulated: true },
  { itemId: "soyabean-curry", name: "Soyabean Curry", unit: "kg", category: "dry sabzi", isSimulated: true },
];

export interface SeedRecord {
  date: string;
  itemId: string;
  preparedQty: number;
  leftoverQty: number;
  servings: number;
}

/** The five golden Aloo Gobi records (§7.4), oldest first. The last one is the live demo entry. */
export const ALOO_GOBI: SeedRecord[] = [
  { date: "2026-09-12", itemId: "aloo-gobi", preparedQty: 48, leftoverQty: 19, servings: 110 },
  { date: "2026-09-19", itemId: "aloo-gobi", preparedQty: 50, leftoverQty: 21, servings: 118 },
  { date: "2026-09-26", itemId: "aloo-gobi", preparedQty: 50, leftoverQty: 18, servings: 102 },
  { date: "2026-10-03", itemId: "aloo-gobi", preparedQty: 52, leftoverQty: 22, servings: 120 },
  { date: "2026-10-08", itemId: "aloo-gobi", preparedQty: 50, leftoverQty: 23, servings: 115 },
];

// Candidate history on dates that never clash with Aloo Gobi in the same slot.
export const CHOLE: SeedRecord[] = [4.8, 6.0, 5.6, 5.2, 6.4, 5.6].map((leftoverQty, i) => ({
  date: ["2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14"][i],
  itemId: "chole",
  preparedQty: 40,
  leftoverQty,
  servings: [100, 110, 105, 98, 112, 104][i],
}));

export const MIXED_VEG: SeedRecord[] = [6.0, 7.2, 6.6, 6.3, 6.9].map((leftoverQty, i) => ({
  date: ["2026-08-12", "2026-08-19", "2026-08-26", "2026-09-02", "2026-09-09"][i],
  itemId: "mixed-veg",
  preparedQty: 30,
  leftoverQty,
  servings: [95, 100, 98, 92, 102][i],
}));

export const SOYABEAN: SeedRecord[] = [4.5, 5.0, 4.75].map((leftoverQty, i) => ({
  date: ["2026-08-14", "2026-08-21", "2026-08-28"][i],
  itemId: "soyabean-curry",
  preparedQty: 25,
  leftoverQty,
  servings: [80, 85, 82][i],
}));

export const RATINGS: RatingAggregate[] = [
  { itemId: "aloo-gobi", counts: [12, 14, 8, 3, 1], topReasons: ["taste", "repeated"] },
  { itemId: "chole", counts: [0, 2, 5, 19, 14], topReasons: [] },
  { itemId: "mixed-veg", counts: [2, 4, 9, 10, 5], topReasons: [] },
  { itemId: "soyabean-curry", counts: [2, 5, 6, 5, 2], topReasons: [] },
];

/** Poll on replacing Aloo Gobi — 100 votes. */
export const VOTES: Record<string, number> = { chole: 61, "mixed-veg": 27, "soyabean-curry": 12 };

/** The post-intervention meal the demo logs after approval (§7.4). */
export const POST_CHOLE: SeedRecord = { date: "2026-10-10", itemId: "chole", preparedQty: 50, leftoverQty: 13.5, servings: 120 };

/**
 * includeLatest=false leaves out the 8 Oct Aloo Gobi record so the demo can log it live
 * and the baseline still lands on 18.23 once it is in.
 */
export function seedRecords(includeLatest = true): SeedRecord[] {
  const aloo = includeLatest ? ALOO_GOBI : ALOO_GOBI.slice(0, -1);
  return [...aloo, ...CHOLE, ...MIXED_VEG, ...SOYABEAN];
}
