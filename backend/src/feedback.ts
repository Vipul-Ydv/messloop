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
    items: items.map((i: any) => ({ itemId: i.itemId, name: i.name, hindi: i.hindi, meals: i.meals ?? [] })).sort((a: any, b: any) => a.name.localeCompare(b.name)),
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

  // Optional: what should be made instead — another dish we cook (a vote), or an idea in their words.
  const instead = typeof body?.instead === "string" && body.instead ? body.instead : null;
  if (instead && (instead === itemId || !(await get(HPK, `ITEM#${instead}`)))) {
    throw new HttpError(400, "VALIDATION_ERROR", "Pick another dish from the list.", "instead");
  }
  const idea = typeof body?.idea === "string" ? body.idea.trim().replace(/\s+/g, " ").slice(0, 60) : "";

  const at = new Date().toISOString();
  await put({ PK: HPK, SK: `FEEDBACK#${at}#${itemId}`, itemId, rating, reasons, instead, idea: idea || undefined, createdAt: at, isSimulated: false });
  const poll = instead ? await voteInstead(itemId, instead) : null;
  if (idea) await put({ PK: HPK, SK: `IDEA#${at}#${itemId}`, itemId, text: idea, createdAt: at, isSimulated: false });

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
    poll,
  };
}

/**
 * A vote for what should replace a dish. It lands in the same poll the agent reads as
 * evidence. A new poll lists every other dish we cook, so one vote never narrows the
 * agent's options to a single dish.
 */
async function voteInstead(itemId: string, instead: string) {
  const SK = `POLL#replace-${itemId}`;
  let poll = await get(HPK, SK);
  if (!poll) {
    // Options: dishes served at the same meal, so the agent compares like with like.
    const all = await query(HPK, "ITEM#");
    const meals: string[] = all.find((i: any) => i.itemId === itemId)?.meals ?? [];
    const sameMeal = all.filter((i: any) => i.itemId !== itemId && (!meals.length || (i.meals ?? []).some((x: string) => meals.includes(x))));
    const others = [...new Set([...sameMeal.map((i: any) => i.itemId), instead])];
    poll = { PK: HPK, SK, pollId: `replace-${itemId}`, targetItemId: itemId, counts: Object.fromEntries(others.map((id: string) => [id, 0])), isSimulated: false };
  }
  const counts = { ...poll.counts, [instead]: (poll.counts?.[instead] ?? 0) + 1 };
  await put({ ...poll, counts, realVotes: (poll.realVotes ?? 0) + 1 });
  const total = Object.values(counts).reduce((a: number, b) => a + (b as number), 0) as number;
  return { instead, sharePct: Math.round((counts[instead] / total) * 100), votes: total };
}

/** For the manager: votes for what should replace each dish, and students' own ideas. */
export async function suggestions() {
  const [polls, ideas, items] = await Promise.all([query(HPK, "POLL#"), query(HPK, "IDEA#"), query(HPK, "ITEM#")]);
  const name = (id: string) => items.find((i: any) => i.itemId === id)?.name ?? id;
  const grouped = new Map<string, { text: string; count: number; forItem: string }>();
  for (const i of ideas) {
    const key = `${i.itemId}|${String(i.text).toLowerCase()}`;
    const g = grouped.get(key) ?? { text: i.text, count: 0, forItem: name(i.itemId) };
    g.count += 1;
    grouped.set(key, g);
  }
  return {
    polls: polls.map((p: any) => {
      const total = Object.values(p.counts as Record<string, number>).reduce((a, b) => a + b, 0);
      return {
        targetItemId: p.targetItemId,
        target: name(p.targetItemId),
        totalVotes: total,
        realVotes: p.realVotes ?? (p.isSimulated ? 0 : total),
        isSimulated: !!p.isSimulated,
        options: Object.entries(p.counts as Record<string, number>)
          .map(([id, n]) => ({ itemId: id, name: name(id), votes: n, pct: total ? Math.round((n / total) * 100) : 0 }))
          .sort((a, b) => b.votes - a.votes),
      };
    }).filter((p: any) => p.totalVotes > 0),
    ideas: [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, 12),
  };
}
