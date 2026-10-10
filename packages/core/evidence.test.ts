import { test } from "node:test";
import assert from "node:assert/strict";
import { demoEvidence } from "./fixtures.ts";
import { ratingStats } from "./evidence.ts";
import { RATINGS } from "./seed-data.ts";

test("evidence carries the golden baseline and rule result", () => {
  const e = demoEvidence();
  assert.equal(e.pooledBaselinePer100, 18.23);
  assert.deepEqual(e.rule, { exceeded: 5, of: 5 });
  assert.equal(e.history.length, 5);
  assert.equal(e.history[0].date, "2026-09-12"); // oldest first
  assert.equal(e.history[4].wastePct, 46);
});

test("ratings: Aloo Gobi 2.13 from 38", () => {
  const e = demoEvidence();
  assert.equal(e.avgRating, 2.13);
  assert.equal(e.ratingCount, 38);
  assert.deepEqual(e.topReasons, ["taste", "repeated"]);
});

test("rating averages match the seed table", () => {
  const avg = (id: string) => Math.round(ratingStats(RATINGS.find((r) => r.itemId === id)!).avg! * 100) / 100;
  assert.equal(avg("chole"), 4.13);
  assert.equal(avg("mixed-veg"), 3.4);
  assert.equal(avg("soyabean-curry"), 3);
});

test("candidates: occurrences, average waste and votes", () => {
  const c = Object.fromEntries(demoEvidence().candidates.map((x) => [x.itemId, x]));
  assert.equal(c.chole.occurrences, 6);
  assert.equal(c.chole.avgWastePct, 14);
  assert.equal(c["mixed-veg"].avgWastePct, 22);
  assert.equal(c["soyabean-curry"].avgWastePct, 19);
  assert.equal(c["soyabean-curry"].occurrences, 3);
  assert.equal(c.chole.votePct, 61);
});

test("strength: strong with student signals, moderate without", () => {
  assert.equal(demoEvidence(true).evidenceStrength, "strong");
  assert.equal(demoEvidence(false).evidenceStrength, "moderate");
});

test("cost and nutrition are 'unknown' unless given", () => {
  assert.deepEqual(demoEvidence().constraints, { cost: "unknown", nutrition: "unknown" });
});
