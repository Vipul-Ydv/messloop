// Student feedback: one tap for how the dish was, one or more taps for why food was left.
// Each vote is added to the dish's rating counts, which the agent already reads as
// evidence, so students' reasons reach the next suggestion. Votes are anonymous.

import { HPK, get, put, query } from "./db.ts";
import { HttpError } from "./http.ts";

export const REASONS = [
  { id: "taste", label: "Didn't like the taste", hindi: "Swaad pasand nahi aaya" },
  { id: "spicy", label: "Too spicy", hindi: "Bahut teekha" },
  { id: "cold", label: "Came cold", hindi: "Thanda tha" },
  { id: "oily", label: "Too oily", hindi: "Bahut tel" },
  { id: "undercooked", label: "Not cooked well", hindi: "Theek se nahi bana" },
  { id: "too_much", label: "Took too much", hindi: "Zyada le liya" },
  { id: "repeated", label: "Served too often", hindi: "Baar baar banta hai" },
] as const;

/** What a student is asked about: the dish logged most recently, plus every dish to pick from. */
export async function options() {
  const [items, waste] = await Promise.all([query(HPK, "ITEM#"), query(HPK, "WASTE#")]);
  const latest = waste.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.loggedAt ?? "") < (b.loggedAt ?? "") ? 1 : -1))[0];
  return {
    items: items.map((i: any) => ({ itemId: i.itemId, name: i.name })).sort((a: any, b: any) => a.name.localeCompare(b.name)),
    suggestedItemId: latest?.itemId ?? null,
    suggestedDate: latest?.date ?? null,
    reasons: REASONS,
  };
}

export async function submit(body: any) {
  const itemId = typeof body?.itemId === "string" ? body.itemId : "";
  const item = itemId ? await get(HPK, `ITEM#${itemId}`) : null;
  if (!item) throw new HttpError(400, "VALIDATION_ERROR", "Pick a dish.", "itemId");
  const rating = body?.rating;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, "VALIDATION_ERROR", "Rating must be 1 to 5.", "rating");
  const reasons: string[] = Array.isArray(body?.reasons) ? [...new Set(body.reasons as string[])] : [];
  if (reasons.length > 3 || reasons.some((r) => !REASONS.some((x) => x.id === r))) {
    throw new HttpError(400, "VALIDATION_ERROR", "Pick up to three reasons from the list.", "reasons");
  }

  const at = new Date().toISOString();
  await put({ PK: HPK, SK: `FEEDBACK#${at}#${itemId}`, itemId, rating, reasons, createdAt: at, isSimulated: false });

  // Add the vote to the dish's rating counts (read-modify-write is fine at mess scale).
  const agg = (await get(HPK, `RATING#${itemId}`)) ?? { PK: HPK, SK: `RATING#${itemId}`, itemId, counts: [0, 0, 0, 0, 0], topReasons: [], isSimulated: false };
  const counts = [...agg.counts] as number[];
  counts[rating - 1] += 1;
  const reasonCounts: Record<string, number> = { ...(agg.reasonCounts ?? {}) };
  for (const r of reasons) reasonCounts[r] = (reasonCounts[r] ?? 0) + 1;
  // Students' own reasons first, by how often they were picked; earlier (seeded) reasons after.
  const ranked = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).map(([r]) => r);
  const topReasons = [...new Set([...ranked, ...(agg.topReasons ?? [])])].slice(0, 3);
  const updated = { ...agg, counts, reasonCounts, topReasons, realVotes: (agg.realVotes ?? 0) + 1 };
  await put(updated);

  const total = counts.reduce((a, b) => a + b, 0);
  const avg = counts.reduce((acc, c, i) => acc + c * (i + 1), 0) / total;
  return {
    itemId,
    name: item.name,
    avgRating: Math.round(avg * 10) / 10,
    ratingCount: total,
    topReasons: topReasons.map((r) => REASONS.find((x) => x.id === r)?.label ?? r),
  };
}
