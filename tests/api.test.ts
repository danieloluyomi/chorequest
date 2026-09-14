import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = ":memory:";
let server: Server,
  base = "";
let seed: () => void;
beforeAll(async () => {
  const app = (await import("../src/server/app.ts")).default;
  seed = (await import("../src/server/seed.ts")).seed;
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const address = server.address();
      if (typeof address === "object" && address)
        base = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});
beforeEach(() => seed());
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
async function request(path: string, user: string, init: RequestInit = {}) {
  return fetch(`${base}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-demo-user": user,
      ...init.headers,
    },
  });
}
async function dashboard(user = "student-alex") {
  const response = await request("/dashboard", user);
  return (await response.json()).data;
}
describe("chore approval ledger", () => {
  it("keeps pending work unawarded and awards approval exactly once", async () => {
    expect((await dashboard()).user.points).toBe(690);
    const first = await request(
      "/parent/submissions/sub-dish/decision",
      "parent-demo",
      {
        method: "POST",
        body: JSON.stringify({ decision: "approved", note: "" }),
      },
    );
    expect(first.status).toBe(200);
    expect((await dashboard()).user.points).toBe(720);
    const repeat = await request(
      "/parent/submissions/sub-dish/decision",
      "parent-demo",
      {
        method: "POST",
        body: JSON.stringify({ decision: "approved", note: "" }),
      },
    );
    expect(repeat.status).toBe(409);
    expect((await dashboard()).user.points).toBe(720);
  });
  it("does not award rejected work and preserves feedback for resubmission", async () => {
    const rejected = await request(
      "/parent/submissions/sub-dish/decision",
      "parent-demo",
      {
        method: "POST",
        body: JSON.stringify({
          decision: "rejected",
          note: "Please dry the cups.",
        }),
      },
    );
    expect(rejected.status).toBe(200);
    expect((await dashboard()).user.points).toBe(690);
    const resubmit = await request(
      "/student/assignments/a-dish/submit",
      "student-alex",
      {
        method: "POST",
        body: JSON.stringify({
          note: "Fixed it.",
          proofUrl: "https://example.com/proof.jpg",
        }),
      },
    );
    expect(resubmit.status).toBe(201);
    expect(
      (await dashboard()).chores.find((c: { id: string }) => c.id === "a-dish")
        .status,
    ).toBe("pending");
  });
});
describe("server authorization", () => {
  it("blocks students from parent mutations", async () => {
    const response = await request("/parent/chores", "student-alex", {
      method: "POST",
      body: "{}",
    });
    expect(response.status).toBe(403);
  });
  it("does not expose another family assignment through student IDs", async () => {
    const response = await request(
      "/student/assignments/s-pet/submit",
      "student-alex",
      { method: "POST", body: JSON.stringify({ note: "" }) },
    );
    expect(response.status).toBe(404);
  });
});
describe("reward redemption ledger", () => {
  it("deducts once, treats repeat keys idempotently, and prevents negative balance", async () => {
    const headers = { "Idempotency-Key": "test-redemption" };
    const first = await request(
      "/student/rewards/dessert/redeem",
      "student-alex",
      { method: "POST", headers },
    );
    expect(first.status).toBe(201);
    expect((await dashboard()).user.points).toBe(340);
    const repeat = await request(
      "/student/rewards/dessert/redeem",
      "student-alex",
      { method: "POST", headers },
    );
    expect(repeat.status).toBe(200);
    expect((await dashboard()).user.points).toBe(340);
    const expensive = await request(
      "/student/rewards/park/redeem",
      "student-alex",
      { method: "POST", headers: { "Idempotency-Key": "too-expensive" } },
    );
    expect(expensive.status).toBe(409);
    expect((await dashboard()).user.points).toBe(340);
  });
});
describe("parent management workflows", () => {
  it("creates and edits rewards", async () => {
    const body = {
      name: "Pick dinner",
      description: "Choose the family meal.",
      icon: "🍕",
      cost: 450,
      stock: 2,
      enabled: true,
      requiresApproval: true,
    };
    const created = await request("/parent/rewards", "parent-demo", {
      method: "POST",
      body: JSON.stringify(body),
    });
    expect(created.status).toBe(201);
    const rewardId = (await created.json()).data.id;
    const edited = await request(`/parent/rewards/${rewardId}`, "parent-demo", {
      method: "PUT",
      body: JSON.stringify({ ...body, cost: 500, stock: 3 }),
    });
    expect(edited.status).toBe(200);
    expect(
      (await dashboard()).rewards.find((r: { id: string }) => r.id === rewardId)
        .cost,
    ).toBe(500);
  });
  it("creates one pending family invitation", async () => {
    const body = JSON.stringify({
      email: "guardian@example.com",
      role: "parent",
    });
    expect(
      (
        await request("/parent/invitations", "parent-demo", {
          method: "POST",
          body,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await request("/parent/invitations", "parent-demo", {
          method: "POST",
          body,
        })
      ).status,
    ).toBe(409);
  });
  it("reverses an approval with compensating ledger entries", async () => {
    await request("/parent/submissions/sub-dish/decision", "parent-demo", {
      method: "POST",
      body: JSON.stringify({ decision: "approved", note: "" }),
    });
    expect((await dashboard()).user.points).toBe(720);
    const reversed = await request(
      "/parent/assignments/a-dish/reverse",
      "parent-demo",
      {
        method: "POST",
        body: JSON.stringify({ reason: "Approved the wrong submission" }),
      },
    );
    expect(reversed.status).toBe(200);
    expect((await dashboard()).user.points).toBe(690);
    expect(
      (await dashboard()).chores.find((c: { id: string }) => c.id === "a-dish")
        .status,
    ).toBe("pending");
  });
});
describe("parent accounts and child profiles", () => {
  it("registers a parent and creates an authenticated session", async () => {
    const response = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Taylor Reed",
        email: "taylor@example.com",
        password: "safe-password",
        familyName: "Reed Family",
      }),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("cq_session=");
  });
  it("accepts the seeded parent login and rejects a bad password", async () => {
    const good = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "jamie@chorequest.demo",
        password: "demo1234",
      }),
    });
    expect(good.status).toBe(200);
    const bad = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "jamie@chorequest.demo",
        password: "wrong",
      }),
    });
    expect(bad.status).toBe(401);
  });
  it("signs a student in with family, name, and PIN", async () => {
    const good = await fetch(`${base}/api/auth/student`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentEmail: "jamie@chorequest.demo",
        name: "Alex Morgan",
        pin: "1234",
      }),
    });
    expect(good.status).toBe(200);
    expect(good.headers.get("set-cookie")).toContain("cq_session=");
    const bad = await fetch(`${base}/api/auth/student`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentEmail: "jamie@chorequest.demo",
        name: "Alex Morgan",
        pin: "9999",
      }),
    });
    expect(bad.status).toBe(401);
  });
  it("lets a parent add, rename, and remove a child while keeping an activity record", async () => {
    const response = await request("/parent/children", "parent-demo", {
      method: "POST",
      body: JSON.stringify({ name: "Riley Morgan", pin: "4321" }),
    });
    expect(response.status).toBe(201);
    const childId = (await response.json()).data.id;
    expect(
      (await dashboard("parent-demo")).children.some(
        (child: { name: string }) => child.name === "Riley Morgan",
      ),
    ).toBe(true);
    expect(
      (
        await request(`/parent/children/${childId}`, "parent-demo", {
          method: "PUT",
          body: JSON.stringify({ name: "Riley Reed" }),
        })
      ).status,
    ).toBe(200);
    expect(
      (await dashboard("parent-demo")).children.some(
        (child: { name: string }) => child.name === "Riley Reed",
      ),
    ).toBe(true);
    expect(
      (
        await request(`/parent/children/${childId}`, "parent-demo", {
          method: "DELETE",
        })
      ).status,
    ).toBe(200);
    const after = await dashboard("parent-demo");
    expect(
      after.children.some(
        (child: { name: string }) => child.name === "Riley Reed",
      ),
    ).toBe(false);
    expect(
      after.activity.some((item: { message: string }) =>
        item.message.includes("Riley Morgan was renamed to Riley Reed"),
      ),
    ).toBe(true);
  });
});
describe("management cleanup", () => {
  it("edits, bulk removes, and clears chores without exposing another family", async () => {
    const before = await dashboard("parent-demo"),
      chore = before.chores.find((item: { id: string }) => item.id === "a-bed");
    const update = {
      title: "Make your bed neatly",
      description: "",
      category: "bedroom",
      difficulty: "easy",
      points: 20,
      xp: 25,
      dueAt: chore.dueAt,
      recurrence: "daily",
      requiresApproval: true,
      requiresProof: false,
    };
    expect(
      (
        await request("/parent/assignments/a-bed", "parent-demo", {
          method: "PUT",
          body: JSON.stringify(update),
        })
      ).status,
    ).toBe(200);
    expect(
      (await dashboard("parent-demo")).chores.find(
        (item: { id: string }) => item.id === "a-bed",
      ).title,
    ).toBe("Make your bed neatly");
    expect(
      (
        await request("/parent/chores/bulk-delete", "parent-demo", {
          method: "POST",
          body: JSON.stringify({ assignmentIds: ["a-bed", "a-math"] }),
        })
      ).status,
    ).toBe(200);
    expect(
      (await dashboard("parent-demo")).chores.some(
        (item: { id: string }) => item.id === "a-bed",
      ),
    ).toBe(false);
    expect(
      (await request("/parent/chores", "parent-demo", { method: "DELETE" }))
        .status,
    ).toBe(200);
    expect((await dashboard("parent-demo")).chores).toHaveLength(0);
  });
  it("dismisses only the signed-in user notifications", async () => {
    const before = await dashboard("student-alex"),
      notice = before.notifications[0];
    expect(
      (
        await request(`/notifications/${notice.id}`, "student-alex", {
          method: "DELETE",
        })
      ).status,
    ).toBe(200);
    expect(
      (await dashboard("student-alex")).notifications.some(
        (n: { id: string }) => n.id === notice.id,
      ),
    ).toBe(false);
    expect(
      (await request("/notifications", "student-alex", { method: "DELETE" }))
        .status,
    ).toBe(200);
    expect((await dashboard("student-alex")).notifications).toHaveLength(0);
  });
  it("stores child details used by the chore idea generator", async () => {
    const response = await request("/parent/children", "parent-demo", {
      method: "POST",
      body: JSON.stringify({
        name: "Jordan Morgan",
        pin: "1357",
        age: 11,
        gender: "nonbinary",
        interests: "art, basketball",
      }),
    });
    const childId = (await response.json()).data.id;
    const child = (await dashboard("parent-demo")).children.find(
      (item: { id: string }) => item.id === childId,
    );
    expect(child).toMatchObject({
      age: 11,
      gender: "nonbinary",
      interests: "art, basketball",
    });
  });
});
