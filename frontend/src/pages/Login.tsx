import { useEffect, useState, type FormEvent } from "react";
import { api, type Role, type Session } from "../api.ts";
import { ErrorNote } from "../ui.tsx";

const ROLES: { role: Role; label: string; hint: string }[] = [
  { role: "worker", label: "Mess staff", hint: "Log what was cooked and what was left" },
  { role: "manager", label: "Manager", hint: "See waste, review suggestions, decide" },
  { role: "student", label: "Student", hint: "Rate the food, see what changed" },
];

export default function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [role, setRole] = useState<Role>("worker");
  const [code, setCode] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  // Demo mode is on by default; show the buttons at once and hide them only if the server says otherwise.
  const [demoMode, setDemoMode] = useState(true);
  useEffect(() => {
    api<{ demoMode: boolean }>("GET", "/auth/config").then((c) => setDemoMode(c.demoMode)).catch(() => {});
  }, []);

  async function tryDemo(r: Role) {
    setBusy(true);
    setError(null);
    try {
      const out = await api<{ token: string; role: Role; expiresAt: string }>("POST", "/auth/demo", { role: r });
      onLogin({ token: out.token, role: out.role, expiresAt: Date.parse(out.expiresAt) });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string; role: Role; expiresAt: string }>("POST", "/auth/login", { role, code });
      onLogin({ token: r.token, role: r.role, expiresAt: Date.parse(r.expiresAt) });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit} style={{ gap: 20 }}>
        <div className="stack" style={{ gap: 6 }}>
          <span className="brand"><span className="brand-mark" aria-hidden="true">↻</span> MessLoop</span>
          <h1 style={{ fontSize: 28 }}>Less food in the bin, one decision at a time</h1>
          <p className="muted">Measure leftovers, spot dishes that keep coming back, try a change, see if it worked.</p>
        </div>

        {demoMode && (
          <div className="stack" style={{ gap: 10, padding: 16, borderRadius: 12, background: "var(--warn-soft)" }}>
            <p><strong>Judges and visitors:</strong> try the demo — no code needed. All demo data is simulated.</p>
            <div className="seg" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))" }}>
              {ROLES.map((r) => (
                <button key={r.role} type="button" className="btn" style={{ minHeight: 48 }} disabled={busy} onClick={() => tryDemo(r.role)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>{demoMode ? "Or log in with your code — I am" : "I am"}</legend>
          <div className="stack" style={{ gap: 8, marginTop: 6 }}>
            {ROLES.map((r) => (
              <label key={r.role} className="seg" style={{ display: "block" }}>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minHeight: 56, padding: "8px 14px", borderRadius: 12, border: `1.5px solid ${role === r.role ? "var(--brand)" : "var(--line)"}`, background: role === r.role ? "var(--brand-soft)" : "var(--surface)", cursor: "pointer" }}>
                  <input type="radio" name="role" value={r.role} checked={role === r.role} onChange={() => setRole(r.role)} />
                  <strong>{r.label}</strong>
                  <span className="small muted">{r.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="code">Access code</label>
          <input id="code" className="input" type="password" autoComplete="current-password" value={code} onChange={(e) => setCode(e.target.value)} required />
          <span className="hint">Given to you by the mess committee.</span>
        </div>

        <ErrorNote error={error} />
        <button className="btn" type="submit" disabled={busy || !code}>{busy ? "Checking…" : "Log in"}</button>

      </form>
    </div>
  );
}
