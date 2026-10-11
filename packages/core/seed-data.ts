// The canonical simulated dataset (spec §9). Every value here is SIMULATED and is
// flagged isSimulated: true wherever it is stored (R4). Tests and the backend seed
// both read from this one file, so the demo and the golden tests cannot drift apart.

import type { FoodItem, Period, RatingAggregate, Unit } from "./types.ts";

export const HOSTEL_ID = "demo-hostel";
export const SLOT = "lunch_dry_sabzi";
export const PERIOD: Period = "lunch";
export const UNIT: Unit = "kg";

export const ITEMS: FoodItem[] = [
  { itemId: "aloo-gobi", name: "Aloo Gobi", hindi: "आलू गोभी", meals: ["lunch"], unit: "kg", category: "dry sabzi", isSimulated: true },
  { itemId: "chole", name: "Chole", hindi: "छोले", meals: ["lunch", "dinner"], unit: "kg", category: "dry sabzi", isSimulated: true },
  { itemId: "mixed-veg", name: "Mixed Veg", hindi: "मिक्स वेज", meals: ["lunch"], unit: "kg", category: "dry sabzi", isSimulated: true },
  { itemId: "soyabean-curry", name: "Soyabean Curry", hindi: "सोयाबीन करी", meals: ["lunch"], unit: "kg", category: "dry sabzi", isSimulated: true },
];

/**
 * Every dish on our mess's real weekly menu (breakfast, lunch, dinner). These are real,
 * not simulated: they let staff log a real meal. All weighed in kg so the voice call's
 * "kitne kilo" question works for each. Chole is already in ITEMS above.
 */
const m = (itemId: string, name: string, hindi: string, meals: Period[], category: string): FoodItem => ({ itemId, name, hindi, meals, unit: "kg", category, isSimulated: false });
export const MENU_ITEMS: FoodItem[] = [
  m("aloo-paratha", "Aloo Paratha", "आलू पराठा", ["breakfast"], "bread"),
  m("chana", "Chana", "चना", ["breakfast"], "sabzi"),
  m("suji", "Suji", "सूजी", ["breakfast"], "sweet"),
  m("aloo-sabzi", "Aloo Sabzi", "आलू सब्ज़ी", ["breakfast"], "sabzi"),
  m("paratha", "Paratha", "पराठा", ["breakfast"], "bread"),
  m("paneer-paratha", "Paneer Paratha", "पनीर पराठा", ["breakfast"], "bread"),
  m("poha", "Poha", "पोहा", ["breakfast"], "snack"),
  m("pasta", "Pasta", "पास्ता", ["breakfast"], "snack"),
  m("aloo-puri", "Aloo Puri", "आलू पूरी", ["breakfast"], "bread"),
  m("chana-paratha", "Chana Paratha", "चना पराठा", ["breakfast"], "bread"),
  m("chole-bhature", "Chole Bhature", "छोले भटूरे", ["breakfast"], "bread"),
  m("arhar-dal", "Arhar Dal", "अरहर दाल", ["lunch"], "dal"),
  m("rajma", "Rajma", "राजमा", ["lunch", "dinner"], "dal"),
  m("mix-daal", "Mix Daal", "मिक्स दाल", ["lunch"], "dal"),
  m("kale-chana-dal", "Kale Chana Dal", "काले चने की दाल", ["lunch"], "dal"),
  m("kali-daal", "Kali Daal", "काली दाल", ["lunch"], "dal"),
  m("curry", "Curry", "करी", ["lunch"], "sabzi"),
  m("pulao", "Pulao", "पुलाव", ["lunch"], "rice"),
  m("raita", "Raita", "रायता", ["lunch"], "side"),
  m("salad", "Salad", "सलाद", ["lunch"], "side"),
  m("chawal", "Chawal", "चावल", ["lunch", "dinner"], "rice"),
  m("seasonal-sabzi", "Seasonal Sabzi", "मौसमी सब्ज़ी", ["dinner"], "sabzi"),
  m("daal", "Daal", "दाल", ["dinner"], "dal"),
  m("roti", "Roti", "रोटी", ["dinner"], "bread"),
  m("puri", "Puri", "पूरी", ["dinner"], "bread"),
  m("kheer", "Kheer", "खीर", ["dinner"], "sweet"),
  m("paneer", "Paneer", "पनीर", ["dinner"], "sabzi"),
  m("sweet-dish", "Sweet Dish", "मीठा", ["dinner"], "sweet"),
  m("aloo-badi", "Aloo Badi", "आलू बड़ी", ["dinner"], "sabzi"),
  m("aloo-gutke", "Aloo Gutke", "आलू गुटके", ["dinner"], "sabzi"),
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
