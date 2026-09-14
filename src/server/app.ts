import express from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import path from "node:path";
import { db, id, now } from "./db.ts";
import {
  childSchema,
  childUpdateSchema,
  choreBulkSchema,
  choreSchema,
  choreUpdateSchema,
  decisionSchema,
  invitationSchema,
  loginSchema,
  preferencesSchema,
  registerSchema,
  reversalSchema,
  rewardSchema,
  studentLoginSchema,
  submissionSchema,
} from "../shared/schemas.ts";
import { levelFromXp, localDate, streakFromDates } from "../shared/rules.ts";
type RequestUser = {
  id: string;
  name: string;
  role: "parent" | "student";
  familyId: string;
};
declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
const encodePassword = (
  password: string,
  salt = crypto.randomBytes(16).toString("hex"),
) => `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
const verifyPassword = (password: string, stored: string) => {
  const [salt, hash] = stored.includes(":")
    ? stored.split(":")
    : ["chorequest-demo", stored];
  const actual = crypto.scryptSync(password, salt, 64),
    expected = Buffer.from(hash, "hex");
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
};
const createSession = (userId: string, res: express.Response) => {
  const token = crypto.randomBytes(32).toString("hex"),
    tokenHash = crypto.createHash("sha256").update(token).digest("hex"),
    expires = new Date(Date.now() + 7 * 86400000).toISOString();
  db.prepare("INSERT INTO sessions VALUES(?,?,?,?,?)").run(
    id(),
    userId,
    tokenHash,
    expires,
    now(),
  );
  res.cookie("cq_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 86400000,
  });
};
app.use((req, _res, next) => {
  let uid =
    process.env.NODE_ENV === "test"
      ? (req.header("x-demo-user") ?? undefined)
      : undefined;
  const token = req.cookies.cq_session;
  if (!uid && token) {
    const session = db
      .prepare(
        "SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?",
      )
      .get(crypto.createHash("sha256").update(token).digest("hex"), now()) as
      | { user_id: string }
      | undefined;
    uid = session?.user_id;
  }
  if (uid) {
    const row = db
      .prepare(
        `SELECT u.id,u.name,m.role,m.family_id familyId FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=? AND m.status='active' LIMIT 1`,
      )
      .get(uid) as RequestUser | undefined;
    req.user = row;
  }
  next();
});
const requireUser = (
  req: express.Request,
  res: express.Response,
): RequestUser | undefined => {
  if (!req.user) {
    res
      .status(401)
      .json({ error: { code: "UNAUTHENTICATED", message: "Please sign in." } });
    return;
  }
  return req.user;
};
const requireRole = (
  req: express.Request,
  res: express.Response,
  role: "parent" | "student",
) => {
  const user = requireUser(req, res);
  if (user && user.role !== role) {
    res
      .status(403)
      .json({
        error: { code: "FORBIDDEN", message: `${role} access required.` },
      });
    return;
  }
  return user;
};
const parse = <T>(
  schema: {
    safeParse: (v: unknown) => {
      success: boolean;
      data?: T;
      error?: { flatten: () => unknown };
    };
  },
  body: unknown,
  res: express.Response,
) => {
  const result = schema.safeParse(body);
  if (!result.success) {
    res
      .status(400)
      .json({
        error: {
          code: "INVALID_INPUT",
          message: "Check the highlighted fields.",
          fields: result.error?.flatten(),
        },
      });
    return;
  }
  return result.data;
};
app.post("/api/auth/demo", (req, res) => {
  const uid =
    req.body?.role === "parent"
      ? "parent-demo"
      : req.body?.studentId === "student-sam"
        ? "student-sam"
        : "student-alex";
  createSession(uid, res);
  res.json({ data: { ok: true } });
});
app.post("/api/auth/register", (req, res) => {
  const body = parse(registerSchema, req.body, res);
  if (!body) return;
  try {
    const userId = id(),
      familyId = id();
    db.transaction(() => {
      db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?)").run(
        userId,
        body.email.toLowerCase(),
        encodePassword(body.password),
        body.name,
        "America/New_York",
        now(),
      );
      db.prepare("INSERT INTO families VALUES(?,?,?,?,?)").run(
        familyId,
        body.familyName,
        userId,
        "{}",
        now(),
      );
      db.prepare("INSERT INTO memberships VALUES(?,?,?,?,?)").run(
        id(),
        familyId,
        userId,
        "parent",
        "active",
      );
      db.prepare("INSERT INTO preferences VALUES(?,?,?,?,?)").run(
        userId,
        "garden",
        1,
        0,
        1,
      );
    })();
    createSession(userId, res);
    res.status(201).json({ data: { ok: true } });
  } catch {
    res
      .status(409)
      .json({
        error: {
          code: "EMAIL_TAKEN",
          message: "An account already uses that email.",
        },
      });
  }
});
app.post("/api/auth/login", (req, res) => {
  const body = parse(loginSchema, req.body, res);
  if (!body) return;
  const user = db
    .prepare("SELECT id,password_hash FROM users WHERE lower(email)=lower(?)")
    .get(body.email) as { id: string; password_hash: string } | undefined;
  if (!user || !verifyPassword(body.password, user.password_hash))
    return res
      .status(401)
      .json({
        error: {
          code: "INVALID_LOGIN",
          message: "Email or password is incorrect.",
        },
      });
  createSession(user.id, res);
  res.json({ data: { ok: true } });
});
app.post("/api/auth/student", (req, res) => {
  const body = parse(studentLoginSchema, req.body, res);
  if (!body) return;
  const child = db
    .prepare(
      `SELECT child.id,child.password_hash FROM users child JOIN memberships membership ON membership.user_id=child.id AND membership.role='student' AND membership.status='active' JOIN families family ON family.id=membership.family_id JOIN users parent ON parent.id=family.owner_id WHERE lower(parent.email)=lower(?) AND lower(child.name)=lower(?) LIMIT 1`,
    )
    .get(body.parentEmail, body.name) as
    | { id: string; password_hash: string }
    | undefined;
  if (!child || !verifyPassword(body.pin, child.password_hash))
    return res
      .status(401)
      .json({
        error: {
          code: "INVALID_STUDENT_LOGIN",
          message: "Family email, name, or PIN is incorrect.",
        },
      });
  createSession(child.id, res);
  res.json({ data: { ok: true } });
});
app.post("/api/auth/logout", (req, res) => {
  const token = req.cookies.cq_session;
  if (token)
    db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
      crypto.createHash("sha256").update(token).digest("hex"),
    );
  res.clearCookie("cq_session");
  res.json({ data: { ok: true } });
});
app.get("/api/dashboard", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const points = Number(
    (
      db
        .prepare(
          "SELECT COALESCE(SUM(amount),0) total FROM point_transactions WHERE student_id=?",
        )
        .get(user.id) as { total: number }
    ).total,
  );
  const xp = Number(
    (
      db
        .prepare(
          "SELECT COALESCE(SUM(amount),0) total FROM xp_transactions WHERE student_id=?",
        )
        .get(user.id) as { total: number }
    ).total,
  );
  const dates = (
    db
      .prepare(
        "SELECT local_date FROM daily_activity WHERE student_id=? ORDER BY local_date DESC",
      )
      .all(user.id) as { local_date: string }[]
  ).map((x) => x.local_date);
  const timezone = (
    db.prepare("SELECT timezone FROM users WHERE id=?").get(user.id) as {
      timezone: string;
    }
  ).timezone;
  const pref = db
    .prepare("SELECT * FROM preferences WHERE user_id=?")
    .get(user.id) as Record<string, string | number>;
  const childIds =
    user.role === "parent"
      ? (
          db
            .prepare(
              `SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.family_id=? AND m.role='student' AND m.status='active'`,
            )
            .all(user.familyId) as { id: string }[]
        ).map((x) => x.id)
      : [user.id];
  const placeholders = childIds.length
    ? childIds.map(() => "?").join(",")
    : "NULL";
  const chores = db
    .prepare(
      `SELECT c.*,a.id assignment_id,a.student_id,a.due_at,a.status,u.name assignee_name,s.id submission_id,s.created_at completed_at,d.note feedback FROM assignments a JOIN chores c ON c.id=a.chore_id JOIN users u ON u.id=a.student_id LEFT JOIN submissions s ON s.assignment_id=a.id AND s.attempt=(SELECT MAX(attempt) FROM submissions WHERE assignment_id=a.id) LEFT JOIN decisions d ON d.submission_id=s.id WHERE a.student_id IN (${placeholders}) AND c.archived_at IS NULL ORDER BY a.due_at`,
    )
    .all(...childIds) as Record<string, unknown>[];
  const mapUser = (uid: string) => {
    const u = db
      .prepare(
        "SELECT u.id,u.name,u.timezone,p.age,p.gender,p.interests FROM users u LEFT JOIN child_profiles p ON p.user_id=u.id WHERE u.id=?",
      )
      .get(uid) as {
      id: string;
      name: string;
      timezone: string;
      age?: number;
      gender?: string;
      interests?: string;
    };
    const p = Number(
      (
        db
          .prepare(
            "SELECT COALESCE(SUM(amount),0) total FROM point_transactions WHERE student_id=?",
          )
          .get(uid) as { total: number }
      ).total,
    );
    const x = Number(
      (
        db
          .prepare(
            "SELECT COALESCE(SUM(amount),0) total FROM xp_transactions WHERE student_id=?",
          )
          .get(uid) as { total: number }
      ).total,
    );
    const ds = (
      db
        .prepare(
          "SELECT local_date FROM daily_activity WHERE student_id=? ORDER BY local_date DESC",
        )
        .all(uid) as { local_date: string }[]
    ).map((v) => v.local_date);
    return {
      id: u.id,
      name: u.name,
      role: "student",
      points: p,
      xp: x,
      level: levelFromXp(x),
      streak: streakFromDates(ds, localDate(new Date(), u.timezone)),
      bestStreak: Math.max(
        5,
        streakFromDates(ds, localDate(new Date(), u.timezone)),
      ),
      theme: "garden",
      animation: true,
      age: u.age,
      gender: u.gender,
      interests: u.interests,
    };
  };
  res.json({
    data: {
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        points,
        xp,
        level: levelFromXp(xp),
        streak: streakFromDates(dates, localDate(new Date(), timezone)),
        bestStreak: 12,
        theme: pref?.theme ?? "garden",
        animation: Boolean(pref?.animation ?? 1),
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
        dueAt: c.due_at,
        completedAt: c.completed_at,
        recurrence: c.recurrence,
        requiresApproval: Boolean(c.requires_approval),
        requiresProof: Boolean(c.requires_proof),
        assigneeId: c.student_id,
        assigneeName: c.assignee_name,
        status: c.status,
        submissionId: c.submission_id,
        feedback: c.feedback,
      })),
      rewards: db
        .prepare(
          `SELECT r.*,EXISTS(SELECT 1 FROM reward_goals g WHERE g.reward_id=r.id AND g.student_id=? AND g.active=1) goal FROM rewards r WHERE family_id=? ORDER BY cost`,
        )
        .all(user.id, user.familyId)
        .map((r: any) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          icon: r.icon,
          cost: r.cost,
          stock: r.stock,
          enabled: Boolean(r.enabled),
          requiresApproval: Boolean(r.requires_approval),
          goal: Boolean(r.goal),
        })),
      transactions: db
        .prepare(
          "SELECT id,amount,kind,note,created_at createdAt FROM point_transactions WHERE student_id=? ORDER BY created_at DESC LIMIT 5",
        )
        .all(user.id),
      notifications: db
        .prepare(
          "SELECT id,title,body,read_at IS NOT NULL read,created_at createdAt FROM notifications WHERE user_id=? ORDER BY created_at DESC",
        )
        .all(user.id),
      activity: db
        .prepare(
          "SELECT id,message,amount,created_at createdAt FROM activity_logs WHERE family_id=? ORDER BY created_at DESC LIMIT 8",
        )
        .all(user.familyId),
      children: user.role === "parent" ? childIds.map(mapUser) : [],
      pendingCount: Number(
        (
          db
            .prepare(
              `SELECT COUNT(*) count FROM assignments a JOIN chores c ON c.id=a.chore_id WHERE c.family_id=? AND a.status='pending'`,
            )
            .get(user.familyId) as { count: number }
        ).count,
      ),
    },
  });
});
app.post("/api/parent/chores", (req, res) => {
  const user = requireRole(req, res, "parent");
  if (!user) return;
  const body = parse(choreSchema, req.body, res);
  if (!body) return;
  const choreId = id();
  db.transaction(() => {
    db.prepare("INSERT INTO chores VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      choreId,
      user.familyId,
      user.id,
      body.title,
      body.description,
      body.category,
      body.difficulty,
      body.points,
      body.xp,
      body.recurrence,
      Number(body.requiresApproval),
      Number(body.requiresProof),
      null,
      now(),
    );
    for (const studentId of body.assigneeIds) {
      const member = db
        .prepare(
          `SELECT 1 FROM memberships WHERE family_id=? AND user_id=? AND role='student'`,
        )
        .get(user.familyId, studentId);
      if (!member) throw new Error("Student is not in this family");
      db.prepare("INSERT INTO assignments VALUES(?,?,?,?,?,?,?)").run(
        id(),
        choreId,
        studentId,
        body.dueAt,
        "todo",
        null,
        now(),
      );
    }
    db.prepare("INSERT INTO activity_logs VALUES(?,?,?,?,?,?,?)").run(
      id(),
      user.familyId,
      user.id,
      "chore.created",
      `${user.name} created ${body.title}`,
      null,
      now(),
    );
  })();
  res.status(201).json({ data: { id: choreId } });
});
app.put("/api/parent/assignments/:id", (req, res) => {
  const user = requireRole(req, res, "parent");
  if (!user) return;
  const body = parse(choreUpdateSchema, req.body, res);
  if (!body) return;
  const row = db
    .prepare(
      "SELECT a.chore_id FROM assignments a JOIN chores c ON c.id=a.chore_id WHERE a.id=? AND c.family_id=?",
    )
    .get(req.params.id, user.familyId) as { chore_id: string } | undefined;
  if (!row)
    return res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Chore not found." } });
  db.transaction(() => {
    db.prepare(
      "UPDATE chores SET title=?,description=?,category=?,difficulty=?,points=?,xp=?,recurrence=?,requires_approval=?,requires_proof=? WHERE id=?",
    ).run(
      body.title,
      body.description,
      body.category,
      body.difficulty,
      body.points,
      body.xp,
      body.recurrence,
      Number(body.requiresApproval),
      Number(body.requiresProof),
      row.chore_id,
    );
    db.prepare("UPDATE assignments SET due_at=? WHERE id=?").run(
      body.dueAt,
      req.params.id,
    );
  })();
  res.json({ data: { ok: true } });
});
app.delete("/api/parent/assignments/:id", (req, res) => {
  const user = requireRole(req, res, "parent");
  if (!user) return;
  const result = db
    .prepare(
      "UPDATE chores SET archived_at=? WHERE id=(SELECT a.chore_id FROM assignments a JOIN chores c ON c.id=a.chore_id WHERE a.id=? AND c.family_id=?)",
    )
    .run(now(), req.params.id, user.familyId);
  if (!result.changes)
    return res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Chore not found." } });
  res.json({ data: { ok: true } });
});
app.post("/api/parent/chores/bulk-delete", (req, res) => {
  const user = requireRole(req, res, "parent");
  if (!user) return;
  const body = parse(choreBulkSchema, req.body, res);
  if (!body) return;
  const marks = body.assignmentIds.map(() => "?").join(",");
  const result = db
    .prepare(
      `UPDATE chores SET archived_at=? WHERE family_id=? AND id IN(SELECT chore_id FROM assignments WHERE id IN(${marks}))`,
    )
    .run(now(), user.familyId, ...body.assignmentIds);
  res.json({ data: { removed: result.changes } });
});
app.delete("/api/parent/chores", (req, res) => {
  const user = requireRole(req, res, "parent");
  if (!user) return;
  const result = db
    .prepare(
      "UPDATE chores SET archived_at=? WHERE family_id=? AND archived_at IS NULL",
    )
    .run(now(), user.familyId);
  res.json({ data: { removed: result.changes } });
});
function award(assignmentId: string, submissionId: string, user: RequestUser) {
  const a = db
    .prepare(
      `SELECT a.*,c.points,c.xp,c.requires_approval,c.family_id,c.title,u.timezone FROM assignments a JOIN chores c ON c.id=a.chore_id JOIN users u ON u.id=a.student_id WHERE a.id=?`,
    )
    .get(assignmentId) as any;
  if (a.awarded_submission_id) return;
  db.prepare(
    "UPDATE assignments SET status=?,awarded_submission_id=? WHERE id=?",
  ).run(
    a.requires_approval ? "approved" : "completed",
    submissionId,
    assignmentId,
  );
  db.prepare(
    "INSERT OR IGNORE INTO point_transactions VALUES(?,?,?,?,?,?,?,?,?)",
  ).run(
    id(),
    a.family_id,
    a.student_id,
    a.points,
    "chore",
    a.title,
    assignmentId,
    `chore:${assignmentId}`,
    now(),
  );
  db.prepare(
    "INSERT OR IGNORE INTO xp_transactions VALUES(?,?,?,?,?,?,?,?)",
  ).run(
    id(),
    a.family_id,
    a.student_id,
    a.xp,
    "chore",
    assignmentId,
    `chore:${assignmentId}`,
    now(),
  );
  const date = localDate(new Date(), a.timezone);
  db.prepare(
    `INSERT INTO daily_activity VALUES(?,?,?,?,1) ON CONFLICT(student_id,local_date) DO UPDATE SET qualifying_count=qualifying_count+1`,
  ).run(id(), a.student_id, date, a.timezone);
  db.prepare("INSERT INTO activity_logs VALUES(?,?,?,?,?,?,?)").run(
    id(),
    a.family_id,
    user.id,
    "chore.completed",
    `${a.title} was completed`,
    a.points,
    now(),
  );
}
app.post("/api/student/assignments/:id/submit", (req, res) => {
  const user = requireRole(req, res, "student");
  if (!user) return;
  const body = parse(submissionSchema, req.body, res);
  if (!body) return;
  const a = db
    .prepare(
      `SELECT a.*,c.requires_approval,c.requires_proof FROM assignments a JOIN chores c ON c.id=a.chore_id WHERE a.id=? AND a.student_id=?`,
    )
    .get(req.params.id, user.id) as any;
  if (!a)
    return res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Chore not found." } });
  if (!["todo", "changes_requested", "rejected"].includes(a.status))
    return res
      .status(409)
      .json({
        error: {
          code: "ALREADY_SUBMITTED",
          message: "This chore was already submitted.",
        },
      });
  if (a.requires_proof && !body.proofUrl)
    return res
      .status(400)
      .json({
        error: { code: "PROOF_REQUIRED", message: "Photo proof is required." },
      });
  db.transaction(() => {
    const attempt = Number(
      (
        db
          .prepare(
            "SELECT COALESCE(MAX(attempt),0)+1 next FROM submissions WHERE assignment_id=?",
          )
          .get(a.id) as { next: number }
      ).next,
    );
    const sid = id();
    const status = a.requires_approval ? "pending" : "approved";
    db.prepare("INSERT INTO submissions VALUES(?,?,?,?,?,?,?)").run(
      sid,
      a.id,
      attempt,
      body.note,
      body.proofUrl ?? null,
      status,
      now(),
    );
    db.prepare("UPDATE assignments SET status=? WHERE id=?").run(
      a.requires_approval ? "pending" : "completed",
      a.id,
    );
    if (!a.requires_approval) award(a.id, sid, user);
    if (a.requires_approval)
      db.prepare(
        "INSERT INTO notifications SELECT ?,user_id,?,?,NULL,? FROM memberships WHERE family_id=? AND role=?",
      ).run(
        id(),
        "Chore ready to review",
        `${user.name} submitted a chore.`,
        now(),
        user.familyId,
        "parent",
      );
  })();
  res
    .status(201)
    .json({ data: { status: a.requires_approval ? "pending" : "completed" } });
});
app.post("/api/parent/submissions/:id/decision", (req, res) => {
  const user = requireRole(req, res, "parent");
  if (!user) return;
  const body = parse(decisionSchema, req.body, res);
  if (!body) return;
  const s = db
    .prepare(
      `SELECT s.*,a.id assignment_id,a.student_id,c.family_id,c.title FROM submissions s JOIN assignments a ON a.id=s.assignment_id JOIN chores c ON c.id=a.chore_id WHERE s.id=? AND c.family_id=?`,
    )
    .get(req.params.id, user.familyId) as any;
  if (!s)
    return res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Submission not found." } });
  if (s.status !== "pending")
    return res
      .status(409)
      .json({
        error: {
          code: "ALREADY_DECIDED",
          message: "This submission already has a decision.",
        },
      });
  db.transaction(() => {
    db.prepare("UPDATE submissions SET status=? WHERE id=?").run(
      body.decision,
      s.id,
    );
    db.prepare("UPDATE assignments SET status=? WHERE id=?").run(
      body.decision,
      s.assignment_id,
    );
    db.prepare("INSERT INTO decisions VALUES(?,?,?,?,?,?,?)").run(
      id(),
      s.id,
      user.id,
      body.decision,
      body.note,
      null,
      now(),
    );
    if (body.decision === "approved") award(s.assignment_id, s.id, user);
    db.prepare("INSERT INTO notifications VALUES(?,?,?,?,?,?)").run(
      id(),
      s.student_id,
      body.decision === "approved" ? "Chore approved" : "Chore needs attention",
      body.decision === "approved"
        ? `You earned points for ${s.title}.`
        : body.note,
      null,
      now(),
    );
  })();
  res.json({ data: { status: body.decision } });
});
app.post("/api/student/rewards/:id/goal", (req, res) => {
  const user = requireRole(req, res, "student");
  if (!user) return;
  const reward = db
    .prepare("SELECT id FROM rewards WHERE id=? AND family_id=? AND enabled=1")
    .get(req.params.id, user.familyId);
  if (!reward)
    return res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Reward not found." } });
  db.transaction(() => {
    db.prepare("UPDATE reward_goals SET active=0 WHERE student_id=?").run(
      user.id,
    );
    db.prepare("INSERT INTO reward_goals VALUES(?,?,?,?,?)").run(
      id(),
      user.id,
      req.params.id,
      1,
      now(),
    );
  })();
  res.json({ data: { ok: true } });
});
app.post("/api/student/rewards/:id/redeem", (req, res) => {
  const user = requireRole(req, res, "student");
  if (!user) return;
  const key = req.header("Idempotency-Key") ?? "";
  if (!key)
    return res
      .status(400)
      .json({ error: { code: "IDEMPOTENCY_REQUIRED", message: "Try again." } });
  const prior = db
    .prepare("SELECT id,status FROM redemptions WHERE idempotency_key=?")
    .get(key);
  if (prior) return res.json({ data: prior });
  try {
    const result = db.transaction(() => {
      const r = db
        .prepare("SELECT * FROM rewards WHERE id=? AND family_id=?")
        .get(req.params.id, user.familyId) as any;
      if (!r || !r.enabled || r.stock < 1) throw new Error("UNAVAILABLE");
      const balance = Number(
        (
          db
            .prepare(
              "SELECT COALESCE(SUM(amount),0) total FROM point_transactions WHERE student_id=?",
            )
            .get(user.id) as { total: number }
        ).total,
      );
      if (balance < r.cost) throw new Error("INSUFFICIENT");
      const rid = id(),
        status = r.requires_approval ? "requested" : "fulfilled";
      db.prepare("INSERT INTO redemptions VALUES(?,?,?,?,?,?,?,?)").run(
        rid,
        r.id,
        user.id,
        r.cost,
        status,
        key,
        now(),
        now(),
      );
      db.prepare(
        "INSERT INTO point_transactions VALUES(?,?,?,?,?,?,?,?,?)",
      ).run(
        id(),
        user.familyId,
        user.id,
        -r.cost,
        "reward",
        r.name,
        rid,
        `redeem:${rid}`,
        now(),
      );
      db.prepare("UPDATE rewards SET stock=stock-1 WHERE id=?").run(r.id);
      return { id: rid, status };
    })();
    res.status(201).json({ data: result });
  } catch (e) {
    const code = (e as Error).message;
    res
      .status(409)
      .json({
        error: {
          code,
          message:
            code === "INSUFFICIENT"
              ? "You need more points for this reward."
              : "This reward is unavailable.",
        },
      });
  }
});
app.post("/api/parent/rewards", (req, res) => {
  const user = requireRole(req, res, "parent");
  if (!user) return;
  const body = parse(rewardSchema, req.body, res);
  if (!body) return;
  const rewardId = id();
  db.prepare("INSERT INTO rewards VALUES(?,?,?,?,?,?,?,?,?,?)").run(
    rewardId,
    user.familyId,
    body.name,
    body.description,
    body.icon,
    body.cost,
    body.stock,
    Number(body.enabled),
    Number(body.requiresApproval),
    now(),
  );
  res.status(201).json({ data: { id: rewardId } });
});
app.put("/api/parent/rewards/:id", (req, res) => {
  const user = requireRole(req, res, "parent");
  if (!user) return;
  const body = parse(rewardSchema, req.body, res);
  if (!body) return;
  const result = db
    .prepare(
      "UPDATE rewards SET name=?,description=?,icon=?,cost=?,stock=?,enabled=?,requires_approval=? WHERE id=? AND family_id=?",
    )
    .run(
      body.name,
      body.description,
      body.icon,
      body.cost,
      body.stock,
      Number(body.enabled),
      Number(body.requiresApproval),
      req.params.id,
      user.familyId,
    );
  if (!result.changes)
    return res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Reward not found." } });
  res.json({ data: { ok: true } });
});
app.post("/api/parent/children", (req, res) => {
  const user = requireRole(req, res, "parent");
  if (!user) return;
  const body = parse(childSchema, req.body, res);
  if (!body) return;
  const childId = id(),
    internalEmail = `child-${childId}@chorequest.local`;
  db.transaction(() => {
    db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?)").run(
      childId,
      internalEmail,
      encodePassword(body.pin),
      body.name,
      "America/New_York",
      now(),
    );
    db.prepare("INSERT INTO memberships VALUES(?,?,?,?,?)").run(
      id(),
      user.familyId,
      childId,
      "student",
      "active",
    );
    db.prepare("INSERT INTO child_profiles VALUES(?,?,?,?)").run(
      childId,
      body.age ?? null,
      body.gender ?? null,
      body.interests ?? "",
    );
    db.prepare("INSERT INTO preferences VALUES(?,?,?,?,?)").run(
      childId,
      "garden",
      1,
      0,
      1,
    );
    db.prepare("INSERT INTO activity_logs VALUES(?,?,?,?,?,?,?)").run(
      id(),
      user.familyId,
      user.id,
      "child.created",
      `${user.name} added ${body.name}`,
      null,
      now(),
    );
  })();
  res.status(201).json({ data: { id: childId, name: body.name } });
});
app.put("/api/parent/children/:id", (req, res) => {
  const user = requireRole(req, res, "parent");
  if (!user) return;
  const body = parse(childUpdateSchema, req.body, res);
  if (!body) return;
  const child = db
    .prepare(
      `SELECT u.name FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=? AND m.family_id=? AND m.role='student' AND m.status='active'`,
    )
    .get(req.params.id, user.familyId) as { name: string } | undefined;
  if (!child)
    return res
      .status(404)
      .json({
        error: { code: "NOT_FOUND", message: "Child profile not found." },
      });
  db.transaction(() => {
    if (body.pin)
      db.prepare("UPDATE users SET name=?,password_hash=? WHERE id=?").run(
        body.name,
        encodePassword(body.pin),
        req.params.id,
      );
    else
      db.prepare("UPDATE users SET name=? WHERE id=?").run(
        body.name,
        req.params.id,
      );
    db.prepare(
      `INSERT INTO child_profiles VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET age=excluded.age,gender=excluded.gender,interests=excluded.interests`,
    ).run(
      req.params.id,
      body.age ?? null,
      body.gender ?? null,
      body.interests ?? "",
    );
    db.prepare("INSERT INTO activity_logs VALUES(?,?,?,?,?,?,?)").run(
      id(),
      user.familyId,
      user.id,
      "child.updated",
      child.name === body.name
        ? `${body.name}'s profile was updated`
        : `${child.name} was renamed to ${body.name}`,
      null,
      now(),
    );
  })();
  res.json({ data: { ok: true } });
});
app.delete("/api/parent/children/:id", (req, res) => {
  const user = requireRole(req, res, "parent");
  if (!user) return;
  const child = db
    .prepare(
      `SELECT u.name FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=? AND m.family_id=? AND m.role='student' AND m.status='active'`,
    )
    .get(req.params.id, user.familyId) as { name: string } | undefined;
  if (!child)
    return res
      .status(404)
      .json({
        error: { code: "NOT_FOUND", message: "Child profile not found." },
      });
  db.transaction(() => {
    db.prepare(
      "UPDATE memberships SET status='inactive' WHERE family_id=? AND user_id=? AND role='student'",
    ).run(user.familyId, req.params.id);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(req.params.id);
    db.prepare("INSERT INTO activity_logs VALUES(?,?,?,?,?,?,?)").run(
      id(),
      user.familyId,
      user.id,
      "child.removed",
      `${child.name} was removed from the active family`,
      null,
      now(),
    );
  })();
  res.json({ data: { ok: true } });
});
app.post("/api/parent/invitations", (req, res) => {
  const user = requireRole(req, res, "parent");
  if (!user) return;
  const body = parse(invitationSchema, req.body, res);
  if (!body) return;
  try {
    const inviteId = id();
    db.prepare("INSERT INTO invitations VALUES(?,?,?,?,?,?,?)").run(
      inviteId,
      user.familyId,
      body.email,
      body.role,
      "pending",
      user.id,
      now(),
    );
    res.status(201).json({ data: { id: inviteId, status: "pending" } });
  } catch {
    res
      .status(409)
      .json({
        error: {
          code: "ALREADY_INVITED",
          message: "That email already has a pending invitation.",
        },
      });
  }
});
app.post("/api/parent/assignments/:id/reverse", (req, res) => {
  const user = requireRole(req, res, "parent");
  if (!user) return;
  const body = parse(reversalSchema, req.body, res);
  if (!body) return;
  const a = db
    .prepare(
      `SELECT a.*,c.family_id,c.title,u.timezone FROM assignments a JOIN chores c ON c.id=a.chore_id JOIN users u ON u.id=a.student_id WHERE a.id=? AND c.family_id=?`,
    )
    .get(req.params.id, user.familyId) as any;
  if (!a || !a.awarded_submission_id)
    return res
      .status(409)
      .json({
        error: {
          code: "NOT_REVERSIBLE",
          message: "This assignment has no award to reverse.",
        },
      });
  db.transaction(() => {
    const pt = db
      .prepare("SELECT amount FROM point_transactions WHERE idempotency_key=?")
      .get(`chore:${a.id}`) as { amount: number } | undefined;
    const xt = db
      .prepare("SELECT amount FROM xp_transactions WHERE idempotency_key=?")
      .get(`chore:${a.id}`) as { amount: number } | undefined;
    if (pt)
      db.prepare(
        "INSERT OR IGNORE INTO point_transactions VALUES(?,?,?,?,?,?,?,?,?)",
      ).run(
        id(),
        a.family_id,
        a.student_id,
        -pt.amount,
        "reversal",
        body.reason,
        a.id,
        `reverse:points:${a.id}`,
        now(),
      );
    if (xt)
      db.prepare(
        "INSERT OR IGNORE INTO xp_transactions VALUES(?,?,?,?,?,?,?,?)",
      ).run(
        id(),
        a.family_id,
        a.student_id,
        -xt.amount,
        "reversal",
        a.id,
        `reverse:xp:${a.id}`,
        now(),
      );
    db.prepare(
      "UPDATE assignments SET status='pending',awarded_submission_id=NULL WHERE id=?",
    ).run(a.id);
    db.prepare(
      "UPDATE daily_activity SET qualifying_count=MAX(0,qualifying_count-1) WHERE student_id=? AND local_date=?",
    ).run(a.student_id, localDate(new Date(), a.timezone));
    db.prepare("INSERT INTO activity_logs VALUES(?,?,?,?,?,?,?)").run(
      id(),
      a.family_id,
      user.id,
      "approval.reversed",
      `${user.name} reversed ${a.title}: ${body.reason}`,
      pt ? -pt.amount : null,
      now(),
    );
  })();
  res.json({ data: { status: "pending" } });
});
app.post("/api/parent/recurring/generate", (req, res) => {
  const user = requireRole(req, res, "parent");
  if (!user) return;
  const rows = db
    .prepare(
      `SELECT c.id chore_id,c.recurrence,a.student_id,a.due_at FROM chores c JOIN assignments a ON a.chore_id=c.id WHERE c.family_id=? AND c.archived_at IS NULL AND c.recurrence IN('daily','weekly') ORDER BY a.due_at DESC`,
    )
    .all(user.familyId) as any[];
  let created = 0;
  const seen = new Set<string>();
  db.transaction(() => {
    for (const row of rows) {
      const key = `${row.chore_id}:${row.student_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const next = new Date(row.due_at),
        today = new Date();
      next.setDate(next.getDate() + (row.recurrence === "daily" ? 1 : 7));
      while (next <= today) {
        const result = db
          .prepare("INSERT OR IGNORE INTO assignments VALUES(?,?,?,?,?,?,?)")
          .run(
            id(),
            row.chore_id,
            row.student_id,
            next.toISOString(),
            "todo",
            null,
            now(),
          );
        created += result.changes;
        next.setDate(next.getDate() + (row.recurrence === "daily" ? 1 : 7));
      }
    }
  })();
  res.json({ data: { created } });
});
app.delete("/api/notifications/:id", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const result = db
    .prepare("DELETE FROM notifications WHERE id=? AND user_id=?")
    .run(req.params.id, user.id);
  if (!result.changes)
    return res
      .status(404)
      .json({
        error: { code: "NOT_FOUND", message: "Notification not found." },
      });
  res.json({ data: { ok: true } });
});
app.delete("/api/notifications", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const result = db
    .prepare("DELETE FROM notifications WHERE user_id=?")
    .run(user.id);
  res.json({ data: { removed: result.changes } });
});
app.put("/api/preferences", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const body = parse(preferencesSchema, req.body, res);
  if (!body) return;
  db.prepare(
    `INSERT INTO preferences VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET theme=excluded.theme,animation=excluded.animation,reduced_motion=excluded.reduced_motion,sound=excluded.sound`,
  ).run(
    user.id,
    body.theme,
    Number(body.animation),
    Number(body.reducedMotion),
    Number(body.sound),
  );
  res.json({ data: body });
});
app.use(express.static(path.resolve("dist/client")));
app.get("/{*splat}", (_req, res) =>
  res.sendFile(path.resolve("dist/client/index.html")),
);
export default app;
