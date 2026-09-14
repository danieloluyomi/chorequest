// src/server/postgres-app.ts
import express from "express";
import cookieParser from "cookie-parser";
import crypto2 from "node:crypto";
import path from "node:path";

// src/server/postgres.ts
import postgres from "postgres";
var connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("POSTGRES_URL is required");
var sql = postgres(connectionString, {
  max: 1,
  prepare: false,
  ssl: "require",
  idle_timeout: 20,
  connect_timeout: 15
});
var id = () => crypto.randomUUID();

// src/shared/schemas.ts
import { z } from "zod";
var choreSchema = z.object({
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default(""),
  category: z.enum([
    "bedroom",
    "other_bedrooms",
    "bathroom",
    "kitchen",
    "attic",
    "basement",
    "school",
    "pets",
    "outdoors",
    "family"
  ]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  points: z.number().int().min(1).max(1e3),
  xp: z.number().int().min(1).max(1e3),
  dueAt: z.string().datetime(),
  recurrence: z.enum(["none", "daily", "weekly"]),
  requiresApproval: z.boolean(),
  requiresProof: z.boolean(),
  assigneeIds: z.array(z.string()).min(1)
});
var choreUpdateSchema = choreSchema.omit({ assigneeIds: true });
var choreBulkSchema = z.object({
  assignmentIds: z.array(z.string()).min(1).max(500)
});
var submissionSchema = z.object({
  note: z.string().trim().max(500).default(""),
  proofUrl: z.string().url().max(500).optional()
});
var decisionSchema = z.object({
  decision: z.enum(["approved", "rejected", "changes_requested"]),
  note: z.string().trim().max(500).default("")
}).superRefine((v, c) => {
  if (v.decision !== "approved" && !v.note)
    c.addIssue({
      code: "custom",
      message: "Feedback is required",
      path: ["note"]
    });
});
var rewardSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).default(""),
  icon: z.string().max(8).default("\u{1F381}"),
  cost: z.number().int().min(1).max(1e5),
  stock: z.number().int().min(0).max(1e4),
  enabled: z.boolean(),
  requiresApproval: z.boolean()
});
var invitationSchema = z.object({
  email: z.string().trim().email().max(200),
  role: z.enum(["parent", "student"])
});
var reversalSchema = z.object({
  reason: z.string().trim().min(3).max(300)
});
var registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(128),
  familyName: z.string().trim().min(2).max(80)
});
var loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(128)
});
var accountProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(200)
});
var passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128)
});
var childProfile = {
  name: z.string().trim().min(2).max(80),
  age: z.number().int().min(3).max(21).optional(),
  gender: z.string().trim().max(40).optional(),
  interests: z.string().trim().max(200).optional()
};
var childSchema = z.object({
  ...childProfile,
  pin: z.string().regex(/^\d{4}$/, "Use a 4-digit PIN")
});
var childUpdateSchema = z.object({
  ...childProfile,
  pin: z.string().regex(/^\d{4}$/, "Use a 4-digit PIN").optional()
});
var studentLoginSchema = z.object({
  parentEmail: z.string().trim().email().max(200),
  name: z.string().trim().min(2).max(80),
  pin: z.string().regex(/^\d{4}$/, "Use a 4-digit PIN")
});
var preferencesSchema = z.object({
  theme: z.enum(["garden", "forest", "midnight", "ocean"]),
  animation: z.boolean(),
  reducedMotion: z.boolean(),
  sound: z.boolean()
});

// src/shared/rules.ts
var DAY_MS = 864e5;
function levelFromXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}
function localDate(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const value = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
function streakFromDates(dates, today) {
  const unique = [...new Set(dates)].sort().reverse();
  if (!unique.length) return 0;
  const utc = (v) => Date.parse(`${v}T00:00:00Z`), newest = utc(unique[0]), current = utc(today);
  if (current - newest > DAY_MS) return 0;
  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    if (utc(unique[i - 1]) - utc(unique[i]) === DAY_MS) streak++;
    else break;
  }
  return streak;
}

// src/server/postgres-app.ts
var app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
var encodePassword = (password, salt = crypto2.randomBytes(16).toString("hex")) => `${salt}:${crypto2.scryptSync(password, salt, 64).toString("hex")}`;
var verifyPassword = (password, stored) => {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = crypto2.scryptSync(password, salt, 64), expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && crypto2.timingSafeEqual(actual, expected);
};
var tokenHash = (token) => crypto2.createHash("sha256").update(token).digest("hex");
var parse = (schema, value, res) => {
  const result = schema.safeParse(value);
  if (!result.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION",
        message: result.error?.issues[0]?.message ?? "Invalid request."
      }
    });
    return;
  }
  return result.data;
};
var fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });
var iso = (value) => value instanceof Date ? value.toISOString() : String(value);
async function createSession(userId, res) {
  const token = crypto2.randomBytes(32).toString("hex"), expires = new Date(Date.now() + 7 * 864e5);
  await sql`INSERT INTO sessions ${sql({ id: id(), user_id: userId, token_hash: tokenHash(token), expires_at: expires })}`;
  res.cookie("cq_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 7 * 864e5
  });
}
app.use(async (req, _res, next) => {
  try {
    const token = req.cookies.cq_session;
    if (token) {
      const [record] = await sql`SELECT u.id,u.name,m.role,m.family_id FROM sessions s JOIN users u ON u.id=s.user_id JOIN memberships m ON m.user_id=u.id AND m.status='active' WHERE s.token_hash=${tokenHash(token)} AND s.expires_at>now() LIMIT 1`;
      if (record)
        req.user = {
          id: record.id,
          name: record.name,
          role: record.role,
          familyId: record.family_id
        };
    }
    next();
  } catch (error) {
    next(error);
  }
});
var user = (req, res) => req.user ?? (fail(res, 401, "UNAUTHORIZED", "Please sign in."), void 0);
var role = (req, res, wanted) => {
  const current = user(req, res);
  if (current && current.role !== wanted) {
    fail(res, 403, "FORBIDDEN", "This action is not available here.");
    return;
  }
  return current;
};
app.get("/api/health", async (_req, res) => {
  await sql`SELECT 1`;
  res.json({ data: { ok: true } });
});
app.post("/api/auth/register", async (req, res) => {
  const body = parse(registerSchema, req.body, res);
  if (!body) return;
  const email = body.email.toLowerCase();
  if ((await sql`SELECT 1 FROM users WHERE email=${email}`)[0])
    return fail(res, 409, "EMAIL_TAKEN", "That email is already registered.");
  const uid = id(), familyId = id();
  await sql.begin(async (tx) => {
    await tx`INSERT INTO users ${tx({ id: uid, email, password_hash: encodePassword(body.password), name: body.name })}`;
    await tx`INSERT INTO families ${tx({ id: familyId, name: body.familyName, owner_id: uid })}`;
    await tx`INSERT INTO memberships ${tx({ id: id(), family_id: familyId, user_id: uid, role: "parent", status: "active" })}`;
    await tx`INSERT INTO preferences ${tx({ user_id: uid })}`;
  });
  await createSession(uid, res);
  res.status(201).json({ data: { id: uid, name: body.name, role: "parent" } });
});
app.post("/api/auth/login", async (req, res) => {
  const body = parse(loginSchema, req.body, res);
  if (!body) return;
  const [found] = await sql`SELECT u.id,u.password_hash FROM users u JOIN memberships m ON m.user_id=u.id AND m.role='parent' AND m.status='active' WHERE lower(u.email)=${body.email.toLowerCase()} LIMIT 1`;
  if (!found || !verifyPassword(body.password, found.password_hash))
    return fail(res, 401, "INVALID_LOGIN", "Email or password is incorrect.");
  await createSession(found.id, res);
  res.json({ data: { ok: true } });
});
app.post("/api/auth/student", async (req, res) => {
  const body = parse(studentLoginSchema, req.body, res);
  if (!body) return;
  const [found] = await sql`SELECT child.id,child.password_hash FROM users parent JOIN families f ON f.owner_id=parent.id JOIN memberships m ON m.family_id=f.id AND m.role='student' AND m.status='active' JOIN users child ON child.id=m.user_id WHERE lower(parent.email)=${body.parentEmail.toLowerCase()} AND lower(child.name)=lower(${body.name}) LIMIT 1`;
  if (!found || !verifyPassword(body.pin, found.password_hash))
    return fail(
      res,
      401,
      "INVALID_LOGIN",
      "Family, name, or PIN is incorrect."
    );
  await createSession(found.id, res);
  res.json({ data: { ok: true } });
});
app.post("/api/auth/logout", async (req, res) => {
  const token = req.cookies.cq_session;
  if (token)
    await sql`DELETE FROM sessions WHERE token_hash=${tokenHash(token)}`;
  res.clearCookie("cq_session");
  res.json({ data: { ok: true } });
});
async function totals(uid) {
  const [p] = await sql`SELECT COALESCE(SUM(amount),0)::int total FROM point_transactions WHERE student_id=${uid}`;
  const [x] = await sql`SELECT COALESCE(SUM(amount),0)::int total FROM xp_transactions WHERE student_id=${uid}`;
  return { points: Number(p.total), xp: Number(x.total) };
}
async function mapChild(uid) {
  const [u] = await sql`SELECT u.id,u.name,u.timezone,p.age,p.gender,p.interests FROM users u LEFT JOIN child_profiles p ON p.user_id=u.id WHERE u.id=${uid}`;
  const t = await totals(uid);
  const dates = (await sql`SELECT local_date::text FROM daily_activity WHERE student_id=${uid} ORDER BY local_date DESC`).map((x) => x.local_date);
  const streak = streakFromDates(dates, localDate(/* @__PURE__ */ new Date(), u.timezone));
  return {
    id: u.id,
    name: u.name,
    role: "student",
    ...t,
    level: levelFromXp(t.xp),
    streak,
    bestStreak: streak,
    theme: "garden",
    animation: true,
    age: u.age,
    gender: u.gender,
    interests: u.interests
  };
}
app.get("/api/dashboard", async (req, res) => {
  const current = user(req, res);
  if (!current) return;
  const t = await totals(current.id);
  const [profile] = await sql`SELECT u.email,u.timezone,COALESCE(p.theme,'garden') theme,COALESCE(p.animation,true) animation FROM users u LEFT JOIN preferences p ON p.user_id=u.id WHERE u.id=${current.id}`;
  const dates = (await sql`SELECT local_date::text FROM daily_activity WHERE student_id=${current.id} ORDER BY local_date DESC`).map((x) => x.local_date);
  const childRows = current.role === "parent" ? await sql`SELECT user_id id FROM memberships WHERE family_id=${current.familyId} AND role='student' AND status='active'` : [{ id: current.id }];
  const childIds = childRows.map((x) => x.id);
  const chores = childIds.length ? await sql`SELECT c.*,a.id assignment_id,a.student_id,a.due_at,a.status,u.name assignee_name,s.id submission_id,s.created_at completed_at,d.note feedback FROM assignments a JOIN chores c ON c.id=a.chore_id JOIN users u ON u.id=a.student_id LEFT JOIN LATERAL(SELECT * FROM submissions WHERE assignment_id=a.id ORDER BY attempt DESC LIMIT 1)s ON true LEFT JOIN decisions d ON d.submission_id=s.id WHERE a.student_id IN ${sql(childIds)} AND c.archived_at IS NULL ORDER BY a.due_at` : [];
  const rewards = await sql`SELECT r.*,EXISTS(SELECT 1 FROM reward_goals g WHERE g.reward_id=r.id AND g.student_id=${current.id} AND g.active=true) goal FROM rewards r WHERE family_id=${current.familyId} ORDER BY cost`;
  const children = current.role === "parent" ? await Promise.all(childIds.map(mapChild)) : [];
  const [pending] = await sql`SELECT COUNT(*)::int count FROM assignments a JOIN chores c ON c.id=a.chore_id WHERE c.family_id=${current.familyId} AND a.status='pending' AND c.archived_at IS NULL`;
  const streak = streakFromDates(
    dates,
    localDate(/* @__PURE__ */ new Date(), profile.timezone)
  );
  res.json({
    data: {
      user: {
        id: current.id,
        name: current.name,
        email: current.role === "parent" ? profile.email : void 0,
        role: current.role,
        ...t,
        level: levelFromXp(t.xp),
        streak,
        bestStreak: streak,
        theme: profile.theme,
        animation: profile.animation
      },
      chores: chores.map((c) => ({
        id: c.assignment_id,
        templateId: c.id,
        title: c.title,
        description: c.description,
        category: c.category,
        difficulty: c.difficulty,
        points: c.points,
        xp: c.xp,
        dueAt: iso(c.due_at),
        completedAt: c.completed_at ? iso(c.completed_at) : void 0,
        recurrence: c.recurrence,
        requiresApproval: c.requires_approval,
        requiresProof: c.requires_proof,
        assigneeId: c.student_id,
        assigneeName: c.assignee_name,
        status: c.status,
        submissionId: c.submission_id,
        feedback: c.feedback
      })),
      rewards: rewards.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        icon: r.icon,
        cost: r.cost,
        stock: r.stock,
        enabled: r.enabled,
        requiresApproval: r.requires_approval,
        goal: r.goal
      })),
      transactions: await sql`SELECT id,amount,kind,note,created_at "createdAt" FROM point_transactions WHERE student_id=${current.id} ORDER BY created_at DESC LIMIT 5`,
      notifications: await sql`SELECT id,title,body,(read_at IS NOT NULL) read,created_at "createdAt" FROM notifications WHERE user_id=${current.id} ORDER BY created_at DESC`,
      activity: await sql`SELECT id,message,amount,created_at "createdAt" FROM activity_logs WHERE family_id=${current.familyId} ORDER BY created_at DESC LIMIT 8`,
      children,
      pendingCount: Number(pending.count)
    }
  });
});
app.post("/api/parent/chores", async (req, res) => {
  const current = role(req, res, "parent"), body = parse(choreSchema, req.body, res);
  if (!current || !body) return;
  const members = await sql`SELECT user_id FROM memberships WHERE family_id=${current.familyId} AND role='student' AND status='active' AND user_id IN ${sql(body.assigneeIds)}`;
  if (members.length !== new Set(body.assigneeIds).size)
    return fail(res, 400, "INVALID_ASSIGNEE", "Choose kids in your family.");
  const choreId = id();
  await sql.begin(async (tx) => {
    await tx`INSERT INTO chores ${tx({ id: choreId, family_id: current.familyId, creator_id: current.id, title: body.title, description: body.description, category: body.category, difficulty: body.difficulty, points: body.points, xp: body.xp, recurrence: body.recurrence, requires_approval: body.requiresApproval, requires_proof: body.requiresProof })}`;
    for (const studentId of body.assigneeIds)
      await tx`INSERT INTO assignments ${tx({ id: id(), chore_id: choreId, student_id: studentId, due_at: body.dueAt, status: "todo" })}`;
    await tx`INSERT INTO activity_logs ${tx({ id: id(), family_id: current.familyId, actor_id: current.id, action: "chore.created", message: `${current.name} created ${body.title}` })}`;
  });
  res.status(201).json({ data: { id: choreId } });
});
app.put("/api/parent/assignments/:id", async (req, res) => {
  const current = role(req, res, "parent"), body = parse(choreUpdateSchema, req.body, res);
  if (!current || !body) return;
  const [row] = await sql`SELECT a.chore_id FROM assignments a JOIN chores c ON c.id=a.chore_id WHERE a.id=${req.params.id} AND c.family_id=${current.familyId}`;
  if (!row) return fail(res, 404, "NOT_FOUND", "Chore not found.");
  await sql.begin(async (tx) => {
    await tx`UPDATE chores SET title=${body.title},description=${body.description},category=${body.category},difficulty=${body.difficulty},points=${body.points},xp=${body.xp},recurrence=${body.recurrence},requires_approval=${body.requiresApproval},requires_proof=${body.requiresProof} WHERE id=${row.chore_id}`;
    await tx`UPDATE assignments SET due_at=${body.dueAt} WHERE id=${req.params.id}`;
  });
  res.json({ data: { ok: true } });
});
app.delete("/api/parent/assignments/:id", async (req, res) => {
  const current = role(req, res, "parent");
  if (!current) return;
  const rows = await sql`UPDATE chores SET archived_at=now() WHERE id=(SELECT a.chore_id FROM assignments a JOIN chores c ON c.id=a.chore_id WHERE a.id=${req.params.id} AND c.family_id=${current.familyId}) RETURNING id`;
  if (!rows.length) return fail(res, 404, "NOT_FOUND", "Chore not found.");
  res.json({ data: { ok: true } });
});
app.post("/api/parent/chores/bulk-delete", async (req, res) => {
  const current = role(req, res, "parent"), body = parse(choreBulkSchema, req.body, res);
  if (!current || !body) return;
  const rows = await sql`UPDATE chores SET archived_at=now() WHERE family_id=${current.familyId} AND id IN(SELECT chore_id FROM assignments WHERE id IN ${sql(body.assignmentIds)}) RETURNING id`;
  res.json({ data: { removed: rows.length } });
});
app.delete("/api/parent/chores", async (req, res) => {
  const current = role(req, res, "parent");
  if (!current) return;
  const rows = await sql`UPDATE chores SET archived_at=now() WHERE family_id=${current.familyId} AND archived_at IS NULL RETURNING id`;
  res.json({ data: { removed: rows.length } });
});
async function award(tx, assignmentId, submissionId, actor) {
  const [a] = await tx`SELECT a.*,c.points,c.xp,c.requires_approval,c.family_id,c.title,u.timezone FROM assignments a JOIN chores c ON c.id=a.chore_id JOIN users u ON u.id=a.student_id WHERE a.id=${assignmentId} FOR UPDATE`;
  if (a.awarded_submission_id) return;
  await tx`UPDATE assignments SET status=${a.requires_approval ? "approved" : "completed"},awarded_submission_id=${submissionId} WHERE id=${assignmentId}`;
  await tx`INSERT INTO point_transactions ${tx({ id: id(), family_id: a.family_id, student_id: a.student_id, amount: a.points, kind: "chore", note: a.title, reference_id: assignmentId, idempotency_key: `chore:${assignmentId}` })} ON CONFLICT(idempotency_key) DO NOTHING`;
  await tx`INSERT INTO xp_transactions ${tx({ id: id(), family_id: a.family_id, student_id: a.student_id, amount: a.xp, kind: "chore", reference_id: assignmentId, idempotency_key: `chore:${assignmentId}` })} ON CONFLICT(idempotency_key) DO NOTHING`;
  await tx`INSERT INTO daily_activity ${tx({ id: id(), student_id: a.student_id, local_date: localDate(/* @__PURE__ */ new Date(), a.timezone), timezone: a.timezone, qualifying_count: 1 })} ON CONFLICT(student_id,local_date) DO UPDATE SET qualifying_count=daily_activity.qualifying_count+1`;
  await tx`INSERT INTO activity_logs ${tx({ id: id(), family_id: a.family_id, actor_id: actor.id, action: "chore.completed", message: `${a.title} was completed`, amount: a.points })}`;
}
app.post("/api/student/assignments/:id/submit", async (req, res) => {
  const current = role(req, res, "student"), body = parse(submissionSchema, req.body, res);
  if (!current || !body) return;
  const [a] = await sql`SELECT a.*,c.requires_approval,c.requires_proof FROM assignments a JOIN chores c ON c.id=a.chore_id WHERE a.id=${req.params.id} AND a.student_id=${current.id}`;
  if (!a) return fail(res, 404, "NOT_FOUND", "Chore not found.");
  if (!["todo", "changes_requested", "rejected"].includes(a.status))
    return fail(
      res,
      409,
      "ALREADY_SUBMITTED",
      "This chore was already submitted."
    );
  if (a.requires_proof && !body.proofUrl)
    return fail(res, 400, "PROOF_REQUIRED", "Proof is required.");
  const sid = id();
  await sql.begin(async (tx) => {
    const [next] = await tx`SELECT COALESCE(MAX(attempt),0)::int+1 next FROM submissions WHERE assignment_id=${a.id}`;
    await tx`INSERT INTO submissions ${tx({ id: sid, assignment_id: a.id, attempt: next.next, note: body.note, proof_url: body.proofUrl ?? null, status: a.requires_approval ? "pending" : "approved" })}`;
    await tx`UPDATE assignments SET status=${a.requires_approval ? "pending" : "completed"} WHERE id=${a.id}`;
    if (a.requires_approval)
      await tx`INSERT INTO notifications SELECT ${id()},user_id,'Chore ready to review',${`${current.name} submitted a chore.`},NULL,now() FROM memberships WHERE family_id=${current.familyId} AND role='parent' AND status='active'`;
    else await award(tx, a.id, sid, current);
  });
  res.status(201).json({ data: { status: a.requires_approval ? "pending" : "completed" } });
});
app.post("/api/parent/submissions/:id/decision", async (req, res) => {
  const current = role(req, res, "parent"), body = parse(decisionSchema, req.body, res);
  if (!current || !body) return;
  const [s] = await sql`SELECT s.*,a.id assignment_id,a.student_id,c.title FROM submissions s JOIN assignments a ON a.id=s.assignment_id JOIN chores c ON c.id=a.chore_id WHERE s.id=${req.params.id} AND c.family_id=${current.familyId}`;
  if (!s) return fail(res, 404, "NOT_FOUND", "Submission not found.");
  if (s.status !== "pending")
    return fail(res, 409, "ALREADY_DECIDED", "Already reviewed.");
  await sql.begin(async (tx) => {
    await tx`UPDATE submissions SET status=${body.decision} WHERE id=${s.id}`;
    await tx`UPDATE assignments SET status=${body.decision} WHERE id=${s.assignment_id}`;
    await tx`INSERT INTO decisions ${tx({ id: id(), submission_id: s.id, parent_id: current.id, decision: body.decision, note: body.note })}`;
    if (body.decision === "approved")
      await award(tx, s.assignment_id, s.id, current);
    await tx`INSERT INTO notifications ${tx({ id: id(), user_id: s.student_id, title: body.decision === "approved" ? "Chore approved" : "Chore needs attention", body: body.decision === "approved" ? `You earned points for ${s.title}.` : body.note })}`;
  });
  res.json({ data: { status: body.decision } });
});
app.post("/api/student/rewards/:id/goal", async (req, res) => {
  const current = role(req, res, "student");
  if (!current) return;
  if (!(await sql`SELECT 1 FROM rewards WHERE id=${req.params.id} AND family_id=${current.familyId} AND enabled=true`)[0])
    return fail(res, 404, "NOT_FOUND", "Reward not found.");
  await sql.begin(async (tx) => {
    await tx`UPDATE reward_goals SET active=false WHERE student_id=${current.id}`;
    await tx`INSERT INTO reward_goals ${tx({ id: id(), student_id: current.id, reward_id: req.params.id, active: true })}`;
  });
  res.json({ data: { ok: true } });
});
app.post("/api/student/rewards/:id/redeem", async (req, res) => {
  const current = role(req, res, "student");
  if (!current) return;
  const key = req.header("Idempotency-Key");
  if (!key) return fail(res, 400, "IDEMPOTENCY_REQUIRED", "Try again.");
  const [prior] = await sql`SELECT id,status FROM redemptions WHERE idempotency_key=${key}`;
  if (prior) return res.json({ data: prior });
  try {
    const result = await sql.begin(async (tx) => {
      const [r] = await tx`SELECT * FROM rewards WHERE id=${req.params.id} AND family_id=${current.familyId} FOR UPDATE`;
      if (!r || !r.enabled || r.stock < 1) throw new Error("UNAVAILABLE");
      const [balanceRow] = await tx`SELECT COALESCE(SUM(amount),0)::int total FROM point_transactions WHERE student_id=${current.id}`;
      const balance = Number(balanceRow.total);
      if (balance < r.cost) throw new Error("INSUFFICIENT");
      const rid = id(), status = r.requires_approval ? "requested" : "fulfilled";
      await tx`INSERT INTO redemptions ${tx({ id: rid, reward_id: r.id, student_id: current.id, cost: r.cost, status, idempotency_key: key })}`;
      await tx`INSERT INTO point_transactions ${tx({ id: id(), family_id: current.familyId, student_id: current.id, amount: -r.cost, kind: "reward", note: r.name, reference_id: rid, idempotency_key: `redeem:${rid}` })}`;
      await tx`UPDATE rewards SET stock=stock-1 WHERE id=${r.id}`;
      return { id: rid, status };
    });
    res.status(201).json({ data: result });
  } catch (e) {
    const code = e.message;
    fail(
      res,
      409,
      code,
      code === "INSUFFICIENT" ? "You need more points." : "Reward unavailable."
    );
  }
});
app.post("/api/parent/rewards", async (req, res) => {
  const current = role(req, res, "parent"), body = parse(rewardSchema, req.body, res);
  if (!current || !body) return;
  const rewardId = id();
  await sql`INSERT INTO rewards ${sql({ id: rewardId, family_id: current.familyId, name: body.name, description: body.description, icon: body.icon, cost: body.cost, stock: body.stock, enabled: body.enabled, requires_approval: body.requiresApproval })}`;
  res.status(201).json({ data: { id: rewardId } });
});
app.put("/api/parent/rewards/:id", async (req, res) => {
  const current = role(req, res, "parent"), body = parse(rewardSchema, req.body, res);
  if (!current || !body) return;
  const rows = await sql`UPDATE rewards SET name=${body.name},description=${body.description},icon=${body.icon},cost=${body.cost},stock=${body.stock},enabled=${body.enabled},requires_approval=${body.requiresApproval} WHERE id=${req.params.id} AND family_id=${current.familyId} RETURNING id`;
  if (!rows.length) return fail(res, 404, "NOT_FOUND", "Reward not found.");
  res.json({ data: { ok: true } });
});
app.post("/api/parent/children", async (req, res) => {
  const current = role(req, res, "parent"), body = parse(childSchema, req.body, res);
  if (!current || !body) return;
  const childId = id();
  await sql.begin(async (tx) => {
    await tx`INSERT INTO users ${tx({ id: childId, email: `child-${childId}@chorequest.local`, password_hash: encodePassword(body.pin), name: body.name })}`;
    await tx`INSERT INTO memberships ${tx({ id: id(), family_id: current.familyId, user_id: childId, role: "student", status: "active" })}`;
    await tx`INSERT INTO child_profiles ${tx({ user_id: childId, age: body.age ?? null, gender: body.gender ?? null, interests: body.interests ?? "" })}`;
    await tx`INSERT INTO preferences ${tx({ user_id: childId })}`;
    await tx`INSERT INTO activity_logs ${tx({ id: id(), family_id: current.familyId, actor_id: current.id, action: "child.created", message: `${current.name} added ${body.name}` })}`;
  });
  res.status(201).json({ data: { id: childId, name: body.name } });
});
app.put("/api/parent/children/:id", async (req, res) => {
  const current = role(req, res, "parent"), body = parse(childUpdateSchema, req.body, res);
  if (!current || !body) return;
  const [child] = await sql`SELECT u.name FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=${req.params.id} AND m.family_id=${current.familyId} AND m.role='student' AND m.status='active'`;
  if (!child) return fail(res, 404, "NOT_FOUND", "Child not found.");
  await sql.begin(async (tx) => {
    if (body.pin)
      await tx`UPDATE users SET name=${body.name},password_hash=${encodePassword(body.pin)} WHERE id=${req.params.id}`;
    else await tx`UPDATE users SET name=${body.name} WHERE id=${req.params.id}`;
    await tx`INSERT INTO child_profiles ${tx({ user_id: req.params.id, age: body.age ?? null, gender: body.gender ?? null, interests: body.interests ?? "" })} ON CONFLICT(user_id) DO UPDATE SET age=excluded.age,gender=excluded.gender,interests=excluded.interests`;
    await tx`INSERT INTO activity_logs ${tx({ id: id(), family_id: current.familyId, actor_id: current.id, action: "child.updated", message: child.name === body.name ? `${body.name}'s profile was updated` : `${child.name} was renamed to ${body.name}` })}`;
  });
  res.json({ data: { ok: true } });
});
app.delete("/api/parent/children/:id", async (req, res) => {
  const current = role(req, res, "parent");
  if (!current) return;
  const rows = await sql`UPDATE memberships SET status='inactive' WHERE family_id=${current.familyId} AND user_id=${req.params.id} AND role='student' AND status='active' RETURNING user_id`;
  if (!rows.length) return fail(res, 404, "NOT_FOUND", "Child not found.");
  await sql`DELETE FROM sessions WHERE user_id=${req.params.id}`;
  res.json({ data: { ok: true } });
});
app.delete("/api/notifications/:id", async (req, res) => {
  const current = user(req, res);
  if (!current) return;
  const rows = await sql`DELETE FROM notifications WHERE id=${req.params.id} AND user_id=${current.id} RETURNING id`;
  if (!rows.length)
    return fail(res, 404, "NOT_FOUND", "Notification not found.");
  res.json({ data: { ok: true } });
});
app.put("/api/notifications/read", async (req, res) => {
  const current = user(req, res);
  if (!current) return;
  await sql`UPDATE notifications SET read_at=now() WHERE user_id=${current.id} AND read_at IS NULL`;
  res.json({ data: { ok: true } });
});
app.delete("/api/notifications", async (req, res) => {
  const current = user(req, res);
  if (!current) return;
  const rows = await sql`DELETE FROM notifications WHERE user_id=${current.id} RETURNING id`;
  res.json({ data: { removed: rows.length } });
});
app.put("/api/preferences", async (req, res) => {
  const current = user(req, res), body = parse(preferencesSchema, req.body, res);
  if (!current || !body) return;
  await sql`INSERT INTO preferences ${sql({ user_id: current.id, theme: body.theme, animation: body.animation, reduced_motion: body.reducedMotion, sound: body.sound })} ON CONFLICT(user_id) DO UPDATE SET theme=excluded.theme,animation=excluded.animation,reduced_motion=excluded.reduced_motion,sound=excluded.sound`;
  res.json({ data: body });
});
app.put("/api/account/profile", async (req, res) => {
  const current = role(req, res, "parent"), body = parse(accountProfileSchema, req.body, res);
  if (!current || !body) return;
  const email = body.email.toLowerCase();
  if ((await sql`SELECT 1 FROM users WHERE lower(email)=${email} AND id<>${current.id} LIMIT 1`)[0])
    return fail(res, 409, "EMAIL_TAKEN", "That email is already in use.");
  await sql`UPDATE users SET name=${body.name},email=${email} WHERE id=${current.id}`;
  res.json({ data: { name: body.name, email } });
});
app.put("/api/account/password", async (req, res) => {
  const current = role(req, res, "parent"), body = parse(passwordChangeSchema, req.body, res);
  if (!current || !body) return;
  const [found] = await sql`SELECT password_hash FROM users WHERE id=${current.id}`;
  if (!found || !verifyPassword(body.currentPassword, found.password_hash))
    return fail(
      res,
      400,
      "INVALID_PASSWORD",
      "Your current password is incorrect."
    );
  await sql`UPDATE users SET password_hash=${encodePassword(body.newPassword)} WHERE id=${current.id}`;
  res.json({ data: { ok: true } });
});
app.use(express.static(path.resolve("dist/client")));
app.get(
  "/{*splat}",
  (_req, res) => res.sendFile(path.resolve("dist/client/index.html"))
);
app.use(
  (error, _req, res, _next) => {
    console.error(error);
    fail(res, 500, "SERVER_ERROR", "Something went wrong.");
  }
);
var postgres_app_default = app;

// src/server/vercel-entry.ts
var vercel_entry_default = postgres_app_default;
export {
  vercel_entry_default as default
};
