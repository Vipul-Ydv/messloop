// Student feedback: how was today's dish, and if food was left, why. One screen, a few
// taps, anonymous. Each vote is added to the ratings the agent reads as evidence.

import { useEffect, useState } from "react";
import { ApiError, api } from "../api.ts";
import { Card, ErrorNote, Loading, niceDate } from "../ui.tsx";

interface Options {
  items: { itemId: string; name: string }[];
  suggestedItemId: string | null;
  suggestedDate: string | null;
  reasons: { id: string; label: string; hindi: string }[];
}
interface Result { name: string; avgRating: number; ratingCount: number; topReasons: string[]; poll: { instead: string; sharePct: number; votes: number } | null }

const FACES = [
  { n: 1, face: "😖", label: "Bilkul nahi" },
  { n: 2, face: "🙁", label: "Theek nahi" },
  { n: 3, face: "😐", label: "Theek tha" },
  { n: 4, face: "🙂", label: "Achha" },
  { n: 5, face: "😋", label: "Bahut badhiya" },
];

const votedKey = (itemId: string) => `messloop.voted.${itemId}.${new Date().toLocaleDateString("en-CA")}`;
const hasVoted = (itemId: string) => { try { return localStorage.getItem(votedKey(itemId)) === "1"; } catch { return false; } };
const markVoted = (itemId: string) => { try { localStorage.setItem(votedKey(itemId), "1"); } catch { /* private window: fine */ } };

export default function Feedback() {
  const [opts, setOpts] = useState<Options | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [itemId, setItemId] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [instead, setInstead] = useState<string | null>(null);
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    api<Options>("GET", "/feedback/options")
      .then((o) => { setOpts(o); setItemId(o.suggestedItemId ?? o.items[0]?.itemId ?? ""); })
      .catch(setLoadError);
  }, []);

  if (loadError) return <ErrorNote error={loadError} />;
  if (!opts) return <Loading what="Loading today's dish" />;

  const dish = opts.items.find((i) => i.itemId === itemId);
  const toggle = (id: string) =>
    setReasons((r) => (r.includes(id) ? r.filter((x) => x !== id) : r.length >= 3 ? r : [...r, id]));

  async function send() {
    if (!rating) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<Result>("POST", "/feedback", { itemId, rating, reasons, instead, idea: idea.trim() || undefined });
      markVoted(itemId);
      setResult(r);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, "NETWORK", "Could not send. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Card>
        <h1>Shukriya! 🙏</h1>
        <p style={{ fontSize: 18 }}>
          {result.name} is now rated <strong className="num">{result.avgRating.toFixed(1)} / 5</strong> by {result.ratingCount} students.
        </p>
        {result.topReasons.length > 0 && <p>Most common reasons food is left: <strong>{result.topReasons.join(", ")}</strong>.</p>}
        {result.poll && (
          <p><strong className="num">{result.poll.sharePct}%</strong> of {result.poll.votes} votes want <strong>{opts.items.find((i) => i.itemId === result.poll!.instead)?.name}</strong> instead of {result.name}.</p>
        )}
        <p className="muted">The agent reads these ratings the next time it looks at this dish, so your answer can change what's cooked.</p>
        <div className="row">
          <button className="btn btn-ghost" onClick={() => { setResult(null); setRating(null); setReasons([]); setInstead(null); setIdea(""); }}>Rate another dish</button>
          <a className="btn" href="#/impact">See what changed in the mess</a>
        </div>
      </Card>
    );
  }

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 720 }}>
      <Card>
        <p className="small muted" style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
          {opts.suggestedDate && itemId === opts.suggestedItemId ? `Served ${niceDate(opts.suggestedDate)}` : "Your dish"}
        </p>
        <h1 lang="hi">Aaj ki sabzi kaisi thi?</h1>
        <p className="muted">How was the dish today? It takes 5 seconds and it's anonymous.</p>
        <div className="field">
          <label htmlFor="dish">Dish</label>
          <select id="dish" className="input" value={itemId} onChange={(e) => { setItemId(e.target.value); setRating(null); setReasons([]); setInstead(null); }}>
            {opts.items.map((i) => <option key={i.itemId} value={i.itemId}>{i.name}</option>)}
          </select>
        </div>
        {dish && hasVoted(dish.itemId) && <p className="note note-info">You already rated {dish.name} today from this phone. You can still change your mind.</p>}

        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>Your rating</legend>
          <div className="grid" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8, marginTop: 6 }}>
            {FACES.map((f) => {
              const on = rating === f.n;
              return (
                <button key={f.n} type="button" onClick={() => setRating(f.n)} aria-pressed={on} aria-label={`${f.n} of 5: ${f.label}`}
                  style={{ minHeight: 84, borderRadius: 14, border: `2px solid ${on ? "var(--brand)" : "var(--line)"}`, background: on ? "var(--brand-soft)" : "var(--surface)", color: "var(--ink)", font: "inherit", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, padding: 4 }}>
                  <span aria-hidden="true" style={{ fontSize: 30 }}>{f.face}</span>
                  <span className="small" style={{ fontWeight: on ? 700 : 500, lineHeight: 1.1, textAlign: "center" }}>{f.label}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </Card>

      {rating !== null && (
        <Card delay={0}>
          <h2 lang="hi">{rating <= 3 ? "Khaana bacha? Kyun?" : "Kuch bacha? Kyun? (optional)"}</h2>
          <p className="small muted">Pick up to three. This helps the mess fix the real problem.</p>
          <div className="row" style={{ gap: 8 }}>
            {opts.reasons.map((r) => {
              const on = reasons.includes(r.id);
              return (
                <button key={r.id} type="button" onClick={() => toggle(r.id)} aria-pressed={on}
                  style={{ minHeight: 48, padding: "6px 14px", borderRadius: 999, border: `2px solid ${on ? "var(--brand)" : "var(--line)"}`, background: on ? "var(--brand)" : "var(--surface)", color: on ? "#fff" : "var(--ink)", font: "inherit", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontWeight: 600 }}>{on ? "✓ " : ""}{r.hindi}</span>
                  <span className="small" style={{ display: "block", opacity: 0.8 }}>{r.label}</span>
                </button>
              );
            })}
          </div>
          <div className="stack" style={{ gap: 10, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
            <h2 lang="hi">Iski jagah kya banna chahiye?</h2>
            <p className="small muted">What should be made instead? Optional. Your vote goes straight into the evidence the agent uses.</p>
            <div className="row" style={{ gap: 8 }}>
              {opts.items.filter((i) => i.itemId !== itemId).map((i) => {
                const on = instead === i.itemId;
                return (
                  <button key={i.itemId} type="button" onClick={() => setInstead(on ? null : i.itemId)} aria-pressed={on}
                    style={{ minHeight: 44, padding: "6px 16px", borderRadius: 999, border: `2px solid ${on ? "var(--brand)" : "var(--line)"}`, background: on ? "var(--brand)" : "var(--surface)", color: on ? "#fff" : "var(--ink)", font: "inherit", fontWeight: 600, cursor: "pointer" }}>
                    {on ? "✓ " : ""}{i.name}
                  </button>
                );
              })}
            </div>
            <div className="field">
              <label htmlFor="idea">Ya kuch aur? <span className="muted" style={{ fontWeight: 400 }}>(Something else? Optional)</span></label>
              <input id="idea" className="input" style={{ fontSize: 16 }} value={idea} maxLength={60} onChange={(e) => setIdea(e.target.value)} placeholder="e.g. Rajma, Kadhi pakoda" />
              <span className="hint">New ideas go to the mess manager. The agent only compares dishes the mess has already cooked.</span>
            </div>
          </div>
          {error && <ErrorNote error={error} />}
          <button className="btn" onClick={send} disabled={busy || !itemId}>{busy ? "Sending…" : "Bhejo (Send)"}</button>
        </Card>
      )}
    </div>
  );
}
