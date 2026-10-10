import { test } from "node:test";
import assert from "node:assert/strict";
import { firstNumber, matchDish, parseAnswers } from "./voice-parse.ts";
import { ITEMS } from "./seed-data.ts";

test("digits as Transcribe writes them", () => {
  assert.equal(firstNumber("50 kg बना था ।"), 50);
  assert.equal(firstNumber("115 बच्चों ने खाया ।"), 115);
  assert.equal(firstNumber("13.5 किलो बचा"), 13.5);
});

test("Devanagari digits and 'saadhe'", () => {
  assert.equal(firstNumber("५० किलो"), 50);
  assert.equal(firstNumber("साढ़े 13 किलो बचा"), 13.5);
});

test("no number, or two numbers, is left for the worker", () => {
  assert.equal(firstNumber("पचास किलो"), null);
  assert.equal(firstNumber("50 या 52 किलो"), null);
});

test("dish names in Hindi or English", () => {
  assert.equal(matchDish("आज आलू गोभी बनी थी ।", ITEMS), "aloo-gobi");
  assert.equal(matchDish("छोले बने", ITEMS), "chole");
  assert.equal(matchDish("Mixed veg", ITEMS), "mixed-veg");
  assert.equal(matchDish("आज दाल बनी", ITEMS), null);
});

test("a full call: everything read by rules, nothing left for the model", () => {
  const { fields, unread } = parseAnswers({
    dish: "आज आलू गोभी बनी थी ।",
    prepared: "50 kg बना था ।",
    leftover: "23 किलो बचा",
    servings: "115 बच्चों ने खाया ।",
    reason: "सब्ज़ी ठंडी थी ।",
  }, ITEMS);
  assert.deepEqual(fields, { itemId: "aloo-gobi", preparedQty: 50, leftoverQty: 23, servings: 115, reason: "सब्ज़ी ठंडी थी" });
  assert.deepEqual(unread, []);
});

test("number words are flagged as unread, skipped answers are not", () => {
  const { fields, unread } = parseAnswers({ dish: "छोले", prepared: "पचास किलो", servings: "" }, ITEMS);
  assert.equal(fields.preparedQty, null);
  assert.deepEqual(unread, ["prepared"]);
});
