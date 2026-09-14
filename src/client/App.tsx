import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import {
  Award,
  Bell,
  BarChart3,
  CalendarCheck,
  Check,
  Coins,
  Gift,
  Home,
  Eye,
  EyeOff,
  Menu,
  Pencil,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  Users,
  WandSparkles,
  X,
} from "lucide-react";
import type { Chore, DashboardData, Reward, Theme } from "../shared/domain.ts";
import { levelProgress } from "../shared/rules.ts";
import { api, getDashboard, savePreferences } from "./api.ts";
const student = [
  ["", "Home", Home],
  ["chores", "My Chores", CalendarCheck],
  ["rewards", "Rewards Shop", Gift],
  ["achievements", "Achievements", Award],
  ["family", "Family", Users],
  ["notifications", "Notifications", Bell],
  ["settings", "Settings", Settings],
] as const;
const parent = [
  ["", "Dashboard", Home],
  ["chores", "Chore Management", CalendarCheck],
  ["approvals", "Approvals", ShieldCheck],
  ["rewards", "Rewards Management", Store],
  ["family", "Family Management", Users],
  ["reports", "Reports / Activity", BarChart3],
  ["notifications", "Notifications", Bell],
  ["settings", "Settings", Settings],
] as const;
const icons: Record<string, string> = {
  bedroom: "🛏️",
  other_bedrooms: "🧺",
  bathroom: "🫧",
  kitchen: "🍽️",
  attic: "📦",
  basement: "🧹",
  school: "📚",
  pets: "🐾",
  outdoors: "🌿",
  family: "🏡",
};
const ROOM_OPTIONS = [
  ["bedroom", "Kid's bedroom"],
  ["other_bedrooms", "Other bedrooms"],
  ["bathroom", "Bathroom"],
  ["kitchen", "Kitchen"],
  ["attic", "Attic"],
  ["basement", "Basement"],
  ["outdoors", "Outside"],
] as const;
const savedRooms = (userId: string) => {
  try { return JSON.parse(localStorage.getItem(`cq-rooms:${userId}`) ?? "[]") as string[]; }
  catch { return []; }
};
const avatarFor = (userId: string) => localStorage.getItem(`cq-avatar:${userId}`);
const fmt = (v: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(v));
const isArchived = (chore: Chore) =>
  ["approved", "completed"].includes(chore.status) &&
  new Date(chore.completedAt ?? chore.dueAt).getTime() <
    Date.now() - 2 * 86400000;
export default function App() {
  const [data, setData] = useState<DashboardData>(),
    [auth, setAuth] = useState(false),
    [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(false),
    [toast, setToast] = useState(""),
    [toastId, setToastId] = useState(0);
  const navigate = useNavigate();
  const knownNotices = useRef<Set<string> | null>(null);
  const load = async () => {
    try {
      setData(await getDashboard());
      setAuth(false);
    } catch {
      setData(undefined);
      setAuth(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!data) return;
    knownNotices.current = new Set(data.notifications.map((notice) => notice.id));
    const timer = window.setInterval(() => {
      void getDashboard().then((fresh) => {
        const incoming = fresh.notifications.find((notice) => !notice.read && !knownNotices.current?.has(notice.id));
        knownNotices.current = new Set(fresh.notifications.map((notice) => notice.id));
        if (incoming) {
          setToast(`${incoming.title}: ${incoming.body}`);
          setToastId((id) => id + 1);
        }
        setData(fresh);
      }).catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [data]);
  const act = async (f: () => Promise<unknown>, ok: string) => {
    try {
      await f();
      setToast(ok);
      setToastId((id) => id + 1);
      await load();
    } catch (e) {
      setToast((e as Error).message);
      setToastId((id) => id + 1);
    }
  };
  const signedIn = async () => {
    setLoading(true);
    await load();
    navigate("/parent");
  };
  if (loading)
    return (
      <div className="splash">
        <img
          className="splash-logo"
          src="/chorequest-logo.png"
          alt="ChoreQuest"
        />
        <p>Opening your family workspace…</p>
      </div>
    );
  if (auth || !data) return <AuthScreen done={signedIn} />;
  const role = data.user.role,
    nav = role === "student" ? student : parent,
    unreadCount = data.notifications.filter((notice) => !notice.read).length,
    changesCount = data.chores.filter((chore) => chore.status === "changes_requested").length;
  const markNotificationsRead = () => {
    setData((current) => current ? { ...current, notifications: current.notifications.map((notice) => ({ ...notice, read: true })) } : current);
    void api("/notifications/read", { method: "PUT" });
  };
  const signOut = async () => {
    await api("/auth/logout", { method: "POST" });
    setData(undefined);
    setAuth(true);
    navigate("/");
  };
  return (
    <div
      className={`app role-${role} theme-${data.user.theme} ${data.user.animation ? "animated" : ""}`}
    >
      <div className="background" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="shell">
        <aside className={menu ? "sidebar open" : "sidebar"}>
          <div className="brand">
            <img
              className="brand-logo"
              src="/chorequest-logo.png"
              alt="ChoreQuest"
            />
            <button
              className="icon mobile"
              aria-label="Close menu"
              onClick={() => setMenu(false)}
            >
              <X />
            </button>
          </div>
          <nav>
            {nav.map(([p, l, I]) => (
              <NavLink
                end={!p}
                key={l}
                to={`/${role}${p ? `/${p}` : ""}`}
                onClick={() => setMenu(false)}
              >
                <I />
                <span>{l}</span>
                {l === "Approvals" && data.pendingCount ? (
                  <b>{data.pendingCount}</b>
                ) : null}
                {l === "My Chores" && changesCount ? <b>{changesCount}</b> : null}
                {l === "Notifications" && unreadCount ? <b>{unreadCount}</b> : null}
                {l === "Rewards Management" && !data.rewards.length ? <b>!</b> : null}
              </NavLink>
            ))}
          </nav>
          <div className="tip">
            <img className="tip-mascot" src={role === "student" ? (data.user.streak > 1 ? "/mascot/fire-eyes.png" : "/mascot/weights.png") : "/mascot/analyze.png"} alt="" />
            <strong>
              {role === "student" ? "Keep the streak!" : "Family pulse"}
            </strong>
            <p>
              {role === "student"
                ? `${data.user.streak} days strong.`
                : `${data.pendingCount} awaiting review.`}
            </p>
          </div>
        </aside>
        <main>
          <header>
            <button
              className="icon mobile"
              onClick={() => setMenu(true)}
              aria-label="Open menu"
            >
              <Menu />
            </button>
            <span className="workspace-label">
              {role === "parent" ? "Parent workspace" : "Student space"}
            </span>
            <div className="header-user">
              {role === "student" ? (
                <button
                  className="currency"
                  aria-label={`${data.user.points} spendable points`}
                >
                  <Coins />
                  {data.user.points}
                </button>
              ) : null}
              <NavLink
                className="icon"
                aria-label="Notifications"
                to={`/${role}/notifications`}
              >
                <Bell />
                {unreadCount ? <b className="notification-ping">{unreadCount}</b> : null}
              </NavLink>
              <span className="avatar">
                {avatarFor(data.user.id) ? <img src={avatarFor(data.user.id)!} alt="" /> : data.user.name
                  .split(" ")
                  .map((x) => x[0])
                  .join("")}
              </span>
              <div>
                <strong>{data.user.name}</strong>
                <small>{role}</small>
              </div>
              <button className="signout" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          </header>
          <div className="page">
            <Routes>
              <Route path="/" element={<Navigate to={`/${role}`} replace />} />
              <Route path="/student" element={<StudentHome d={data} />} />
              <Route
                path="/student/chores"
                element={<StudentChores d={data} act={act} />}
              />
              <Route
                path="/student/rewards"
                element={<Rewards d={data} act={act} />}
              />
              <Route path="/student/achievements" element={<Achievements d={data} />} />
              <Route
                path="/student/family"
                element={<Family d={data} act={act} />}
              />
              <Route
                path="/student/notifications"
                element={<Notifications d={data} onRead={markNotificationsRead} />}
              />
              <Route
                path="/student/settings"
                element={<Prefs d={data} act={act} />}
              />
              <Route path="/parent" element={<ParentHome d={data} />} />
              <Route
                path="/parent/chores"
                element={<ParentChores d={data} act={act} />}
              />
              <Route
                path="/parent/approvals"
                element={<Approvals d={data} act={act} />}
              />
              <Route
                path="/parent/rewards"
                element={<ParentRewards d={data} act={act} />}
              />
              <Route
                path="/parent/family"
                element={<Family d={data} act={act} />}
              />
              <Route path="/parent/reports" element={<Reports d={data} />} />
              <Route
                path="/parent/notifications"
                element={<Notifications d={data} onRead={markNotificationsRead} />}
              />
              <Route
                path="/parent/settings"
                element={<Prefs d={data} act={act} />}
              />
              <Route path="*" element={<Empty title="Page not found" />} />
            </Routes>
          </div>
        </main>
      </div>
      <div
        key={toastId}
        className={toast ? "toast show" : "toast"}
        role="status"
      >
        {toast}
      </div>
    </div>
  );
}
function AuthScreen({ done }: { done: () => Promise<void> }) {
  const [mode, setMode] = useState<"register" | "login" | "student">(
      "register",
    ),
    [error, setError] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const body =
      mode === "register"
        ? {
            name: f.get("name"),
            email: f.get("email"),
            password: f.get("password"),
            familyName: f.get("familyName"),
          }
        : mode === "login"
          ? { email: f.get("email"), password: f.get("password") }
          : {
              parentEmail: f.get("parentEmail"),
              name: f.get("studentName"),
              pin: f.get("pin"),
            };
    try {
      await api(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await done();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-page">
      <div className="auth-art">
        <img src="/chorequest-logo.png" alt="ChoreQuest" />
        <div>
          <p className="eyebrow">CHORES. PROGRESS. REWARDS.</p>
          <h1>One place for the family routine.</h1>
        </div>
        <div className="auth-orbit" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </div>
      <main className="auth-panel">
        <div className="auth-card">
          <div className="auth-tabs">
            <button
              className={mode !== "student" ? "active" : ""}
              onClick={() =>
                setMode(mode === "register" ? "register" : "login")
              }
            >
              Parent
            </button>
            <button
              className={mode === "student" ? "active" : ""}
              onClick={() => setMode("student")}
            >
              Student
            </button>
          </div>
          <p className="eyebrow">
            {mode === "register"
              ? "CREATE A FAMILY"
              : mode === "login"
                ? "PARENT SIGN IN"
                : "STUDENT SIGN IN"}
          </p>
          <h2>
            {mode === "register"
              ? "Start as a parent"
              : mode === "login"
                ? "Welcome back"
                : "Open your chore list"}
          </h2>
          <form onSubmit={submit}>
            {mode === "register" ? (
              <>
                <label>
                  Your name
                  <input
                    name="name"
                    required
                    minLength={2}
                    autoComplete="name"
                  />
                </label>
                <label>
                  Family name
                  <input name="familyName" required minLength={2} />
                </label>
              </>
            ) : null}
            {mode === "student" ? (
              <>
                <label>
                  Parent's email
                  <input
                    name="parentEmail"
                    type="email"
                    required
                    autoComplete="email"
                  />
                </label>
                <label>
                  Your name
                  <input
                    name="studentName"
                    required
                    minLength={2}
                    autoComplete="username"
                  />
                </label>
                <label>
                  4-digit PIN
                  <input
                    name="pin"
                    required
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    autoComplete="current-password"
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                  />
                </label>
                <label>
                  Password
                  <span className="password-field">
                    <input
                      name="password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={mode === "register" ? 8 : 1}
                      autoComplete={
                        mode === "register" ? "new-password" : "current-password"
                      }
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword((shown) => !shown)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </span>
                </label>
              </>
            )}
            {error ? <p className="auth-error">{error}</p> : null}
            <button className="button primary" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "register"
                  ? "Create family"
                  : mode === "login"
                    ? "Sign in"
                    : "Enter student space"}
            </button>
          </form>
          {mode !== "student" ? (
            <button
              className="text-button"
              onClick={() => {
                setMode(mode === "register" ? "login" : "register");
                setError("");
              }}
            >
              {mode === "register"
                ? "Already have an account? Sign in"
                : "Create a parent account"}
            </button>
          ) : (
            <button
              className="text-button"
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Back to parent sign in
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
function Title({
  over,
  title,
  copy,
  children,
}: {
  over: string;
  title: string;
  copy: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <p className="eyebrow">{over}</p>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      {children}
    </div>
  );
}
function Progress({ value }: { value: number }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <i style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}
function Status({ s }: { s: string }) {
  return <span className={`status ${s}`}>{s.replace("_", " ")}</span>;
}
function List({ items, open }: { items: Chore[]; open?: (c: Chore) => void }) {
  if (!items.length) return <Empty title="All clear!" image="/mascot/hammock.png" />;
  return (
    <div className="chore-list">
      {items.map((c) => (
        <button
          key={c.id}
          className="chore"
          disabled={!open}
          onClick={() => open?.(c)}
        >
          <span className="cat">{icons[c.category]}</span>
          <span>
            <strong>{c.title}</strong>
            <small>
              {fmt(c.dueAt)} · {c.assigneeName}
            </small>
          </span>
          <Status s={c.status} />
          <b>+{c.points}</b>
        </button>
      ))}
    </div>
  );
}
function StudentHome({ d }: { d: DashboardData }) {
  const p = levelProgress(d.user.xp),
    goal = d.rewards.find((r) => r.goal),
    today = d.chores.filter(
      (c) => new Date(c.dueAt).toDateString() === new Date().toDateString(),
    );
  return (
    <>
      <Title
        over={new Intl.DateTimeFormat(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
          .format(new Date())
          .toUpperCase()}
        title={`Hey, ${d.user.name.split(" ")[0]}!`}
        copy="Ready to earn some points today?"
      ><img className="title-mascot" src="/mascot/wave.png" alt="ChoreQuest dog waving" /></Title>
      <div className="hero-grid">
        <section className="points">
          <p className="eyebrow">YOUR PROGRESS</p>
          <strong>
            {d.user.points}
            <small> pts</small>
          </strong>
          <span>
            Level {p.level} · {p.current}/{p.needed} XP
          </span>
          <Progress value={p.percent} />
        </section>
        <section className="streak mascot-card">
          <img src={d.user.streak > 1 ? "/mascot/fire-eyes.png" : "/mascot/weights.png"} alt="ChoreQuest streak mascot" />
          <div>
            <p className="eyebrow">CURRENT STREAK</p>
            <strong>{d.user.streak} days</strong>
            <span>Best: {d.user.bestStreak}</span>
          </div>
        </section>
      </div>
      <Section
        title="Today’s quests"
        copy="A little progress makes a big difference."
      >
        <List items={today} />
      </Section>
      <div className="two">
        <Section
          title="Active reward goal"
          copy="Your next win is getting closer."
        >
          {goal ? (
            <>
              <img className="goal-mascot" src="/mascot/flex.png" alt="ChoreQuest dog celebrating a reward goal" />
              <h3>
                {goal.icon} {goal.name}
              </h3>
              <Progress value={Math.round((d.user.points / goal.cost) * 100)} />
              <p>
                {d.user.points} / {goal.cost} points
              </p>
            </>
          ) : (
            <Empty title="Choose a reward goal" image="/mascot/rocket.png" />
          )}
        </Section>
        <Activity d={d} />
      </div>
    </>
  );
}
function ParentHome({ d }: { d: DashboardData }) {
  return (
    <>
      <Title
        over="FAMILY OVERVIEW"
        title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${d.user.name.split(" ")[0]}`}
        copy="Here’s what needs attention across your family today."
      ><img className="title-mascot" src="/mascot/analyze.png" alt="ChoreQuest dog reviewing a checklist" /></Title>
      {!savedRooms(d.user.id).length ? <div className="setup-banner"><b>Choose your chore rooms</b><span>Set which parts of the home should appear in guided suggestions.</span><NavLink className="button secondary" to="/parent/settings">Choose rooms</NavLink></div> : null}
      <div className="command-strip">
        <NavLink to="/parent/chores">
          <Plus />
          <span>
            <strong>Assign a chore</strong>
            <small>Create one-time or repeating work</small>
          </span>
        </NavLink>
        <NavLink to="/parent/approvals">
          <ShieldCheck />
          <span>
            <strong>Review submissions</strong>
            <small>
              {d.pendingCount
                ? `${d.pendingCount} waiting for you`
                : "Nothing waiting"}
            </small>
          </span>
        </NavLink>
        <NavLink to="/parent/rewards">
          <Gift />
          <span>
            <strong>Manage rewards</strong>
            <small>{d.rewards.length} rewards available</small>
          </span>
        </NavLink>
        <NavLink to="/parent/family">
          <Users />
          <span>
            <strong>Add a child</strong>
            <small>Manage family profiles</small>
          </span>
        </NavLink>
      </div>
      <div className="stats">
        <article>
          <span>Needs review</span>
          <b>{d.pendingCount}</b>
        </article>
        <article>
          <span>Active chores</span>
          <b>{d.chores.length}</b>
        </article>
        <article>
          <span>Completed</span>
          <b>
            {
              d.chores.filter((c) =>
                ["approved", "completed"].includes(c.status),
              ).length
            }
          </b>
        </article>
        <article>
          <span>Children</span>
          <b>{d.children.length}</b>
        </article>
      </div>
      {d.children.length ? (
        <Section title="Children" copy="Points, levels, and momentum.">
          <div className="people">
            {d.children.map((c) => (
              <article key={c.id}>
                <span className="avatar">{avatarFor(c.id) ? <img src={avatarFor(c.id)!} alt="" /> : c.name[0]}</span>
                <div>
                  <h3>{c.name}</h3>
                  <p>
                    {c.points} points · Level {c.level}
                  </p>
                </div>
                <b>🔥 {c.streak} days</b>
              </article>
            ))}
          </div>
        </Section>
      ) : (
        <section className="onboarding-empty">
          <div>
            <p className="eyebrow">FIRST STEP</p>
            <h2>Add your first child profile</h2>
            <p>
              Once they’re added, you can assign chores and create rewards for
              them.
            </p>
          </div>
          <NavLink className="button primary" to="/parent/family">
            <Plus />
            Add a child
          </NavLink>
        </section>
      )}
      <div className="two">
        <Section title="Needs review" copy="Share timely feedback.">
          <List items={d.chores.filter((c) => c.status === "pending")} />
        </Section>
        <Activity d={d} />
      </div>
    </>
  );
}
function Section({
  title,
  copy,
  children,
}: {
  title: string;
  copy: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          <p>{copy}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
function Empty({ title, copy = "Nothing needs attention here right now.", image }: { title: string; copy?: string; image?: string }) {
  return (
    <div className="empty">
      {image ? <img className="empty-mascot" src={image} alt="" /> : <Sparkles />}
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}
function StudentChores({ d, act }: { d: DashboardData; act: Act }) {
  const [filter, setFilter] = useState("active"),
    [chosen, setChosen] = useState<Chore>();
  const list = d.chores.filter((c) =>
    filter === "archive"
      ? isArchived(c)
      : !isArchived(c) && (filter === "active" || c.status === filter),
  );
  return (
    <>
      <Title
        over="CHORE LOG"
        title="My chores"
        copy="Active work and history."
      />
      <div className="tabs">
        {[
          ["active", "Active"],
          ["todo", "To do"],
          ["pending", "Pending"],
          ["changes_requested", "Needs changes"],
          ["archive", "Archive"],
        ].map(([value, label]) => (
          <button
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
            key={value}
          >
            {label}
          </button>
        ))}
      </div>
      <Section
        title={filter === "archive" ? "Archive" : "Assignments"}
        copy={`${list.length} ${list.length === 1 ? "item" : "items"}`}
      >
        <List items={list} open={setChosen} />
      </Section>
      {chosen ? (
        <ChoreDialog
          c={chosen}
          history={d.chores.filter(
            (item) =>
              item.templateId === chosen.templateId &&
              item.assigneeId === chosen.assigneeId,
          )}
          close={() => setChosen(undefined)}
          submit={(note, proof) =>
            act(
              () =>
                api(`/student/assignments/${chosen.id}/submit`, {
                  method: "POST",
                  body: JSON.stringify({ note, proofUrl: proof || undefined }),
                }),
              chosen.requiresApproval
                ? "Submitted for parent verification."
                : "Chore completed!",
            )
          }
        />
      ) : null}
    </>
  );
}
type Act = (f: () => Promise<unknown>, ok: string) => Promise<void>;
function ChoreDialog({
  c,
  history,
  close,
  submit,
}: {
  c: Chore;
  history: Chore[];
  close: () => void;
  submit: (n: string, p: string) => Promise<void>;
}) {
  const [note, setNote] = useState(""),
    [proof, setProof] = useState(""),
    can = ["todo", "changes_requested", "rejected"].includes(c.status);
  return (
    <div className="backdrop">
      <dialog open>
        <button className="icon close" onClick={close} aria-label="Close">
          <X />
        </button>
        <span className="cat big">{icons[c.category]}</span>
        <h2>{c.title}</h2>
        {c.description ? <p>{c.description}</p> : null}
        <dl>
          <div>
            <dt>Due</dt>
            <dd>{fmt(c.dueAt)}</dd>
          </div>
          <div>
            <dt>Reward</dt>
            <dd>
              {c.points} pts · {c.xp} XP
            </dd>
          </div>
        </dl>
        {c.feedback ? (
          <aside>
            <strong>Parent feedback</strong>
            <p>{c.feedback}</p>
          </aside>
        ) : null}
        {can ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit(note, proof).then(close);
            }}
          >
            <label>
              Note
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <label>
              Proof URL {c.requiresProof ? "(required)" : ""}
              <input
                type="url"
                required={c.requiresProof}
                value={proof}
                onChange={(e) => setProof(e.target.value)}
              />
            </label>
            <button className="button primary">
              {c.requiresApproval ? "Submit" : "Complete"}
            </button>
          </form>
        ) : (
          <p className="notice">
            <Status s={c.status} />
          </p>
        )}
        {history.length > 1 ? (
          <div className="history">
            <h3>History</h3>
            {history.map((item) => (
              <div key={item.id}>
                <span>{fmt(item.dueAt)}</span>
                <Status s={item.status} />
              </div>
            ))}
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
function Rewards({ d, act }: { d: DashboardData; act: Act }) {
  return (
    <>
      <Title
        over="REWARDS SHOP"
        title="Turn points into something fun"
        copy="Choose a goal or redeem when you have enough."
      />
      <div className="rewards">
        {d.rewards.filter((r) => r.enabled).length ? d.rewards
          .filter((r) => r.enabled)
          .map((r) => (
            <RewardCard
              key={r.id}
              r={r}
              points={d.user.points}
              goal={() =>
                act(
                  () =>
                    api(`/student/rewards/${r.id}/goal`, { method: "POST" }),
                  "Goal updated!",
                )
              }
              redeem={() =>
                act(
                  () =>
                    api(`/student/rewards/${r.id}/redeem`, {
                      method: "POST",
                      headers: { "Idempotency-Key": crypto.randomUUID() },
                    }),
                  "Reward requested!",
                )
              }
            />
          )) : <Empty image="/mascot/empty-gift.png" title="No rewards yet" copy="Looks like your parent hasn't added any rewards for you! Talk to them about adding something fun to work toward." />}
      </div>
    </>
  );
}
function RewardCard({
  r,
  points,
  goal,
  redeem,
}: {
  r: Reward;
  points: number;
  goal: () => void;
  redeem: () => void;
}) {
  return (
    <article className={r.goal ? "reward goal" : "reward"}>
      {r.goal ? <img className="reward-mascot" src="/mascot/rocket.png" alt="ChoreQuest dog rocketing toward a goal" /> : null}
      <span>{r.icon}</span>
      {r.goal ? <i>Active goal</i> : null}
      <h2>{r.name}</h2>
      <p>{r.description}</p>
      <strong>{r.cost} points</strong>
      <Progress value={Math.round((points / r.cost) * 100)} />
      <small>
        {Math.max(0, r.cost - points)} points to go · {r.stock} left
      </small>
      <div>
        <button className="button secondary" onClick={goal} disabled={r.goal}>
          {r.goal ? "Goal selected" : "Set goal"}
        </button>
        <button
          className="button primary"
          onClick={redeem}
          disabled={points < r.cost}
        >
          Redeem
        </button>
      </div>
    </article>
  );
}
function ParentChores({ d, act }: { d: DashboardData; act: Act }) {
  const [createOpen, setCreateOpen] = useState(false),
    [ideasOpen, setIdeasOpen] = useState(false),
    [view, setView] = useState<"active" | "archive">("active"),
    [chosen, setChosen] = useState<Chore>(),
    [editing, setEditing] = useState<Chore>(),
    [query, setQuery] = useState(""),
    [student, setStudent] = useState("all"),
    [status, setStatus] = useState("all"),
    [selected, setSelected] = useState<string[]>([]);
  const list = d.chores.filter(
    (c) =>
      (view === "archive" ? isArchived(c) : !isArchived(c)) &&
      (student === "all" || c.assigneeId === student) &&
      (status === "all" || c.status === status) &&
      `${c.title} ${c.assigneeName}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const remove = async (ids: string[]) => {
    if (
      !ids.length ||
      !window.confirm(
        `Remove ${ids.length} chore${ids.length === 1 ? "" : "s"}?`,
      )
    )
      return;
    await act(
      () =>
        ids.length === 1
          ? api(`/parent/assignments/${ids[0]}`, { method: "DELETE" })
          : api("/parent/chores/bulk-delete", {
              method: "POST",
              body: JSON.stringify({ assignmentIds: ids }),
            }),
      ids.length === 1 ? "Chore removed." : "Chores removed.",
    );
    setSelected([]);
    setChosen(undefined);
  };
  return (
    <>
      <Title over="CHORES" title="Chores" copy="">
        <div className="actions">
          <button
            className="button secondary"
            onClick={() => setIdeasOpen(true)}
          >
            <WandSparkles />
            Generate ideas
          </button>
          <button
            className="button primary"
            onClick={() => setCreateOpen(true)}
          >
            <Plus />
            New chore
          </button>
        </div>
      </Title>
      <div className="manager-tools">
        <label className="search-field">
          <Search />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chores"
          />
        </label>
        <select value={student} onChange={(e) => setStudent(e.target.value)}>
          <option value="all">All kids</option>
          {d.children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="todo">To do</option>
          <option value="pending">Pending</option>
          <option value="changes_requested">Needs changes</option>
          <option value="completed">Completed</option>
          <option value="approved">Approved</option>
        </select>
      </div>
      <div className="tabs manager-tabs">
        <button
          className={view === "active" ? "active" : ""}
          onClick={() => setView("active")}
        >
          Active
        </button>
        <button
          className={view === "archive" ? "active" : ""}
          onClick={() => setView("archive")}
        >
          Archive
        </button>
        {selected.length ? (
          <button className="bulk-danger" onClick={() => void remove(selected)}>
            <Trash2 />
            Remove {selected.length}
          </button>
        ) : null}
        <button
          className="clear-link"
          onClick={() => {
            if (
              window.confirm(
                "Remove every active chore? Past activity and points stay saved.",
              )
            )
              void act(
                () => api("/parent/chores", { method: "DELETE" }),
                "All chores cleared.",
              );
          }}
        >
          Clear all
        </button>
      </div>
      <Section
        title={view === "active" ? "Active" : "Archive"}
        copy={`${list.length} chores`}
      >
        <div className="chore-list">
          {list.length ? (
            list.map((c) => (
              <div className="chore manage-chore" key={c.id}>
                <input
                  type="checkbox"
                  aria-label={`Select ${c.title}`}
                  checked={selected.includes(c.id)}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked
                        ? [...s, c.id]
                        : s.filter((id) => id !== c.id),
                    )
                  }
                />
                <button className="chore-main" onClick={() => setChosen(c)}>
                  <span className="cat">{icons[c.category]}</span>
                  <span>
                    <strong>{c.title}</strong>
                    <small>
                      {c.assigneeName} · {fmt(c.dueAt)}
                    </small>
                  </span>
                  <Status s={c.status} />
                  <b>+{c.points}</b>
                </button>
                <div className="row-actions">
                  <button
                    aria-label={`Edit ${c.title}`}
                    onClick={() => setEditing(c)}
                  >
                    <Pencil />
                  </button>
                  <button
                    className="danger-link"
                    aria-label={`Remove ${c.title}`}
                    onClick={() => void remove([c.id])}
                  >
                    <Trash2 />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <Empty title="No chores found" />
          )}
        </div>
      </Section>
      {createOpen ? (
        <ChoreForm
          d={d}
          close={() => setCreateOpen(false)}
          save={(b) =>
            act(
              () =>
                api("/parent/chores", {
                  method: "POST",
                  body: JSON.stringify(b),
                }),
              "Chore assigned!",
            )
          }
        />
      ) : null}
      {editing ? (
        <ChoreForm
          d={d}
          initial={editing}
          close={() => setEditing(undefined)}
          save={(b) =>
            act(
              () =>
                api(`/parent/assignments/${editing.id}`, {
                  method: "PUT",
                  body: JSON.stringify(b),
                }),
              "Chore updated.",
            )
          }
        />
      ) : null}
      {ideasOpen ? (
        <ChoreIdeas d={d} close={() => setIdeasOpen(false)} act={act} />
      ) : null}
      {chosen ? (
        <HistoryDialog
          chore={chosen}
          items={d.chores.filter(
            (item) =>
              item.templateId === chosen.templateId &&
              item.assigneeId === chosen.assigneeId,
          )}
          close={() => setChosen(undefined)}
        />
      ) : null}
    </>
  );
}
function HistoryDialog({
  chore,
  items,
  close,
}: {
  chore: Chore;
  items: Chore[];
  close: () => void;
}) {
  return (
    <div className="backdrop">
      <dialog open>
        <button className="icon close" onClick={close} aria-label="Close">
          <X />
        </button>
        <p className="eyebrow">CHORE HISTORY</p>
        <h2>{chore.title}</h2>
        <p>
          {chore.assigneeName} ·{" "}
          {chore.recurrence === "none" ? "One time" : chore.recurrence}
        </p>
        <div className="history">
          {items.map((item) => (
            <div key={item.id}>
              <span>{fmt(item.dueAt)}</span>
              <Status s={item.status} />
            </div>
          ))}
        </div>
      </dialog>
    </div>
  );
}
function ChoreForm({
  d,
  initial,
  close,
  save,
}: {
  d: DashboardData;
  initial?: Chore;
  close: () => void;
  save: (b: unknown) => Promise<void>;
}) {
  const local = initial
    ? new Date(
        new Date(initial.dueAt).getTime() -
          new Date().getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 16)
    : "";
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      assigneeIds = f.getAll("assignees"),
      body = {
        title: f.get("title"),
        description: f.get("description") || "",
        category: f.get("category"),
        difficulty: f.get("difficulty"),
        points: Number(f.get("points")),
        xp: Number(f.get("xp")),
        dueAt: new Date(String(f.get("dueAt"))).toISOString(),
        recurrence: f.get("recurrence"),
        requiresApproval: f.get("approval") === "on",
        requiresProof: f.get("proof") === "on",
        ...(!initial ? { assigneeIds } : {}),
      };
    if (!initial && !assigneeIds.length) return;
    void save(body).then(close);
  };
  return (
    <div className="backdrop">
      <dialog open>
        <button className="icon close" onClick={close} aria-label="Close">
          <X />
        </button>
        <h2>{initial ? "Edit chore" : "New chore"}</h2>
        <form onSubmit={submit}>
          <label>
            Title
            <input
              name="title"
              minLength={2}
              required
              defaultValue={initial?.title}
            />
          </label>
          <label>
            Details <small>Optional</small>
            <textarea name="description" defaultValue={initial?.description} />
          </label>
          <div className="form-grid">
            <label>
              Category
              <select name="category" defaultValue={initial?.category}>
                {Object.keys(icons).map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Difficulty
              <select name="difficulty" defaultValue={initial?.difficulty}>
                <option>easy</option>
                <option>medium</option>
                <option>hard</option>
              </select>
            </label>
            <label>
              Points
              <input
                name="points"
                type="number"
                min="1"
                defaultValue={initial?.points ?? 25}
              />
            </label>
            <label>
              XP
              <input
                name="xp"
                type="number"
                min="1"
                defaultValue={initial?.xp ?? 35}
              />
            </label>
            <label>
              Due
              <input
                name="dueAt"
                type="datetime-local"
                required
                defaultValue={local}
              />
            </label>
            <label>
              Repeat
              <select
                name="recurrence"
                defaultValue={initial?.recurrence ?? "none"}
              >
                <option value="none">Never</option>
                <option>daily</option>
                <option>weekly</option>
              </select>
            </label>
          </div>
          {!initial ? (
            <fieldset>
              <legend>Assign to</legend>
              {d.children.map((c) => (
                <label className="checkline" key={c.id}>
                  <input name="assignees" type="checkbox" value={c.id} />
                  {c.name}
                </label>
              ))}
            </fieldset>
          ) : null}
          <label className="checkline">
            <input
              name="approval"
              type="checkbox"
              defaultChecked={initial?.requiresApproval ?? true}
            />
            Parent checks it first
          </label>
          <label className="checkline">
            <input
              name="proof"
              type="checkbox"
              defaultChecked={initial?.requiresProof}
            />
            Ask for proof
          </label>
          <button className="button primary">
            {initial ? "Save" : "Assign chore"}
          </button>
        </form>
      </dialog>
    </div>
  );
}
const choreIdeas = [
  { title: "Make the bed", category: "bedroom", difficulty: "easy", points: 15, minAge: 4 },
  { title: "Put toys in their bins", category: "bedroom", difficulty: "easy", points: 15, minAge: 4 },
  { title: "Put clothes in the hamper", category: "bedroom", difficulty: "easy", points: 15, minAge: 4 },
  { title: "Fold and put away clothes", category: "bedroom", difficulty: "medium", points: 30, minAge: 8 },
  { title: "Straighten pillows and blankets", category: "other_bedrooms", difficulty: "easy", points: 15, minAge: 5 },
  { title: "Dust bedroom surfaces", category: "other_bedrooms", difficulty: "medium", points: 25, minAge: 7 },
  { title: "Put bathroom towels away", category: "bathroom", difficulty: "easy", points: 20, minAge: 5 },
  { title: "Wipe the bathroom sink", category: "bathroom", difficulty: "easy", points: 20, minAge: 6 },
  { title: "Restock toilet paper", category: "bathroom", difficulty: "easy", points: 15, minAge: 6 },
  { title: "Clean the bathroom mirror", category: "bathroom", difficulty: "medium", points: 30, minAge: 8 },
  { title: "Scrub the bathtub", category: "bathroom", difficulty: "hard", points: 50, minAge: 12 },
  { title: "Set the table", category: "kitchen", difficulty: "easy", points: 15, minAge: 4 },
  { title: "Wipe kitchen counters", category: "kitchen", difficulty: "easy", points: 20, minAge: 6 },
  { title: "Unload safe dishwasher items", category: "kitchen", difficulty: "medium", points: 30, minAge: 7 },
  { title: "Sweep the kitchen floor", category: "kitchen", difficulty: "medium", points: 30, minAge: 8 },
  { title: "Sort one attic box", category: "attic", difficulty: "medium", points: 35, minAge: 10 },
  { title: "Carry light storage items", category: "attic", difficulty: "medium", points: 30, minAge: 9 },
  { title: "Sweep the basement", category: "basement", difficulty: "medium", points: 35, minAge: 9 },
  { title: "Organize basement games", category: "basement", difficulty: "easy", points: 25, minAge: 6 },
  { title: "Pick up sticks outside", category: "outdoors", difficulty: "easy", points: 20, minAge: 5 },
  { title: "Water outdoor plants", category: "outdoors", difficulty: "easy", points: 20, minAge: 5 },
  { title: "Take out recycling", category: "outdoors", difficulty: "medium", points: 30, minAge: 8 },
  { title: "Rake a small area", category: "outdoors", difficulty: "hard", points: 45, minAge: 10 },
];
function ChoreIdeas({
  d,
  close,
  act,
}: {
  d: DashboardData;
  close: () => void;
  act: Act;
}) {
  const [childId, setChildId] = useState(d.children[0]?.id ?? ""),
    [rooms, setRooms] = useState<string[]>(() => savedRooms(d.user.id).length ? savedRooms(d.user.id) : ["bedroom", "bathroom", "kitchen"]),
    [picked, setPicked] = useState<string[]>([]);
  const child = d.children.find((c) => c.id === childId),
    ideas = choreIdeas
      .filter((x) => rooms.includes(x.category) && x.minAge <= (child?.age ?? 8))
      .slice(0, 12);
  const add = () =>
    void act(
      () =>
        Promise.all(
          ideas
            .filter((x) => picked.includes(x.title))
            .map((x, i) => {
              const due = new Date();
              due.setDate(due.getDate() + 1 + (i % 2));
              due.setHours(18, 0, 0, 0);
              return api("/parent/chores", {
                method: "POST",
                body: JSON.stringify({
                  ...x,
                  description: "",
                  xp: x.points + 10,
                  dueAt: due.toISOString(),
                  recurrence: "weekly",
                  requiresApproval: true,
                  requiresProof: false,
                  assigneeIds: [childId],
                }),
              });
            }),
        ),
      "Chore ideas added.",
    ).then(close);
  return (
    <div className="backdrop">
      <dialog open>
        <button className="icon close" onClick={close}>
          <X />
        </button>
        <p className="eyebrow">GUIDED GENERATOR</p>
        <h2>Generate chore ideas</h2>
        <div className="form-grid">
          <label>
            Kid
            <select
              value={childId}
              onChange={(e) => setChildId(e.target.value)}
            >
              {d.children.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                  {c.age ? ` (${c.age})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>Rooms
            <details className="multi-select">
              <summary>{rooms.length ? `${rooms.length} selected` : "Choose rooms"}</summary>
              <div>{ROOM_OPTIONS.map(([value, label]) => <label className="checkline" key={value}><input type="checkbox" checked={rooms.includes(value)} onChange={(event) => setRooms((current) => event.target.checked ? [...current, value] : current.filter((room) => room !== value))} />{label}</label>)}</div>
            </details>
          </label>
        </div>
        {child ? (
          <p className="notice">
            Ideas for age {child.age ?? "not set"}{child.interests ? ` · ${child.interests}` : ""}
          </p>
        ) : null}
        <div className="idea-grid">
          {ideas.map((x) => (
            <label
              key={x.title}
              className={picked.includes(x.title) ? "idea selected" : "idea"}
            >
              <input
                type="checkbox"
                checked={picked.includes(x.title)}
                onChange={(e) =>
                  setPicked((s) =>
                    e.target.checked
                      ? [...s, x.title]
                      : s.filter((v) => v !== x.title),
                  )
                }
              />
              <span>{icons[x.category]}</span>
              <strong>{x.title}</strong>
              <small>{x.points} pts · weekly</small>
            </label>
          ))}
          {!ideas.length ? <p className="notice">No ideas match yet. Select more rooms or add the child's age in Family Management.</p> : null}
        </div>
        <button
          className="button primary"
          disabled={!picked.length || !childId}
          onClick={add}
        >
          <WandSparkles />
          Add {picked.length || ""} chore{picked.length === 1 ? "" : "s"}
        </button>
      </dialog>
    </div>
  );
}
function Approvals({ d, act }: { d: DashboardData; act: Act }) {
  const [c, setC] = useState<Chore>();
  return (
    <>
      <Title over="APPROVALS" title="Check completed chores" copy="" />
      <Section title="Waiting" copy={`${d.pendingCount}`}>
        <List
          items={d.chores.filter((x) => x.status === "pending")}
          open={setC}
        />
      </Section>
      {c ? <Decision c={c} close={() => setC(undefined)} act={act} /> : null}
    </>
  );
}
function Decision({
  c,
  close,
  act,
}: {
  c: Chore;
  close: () => void;
  act: Act;
}) {
  const [note, setNote] = useState("");
  const run = (decision: "approved" | "changes_requested") =>
    void act(
      () =>
        api(`/parent/submissions/${c.submissionId}/decision`, {
          method: "POST",
          body: JSON.stringify({ decision, note }),
        }),
      decision === "approved" ? "Approved. Points added." : "Sent back.",
    ).then(close);
  return (
    <div className="backdrop">
      <dialog open>
        <button className="icon close" onClick={close}>
          <X />
        </button>
        <p className="eyebrow">{c.assigneeName}</p>
        <h2>{c.title}</h2>
        <p>{c.points} points</p>
        <label>
          Note <small>Only needed when sending it back</small>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What needs fixing?"
          />
        </label>
        <div className="actions">
          <button className="button success" onClick={() => run("approved")}>
            <Check />
            Approve
          </button>
          <button
            className="button warning"
            disabled={!note.trim()}
            onClick={() => run("changes_requested")}
          >
            Send back
          </button>
        </div>
      </dialog>
    </div>
  );
}
function ParentRewards({ d, act }: { d: DashboardData; act: Act }) {
  const [editing, setEditing] = useState<Reward | undefined>(),
    [open, setOpen] = useState(false),
    [ideasOpen, setIdeasOpen] = useState(false);
  return (
    <>
      <Title
        over="FAMILY SHOP"
        title="Rewards management"
        copy="Create rewards that feel worth working toward."
      >
        <div className="actions"><button className="button secondary" onClick={() => setIdeasOpen(true)}><WandSparkles />Generate ideas</button><button className="button primary" onClick={() => setOpen(true)}><Plus />New reward</button></div>
      </Title>
      <div className="manage-grid">
        {d.rewards.length ? d.rewards.map((r) => (
          <article className="manage-card" key={r.id}>
            <span>{r.icon}</span>
            <div>
              <h2>{r.name}</h2>
              <p>{r.description}</p>
              <small>
                {r.cost} pts · {r.stock} available ·{" "}
                {r.enabled ? "Live" : "Paused"}
              </small>
            </div>
            <button className="button secondary" onClick={() => setEditing(r)}>
              Edit
            </button>
          </article>
        )) : <Empty image="/mascot/rocket.png" title="Add their first reward" copy="Add rewards that motivate your kid and give them something exciting to work toward." />}
      </div>
      {open || editing ? (
        <RewardForm
          reward={editing}
          close={() => {
            setOpen(false);
            setEditing(undefined);
          }}
          save={(b) =>
            act(
              () =>
                api(
                  editing ? `/parent/rewards/${editing.id}` : "/parent/rewards",
                  { method: editing ? "PUT" : "POST", body: JSON.stringify(b) },
                ),
              editing ? "Reward updated." : "Reward created.",
            )
          }
        />
      ) : null}
      {ideasOpen ? <RewardIdeas d={d} act={act} close={() => setIdeasOpen(false)} /> : null}
    </>
  );
}
const rewardIdeas = [
  { icon: "🎨", name: "Choose tonight's activity", description: "Pick a favorite family activity.", cost: 120, minAge: 4 },
  { icon: "🍿", name: "Movie night pick", description: "Choose the movie and snack.", cost: 180, minAge: 5 },
  { icon: "🛝", name: "Special park trip", description: "Plan an extra trip to a favorite park.", cost: 220, minAge: 4 },
  { icon: "🎮", name: "Extra game time", description: "Earn 30 minutes of game time.", cost: 250, minAge: 7 },
  { icon: "🍕", name: "Choose dinner", description: "Pick one family dinner this week.", cost: 300, minAge: 6 },
  { icon: "🛍️", name: "Small surprise", description: "Choose a small treat within the family budget.", cost: 450, minAge: 8 },
  { icon: "🎟️", name: "Weekend adventure", description: "Choose a local weekend outing.", cost: 700, minAge: 10 },
];
function RewardIdeas({ d, act, close }: { d: DashboardData; act: Act; close: () => void }) {
  const [childId, setChildId] = useState(d.children[0]?.id ?? ""), [picked, setPicked] = useState<string[]>([]);
  const child = d.children.find((item) => item.id === childId);
  const ideas = rewardIdeas.filter((idea) => idea.minAge <= (child?.age ?? 8));
  const add = () => void act(() => Promise.all(ideas.filter((idea) => picked.includes(idea.name)).map((idea) => api("/parent/rewards", { method: "POST", body: JSON.stringify({ ...idea, stock: 5, enabled: true, requiresApproval: true }) }))), "Reward ideas added.").then(close);
  return <div className="backdrop"><dialog open><button className="icon close" onClick={close}><X /></button><p className="eyebrow">GUIDED GENERATOR</p><h2>Generate reward ideas</h2>
    <label>Kid<select value={childId} onChange={(event) => setChildId(event.target.value)}>{d.children.map((item) => <option key={item.id} value={item.id}>{item.name}{item.age ? ` (${item.age})` : ""}</option>)}</select></label>
    <p className="notice">Age-friendly ideas you can edit anytime.</p>
    <div className="idea-grid">{ideas.map((idea) => <label key={idea.name} className={picked.includes(idea.name) ? "idea selected" : "idea"}><input type="checkbox" checked={picked.includes(idea.name)} onChange={(event) => setPicked((current) => event.target.checked ? [...current, idea.name] : current.filter((name) => name !== idea.name))} /><span>{idea.icon}</span><strong>{idea.name}</strong><small>{idea.cost} points</small></label>)}</div>
    <button className="button primary" disabled={!picked.length || !childId} onClick={add}><WandSparkles />Add {picked.length || ""} reward{picked.length === 1 ? "" : "s"}</button>
  </dialog></div>;
}
function RewardForm({
  reward,
  close,
  save,
}: {
  reward?: Reward;
  close: () => void;
  save: (b: unknown) => Promise<void>;
}) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void save({
      name: f.get("name"),
      description: f.get("description") || "",
      icon: f.get("icon") || "🎁",
      cost: Number(f.get("cost")),
      stock: Number(f.get("stock")),
      enabled: f.get("enabled") === "on",
      requiresApproval: f.get("approval") === "on",
    }).then(close);
  };
  return (
    <div className="backdrop">
      <dialog open>
        <button className="icon close" onClick={close} aria-label="Close">
          <X />
        </button>
        <p className="eyebrow">REWARD BUILDER</p>
        <h2>{reward ? "Edit reward" : "Create a reward"}</h2>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              Icon
              <input
                name="icon"
                defaultValue={reward?.icon ?? "🎁"}
                maxLength={8}
              />
            </label>
            <label>
              Name
              <input
                name="name"
                required
                minLength={2}
                defaultValue={reward?.name}
              />
            </label>
          </div>
          <label>
            Description
            <textarea name="description" defaultValue={reward?.description} />
          </label>
          <div className="form-grid">
            <label>
              Point cost
              <input
                name="cost"
                type="number"
                min="1"
                required
                defaultValue={reward?.cost ?? 300}
              />
            </label>
            <label>
              Quantity
              <input
                name="stock"
                type="number"
                min="0"
                required
                defaultValue={reward?.stock ?? 5}
              />
            </label>
          </div>
          <label className="checkline">
            <input
              name="enabled"
              type="checkbox"
              defaultChecked={reward?.enabled ?? true}
            />
            Available in shop
          </label>
          <label className="checkline">
            <input
              name="approval"
              type="checkbox"
              defaultChecked={reward?.requiresApproval ?? true}
            />
            Require parent approval
          </label>
          <button className="button primary">
            {reward ? "Save changes" : "Create reward"}
          </button>
        </form>
      </dialog>
    </div>
  );
}
function Achievements({ d }: { d: DashboardData }) {
  const [tab, setTab] = useState("all");
  const done = d.chores.filter((chore) => ["approved", "completed"].includes(chore.status));
  const achievements = [
    { icon: "🌱", name: "First Steps", detail: "Complete your first chore", type: "chores", value: done.length, goal: 1, xp: 25 },
    { icon: "🏆", name: "Quest Collector", detail: "Complete 10 chores", type: "chores", value: done.length, goal: 10, xp: 75 },
    { icon: "🍽️", name: "Kitchen Warrior", detail: "Complete 50 kitchen chores", type: "rooms", value: done.filter((chore) => chore.category === "kitchen").length, goal: 50, xp: 250 },
    { icon: "🫧", name: "Bathroom Boss", detail: "Complete 25 bathroom chores", type: "rooms", value: done.filter((chore) => chore.category === "bathroom").length, goal: 25, xp: 150 },
    { icon: "🔥", name: "On a Roll", detail: "Build a 3-day streak", type: "streaks", value: d.user.bestStreak, goal: 3, xp: 50 },
    { icon: "⚡", name: "Unstoppable", detail: "Build a 30-day streak", type: "streaks", value: d.user.bestStreak, goal: 30, xp: 400 },
    { icon: "💚", name: "House Hero", detail: "Complete 100 chores", type: "chores", value: done.length, goal: 100, xp: 500 },
  ];
  const shown = tab === "all" ? achievements : achievements.filter((item) => item.type === tab);
  const levels = [100, 250, 500, 1000];
  return (
    <>
      <Title
        over="TROPHY GARDEN"
        title="Achievements"
        copy="Complete quests, build streaks, and climb the XP trail."
      />
      <div className="achievement-layout">
        <aside className="achievement-panel"><img src="/mascot/flex.png" alt="ChoreQuest dog flexing" /><p className="eyebrow">YOUR XP</p><strong>{d.user.xp}</strong><p>Level {d.user.level}</p><div className="achievement-tabs">{[["all","All"],["chores","Chores"],["rooms","Rooms"],["streaks","Streaks"]].map(([value,label]) => <button className={tab === value ? "active" : ""} onClick={() => setTab(value)} key={value}>{label}</button>)}</div></aside>
        <section className="achievement-list">{shown.map((item) => { const percent = Math.min(100, Math.round(item.value / item.goal * 100)); return <article className={percent >= 100 ? "earned" : ""} key={item.name}><span>{item.icon}</span><div><h2>{item.name}</h2><p>{item.detail}</p><Progress value={percent} /><small>{Math.min(item.value,item.goal)} / {item.goal}</small></div><b>+{item.xp} XP</b></article>; })}</section>
        <section className="xp-trail"><h2>XP trail</h2><div className="trail-line"><i style={{ height: `${Math.min(100, d.user.xp / 10)}%` }} /></div>{levels.map((level, index) => <article className={d.user.xp >= level ? "reached" : ""} key={level} style={{ bottom: `${(index / (levels.length - 1)) * 86 + 4}%` }}><span>{d.user.xp >= level ? "✓" : index + 1}</span><div><b>{level} XP</b><small>{index === levels.length - 1 ? "Legend chest" : `Bonus reward ${index + 1}`}</small></div></article>)}</section>
      </div>
    </>
  );
}
function Family({ d, act }: { d: DashboardData; act: Act }) {
  const people = d.user.role === "parent" ? d.children : [d.user],
    [editing, setEditing] = useState<DashboardData["children"][number]>();
  const addChild = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    void act(
      () =>
        api("/parent/children", {
          method: "POST",
          body: JSON.stringify({
            name: f.get("name"),
            pin: f.get("pin"),
            age: f.get("age") ? Number(f.get("age")) : undefined,
            gender: f.get("gender") || undefined,
            interests: f.get("interests") || undefined,
          }),
        }),
      "Child added.",
    ).then(() => form.reset());
  };
  const remove = (child: DashboardData["children"][number]) => {
    if (window.confirm(`Remove ${child.name}? Their history will be kept.`))
      void act(
        () => api(`/parent/children/${child.id}`, { method: "DELETE" }),
        `${child.name} removed.`,
      );
  };
  return (
    <>
      <Title over="FAMILY" title="Kids" copy="" />
      <div className={d.user.role === "parent" ? "family-layout" : ""}>
        <Section title="Profiles" copy={`${people.length} active`}>
          <div className="people family-people">
            {people.map((p) => (
              <article key={p.id}>
                <span className="avatar">{avatarFor(p.id) ? <img src={avatarFor(p.id)!} alt="" /> : p.name[0]}</span>
                <div>
                  <h3>{p.name}</h3>
                  <p>
                    {p.age ? `Age ${p.age} · ` : ""}
                    {p.points} points · Level {p.level}
                  </p>
                </div>
                {d.user.role === "parent" ? (
                  <div className="row-actions">
                    <button onClick={() => setEditing(p)}>Edit</button>
                    <button className="danger-link" onClick={() => remove(p)}>
                      Remove
                    </button>
                  </div>
                ) : (
                  <b>🔥 {p.streak}</b>
                )}
              </article>
            ))}
          </div>
        </Section>
        {d.user.role === "parent" ? (
          <aside className="setup-card">
            <span className="setup-step">+</span>
            <h2>Add a kid</h2>
            <form onSubmit={addChild}>
              <label>
                Name
                <input name="name" required minLength={2} />
              </label>
              <div className="form-grid">
                <label>
                  Age
                  <input name="age" type="number" min="3" max="21" />
                </label>
                <label>
                  4-digit PIN
                  <input
                    name="pin"
                    required
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                  />
                </label>
              </div>
              <label>
                Gender <small>Optional</small>
                <input name="gender" />
              </label>
              <label>
                Interests <small>Helps generate ideas</small>
                <input name="interests" placeholder="Art, soccer, animals" />
              </label>
              <button className="button primary">
                <Plus />
                Add kid
              </button>
            </form>
          </aside>
        ) : null}
      </div>
      {editing ? (
        <ChildEdit
          child={editing}
          close={() => setEditing(undefined)}
          save={(body) =>
            act(
              () =>
                api(`/parent/children/${editing.id}`, {
                  method: "PUT",
                  body: JSON.stringify(body),
                }),
              "Profile updated.",
            )
          }
        />
      ) : null}
    </>
  );
}
function ChildEdit({
  child,
  close,
  save,
}: {
  child: DashboardData["children"][number];
  close: () => void;
  save: (body: unknown) => Promise<void>;
}) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      pin = String(f.get("pin") || "");
    void save({
      name: f.get("name"),
      age: f.get("age") ? Number(f.get("age")) : undefined,
      gender: f.get("gender") || undefined,
      interests: f.get("interests") || undefined,
      ...(pin ? { pin } : {}),
    }).then(close);
  };
  return (
    <div className="backdrop">
      <dialog open>
        <button className="icon close" onClick={close}>
          <X />
        </button>
        <h2>Edit profile</h2>
        <form onSubmit={submit}>
          <label>
            Name
            <input
              name="name"
              defaultValue={child.name}
              required
              minLength={2}
            />
          </label>
          <div className="form-grid">
            <label>
              Age
              <input
                name="age"
                type="number"
                min="3"
                max="21"
                defaultValue={child.age}
              />
            </label>
            <label>
              New PIN
              <input
                name="pin"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
              />
            </label>
          </div>
          <label>
            Gender
            <input name="gender" defaultValue={child.gender} />
          </label>
          <label>
            Interests
            <input name="interests" defaultValue={child.interests} />
          </label>
          <button className="button primary">Save</button>
        </form>
      </dialog>
    </div>
  );
}
function Notifications({ d, onRead }: { d: DashboardData; onRead: () => void }) {
  const [items, setItems] = useState(d.notifications);
  // Opening the inbox counts as reading the current notifications.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onRead(), []);
  const remove = async (id?: string) => {
    await api(id ? `/notifications/${id}` : "/notifications", {
      method: "DELETE",
    });
    setItems((v) => (id ? v.filter((n) => n.id !== id) : []));
  };
  return (
    <>
      <Title over="INBOX" title="Notifications" copy="">
        {items.length ? (
          <button className="button secondary" onClick={() => void remove()}>
            Clear all
          </button>
        ) : null}
      </Title>
      <Section title="Recent" copy="">
        <div className="notices">
          {items.length ? (
            items.map((n) => (
              <article key={n.id}>
                <Bell />
                <div>
                  <h3>{n.title}</h3>
                  <p>{n.body}</p>
                  <small>{fmt(n.createdAt)}</small>
                </div>
                <button
                  className="icon"
                  onClick={() => void remove(n.id)}
                  aria-label="Dismiss"
                >
                  <X />
                </button>
              </article>
            ))
          ) : (
            <Empty title="You're all caught up" />
          )}
        </div>
      </Section>
    </>
  );
}
function Activity({ d }: { d: DashboardData }) {
  return (
    <Section title="Recent activity" copy="The latest family wins.">
      <div className="activity">
        {d.activity.map((a) => (
          <div key={a.id}>
            <i />
            <p>
              {a.message}
              <small>{fmt(a.createdAt)}</small>
            </p>
            {a.amount ? <b>+{a.amount}</b> : null}
          </div>
        ))}
      </div>
    </Section>
  );
}
function Reports({ d }: { d: DashboardData }) {
  return (
    <>
      <Title
        over="WEEKLY PULSE"
        title="Reports & activity"
        copy="Simple trends backed by the transaction ledger."
      />
      <div className="two">
        <Section title="Balances" copy="Current spendable points.">
          {d.children.map((c) => (
            <div className="bar" key={c.id}>
              <span>{c.name}</span>
              <Progress value={Math.min(100, c.points / 10)} />
              <b>{c.points}</b>
            </div>
          ))}
        </Section>
        <Activity d={d} />
      </div>
    </>
  );
}
function AccountSettings({ d, act }: { d: DashboardData; act: Act }) {
  const [showPasswords, setShowPasswords] = useState(false);
  return (
    <div className="settings-grid">
      <Section title="Account" copy="Update your parent profile.">
        <form onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void act(() => api("/account/profile", { method: "PUT", body: JSON.stringify({ name: form.get("name"), email: form.get("email") }) }), "Account updated.");
        }}>
          <label>Name<input name="name" required minLength={2} defaultValue={d.user.name} autoComplete="name" /></label>
          <label>Email<input name="email" type="email" required defaultValue={d.user.email} autoComplete="email" /></label>
          <button className="button primary">Save account</button>
        </form>
      </Section>
      <Section title="Password" copy="Use at least 8 characters.">
        <form onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const next = String(form.get("newPassword"));
          const confirm = String(form.get("confirmPassword"));
          if (next !== confirm) {
            void act(() => Promise.reject(new Error("New passwords do not match.")), "");
            return;
          }
          void act(() => api("/account/password", { method: "PUT", body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword: next }) }), "Password changed.");
        }}>
          <label>Current password<input name="currentPassword" type={showPasswords ? "text" : "password"} required autoComplete="current-password" /></label>
          <div className="form-grid">
            <label>New password<input name="newPassword" type={showPasswords ? "text" : "password"} required minLength={8} autoComplete="new-password" /></label>
            <label>Confirm password<input name="confirmPassword" type={showPasswords ? "text" : "password"} required minLength={8} autoComplete="new-password" /></label>
          </div>
          <button className="account-password-toggle" type="button" onClick={() => setShowPasswords((value) => !value)}>
            {showPasswords ? <EyeOff /> : <Eye />} {showPasswords ? "Hide passwords" : "Show passwords"}
          </button>
          <button className="button primary">Change password</button>
        </form>
      </Section>
    </div>
  );
}
function ProfileSettings({ d, act }: { d: DashboardData; act: Act }) {
  const choices = ["wave", "flex", "rocket", "fire-eyes", "weights", "analyze"];
  const save = (value: string) => {
    localStorage.setItem(`cq-avatar:${d.user.id}`, value);
    void act(() => Promise.resolve(), "Profile picture updated.");
  };
  const upload = (file?: File) => {
    if (!file) return;
    if (file.size > 1_500_000) {
      void act(() => Promise.reject(new Error("Choose an image under 1.5 MB.")), "");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => save(String(reader.result));
    reader.readAsDataURL(file);
  };
  return <Section title="Profile picture" copy="Choose a mascot or upload your own.">
    <div className="avatar-picker">
      {choices.map((choice) => <button key={choice} className={avatarFor(d.user.id) === `/mascot/${choice}.png` ? "selected" : ""} onClick={() => save(`/mascot/${choice}.png`)}><img src={`/mascot/${choice}.png`} alt={`${choice} dog avatar`} /></button>)}
    </div>
    <label className="upload-avatar">Upload a photo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => upload(event.target.files?.[0])} /></label>
  </Section>;
}
function RoomSettings({ d, act }: { d: DashboardData; act: Act }) {
  const [rooms, setRooms] = useState<string[]>(() => savedRooms(d.user.id));
  const save = () => {
    localStorage.setItem(`cq-rooms:${d.user.id}`, JSON.stringify(rooms));
    void act(() => Promise.resolve(), "Chore rooms saved.");
  };
  return <Section title="Chore rooms" copy="These rooms appear in guided chore ideas.">
    <div className="room-picker">{ROOM_OPTIONS.map(([value, label]) => <label className={rooms.includes(value) ? "room-option selected" : "room-option"} key={value}><input type="checkbox" checked={rooms.includes(value)} onChange={(event) => setRooms((current) => event.target.checked ? [...current, value] : current.filter((room) => room !== value))} /><span>{icons[value]}</span>{label}</label>)}</div>
    <button className="button primary" onClick={save}>Save rooms</button>
  </Section>;
}
function Prefs({ d, act }: { d: DashboardData; act: Act }) {
  const choose = (theme: Theme) =>
    void act(
      () => savePreferences(theme, true, false, true),
      `${theme === "garden" ? "Light Garden" : theme[0].toUpperCase() + theme.slice(1)} theme applied.`,
    );
  return (
    <>
      <Title
        over="APPEARANCE"
        title="Choose your atmosphere"
        copy="Theme changes save immediately. Motion automatically follows your device accessibility preference."
      />
      <Section
        title="App theme"
        copy="Four focused looks—no extra switches to manage."
      >
        <div className="themes">
          {(
            [
              ["garden", "Light Garden"],
              ["forest", "Dark Green"],
              ["midnight", "Midnight"],
              ["ocean", "Ocean"],
            ] as [Theme, string][]
          ).map(([v, l]) => (
            <button
              className={`${v} ${d.user.theme === v ? "selected" : ""}`}
              onClick={() => choose(v)}
              key={v}
            >
              <i />
              <span>
                <strong>{l}</strong>
                <small>
                  {v === "garden"
                    ? "Warm and focused"
                    : v === "forest"
                      ? "Calm and grounded"
                      : v === "midnight"
                        ? "Quiet after dark"
                        : "Cool and energetic"}
                </small>
              </span>
              {d.user.theme === v ? <Check /> : null}
            </button>
          ))}
        </div>
      </Section>
      <ProfileSettings d={d} act={act} />
      {d.user.role === "parent" ? <RoomSettings d={d} act={act} /> : null}
      {d.user.role === "parent" ? <AccountSettings d={d} act={act} /> : null}
    </>
  );
}
