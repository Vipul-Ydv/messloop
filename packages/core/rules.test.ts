import { test } from "node:test";
import assert from "node:assert/strict";
import { evidenceStrength, recurringWaste } from "./rules.ts";
import { withMetrics } from "./metrics.ts";
import { ALOO_GOBI } from "./seed-data.ts";

const newestFirst = [...ALOO_GOBI].reverse().map(withMetrics);

test("Aloo Gobi: 5 of 5 over 35% → alert", () => {
  assert.deepEqual(recurringWaste(newestFirst, 35), { n: 5, exceeded: 5, alert: true });
});

test("only the last 5 records count", () => {
  const six = [{ wastePct: 10 }, ...newestFirst];
  assert.deepEqual(recurringWaste(six, 35), { n: 5, exceeded: 4, alert: true });
});

test("fewer than 3 records never alerts", () => {
  assert.equal(recurringWaste([{ wastePct: 90 }, { wastePct: 90 }], 35).alert, false);
});

test("exactly at the threshold does not count as exceeded", () => {
  assert.equal(recurringWaste([{ wastePct: 35 }, { wastePct: 35 }, { wastePct: 35 }], 35).exceeded, 0);
});

test("evidence strength table (§7.3)", () => {
  const none = { ratingCount: 0, avgRating: null, topVoteShare: null };
  assert.equal(evidenceStrength({ n: 2, exceeded: 2, ...none }), "insufficient");
  assert.equal(evidenceStrength({ n: 3, exceeded: 3, ...none }), "limited");
  assert.equal(evidenceStrength({ n: 4, exceeded: 3, ...none }), "limited"); // 0.75 < 0.8
  assert.equal(evidenceStrength({ n: 5, exceeded: 4, ...none }), "moderate"); // 0.8
  assert.equal(evidenceStrength({ n: 5, exceeded: 5, ...none }), "moderate");
  assert.equal(evidenceStrength({ n: 5, exceeded: 5, ratingCount: 38, avgRating: 2.13, topVoteShare: 61 }), "strong");
});

test("strong needs every student signal, not just some", () => {
  assert.equal(evidenceStrength({ n: 5, exceeded: 5, ratingCount: 9, avgRating: 2.13, topVoteShare: 61 }), "moderate");
  assert.equal(evidenceStrength({ n: 5, exceeded: 5, ratingCount: 38, avgRating: 2.6, topVoteShare: 61 }), "moderate");
  assert.equal(evidenceStrength({ n: 5, exceeded: 5, ratingCount: 38, avgRating: 2.13, topVoteShare: 49 }), "moderate");
});
