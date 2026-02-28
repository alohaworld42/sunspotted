import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config/env.js";
import { buildingsRoutes } from "./routes/buildings.js";
import { healthRoutes } from "./routes/health.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: "info",
      transport: {
        target: "pino-pretty",
        options: { colorize: true },
      },
    },
  });

  // Plugins
  await app.register(cors, {
    origin: config.cors.origin,
  });

  // Routes
  await app.register(healthRoutes);
  await app.register(buildingsRoutes, { prefix: "/api" });

  return app;
}
