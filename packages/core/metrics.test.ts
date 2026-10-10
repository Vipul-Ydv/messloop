// Golden vectors from the spec (§7.4). These values are hand-checkable with a calculator;
// "close enough" is not accepted (§14.2).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  absoluteChange, co2eEstimate, consumptionPerServing, direction, estimatedFoodSaved, platesEquivalent,
  pooledPct, pooledPer100, reductionPct, round, sum, wastePct, wastePer100,
} from "./metrics.ts";
import { ALOO_GOBI, POST_CHOLE } from "./seed-data.ts";

const EXPECTED = [
  { wastePct: 39.58, per100: 17.27, consumption: 0.2636 },
  { wastePct: 42.0, per100: 17.8, consumption: 0.2458 },
  { wastePct: 36.0, per100: 17.65, consumption: 0.3137 },
  { wastePct: 42.31, per100: 18.33, consumption: 0.25 },
  { wastePct: 46.0, per100: 20.0, consumption: 0.2348 },
];

test("each Aloo Gobi record matches its golden row", () => {
  ALOO_GOBI.forEach((r, i) => {
    assert.equal(round(wastePct(r.preparedQty, r.leftoverQty), 2), EXPECTED[i].wastePct, `wastePct row ${i}`);
    assert.equal(round(wastePer100(r.leftoverQty, r.servings), 2), EXPECTED[i].per100, `per100 row ${i}`);
    assert.equal(round(consumptionPerServing(r.preparedQty, r.leftoverQty, r.servings), 4), EXPECTED[i].consumption, `consumption row ${i}`);
  });
});

test("sums are 103 / 565 / 250", () => {
  assert.equal(sum(ALOO_GOBI.map((r) => r.leftoverQty)), 103);
  assert.equal(sum(ALOO_GOBI.map((r) => r.servings)), 565);
  assert.equal(sum(ALOO_GOBI.map((r) => r.preparedQty)), 250);
});

test("pooled baseline is 18.23 per 100 servings and 41.20%", () => {
  assert.equal(round(pooledPer100(ALOO_GOBI), 2), 18.23);
  assert.equal(round(pooledPct(ALOO_GOBI), 2), 41.2);
});

test("pooled is not the average of ratios", () => {
  const avgOfRatios = ALOO_GOBI.reduce((a, r) => a + wastePer100(r.leftoverQty, r.servings), 0) / ALOO_GOBI.length;
  assert.notEqual(round(avgOfRatios, 4), round(pooledPer100(ALOO_GOBI), 4));
});

test("post-intervention Chole: −6.98, 38.29%, decreased, 8.38 kg saved", () => {
  const base = pooledPer100(ALOO_GOBI);
  const post = wastePer100(POST_CHOLE.leftoverQty, POST_CHOLE.servings);
  assert.equal(round(wastePct(POST_CHOLE.preparedQty, POST_CHOLE.leftoverQty), 2), 27.0);
  assert.equal(round(post, 2), 11.25);
  const change = absoluteChange(post, base);
  assert.equal(round(change, 2), -6.98);
  assert.equal(round(reductionPct(base, post)!, 2), 38.29);
  assert.equal(direction(change, base), "decreased");
  assert.equal(round(estimatedFoodSaved(base, post, POST_CHOLE.servings), 2), 8.38);
});

test("food saved as plates and as estimated CO2e (golden)", () => {
  // 8.376 kg saved ÷ (36.5 kg eaten / 120 plates) = 27.54 plates; × 3.3/1.3 = 21.26 kg CO2e
  const saved = estimatedFoodSaved(18.230088495575224, 11.25, POST_CHOLE.servings);
  assert.equal(round(platesEquivalent(saved, [POST_CHOLE])!, 2), 27.54);
  assert.equal(round(co2eEstimate(saved), 2), 21.26);
});

test("plates equivalent is null when nothing was eaten", () => {
  assert.equal(platesEquivalent(5, [{ preparedQty: 10, leftoverQty: 10, servings: 50 }]), null);
  assert.equal(platesEquivalent(5, []), null);
});

test("zero baseline: reduction is null, never divided by zero (R8)", () => {
  assert.equal(reductionPct(0, 5), null);
  assert.equal(absoluteChange(5, 0), 5);
  assert.equal(direction(5, 0), "increased");
});

test("a change within 5% of baseline is 'similar'", () => {
  assert.equal(direction(-0.5, 20), "similar");
  assert.equal(direction(1, 20), "similar");
  assert.equal(direction(1.01, 20), "increased");
});

test("pooled helpers do not divide by zero on empty input", () => {
  assert.equal(pooledPer100([]), 0);
  assert.equal(pooledPct([]), 0);
});
