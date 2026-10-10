import { test } from "node:test";
import assert from "node:assert/strict";
import { parseModelJson, validateAiOutput, validateWasteInput } from "./validate.ts";
import { demoEvidence, goodAiAnswer } from "./fixtures.ts";
import { ITEMS } from "./seed-data.ts";

const aloo = ITEMS[0];
const valid = { date: "2026-10-08", period: "lunch", slotId: "lunch_dry_sabzi", itemId: "aloo-gobi", preparedQty: 50, leftoverQty: 23, unit: "kg", servings: 115 };

const fieldOf = (body: unknown, item = aloo) => {
  const r = validateWasteInput(body, item);
  return r.ok ? null : r.error.field;
};

// ---------------------------------------------------------------- waste records

test("a valid record passes", () => {
  const r = validateWasteInput(valid, aloo);
  assert.equal(r.ok, true);
});

test("leftover larger than prepared is rejected", () => {
  assert.equal(fieldOf({ ...valid, leftoverQty: 60 }), "leftoverQty");
});

test("zero or negative quantities are rejected", () => {
  assert.equal(fieldOf({ ...valid, preparedQty: 0 }), "preparedQty");
  assert.equal(fieldOf({ ...valid, servings: 0 }), "servings");
  assert.equal(fieldOf({ ...valid, leftoverQty: -1 }), "leftoverQty");
});

test("missing or non-numeric numbers are rejected", () => {
  const { servings, ...noServings } = valid;
  assert.equal(fieldOf(noServings), "servings");
  assert.equal(fieldOf({ ...valid, preparedQty: "50" }), "preparedQty");
  assert.equal(fieldOf({ ...valid, leftoverQty: Number.NaN }), "leftoverQty");
  assert.equal(fieldOf({ ...valid, servings: Number.POSITIVE_INFINITY }), "servings");
});

test("units are never mixed (R6)", () => {
  assert.equal(fieldOf({ ...valid, unit: "litre" }), "unit");
});

test("unknown item, bad date and bad period are rejected", () => {
  assert.equal(fieldOf(valid, null as any), "itemId");
  assert.equal(fieldOf({ ...valid, date: "2026-02-30" }), "date");
  assert.equal(fieldOf({ ...valid, date: "08-10-2026" }), "date");
  assert.equal(fieldOf({ ...valid, period: "brunch" }), "period");
});

test("leftover equal to prepared is allowed", () => {
  assert.equal(fieldOf({ ...valid, leftoverQty: 50 }), null);
});

// ---------------------------------------------------------------- AI output

const evidence = demoEvidence();
const errorsOf = (answer: unknown) => {
  const r = validateAiOutput(answer, evidence);
  return r.ok ? [] : r.error;
};

test("a rule-abiding answer passes, including 'per 100 servings' and 'out of 5'", () => {
  assert.deepEqual(errorsOf(goodAiAnswer()), []);
});

test("an invented number is rejected (R2)", () => {
  const a = goodAiAnswer();
  a.reasoning = "Switching would save about 40 kg each week.";
  assert.ok(errorsOf(a).some((e) => e.includes("40")));
});

test("a computed number not in the evidence is rejected", () => {
  const a = goodAiAnswer();
  a.supportingEvidence = ["Waste was 41.2% of what was cooked."]; // pooled % is not in the evidence
  assert.ok(errorsOf(a).length > 0);
});

test("rounding to one decimal is allowed", () => {
  const a = goodAiAnswer();
  a.supportingEvidence = ["The latest meal wasted 20 kg per 100 servings."]; // per100 = 20.0
  assert.deepEqual(errorsOf(a), []);
});

test("certainty language is rejected", () => {
  const a = goodAiAnswer();
  a.reasoning = "This will reduce waste.";
  assert.ok(errorsOf(a).some((e) => e.includes("will reduce")));
});

test("a replacement that is not a candidate is rejected", () => {
  const a = goodAiAnswer();
  a.suggestedAction = { ...a.suggestedAction, replacement: "Paneer" };
  assert.ok(errorsOf(a).some((e) => e.includes("replacement")));
});

test("the wrong target is rejected", () => {
  const a = goodAiAnswer();
  a.suggestedAction = { ...a.suggestedAction, target: "Chole" };
  assert.ok(errorsOf(a).some((e) => e.includes("target")));
});

test("requiresHumanApproval must be true", () => {
  const a: any = goodAiAnswer();
  a.requiresHumanApproval = false;
  assert.ok(errorsOf(a).some((e) => e.includes("requiresHumanApproval")));
});

test("an alternative that is not a candidate is rejected", () => {
  const a = goodAiAnswer();
  a.alternatives = [{ item: "Biryani", pros: [], cons: [] }];
  assert.ok(errorsOf(a).some((e) => e.includes("Biryani")));
});

test("a vote share attributed to the wrong dish is rejected", () => {
  const a = goodAiAnswer();
  a.supportingEvidence = ["Aloo Gobi received 61% of votes."]; // the flagged dish was never on the ballot
  assert.ok(errorsOf(a).some((e) => e.includes("vote")));
  const b = goodAiAnswer();
  b.supportingEvidence = ["Mixed Veg received 61% of votes."]; // 61% was Chole's
  assert.ok(errorsOf(b).some((e) => e.includes("vote")));
});

test("the right vote share for the right dish passes", () => {
  const a = goodAiAnswer();
  a.supportingEvidence = ["Mixed Veg received 27% of votes."];
  assert.deepEqual(errorsOf(a), []);
});

test("other numbers in a sentence about votes are not read as vote shares", () => {
  const a = goodAiAnswer();
  a.reasoning = "Chole has the most votes and at least 3 occurrences.";
  assert.deepEqual(errorsOf(a), []);
});

test("a false comparison between candidates is rejected", () => {
  const a = goodAiAnswer();
  a.alternatives = [{ item: "Mixed Veg", pros: ["Lower waste than Chole"], cons: [] }]; // 22% vs 14%
  assert.ok(errorsOf(a).some((e) => e.includes("comparison")));
  const b = goodAiAnswer();
  b.reasoning = "Mixed Veg has the most votes.";
  assert.ok(errorsOf(b).some((e) => e.includes("comparison")));
});

test("a true comparison passes", () => {
  const a = goodAiAnswer();
  a.reasoning = "Chole has the lowest waste and the most votes.";
  a.alternatives = [{ item: "Mixed Veg", pros: ["More votes than Soyabean Curry"], cons: ["Higher waste than Chole", "Lower rating than Chole"] }];
  assert.deepEqual(errorsOf(a), []);
});

test("each comparison is about the dish named just before it", () => {
  const a = goodAiAnswer();
  a.reasoning = "Soyabean Curry has fewer votes than Chole, while Chole has the most votes.";
  assert.deepEqual(errorsOf(a), []);
  const b = goodAiAnswer();
  b.reasoning = "Chole is liked, but Soyabean Curry has the most votes.";
  assert.ok(errorsOf(b).some((e) => e.includes("Soyabean Curry")));
});

test("action type and replacement must agree", () => {
  const a = goodAiAnswer();
  a.suggestedAction = { type: "replace", target: "Aloo Gobi", replacement: null as any };
  assert.ok(errorsOf(a).some((e) => e.includes("replace")));
  const b = goodAiAnswer();
  b.suggestedAction = { type: "reduce_quantity" as any, target: "Aloo Gobi", replacement: "Mixed Veg" };
  assert.ok(errorsOf(b).some((e) => e.includes("replacement")));
});

test("a candidate with fewer than 3 occurrences cannot be the replacement", () => {
  const e = demoEvidence();
  e.candidates = e.candidates.map((c) => (c.itemId === "soyabean-curry" ? { ...c, occurrences: 2 } : c));
  const a = goodAiAnswer();
  a.suggestedAction = { type: "replace", target: "Aloo Gobi", replacement: "Soyabean Curry" };
  const r = validateAiOutput(a, e);
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.error.some((x) => x.includes("fewer than 3")));
});

test("missing fields are rejected", () => {
  const { reasoning, ...rest } = goodAiAnswer();
  assert.ok(errorsOf(rest).length > 0);
});

test("JSON wrapped in prose or code fences is still parsed, then fully validated", () => {
  const wrapped = "Here you go:\n```json\n" + JSON.stringify(goodAiAnswer()) + "\n```";
  assert.deepEqual(errorsOf(wrapped), []);
  assert.throws(() => parseModelJson("no json here"));
  assert.ok(errorsOf("not json").length > 0);
});
