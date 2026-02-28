import "dotenv/config";

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  host: process.env.HOST || "0.0.0.0",

  database: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME || "sunspotted",
    user: process.env.DB_USER || "sunspotted",
    password: process.env.DB_PASSWORD || "sunspotted",
  },

  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
  },

  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  },
} as const;
