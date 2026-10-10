// Voice log: the app asks mess staff the day's questions out loud in Hindi (Amazon
// Polly), records each answer, turns it into text (Amazon Transcribe, hi-IN), and our
// model pulls out the numbers. Nothing is saved from here: the worker sees the filled
// form and confirms it, because speech-to-text can mishear "50" as "15" (R15).

import { randomUUID } from "node:crypto";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DeleteTranscriptionJobCommand, GetTranscriptionJobCommand, StartTranscriptionJobCommand, TranscribeClient } from "@aws-sdk/client-transcribe";
import { HPK, get, put, query } from "./db.ts";
import { HttpError } from "./http.ts";
import { chat } from "./agent.ts";

const polly = new PollyClient({});
const s3 = new S3Client({});
const transcribe = new TranscribeClient({});

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

const FORMATS: Record<string, string> = { webm: "webm", ogg: "ogg", mp4: "mp4", m4a: "m4a", mpeg: "mp3", mp3: "mp3", wav: "wav", "x-wav": "wav" };
const MAX_CLIP_BYTES = 1_500_000; // about a minute and a half of compressed speech

/** Stores the recorded answers and starts one Hindi transcription job per answer. */
export async function startSession(body: any) {
  const clips: any[] = Array.isArray(body?.clips) ? body.clips : [];
  if (clips.length === 0 || clips.length > QUESTIONS.length) throw new HttpError(400, "VALIDATION_ERROR", "Send between 1 and 5 recorded answers.", "clips");
  const bucket = process.env.VOICE_BUCKET;
  if (!bucket) throw new HttpError(503, "UNAVAILABLE", "Voice log is not configured.");

  const sessionId = randomUUID();
  // Check every clip first, then upload and start all transcriptions in parallel.
  const prepared = clips.map((c, i) => {
    const q = QUESTIONS.find((x) => x.id === c?.questionId);
    if (!q) throw new HttpError(400, "VALIDATION_ERROR", "Unknown questionId.", "clips");
    const sub = String(c.mime ?? "").split(";")[0].split("/")[1] ?? "";
    const format = FORMATS[sub];
    if (!format) throw new HttpError(400, "VALIDATION_ERROR", `Unsupported audio type ${c.mime}.`, "clips");
    const bytes = Buffer.from(String(c.audioBase64 ?? ""), "base64");
    if (bytes.length === 0 || bytes.length > MAX_CLIP_BYTES) throw new HttpError(400, "VALIDATION_ERROR", "Each answer must be a short recording.", "clips");
    return { questionId: q.id as QuestionId, format, bytes, mime: String(c.mime), key: `voice/${sessionId}/${q.id}.${format}`, jobName: `messloop-${sessionId}-${i}` };
  });
  await Promise.all(prepared.map(async (c) => {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: c.key, Body: c.bytes, ContentType: c.mime }));
    await transcribe.send(new StartTranscriptionJobCommand({
      TranscriptionJobName: c.jobName,
      LanguageCode: "hi-IN",
      MediaFormat: c.format as any,
      Media: { MediaFileUri: `s3://${bucket}/${c.key}` },
    }));
  }));
  const jobs = prepared.map(({ questionId, jobName, key }) => ({ questionId, jobName, key }));
  await put({ PK: HPK, SK: `VOICE#${sessionId}`, sessionId, status: "transcribing", jobs, createdAt: new Date().toISOString() });
  return { sessionId };
}

/** Polled by the app. Once every answer is text, our model extracts the form fields once. */
export async function getSession(sessionId: string) {
  const s = await get(HPK, `VOICE#${sessionId}`);
  if (!s) throw new HttpError(404, "NOT_FOUND", "No such voice log.");
  if (s.status !== "transcribing") return publicSession(s);

  const transcripts: Record<string, string> = {};
  for (const j of s.jobs) {
    const out = await transcribe.send(new GetTranscriptionJobCommand({ TranscriptionJobName: j.jobName }));
    const job = out.TranscriptionJob;
    if (job?.TranscriptionJobStatus === "IN_PROGRESS" || job?.TranscriptionJobStatus === "QUEUED") return { sessionId, status: "transcribing" };
    if (job?.TranscriptionJobStatus === "COMPLETED" && job.Transcript?.TranscriptFileUri) {
      const data: any = await (await fetch(job.Transcript.TranscriptFileUri)).json();
      transcripts[j.questionId] = data?.results?.transcripts?.[0]?.transcript ?? "";
    } else {
      transcripts[j.questionId] = "";
    }
  }

  // Recordings are only needed until they are text.
  const bucket = process.env.VOICE_BUCKET;
  await Promise.all(s.jobs.map(async (j: any) => {
    await transcribe.send(new DeleteTranscriptionJobCommand({ TranscriptionJobName: j.jobName })).catch(() => {});
    if (bucket) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: j.key })).catch(() => {});
  }));

  const items = (await query(HPK, "ITEM#")).map((i: any) => ({ itemId: i.itemId, name: i.name, unit: i.unit }));
  const extraction = await extract(transcripts, items);
  const done = { ...s, status: "done", transcripts, fields: extraction.fields, extractionSource: extraction.source, extractionNote: extraction.note };
  await put(done);
  return publicSession(done);
}

function publicSession(s: any) {
  return { sessionId: s.sessionId, status: s.status, transcripts: s.transcripts ?? {}, fields: s.fields ?? {}, extractionSource: s.extractionSource, extractionNote: s.extractionNote };
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
