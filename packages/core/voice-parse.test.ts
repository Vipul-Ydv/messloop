import { test } from "node:test";
import assert from "node:assert/strict";
import { firstNumber, matchDish, matchDishes, parseAnswers } from "./voice-parse.ts";
import { ITEMS, MENU_ITEMS } from "./seed-data.ts";

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

test("the real menu: the longest dish name heard wins", () => {
  const all = [...ITEMS, ...MENU_ITEMS];
  assert.equal(matchDish("आज छोले भटूरे बने", all), "chole-bhature"); // not plain Chole
  assert.equal(matchDish("अरहर दाल बनी थी", all), "arhar-dal"); // not plain Daal
  assert.equal(matchDish("काले चने की दाल", all), "kale-chana-dal");
  assert.equal(matchDish("आज आलू बड़ी बनी", all), "aloo-badi");
  assert.equal(matchDish("आज रोटी बनी", all), "roti");
  assert.equal(matchDish("Aloo Paratha", all), "aloo-paratha"); // not plain Paratha
});

test("a whole meal: every dish heard, in the order spoken, overlaps resolved", () => {
  const all = [...ITEMS, ...MENU_ITEMS];
  assert.deepEqual(matchDishes("आज अरहर दाल, चावल और रोटी बनी", all), ["arhar-dal", "chawal", "roti"]);
  assert.deepEqual(matchDishes("छोले भटूरे और रायता", all), ["chole-bhature", "raita"]);
  assert.deepEqual(matchDishes("कुछ खास नहीं", all), []);
  const { fields } = parseAnswers({ dish: "राजमा चावल बना था" }, all);
  assert.equal(fields.itemId, "rajma");
  assert.deepEqual(fields.dishes, ["rajma", "chawal"]);
});

test("a full call: everything read by rules, nothing left for the model", () => {
  const { fields, unread } = parseAnswers({
    dish: "आज आलू गोभी बनी थी ।",
    prepared: "50 kg बना था ।",
    leftover: "23 किलो बचा",
    servings: "115 बच्चों ने खाया ।",
    reason: "सब्ज़ी ठंडी थी ।",
  }, ITEMS);
  assert.deepEqual(fields, { itemId: "aloo-gobi", dishes: ["aloo-gobi"], preparedQty: 50, leftoverQty: 23, servings: 115, reason: "सब्ज़ी ठंडी थी" });
  assert.deepEqual(unread, []);
});

test("number words are flagged as unread, skipped answers are not", () => {
  const { fields, unread } = parseAnswers({ dish: "छोले", prepared: "पचास किलो", servings: "" }, ITEMS);
  assert.equal(fields.preparedQty, null);
  assert.deepEqual(unread, ["prepared"]);
});
