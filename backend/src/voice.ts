// Voice call: the app asks mess staff the day's questions out loud in Hindi (Amazon
// Polly), each answer is transcribed as it ends (Amazon Transcribe streaming, hi-IN),
// and rules — or, if needed, our model — read the numbers. Nothing is saved from here,
// and no recording is stored: the worker sees the filled form and confirms it, because
// speech-to-text can mishear "23" as "30" (R15).

import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { StartStreamTranscriptionCommand, TranscribeStreamingClient } from "@aws-sdk/client-transcribe-streaming";
import { parseAnswers } from "../../packages/core/voice-parse.ts";
import { HPK, query } from "./db.ts";
import { HttpError } from "./http.ts";
import { chat } from "./agent.ts";

const polly = new PollyClient({});
const streaming = new TranscribeStreamingClient({});

export const QUESTIONS = [
  { id: "dish", text: "नमस्ते! आज कौन सी सब्ज़ी बनी?", english: "Hello! Which sabzi was made today?" },
  { id: "prepared", text: "कुल कितने किलो बना था?", english: "How many kg was cooked in total?" },
  { id: "leftover", text: "सर्विस के बाद बर्तनों में कितने किलो बचा?", english: "After service, how many kg were left in the vessels?" },
  { id: "servings", text: "आज कितने बच्चों ने खाया? यानी कितनी प्लेटें गईं?", english: "How many students ate today, that is, how many plates went out?" },
  { id: "reason", text: "आपके हिसाब से खाना क्यों बचा?", english: "Why do you think food was left over?" },
] as const;

type QuestionId = (typeof QUESTIONS)[number]["id"];

// Spoken prompts barely change, so each warm Lambda synthesises them once.
let promptCache: { id: string; text: string; english: string; audio: string }[] | null = null;

export async function prompts() {
  if (promptCache) return { questions: promptCache };
  promptCache = await Promise.all(QUESTIONS.map(async (q) => {
    const out = await polly.send(new SynthesizeSpeechCommand({ Text: q.text, VoiceId: "Kajal", Engine: "neural", LanguageCode: "hi-IN", OutputFormat: "mp3" }));
    const bytes = await out.AudioStream!.transformToByteArray();
    return { ...q, audio: Buffer.from(bytes).toString("base64") };
  }));
  return { questions: promptCache };
}

interface Fields { itemId: string | null; preparedQty: number | null; leftoverQty: number | null; servings: number | null; reason: string | null }

/** Our model turns the answers into form fields. Anything it can't read stays empty for the worker. */
async function extract(transcripts: Record<string, string>, items: { itemId: string; name: string }[]): Promise<{ fields: Fields; source: "ai" | "none"; note?: string }> {
  const empty: Fields = { itemId: null, preparedQty: null, leftoverQty: null, servings: null, reason: null };
  if (!Object.values(transcripts).some((t) => t.trim())) return { fields: empty, source: "none", note: "Nothing was heard. Please fill the form." };
  try {
    const data = await chat({
      model: process.env.AI_MODEL ?? "qwen3-4b",
      temperature: 0,
      max_tokens: 150,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        {
          role: "system",
          content: "You read a hostel mess worker's spoken answers (Hindi, written by speech-to-text) and fill a form. Convert Hindi number words to digits (पचास = 50, साढ़े तेरह = 13.5). Pick itemId only from the list, matching the dish even if spelled in Hindi; otherwise null. Use null for anything not clearly said. Never guess. reason: a short English summary of why food was left, or null.",
        },
        { role: "user", content: JSON.stringify({ dishes: items, answers: transcripts }) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "waste_form",
          schema: {
            type: "object",
            properties: {
              itemId: { type: ["string", "null"], enum: [...items.map((i) => i.itemId), null] },
              preparedQty: { type: ["number", "null"] },
              leftoverQty: { type: ["number", "null"] },
              servings: { type: ["integer", "null"] },
              reason: { type: ["string", "null"] },
            },
            required: ["itemId", "preparedQty", "leftoverQty", "servings", "reason"],
          },
        },
      },
    }, 22_000);
    const f = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
    return {
      source: "ai",
      fields: {
        itemId: items.some((i) => i.itemId === f.itemId) ? f.itemId : null,
        preparedQty: num(f.preparedQty),
        leftoverQty: num(f.leftoverQty),
        servings: num(f.servings),
        reason: typeof f.reason === "string" && f.reason.trim() ? f.reason.trim().slice(0, 200) : null,
      },
    };
  } catch (e: any) {
    return { fields: empty, source: "none", note: e?.name === "AbortError" ? "Our model took too long. Please fill the form from what you said." : "Could not read the answers. Please fill the form." };
  }
}

// The call sends each answer the moment it ends, while the next question is playing, so
// by the time the worker hangs up most answers are already text. Streaming transcription
// takes about as long as the answer itself; batch jobs took 10-15 s each. Answers arrive
// as 16 kHz mono PCM and are never stored.

const MAX_PCM_BYTES = 16000 * 2 * 25; // 25 s of 16-bit mono audio

export async function transcribeAnswer(body: any) {
  const q = QUESTIONS.find((x) => x.id === body?.questionId);
  if (!q) throw new HttpError(400, "VALIDATION_ERROR", "Unknown questionId.", "questionId");
  const pcm = Buffer.from(String(body?.pcmBase64 ?? ""), "base64");
  if (pcm.length === 0 || pcm.length > MAX_PCM_BYTES) throw new HttpError(400, "VALIDATION_ERROR", "The answer must be a short recording.", "pcmBase64");

  const started = Date.now();
  async function* audio() {
    for (let i = 0; i < pcm.length; i += 8192) yield { AudioEvent: { AudioChunk: pcm.subarray(i, i + 8192) } };
  }
  const res = await streaming.send(new StartStreamTranscriptionCommand({
    LanguageCode: "hi-IN",
    MediaEncoding: "pcm",
    MediaSampleRateHertz: 16000,
    AudioStream: audio(),
  }));
  const parts: string[] = [];
  for await (const ev of res.TranscriptResultStream ?? []) {
    for (const r of ev.TranscriptEvent?.Transcript?.Results ?? []) {
      if (!r.IsPartial && r.Alternatives?.[0]?.Transcript) parts.push(r.Alternatives[0].Transcript);
    }
  }
  const text = parts.join(" ").trim();
  console.log(JSON.stringify({ event: "voice_transcribed", questionId: q.id, ms: Date.now() - started, chars: text.length }));
  return { questionId: q.id, text };
}

/** Rules read what they can (usually everything); the model is asked only about the rest. */
export async function extractAnswers(body: any) {
  const raw = body?.transcripts && typeof body.transcripts === "object" ? body.transcripts : {};
  const transcripts: Record<string, string> = {};
  for (const q of QUESTIONS) if (typeof raw[q.id] === "string") transcripts[q.id] = raw[q.id].slice(0, 500);

  const items = (await query(HPK, "ITEM#")).map((i: any) => ({ itemId: i.itemId, name: i.name }));
  const { fields, unread } = parseAnswers(transcripts, items);
  if (unread.length === 0) return { fields, source: "rules" };

  const model = await extract(transcripts, items);
  const key = { dish: "itemId", prepared: "preparedQty", leftover: "leftoverQty", servings: "servings" } as const;
  const merged = { ...fields };
  for (const q of unread) (merged as any)[key[q]] = (model.fields as any)[key[q]];
  return { fields: merged, source: model.source === "ai" ? "rules+ai" : "rules", note: model.note };
}
