// App shell: session, a tiny hash router (no server rewrites needed on Amplify) and
// role-based navigation. The server enforces roles too; this only hides what a role can't use.

import { useEffect, useState } from "react";
import { loadSession, saveSession, setUnauthorizedHandler, type Role, type Session } from "./api.ts";
import { Legend } from "./ui.tsx";
import Login from "./pages/Login.tsx";
import Entry from "./pages/Entry.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Review from "./pages/Review.tsx";
import ImpactPage from "./pages/Impact.tsx";
import Feedback from "./pages/Feedback.tsx";
import { go } from "./nav.ts";

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || "/");
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1) || "/");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

const HOME: Record<Role, string> = { worker: "/entry", manager: "/dashboard", student: "/feedback" };
const NAV: Record<Role, [string, string][]> = {
  worker: [["/entry", "Log a meal"]],
  manager: [["/dashboard", "Dashboard"], ["/entry", "Log a meal"], ["/impact", "Impact"]],
  student: [["/feedback", "Rate today's food"], ["/impact", "What changed"]],
};

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const hash = useHash();

  useEffect(() => {
    setUnauthorizedHandler(() => { saveSession(null); setSession(null); });
  }, []);

  if (!session) return <Login onLogin={(s) => { saveSession(s); setSession(s); go(HOME[s.role]); }} />;

  const [, page, id] = hash.split("/");
  const allowed = NAV[session.role].some(([p]) => p === "/" + page) || (session.role === "manager" && page === "review");
  if (!allowed) {
    queueMicrotask(() => go(HOME[session.role]));
    return null;
  }

  let content;
  if (page === "entry") content = <Entry role={session.role} />;
  else if (page === "dashboard") content = <Dashboard />;
  else if (page === "review" && id) content = <Review recId={id} />;
  else if (page === "feedback") content = <Feedback />;
  else if (page === "impact") content = <ImpactPage interventionId={id} role={session.role} />;

  return (
    <div className="shell">
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <header className="topbar">
        <a className="brand" href={"#" + HOME[session.role]}>
          <span className="brand-mark" aria-hidden="true">↻</span> MessLoop
        </a>
        <nav className="nav" aria-label="Main">
          {NAV[session.role].map(([path, label]) => (
            <a key={path} href={"#" + path} aria-current={"/" + page === path ? "page" : undefined}>{label}</a>
          ))}
          <span className="role-chip">{session.role}</span>
          <button type="button" onClick={() => { saveSession(null); setSession(null); go("/"); }}>Log out</button>
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="stack" style={{ gap: 20, outline: "none" }}>
        {content}
      </main>
      <Legend />
      <p className="small muted">AI recommends. Humans decide. Measured outcomes determine what works.</p>
    </div>
  );
}
