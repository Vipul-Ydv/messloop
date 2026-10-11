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

// Mess staff see this page in Hindi; managers logging a meal see it in English.
const PERIOD_HI: Record<string, string> = { breakfast: "नाश्ता", lunch: "दोपहर", snacks: "शाम", dinner: "रात" };
const ERROR_HI: Record<string, string> = {
  CONFLICT: "इस तारीख और समय का यह रिकॉर्ड पहले से सेव है।",
  NETWORK: "सर्वर से जुड़ नहीं पाए। इंटरनेट देखकर फिर कोशिश करें।",
  VALIDATION_ERROR: "कुछ भरा हुआ सही नहीं है। नंबर जाँच लें।",
};
const currentPeriod = () => {
  const h = new Date().getHours();
  return h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 19 ? "snacks" : "dinner";
};

export default function Entry({ role }: { role: Role }) {
  const hi = role === "worker";
  const t = (en: string, hindi: string) => (hi ? hindi : en);
  const dishName = (i: { name: string; hindi?: string }) => (hi && i.hindi ? `${i.hindi} (${i.name})` : i.name);
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
  // A meal has several dishes; one record holds one. Other dishes heard in the call wait here.
  const [moreDishes, setMoreDishes] = useState<string[]>([]);
  function logNextDish(id: string) {
    setItemId(id);
    setSaved(null);
    setPrepared(""); setLeftover(""); setServings("");
    setMoreDishes((d) => d.filter((x) => x !== id));
    setMode("form");
  }

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
  const heardFor = (q: string) => (heard?.transcripts[q] ? <span className="hint" lang="hi">{t("Heard", "सुना")}: “{heard.transcripts[q]}”</span> : null);

  useEffect(() => {
    api<Item[]>("GET", "/items")
      .then((list) => {
        const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
        setItems(sorted);
        setItemId((cur) => cur || sorted[0]?.itemId || "");
      })
      .catch(setLoadError);
  }, []);

  // Default the dish to one usually served at the chosen meal (unless the call heard one).
  useEffect(() => {
    if (!items || heard) return;
    const current = items.find((i) => i.itemId === itemId);
    if (current?.meals?.includes(period)) return;
    const first = items.find((i) => i.meals?.includes(period));
    if (first) setItemId(first.itemId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, period]);

  const item = items?.find((i) => i.itemId === itemId);
  const p = Number(prepared), l = Number(leftover), s = Number(servings);

  // Client-side hints only; the server re-checks everything (R15).
  const hint = useMemo(() => {
    if (prepared && !(p > 0)) return { field: "preparedQty", msg: t("Cooked amount must be more than 0.", "बना हुआ खाना 0 से ज़्यादा होना चाहिए।") };
    if (leftover && l < 0) return { field: "leftoverQty", msg: t("Leftover cannot be negative.", "बचा हुआ माइनस में नहीं हो सकता।") };
    if (prepared && leftover && l > p) return { field: "leftoverQty", msg: t("Leftover cannot be more than what was cooked.", "बचा हुआ, बने हुए से ज़्यादा नहीं हो सकता।") };
    if (servings && !(s > 0)) return { field: "servings", msg: t("Plates served must be more than 0.", "प्लेटें 0 से ज़्यादा होनी चाहिए।") };
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepared, leftover, servings, p, l, s, hi]);

  const canPreview = p > 0 && l >= 0 && l <= p && s > 0 && leftover !== "";
  const errorText = (e: ApiError) => (hi ? ERROR_HI[e.code] ?? e.message : e.message);
  const fieldError = (f: string) => (error?.field === f ? errorText(error) : hint?.field === f ? hint.msg : null);

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
      setMoreDishes((heard?.fields.dishes ?? moreDishes).filter((d) => d !== itemId));
      setPrepared(""); setLeftover(""); setServings(""); setReason(""); setHeard(null);
      setMode("choose");
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "NETWORK", "Could not reach the server. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <ErrorNote error={loadError} />;
  if (!items) return <Loading what={t("Loading dishes", "डिश लोड हो रही हैं")} />;

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <Card>
        <p className="muted">{t("Weigh what was cooked and what is left in the serving vessels after service.", "कितना बना और सर्विस के बाद बर्तनों में कितना बचा, यह तौलकर बताइए।")}</p>
        {mode === "choose" && (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <button type="button" className="btn" onClick={startCall}
              style={{ minHeight: 120, flexDirection: "column", gap: 6, borderRadius: 20, fontSize: 20, padding: 16 }}>
              <span aria-hidden="true" style={{ fontSize: 34 }}>🎙</span>
              <span>{t("Bol ke batao", "बोल के बताओ")}</span>
              <span style={{ fontWeight: 400, fontSize: 14 }}>{t("The app asks 5 questions in Hindi — just speak", "ऐप हिंदी में 5 सवाल पूछेगा — बस बोलिए")}</span>
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setMode("form")}
              style={{ minHeight: 120, flexDirection: "column", gap: 6, borderRadius: 20, fontSize: 20, padding: 16, border: "2px solid var(--brand)" }}>
              <span aria-hidden="true" style={{ fontSize: 34 }}>⌨️</span>
              <span>{t("Khud likho", "खुद लिखो")}</span>
              <span style={{ fontWeight: 400, fontSize: 14 }}>{t("Type the numbers in the form", "फ़ॉर्म में नंबर भरिए")}</span>
            </button>
          </div>
        )}
        {mode === "call" && callAudio && (
          <VoiceLog audio={callAudio.audio} ac={callAudio.ac} hindi={hi} onResult={applyVoice} onCancel={() => setMode("form")} />
        )}
        {mode === "form" && heard && (
          <p className="note note-warn" role="status">
            <strong>{t("Filled from your call — check every number before saving.", "आपकी आवाज़ से भरा गया — सेव करने से पहले हर नंबर जाँच लें।")}</strong>{" "}
            {t("Speech-to-text can mishear numbers (for example 23 as 30).", "बोलने से कभी-कभी नंबर गलत सुनाई देता है (जैसे 23 को 30)।")}
            {heard.note ? <> {heard.note}</> : null}
          </p>
        )}
        {mode === "form" && (
        <form className="stack" style={{ gap: 18 }} onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="date">{t("Date", "तारीख")}</label>
            <input id="date" className="input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} required aria-invalid={error?.field === "date"} />
            {fieldError("date") && <span className="field-error">{fieldError("date")}</span>}
          </div>

          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend>{t("Meal", "कौन सा खाना")}</legend>
            <div className="seg" style={{ marginTop: 6 }}>
              {PERIODS.map((x) => (
                <label key={x}><input type="radio" name="period" value={x} checked={period === x} onChange={() => setPeriod(x)} /><span>{hi ? PERIOD_HI[x] : x}</span></label>
              ))}
            </div>
          </fieldset>

          <div className="field">
            <label htmlFor="item">{t("Dish", "सब्ज़ी / डिश")}</label>
            <select id="item" className="input" value={itemId} onChange={(e) => setItemId(e.target.value)} aria-invalid={error?.field === "itemId"}>
              {/* Dishes usually served at the chosen meal first, then everything else. */}
              <optgroup label={t("Usually at this meal", "इस खाने में बनने वाले")}>
                {items.filter((i) => i.meals?.includes(period)).map((i) => <option key={i.itemId} value={i.itemId}>{dishName(i)}</option>)}
              </optgroup>
              <optgroup label={t("Other dishes", "बाकी डिश")}>
                {items.filter((i) => !i.meals?.includes(period)).map((i) => <option key={i.itemId} value={i.itemId}>{dishName(i)}</option>)}
              </optgroup>
            </select>
            <span className="hint">{t(`Measured in ${item?.unit ?? "—"}. Units are never mixed.`, "किलो में तौलें।")}</span>
            {heardFor("dish")}
          </div>

          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
            <NumberField id="prepared" label={t(`Cooked (${item?.unit ?? ""})`, "कितना बना (किलो)")} value={prepared} onChange={setPrepared} error={fieldError("preparedQty")} heard={heardFor("prepared")} />
            <NumberField id="leftover" label={t(`Left over (${item?.unit ?? ""})`, "कितना बचा (किलो)")} value={leftover} onChange={setLeftover} error={fieldError("leftoverQty")} heard={heardFor("leftover")} />
            <NumberField id="servings" label={t("Plates served", "कितनी प्लेटें गईं")} value={servings} onChange={setServings} error={fieldError("servings")} step="1" heard={heardFor("servings")} />
          </div>

          <div className="field">
            <label htmlFor="reason">{t("Why was it left?", "खाना क्यों बचा?")} <span className="muted" style={{ fontWeight: 400 }}>{t("(optional)", "(ज़रूरी नहीं)")}</span></label>
            <input id="reason" className="input" style={{ fontSize: 16 }} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder={t("e.g. too spicy, came out cold", "जैसे: बहुत तीखा, ठंडा था")} />
            {heardFor("reason")}
          </div>

          {error && !error.field && <ErrorNote error={hi ? new Error(errorText(error)) : error} />}
          <button className="btn" type="submit" disabled={busy || !canPreview || !!hint}>{busy ? t("Saving…", "सेव हो रहा है…") : t("Save record", "सेव करें")}</button>
          {!heard && <button type="button" className="btn btn-ghost" onClick={startCall}>{t("🎙 Rather speak? Bol ke batao", "🎙 बोलकर बताना है? बोल के बताओ")}</button>}
        </form>
        )}
      </Card>

      <div className="stack" style={{ gap: 16 }}>
        <Card delay={80} aria-live="polite">
          <h2>{t("Before you save", "सेव करने से पहले")}</h2>
          {canPreview ? (
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><p className="stat-label">{t("Wasted", "कितना बचा")}</p><p className="stat-value">{wastePct(p, l).toFixed(1)}%</p><Lbl kind="Calculated" /></div>
              <div><p className="stat-label">{t("Per 100 plates", "हर 100 प्लेट पर")}</p><p className="stat-value">{wastePer100(l, s).toFixed(1)}<small>{item?.unit}</small></p><Lbl kind="Calculated" /></div>
            </div>
          ) : (
            <p className="muted">{t("Enter cooked, left over and plates served to see the waste figures.", "कितना बना, कितना बचा और कितनी प्लेटें गईं — भरते ही यहाँ हिसाब दिखेगा।")}</p>
          )}
          <p className="small muted">{t("Same formulas the server uses: leftover ÷ cooked × 100, and leftover ÷ plates × 100.", "हिसाब: बचा ÷ बना × 100, और बचा ÷ प्लेटें × 100।")}</p>
        </Card>

        {saved && (
          <Card delay={0} className="saved" role="status">
            <div className="row between">
              <h2>{t("Saved ✓", "सेव हो गया ✓")}</h2>
              {saved.interventionId && <Status value="active" />}
            </div>
            <p>{(() => { const it = items.find((i) => i.itemId === saved.itemId); return it ? dishName(it) : saved.itemId; })()} · {hi ? PERIOD_HI[saved.period] ?? saved.period : saved.period} · {saved.date}</p>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><p className="stat-label">{t("Wasted", "कितना बचा")}</p><p className="stat-value">{saved.wastePct.toFixed(1)}%</p><Lbl kind={saved.labels.wastePct} /></div>
              <div><p className="stat-label">{t("Per 100 plates", "हर 100 प्लेट पर")}</p><p className="stat-value">{saved.wastePer100.toFixed(1)}<small>{saved.unit}</small></p><Lbl kind={saved.labels.wastePer100} /></div>
            </div>
            <p className="small muted">{hi
              ? <>बना {saved.preparedQty} किलो, बचा {saved.leftoverQty} किलो, {saved.servings} प्लेटें — सब <strong>नापा हुआ (Measured)</strong>।</>
              : <>Cooked {saved.preparedQty} {saved.unit}, left {saved.leftoverQty} {saved.unit}, {saved.servings} plates — all <strong>Measured</strong>.</>}</p>
            {moreDishes.length > 0 && (
              <div className="stack" style={{ gap: 8 }}>
                <strong>{t("Log the other dishes from this meal:", "बाकी डिश भी दर्ज करें:")}</strong>
                <div className="row" style={{ gap: 8 }}>
                  {moreDishes.map((id) => {
                    const it = items.find((i) => i.itemId === id);
                    return it ? <button key={id} type="button" className="btn btn-ghost" style={{ minHeight: 44 }} onClick={() => logNextDish(id)}>{dishName(it)}</button> : null;
                  })}
                </div>
              </div>
            )}
            {saved.interventionId && (
              <p className="note note-good">{t("This meal counts towards an active change.", "यह खाना चल रहे बदलाव (ट्रायल) में गिना जाएगा।")} {role === "manager" && <a href={`#/impact/${saved.interventionId}`}>See its impact →</a>}</p>
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
