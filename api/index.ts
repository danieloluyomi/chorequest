import type { Request, Response } from "express";

export default async function handler(request: Request, response: Response) {
  try {
    const { default: app } = await import("../src/server/postgres-app.ts");
    return app(request, response);
  } catch (error) {
    console.error("ChoreQuest API failed to start", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const category = message.includes("POSTGRES_URL")
      ? "DATABASE_URL_MISSING"
      : message.toLowerCase().includes("module")
        ? "MODULE_LOAD_FAILED"
        : "API_STARTUP_FAILED";
    return response.status(500).json({
      error: {
        code: category,
        message: "The ChoreQuest server is not configured correctly yet.",
        diagnostic:
          category === "MODULE_LOAD_FAILED"
            ? message.replaceAll(process.cwd(), "<app>")
            : undefined,
      },
    });
  }
}
