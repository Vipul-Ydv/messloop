// Meal & waste entry (worker). Built for a phone held in one hand: big targets, today's
// date and the current meal pre-filled, and a live preview before anything is saved.

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { wastePct, wastePer100 } from "../../../packages/core/metrics.ts";
import { ApiError, api, type Item, type Role, type WasteRecord } from "../api.ts";
import { Card, ErrorNote, Lbl, Loading, Status } from "../ui.tsx";
import VoiceLog, { unlockAudio, type VoiceResult } from "../VoiceLog.tsx";

const PERIODS = ["breakfast", "lunch", "snacks", "dinner"] as const;
const SLOT = "lunch_dry_sabzi"; // the one serving slot in the demo hostel

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
const currentPeriod = () => {
  const h = new Date().getHours();
  return h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 19 ? "snacks" : "dinner";
};

export default function Entry({ role }: { role: Role }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [date, setDate] = useState(today);
  const [period, setPeriod] = useState<string>(currentPeriod);
  const [itemId, setItemId] = useState("");
  const [prepared, setPrepared] = useState("");
  const [leftover, setLeftover] = useState("");
  const [servings, setServings] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState<WasteRecord | null>(null);
  const [reason, setReason] = useState("");
  // "choose" shows the two big buttons; "call" is the voice call; "form" is typing (or checking what the call heard).
  const [mode, setMode] = useState<"choose" | "call" | "form">("choose");
  const [callAudio, setCallAudio] = useState<{ audio: HTMLAudioElement; ac: AudioContext } | null>(null);
  function startCall() {
    setSaved(null);
    setCallAudio(unlockAudio()); // must happen inside this tap
    setMode("call");
  }
  const [heard, setHeard] = useState<VoiceResult | null>(null);

  // Fill the form from the voice log; the worker still checks it and presses Save.
  function applyVoice(r: VoiceResult) {
    setMode("form");
    setHeard(r);
    setSaved(null);
    setError(null);
    if (r.fields.itemId) setItemId(r.fields.itemId);
    setPrepared(r.fields.preparedQty === null ? "" : String(r.fields.preparedQty));
    setLeftover(r.fields.leftoverQty === null ? "" : String(r.fields.leftoverQty));
    setServings(r.fields.servings === null ? "" : String(r.fields.servings));
    setReason(r.fields.reason ?? "");
  }
  const heardFor = (q: string) => (heard?.transcripts[q] ? <span className="hint" lang="hi">Heard: “{heard.transcripts[q]}”</span> : null);

  useEffect(() => {
    api<Item[]>("GET", "/items")
      .then((list) => {
        const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
        setItems(sorted);
        setItemId((cur) => cur || sorted[0]?.itemId || "");
      })
      .catch(setLoadError);
  }, []);

  const item = items?.find((i) => i.itemId === itemId);
  const p = Number(prepared), l = Number(leftover), s = Number(servings);

  // Client-side hints only; the server re-checks everything (R15).
  const hint = useMemo(() => {
    if (prepared && !(p > 0)) return { field: "preparedQty", msg: "Cooked amount must be more than 0." };
    if (leftover && l < 0) return { field: "leftoverQty", msg: "Leftover cannot be negative." };
    if (prepared && leftover && l > p) return { field: "leftoverQty", msg: "Leftover cannot be more than what was cooked." };
    if (servings && !(s > 0)) return { field: "servings", msg: "Plates served must be more than 0." };
    return null;
  }, [prepared, leftover, servings, p, l, s]);

  const canPreview = p > 0 && l >= 0 && l <= p && s > 0 && leftover !== "";
  const fieldError = (f: string) => (error?.field === f ? error.message : hint?.field === f ? hint.msg : null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const rec = await api<WasteRecord>("POST", "/waste-records", {
        date, period, slotId: SLOT, itemId, preparedQty: p, leftoverQty: l, servings: s, unit: item?.unit,
        reason: reason.trim() || undefined, entryMethod: heard ? "voice" : "form",
      });
      setSaved(rec);
      setPrepared(""); setLeftover(""); setServings(""); setReason(""); setHeard(null);
      setMode("choose");
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "NETWORK", "Could not reach the server. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <ErrorNote error={loadError} />;
  if (!items) return <Loading what="Loading dishes" />;

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <Card>
        <p className="muted">Weigh what was cooked and what is left in the serving vessels after service.</p>
        {mode === "choose" && (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <button type="button" className="btn" onClick={startCall}
              style={{ minHeight: 120, flexDirection: "column", gap: 6, borderRadius: 20, fontSize: 20, padding: 16 }}>
              <span aria-hidden="true" style={{ fontSize: 34 }}>🎙</span>
              <span>Bol ke batao</span>
              <span style={{ fontWeight: 400, fontSize: 14 }}>The app asks 5 questions in Hindi — just speak</span>
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setMode("form")}
              style={{ minHeight: 120, flexDirection: "column", gap: 6, borderRadius: 20, fontSize: 20, padding: 16, border: "2px solid var(--brand)" }}>
              <span aria-hidden="true" style={{ fontSize: 34 }}>⌨️</span>
              <span>Khud likho</span>
              <span style={{ fontWeight: 400, fontSize: 14 }}>Type the numbers in the form</span>
            </button>
          </div>
        )}
        {mode === "call" && callAudio && (
          <VoiceLog audio={callAudio.audio} ac={callAudio.ac} onResult={applyVoice} onCancel={() => setMode("form")} />
        )}
        {mode === "form" && heard && (
          <p className="note note-warn" role="status">
            <strong>Filled from your call — check every number before saving.</strong> Speech-to-text can mishear numbers (for example 23 as 30).
            {heard.note ? <> {heard.note}</> : null}
          </p>
        )}
        {mode === "form" && (
        <form className="stack" style={{ gap: 18 }} onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="date">Date</label>
            <input id="date" className="input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} required aria-invalid={error?.field === "date"} />
            {fieldError("date") && <span className="field-error">{fieldError("date")}</span>}
          </div>

          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend>Meal</legend>
            <div className="seg" style={{ marginTop: 6 }}>
              {PERIODS.map((x) => (
                <label key={x}><input type="radio" name="period" value={x} checked={period === x} onChange={() => setPeriod(x)} /><span>{x}</span></label>
              ))}
            </div>
          </fieldset>

          <div className="field">
            <label htmlFor="item">Dish</label>
            <select id="item" className="input" value={itemId} onChange={(e) => setItemId(e.target.value)} aria-invalid={error?.field === "itemId"}>
              {items.map((i) => <option key={i.itemId} value={i.itemId}>{i.name}</option>)}
            </select>
            <span className="hint">Measured in {item?.unit ?? "—"}. Units are never mixed.</span>
            {heardFor("dish")}
          </div>

          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
            <NumberField id="prepared" label={`Cooked (${item?.unit ?? ""})`} value={prepared} onChange={setPrepared} error={fieldError("preparedQty")} heard={heardFor("prepared")} />
            <NumberField id="leftover" label={`Left over (${item?.unit ?? ""})`} value={leftover} onChange={setLeftover} error={fieldError("leftoverQty")} heard={heardFor("leftover")} />
            <NumberField id="servings" label="Plates served" value={servings} onChange={setServings} error={fieldError("servings")} step="1" heard={heardFor("servings")} />
          </div>

          <div className="field">
            <label htmlFor="reason">Why was it left? <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
            <input id="reason" className="input" style={{ fontSize: 16 }} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. too spicy, came out cold" />
            {heardFor("reason")}
          </div>

          {error && !error.field && <ErrorNote error={error} />}
          <button className="btn" type="submit" disabled={busy || !canPreview || !!hint}>{busy ? "Saving…" : "Save record"}</button>
          {!heard && <button type="button" className="btn btn-ghost" onClick={startCall}>🎙 Rather speak? Bol ke batao</button>}
        </form>
        )}
      </Card>

      <div className="stack" style={{ gap: 16 }}>
        <Card delay={80} aria-live="polite">
          <h2>Before you save</h2>
          {canPreview ? (
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><p className="stat-label">Wasted</p><p className="stat-value">{wastePct(p, l).toFixed(1)}%</p><Lbl kind="Calculated" /></div>
              <div><p className="stat-label">Per 100 plates</p><p className="stat-value">{wastePer100(l, s).toFixed(1)}<small>{item?.unit}</small></p><Lbl kind="Calculated" /></div>
            </div>
          ) : (
            <p className="muted">Enter cooked, left over and plates served to see the waste figures.</p>
          )}
          <p className="small muted">Same formulas the server uses: leftover ÷ cooked × 100, and leftover ÷ plates × 100.</p>
        </Card>

        {saved && (
          <Card delay={0} className="saved" role="status">
            <div className="row between">
              <h2>Saved ✓</h2>
              {saved.interventionId && <Status value="active" />}
            </div>
            <p>{items.find((i) => i.itemId === saved.itemId)?.name} · {saved.period} · {saved.date}</p>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><p className="stat-label">Wasted</p><p className="stat-value">{saved.wastePct.toFixed(1)}%</p><Lbl kind={saved.labels.wastePct} /></div>
              <div><p className="stat-label">Per 100 plates</p><p className="stat-value">{saved.wastePer100.toFixed(1)}<small>{saved.unit}</small></p><Lbl kind={saved.labels.wastePer100} /></div>
            </div>
            <p className="small muted">Cooked {saved.preparedQty} {saved.unit}, left {saved.leftoverQty} {saved.unit}, {saved.servings} plates — all <strong>Measured</strong>.</p>
            {saved.interventionId && (
              <p className="note note-good">This meal counts towards an active change. {role === "manager" && <a href={`#/impact/${saved.interventionId}`}>See its impact →</a>}</p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

function NumberField({ id, label, value, onChange, error, step = "0.1", heard }: { id: string; label: string; value: string; onChange: (v: string) => void; error: string | null; step?: string; heard?: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input num" type="number" inputMode="decimal" min="0" step={step} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} required />
      {error && <span id={`${id}-err`} className="field-error">{error}</span>}
      {heard}
    </div>
  );
}
