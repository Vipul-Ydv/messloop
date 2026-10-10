import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFallback } from "./fallback.ts";
import { validateAiOutput } from "./validate.ts";
import { demoEvidence } from "./fixtures.ts";

test("template recommends the highest-voted candidate with enough history", () => {
  const f = buildFallback(demoEvidence());
  assert.equal(f.problem, "Aloo Gobi exceeded 35% waste in 5 of its last 5 occurrences.");
  assert.deepEqual(f.suggestedAction, { type: "replace", target: "Aloo Gobi", replacement: "Chole" });
  assert.equal(f.requiresHumanApproval, true);
  assert.ok(f.supportingEvidence.includes("Pooled waste: 18.2 kg per 100 servings."));
  assert.ok(f.supportingEvidence.includes("Highest-voted alternative: Chole (61%)."));
});

test("without votes the template investigates instead of guessing", () => {
  const f = buildFallback(demoEvidence(false));
  assert.deepEqual(f.suggestedAction, { type: "investigate", target: "Aloo Gobi", replacement: null });
  assert.equal(f.reasoning, "Based on repeated high waste. Review required.");
});

test("the template itself passes the same validation as the model", () => {
  const e = demoEvidence();
  const r = validateAiOutput(buildFallback(e), e);
  assert.equal(r.ok, true, r.ok ? "" : r.error.join("; "));
});
