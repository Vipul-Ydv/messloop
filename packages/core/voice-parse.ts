// Reads the voice call's transcribed answers into form fields with plain rules. Amazon
// Transcribe usually writes numbers as digits ("50 kg बना था", "115 बच्चों"), so most
// answers need no model at all. Whatever a rule cannot read is left null; the caller may
// then ask the model, and the worker always checks the form before saving.

export interface ParsedFields {
  itemId: string | null;
  preparedQty: number | null;
  leftoverQty: number | null;
  servings: number | null;
  reason: string | null;
}

/** Spoken names for the demo hostel's dishes, as Hindi speech-to-text tends to write them. */
export const DISH_ALIASES: Record<string, string[]> = {
  "aloo-gobi": ["आलू गोभी", "आलू गोबी", "आलू-गोभी", "aloo gobi", "alu gobi"],
  chole: ["छोले", "छोला", "चने", "chole", "chhole"],
  "mixed-veg": ["मिक्स वेज", "मिक्स्ड वेज", "मिक्स सब्ज़ी", "मिक्स सब्जी", "mix veg", "mixed veg"],
  "soyabean-curry": ["सोयाबीन", "सोया बीन", "सोया", "soyabean", "soya"],
};

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

function normaliseDigits(text: string): string {
  return [...text].map((ch) => {
    const d = DEVANAGARI_DIGITS.indexOf(ch);
    return d === -1 ? ch : String(d);
  }).join("");
}

/**
 * The first number in an answer, or null. "साढ़े 13" (13 and a half) and "13.5" both read
 * as 13.5. More than one number ("50 या 52") is ambiguous, so it is left for the worker.
 */
export function firstNumber(text: string): number | null {
  const t = normaliseDigits(text).replace(/(\d),(\d{3})\b/g, "$1$2");
  const all = [...t.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(",", ".")));
  if (all.length !== 1) return null;
  const n = all[0];
  if (!Number.isFinite(n) || n < 0) return null;
  return /साढ़े|साढे/.test(t) && Number.isInteger(n) ? n + 0.5 : n;
}

export function matchDish(text: string, items: { itemId: string; name: string }[]): string | null {
  const t = text.toLowerCase();
  const hits = items.filter((i) => [i.name.toLowerCase(), ...(DISH_ALIASES[i.itemId] ?? [])].some((a) => t.includes(a.toLowerCase())));
  return hits.length === 1 ? hits[0].itemId : null;
}

export function parseAnswers(transcripts: Record<string, string>, items: { itemId: string; name: string }[]) {
  const fields: ParsedFields = {
    itemId: transcripts.dish ? matchDish(transcripts.dish, items) : null,
    preparedQty: transcripts.prepared ? firstNumber(transcripts.prepared) : null,
    leftoverQty: transcripts.leftover ? firstNumber(transcripts.leftover) : null,
    servings: transcripts.servings ? firstNumber(transcripts.servings) : null,
    reason: transcripts.reason?.trim() ? transcripts.reason.replace(/[।.]\s*$/, "").trim().slice(0, 200) : null,
  };
  if (fields.servings !== null && !Number.isInteger(fields.servings)) fields.servings = null;
  // Fields the worker answered but no rule could read: worth asking the model about.
  const unread = (["dish", "prepared", "leftover", "servings"] as const).filter((q) => {
    const key = q === "dish" ? "itemId" : q === "prepared" ? "preparedQty" : q === "leftover" ? "leftoverQty" : "servings";
    return transcripts[q]?.trim() && fields[key] === null;
  });
  return { fields, unread };
}
