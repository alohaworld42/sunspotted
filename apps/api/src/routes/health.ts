import type { FastifyInstance } from "fastify";
import { pool } from "../config/database.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    let dbStatus = "disconnected";
    try {
      await pool.query("SELECT 1");
      dbStatus = "connected";
    } catch {
      dbStatus = "error";
    }

    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
      },
    };
  });
}
