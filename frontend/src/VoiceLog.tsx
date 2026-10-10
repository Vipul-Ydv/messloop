// Voice log: the app asks each question out loud in Hindi, the worker answers, and the
// answers come back as a filled form. Nothing is saved here — the worker checks the form
// and presses Save, because speech-to-text can mishear numbers.

import { useEffect, useRef, useState } from "react";
import { api } from "./api.ts";

interface Question { id: string; text: string; english: string; audio: string }
export interface VoiceFields { itemId: string | null; preparedQty: number | null; leftoverQty: number | null; servings: number | null; reason: string | null }
export interface VoiceResult { fields: VoiceFields; transcripts: Record<string, string>; note?: string }

type Phase = "loading" | "speaking" | "ready" | "recording" | "uploading" | "transcribing" | "error";

const pickMime = () =>
  ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

export default function VoiceLog({ onResult, onCancel }: { onResult: (r: VoiceResult) => void; onCancel: () => void }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const clips = useRef<{ questionId: string; blob: Blob; mime: string }[]>([]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const cancelled = useRef(false);

  const stopEverything = () => {
    audio.current?.pause();
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
  };

  // Microphone permission first, then the spoken questions.
  useEffect(() => {
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !pickMime()) throw new Error("This browser cannot record audio. Please use the form.");
        stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        const p = await api<{ questions: Question[] }>("GET", "/voice/prompts");
        if (cancelled.current) return;
        setQuestions(p.questions);
        setPhase("speaking");
      } catch (e: any) {
        setError(e?.name === "NotAllowedError" ? "Microphone permission was blocked. Allow it, or use the form." : e?.message ?? "Voice log is not available. Please use the form.");
        setPhase("error");
      }
    })();
    return () => { cancelled.current = true; stopEverything(); };
  }, []);

  // Each question is spoken, then the worker can answer.
  useEffect(() => {
    if (phase !== "speaking" || !questions[index]) return;
    const a = new Audio(`data:audio/mpeg;base64,${questions[index].audio}`);
    audio.current = a;
    a.onended = () => setPhase("ready");
    a.play().catch(() => setPhase("ready")); // autoplay blocked: the text is on screen anyway
    return () => a.pause();
  }, [phase, index, questions]);

  useEffect(() => {
    if (phase !== "recording") return;
    setSeconds(0);
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  function startAnswer() {
    const mime = pickMime();
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream.current!, { mimeType: mime });
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      clips.current = clips.current.filter((c) => c.questionId !== questions[index].id);
      clips.current.push({ questionId: questions[index].id, blob: new Blob(chunks, { type: mime }), mime });
      next();
    };
    recorder.current = r;
    r.start();
    setPhase("recording");
  }

  function next() {
    if (index + 1 < questions.length) {
      setIndex((i) => i + 1);
      setPhase("speaking");
    } else {
      finish();
    }
  }

  async function finish() {
    stream.current?.getTracks().forEach((t) => t.stop());
    if (clips.current.length === 0) { onCancel(); return; }
    setPhase("uploading");
    try {
      const body = { clips: await Promise.all(clips.current.map(async (c) => ({ questionId: c.questionId, mime: c.mime, audioBase64: await toBase64(c.blob) }))) };
      const { sessionId } = await api<{ sessionId: string }>("POST", "/voice/sessions", body);
      setPhase("transcribing");
      // Poll one request at a time: the last step (our model reading the answers) takes a few seconds.
      for (let tries = 0; tries < 40 && !cancelled.current; tries++) {
        await new Promise((r) => setTimeout(r, 3000));
        const s = await api<{ status: string; fields: VoiceFields; transcripts: Record<string, string>; extractionNote?: string }>("GET", `/voice/sessions/${sessionId}`);
        if (s.status === "done") { onResult({ fields: s.fields, transcripts: s.transcripts, note: s.extractionNote }); return; }
      }
      throw new Error("Taking too long. Please use the form.");
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Please use the form.");
      setPhase("error");
    }
  }

  const q = questions[index];
  return (
    <section className="card" aria-live="polite" style={{ gap: 16, borderLeft: "6px solid var(--brand)" }}>
      <div className="row between">
        <h2>🎙 Voice log</h2>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 40 }} onClick={() => { cancelled.current = true; stopEverything(); onCancel(); }}>Use the form instead</button>
      </div>

      {phase === "loading" && <p className="muted row"><span className="spinner" aria-hidden="true" /> Getting the microphone and questions ready…</p>}
      {phase === "error" && <p className="note note-bad" role="alert">{error}</p>}

      {q && ["speaking", "ready", "recording"].includes(phase) && (
        <>
          <p className="small muted">Question {index + 1} of {questions.length}</p>
          <p style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.3 }} lang="hi">{q.text}</p>
          <p className="muted">{q.english}</p>
          <div className="row">
            {phase === "speaking" && <p className="muted row running"><span aria-hidden="true">🔊</span> Listening to the question…</p>}
            {phase === "ready" && (
              <>
                <button type="button" className="btn" style={{ minHeight: 64, fontSize: 20, padding: "0 28px" }} onClick={startAnswer}>🎙 Answer</button>
                <button type="button" className="btn btn-ghost" onClick={() => setPhase("speaking")}>↻ Repeat question</button>
                <button type="button" className="btn btn-ghost" onClick={next}>Skip</button>
              </>
            )}
            {phase === "recording" && (
              <button type="button" className="btn btn-bad running" style={{ minHeight: 64, fontSize: 20, padding: "0 28px" }} onClick={() => recorder.current?.stop()}>
                ⏹ Done ({seconds}s)
              </button>
            )}
          </div>
        </>
      )}

      {(phase === "uploading" || phase === "transcribing") && (
        <div className="stack" style={{ gap: 6 }}>
          <p className="row"><span className="spinner" aria-hidden="true" /> {phase === "uploading" ? "Sending your answers…" : "Turning your answers into text and reading the numbers…"}</p>
          <p className="small muted">Amazon Transcribe (Hindi), then our own model. Usually about 20 seconds.</p>
        </div>
      )}
    </section>
  );
}
