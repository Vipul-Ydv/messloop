// App shell: session, a tiny hash router (no server rewrites needed on S3) and
// role-based navigation. The server enforces roles too; this only hides what a role can't use.

import { useEffect, useState, type ReactNode } from "react";
import { loadSession, saveSession, setUnauthorizedHandler, type Role, type Session } from "./api.ts";
import { Icon, type IconName } from "./Icon.tsx";
import { Brand } from "./Logo.tsx";
import { Hero, Legend } from "./ui.tsx";
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
const NAV: Record<Role, [string, string, IconName][]> = {
  worker: [["/entry", "खाना दर्ज करें", "bowl"]], // mess staff see their screens in Hindi
  manager: [["/dashboard", "Dashboard", "chart"], ["/entry", "Log a meal", "bowl"], ["/impact", "Experiments", "flask"]],
  student: [["/feedback", "Rate today's food", "thumbsUp"], ["/impact", "What's changing", "flask"]],
};
const ROLE_META: Record<Role, { label: string; icon: IconName; blurb: string }> = {
  worker: { label: "Mess Worker", icon: "chef", blurb: "Log what was cooked and what came back." },
  manager: { label: "Mess Manager", icon: "chart", blurb: "Spot repeat waste, weigh the evidence, approve changes." },
  student: { label: "Student", icon: "cap", blurb: "Rate the food and see what the mess is changing." },
};

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-art">
        <Brand size={52} />
        <h1>Less food wasted. More loops closed.</h1>
        <p>MessLoop records leftovers, finds the dishes that keep coming back, and measures whether a change really helped.</p>
        <div className="role-cards">
          {(Object.keys(ROLE_META) as Role[]).map((r) => (
            <div key={r} className={`role-card role-${r}`}>
              <span className="tile" aria-hidden="true"><Icon name={ROLE_META[r].icon} size={22} /></span>
              <span><strong>{ROLE_META[r].label}</strong><br /><span className="small">{ROLE_META[r].blurb}</span></span>
            </div>
          ))}
        </div>
        <p className="small auth-note">Your role comes from the access code you were given.</p>
        <div className="auth-deco" aria-hidden="true">
          <Icon name="leaf" size={64} strokeWidth={1.5} /><Icon name="tomato" size={56} strokeWidth={1.5} /><Icon name="carrot" size={60} strokeWidth={1.5} />
        </div>
      </aside>
      <div className="auth-form">{children}</div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const hash = useHash();

  useEffect(() => {
    setUnauthorizedHandler(() => { saveSession(null); setSession(null); });
  }, []);

  // Role identity: accent colours are switched by a data attribute that follows the signed-in role.
  useEffect(() => {
    const el = document.documentElement;
    if (session) el.dataset.role = session.role; else delete el.dataset.role;
    el.lang = session?.role === "worker" ? "hi" : "en";
  }, [session]);

  if (!session) return <AuthShell><Login onLogin={(s) => { saveSession(s); setSession(s); go(HOME[s.role]); }} /></AuthShell>;

  const [, page, id] = hash.split("/");
  const allowed = NAV[session.role].some(([p]) => p === "/" + page) || (session.role === "manager" && page === "review");
  if (!allowed) {
    queueMicrotask(() => go(HOME[session.role]));
    return null;
  }

  let content;
  let banner: ReactNode = null;
  if (page === "entry") {
    banner = session.role === "worker"
      ? <Hero as="p" icon="bowl" title="आज का खाना दर्ज करें!" sub="बोलकर बताइए या खुद लिखिए — कितना बना और कितना बचा।" decor={["carrot", "chapati", "tomato"]} />
      : <Hero as="p" icon="bowl" title="Let's log this meal!" sub="Bol ke batao in Hindi, or type what was cooked and what was left over." decor={["carrot", "chapati", "tomato"]} />;
    content = <Entry role={session.role} />;
  } else if (page === "dashboard") content = <Dashboard />;
  else if (page === "review" && id) {
    banner = (
      <Hero as="p" icon="sparkle" title="Review this recommendation" sub="The agent gathered the evidence. You make the call." decor={["leaf", "scale", "bowl"]}>
        <a className="back" href="#/dashboard"><Icon name="arrowLeft" size={16} /> Back to dashboard</a>
      </Hero>
    );
    content = <Review recId={id} />;
  } else if (page === "feedback") content = <Feedback />;
  else if (page === "impact") content = <ImpactPage interventionId={id} role={session.role} />;

  const meta = ROLE_META[session.role];
  return (
    <div className="shell">
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <header className="topbar">
        <a className="brand" href={"#" + HOME[session.role]} aria-label="MessLoop home"><Brand /></a>
        <nav className="nav" aria-label="Main">
          {NAV[session.role].map(([path, label, icon]) => (
            <a key={path} href={"#" + path} aria-current={"/" + page === path ? "page" : undefined}><Icon name={icon} size={18} />{label}</a>
          ))}
          <span className="role-chip"><Icon name={meta.icon} size={15} />{meta.label}</span>
          <button type="button" onClick={() => { saveSession(null); setSession(null); go("/"); }}><Icon name="logout" size={16} />{session.role === "worker" ? "लॉग आउट" : "Log out"}</button>
        </nav>
      </header>
      {banner}
      <main id="main" tabIndex={-1} className="stack" style={{ gap: 20, outline: "none" }}>
        {content}
      </main>
      <Legend hindi={session.role === "worker"} />
      <p className="small muted tagline"><Icon name="loop" size={14} /> {session.role === "worker" ? "AI सुझाव देता है, फ़ैसला इंसान करते हैं, नतीजे बताते हैं क्या काम आया।" : "AI recommends. Humans decide. Measured outcomes determine what works."}</p>
    </div>
  );
}
