import type { Request, Response } from "express";

const appPromise = import("../src/server/postgres-app.ts").then(
  (module) => module.default,
);

export default async function handler(req: Request, res: Response) {
  try {
    const app = await appPromise;
    return app(req, res);
  } catch (error) {
    console.error("ChoreQuest API failed to start", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const category = message.includes("POSTGRES_URL")
      ? "DATABASE_URL_MISSING"
      : message.toLowerCase().includes("module")
        ? "MODULE_LOAD_FAILED"
        : "API_STARTUP_FAILED";
    return res.status(500).json({
      error: {
        code: category,
        message: "The ChoreQuest server is not configured correctly yet.",
      },
    });
  }
}
