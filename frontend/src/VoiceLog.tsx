// Voice call: the app asks each question out loud in Hindi, beeps, listens, and moves on
// by itself when the worker stops talking — like a phone call, no buttons in between.
// Nothing is saved here: the answers come back as a filled form the worker checks and saves,
// because speech-to-text can mishear numbers.

import { useEffect, useRef, useState } from "react";
import { api } from "./api.ts";

interface Question { id: string; text: string; english: string; audio: string }
export interface VoiceFields { itemId: string | null; preparedQty: number | null; leftoverQty: number | null; servings: number | null; reason: string | null }
export interface VoiceResult { fields: VoiceFields; transcripts: Record<string, string>; note?: string }

type Phase = "connecting" | "asking" | "listening" | "sending" | "reading" | "error";

// Listening rules: wait up to NO_SPEECH_MS for the worker to start; once they have spoken,
// a pause of SILENCE_MS ends the answer; no answer runs longer than MAX_ANSWER_MS.
const NO_SPEECH_MS = 8000;
const SILENCE_MS = 1500;
const MAX_ANSWER_MS = 20000;

const pickMime = () =>
  ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Phones only allow sound that starts from a tap, so the "Call" button calls this in its
 * click handler and passes the result in.
 */
export function unlockAudio(): { audio: HTMLAudioElement; ac: AudioContext } {
  const audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=");
  audio.play().catch(() => {});
  const ac = new AudioContext();
  ac.resume().catch(() => {});
  return { audio, ac };
}

export default function VoiceLog({ audio, ac, onResult, onCancel }: { audio: HTMLAudioElement; ac: AudioContext; onResult: (r: VoiceResult) => void; onCancel: () => void }) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const ended = useRef(false);
  const skip = useRef<() => void>(() => {});
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);

  const hangUp = () => {
    ended.current = true;
    skip.current();
    player.current?.pause();
    stream.current?.getTracks().forEach((t) => t.stop());
  };

  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // The whole call runs as one sequence, started by the tap that opened it.
  useEffect(() => {
    player.current = audio;
    ctx.current = ac;
    // `run` belongs to this effect only, so a cancelled start can never keep talking.
    const run = { alive: true };
    const stopped = () => !run.alive || ended.current;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !pickMime()) throw new Error("This phone's browser cannot record audio. Please type instead.");
        const [mic, p] = await Promise.all([
          navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }),
          api<{ questions: Question[] }>("GET", "/voice/prompts"),
        ]);
        if (stopped()) { mic.getTracks().forEach((t) => t.stop()); return; }
        stream.current = mic;
        setQuestions(p.questions);

        const analyser = ac.createAnalyser();
        analyser.fftSize = 1024;
        ac.createMediaStreamSource(mic).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        const rms = () => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += ((v - 128) / 128) ** 2;
          return Math.sqrt(sum / buf.length);
        };

        const clips: { questionId: string; blob: Blob; mime: string }[] = [];
        for (let i = 0; i < p.questions.length && !stopped(); i++) {
          const q = p.questions[i];
          setIndex(i);

          // Ask, then a short beep: "your turn".
          setPhase("asking");
          await playQuestion(audio, q.audio);
          if (stopped()) break;
          beep(ac);
          await sleep(250);

          // Listen until the worker stops talking.
          setPhase("listening");
          const clip = await listen(mic, rms, setLevel, skip);
          setLevel(0);
          if (clip) clips.push({ questionId: q.id, ...clip });
        }

        mic.getTracks().forEach((t) => t.stop());
        if (!run.alive || (ended.current && clips.length === 0)) return;
        if (clips.length === 0) throw new Error("Nothing was heard. Please type instead.");

        setPhase("sending");
        const body = { clips: await Promise.all(clips.map(async (c) => ({ questionId: c.questionId, mime: c.mime, audioBase64: await toBase64(c.blob) }))) };
        const { sessionId } = await api<{ sessionId: string }>("POST", "/voice/sessions", body);
        setPhase("reading");
        // One request at a time: the last step (our model reading the answers) takes a few seconds.
        for (let tries = 0; tries < 40; tries++) {
          await sleep(3000);
          if (!run.alive) return;
          const s = await api<{ status: string; fields: VoiceFields; transcripts: Record<string, string>; extractionNote?: string }>("GET", `/voice/sessions/${sessionId}`);
          if (s.status === "done") {
            onResult({ fields: s.fields, transcripts: s.transcripts, note: s.extractionNote });
            return;
          }
        }
        throw new Error("This is taking too long. Please type instead.");
      } catch (e: any) {
        if (stopped()) return;
        setError(e?.name === "NotAllowedError" ? "Microphone permission was blocked. Allow it in the browser, or type instead." : e?.message ?? "The call could not continue. Please type instead.");
        setPhase("error");
        stream.current?.getTracks().forEach((t) => t.stop());
      }
    })();
    return () => {
      run.alive = false;
      skip.current();
      audio.pause();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = questions[index];
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const status =
    phase === "connecting" ? "Connecting…"
    : phase === "asking" ? "Asking…"
    : phase === "listening" ? "Listening — speak now"
    : phase === "sending" ? "Sending your answers…"
    : phase === "reading" ? "Understanding your answers…"
    : "Call ended";

  return (
    <section aria-live="polite" style={{ background: "#18201C", color: "#EEF0EF", borderRadius: 24, padding: "28px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center", animation: "rise 300ms ease both" }}>
      <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#1F5C45", display: "grid", placeItems: "center", fontSize: 32 }} aria-hidden="true">↻</div>
      <div>
        <p style={{ fontFamily: "var(--display)", fontSize: 22, fontWeight: 800 }}>MessLoop</p>
        <p style={{ color: "#C9D2CD", fontSize: 15 }}>{status} · {mm}:{ss}</p>
      </div>

      {questions.length > 0 && phase !== "error" && (
        <div style={{ display: "flex", gap: 8 }} aria-label={`Question ${index + 1} of ${questions.length}`}>
          {questions.map((_, i) => (
            <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: i < index ? "#7FD29C" : i === index ? "#F2B632" : "#3A463F" }} />
          ))}
        </div>
      )}

      {q && (phase === "asking" || phase === "listening") && (
        <div style={{ minHeight: 96 }}>
          <p lang="hi" style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.3 }}>{q.text}</p>
          <p style={{ color: "#9FB0A7", fontSize: 14, marginTop: 4 }}>{q.english}</p>
        </div>
      )}

      {phase === "listening" && <MicLevel level={level} />}
      {(phase === "sending" || phase === "reading" || phase === "connecting") && <span className="spinner" style={{ width: 28, height: 28 }} aria-hidden="true" />}
      {phase === "reading" && <p style={{ color: "#9FB0A7", fontSize: 14 }}>Amazon Transcribe (Hindi), then our own model. About 20 seconds.</p>}
      {phase === "error" && <p role="alert" style={{ background: "#3B211B", color: "#F08A72", padding: "10px 14px", borderRadius: 12 }}>{error}</p>}

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
        {phase === "listening" && (
          <button type="button" onClick={() => skip.current()} style={{ minHeight: 48, padding: "0 18px", borderRadius: 999, border: "1px solid #3A463F", background: "transparent", color: "#EEF0EF", font: "inherit", cursor: "pointer" }}>
            Next question ›
          </button>
        )}
        {phase !== "sending" && phase !== "reading" && (
          <button type="button" onClick={() => { hangUp(); onCancel(); }} aria-label="End call and type instead"
            style={{ minHeight: 64, padding: "0 28px", borderRadius: 999, border: 0, background: "#C2412D", color: "#fff", font: "inherit", fontWeight: 700, fontSize: 18, cursor: "pointer" }}>
            {phase === "error" ? "Type instead" : "✕ End call"}
          </button>
        )}
      </div>
    </section>
  );
}

function MicLevel({ level }: { level: number }) {
  const bars = 7;
  return (
    <div aria-hidden="true" style={{ display: "flex", gap: 5, alignItems: "center", height: 40 }}>
      {Array.from({ length: bars }, (_, i) => {
        const centre = 1 - Math.abs(i - (bars - 1) / 2) / bars;
        const h = 8 + Math.min(32, level * 400 * centre);
        return <span key={i} style={{ width: 6, height: h, borderRadius: 3, background: "#7FD29C", transition: "height 80ms linear" }} />;
      })}
    </div>
  );
}

function playQuestion(audio: HTMLAudioElement, base64: string) {
  return new Promise<void>((resolve) => {
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    audio.src = `data:audio/mpeg;base64,${base64}`;
    audio.play().catch(() => resolve()); // if playback is blocked, the question is on screen
  });
}

function beep(ac: AudioContext) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.frequency.value = 880;
  g.gain.setValueAtTime(0.15, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
  o.connect(g).connect(ac.destination);
  o.start();
  o.stop(ac.currentTime + 0.2);
}

/** Records one answer and stops by itself after the worker goes quiet. Null if they never spoke. */
function listen(mic: MediaStream, rms: () => number, setLevel: (n: number) => void, skip: { current: () => void }) {
  return new Promise<{ blob: Blob; mime: string } | null>((resolve) => {
    const mime = pickMime();
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(mic, { mimeType: mime });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    let spoke = false;
    rec.onstop = () => resolve(spoke && chunks.length ? { blob: new Blob(chunks, { type: mime }), mime } : null);
    rec.start(250);

    const started = performance.now();
    let noise = 0;
    let samples = 0;
    let lastVoice = started;
    const stop = () => {
      clearInterval(timer);
      if (rec.state === "recording") rec.stop();
    };
    skip.current = () => { spoke = spoke || chunks.length > 0; stop(); };

    const timer = setInterval(() => {
      const now = performance.now();
      const v = rms();
      setLevel(v);
      // The first half-second sets the room's noise level; speech is well above it.
      if (now - started < 500) { noise += v; samples++; return; }
      const floor = samples ? noise / samples : 0.01;
      const threshold = Math.max(0.02, floor * 3);
      if (v > threshold) { spoke = true; lastVoice = now; }
      if (!spoke && now - started > NO_SPEECH_MS) stop();
      else if (spoke && now - lastVoice > SILENCE_MS) stop();
      else if (now - started > MAX_ANSWER_MS) stop();
    }, 60);
  });
}
