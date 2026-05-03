// Ensure env validation passes without a real .env file during unit tests.
const env = process.env as Record<string, string | undefined>;
env.DATABASE_URL =
  env.DATABASE_URL ?? "postgresql://postgres@localhost:5432/master_education";
env.NEXTAUTH_SECRET =
  env.NEXTAUTH_SECRET ??
  "test-secret-at-least-thirty-two-characters-long-for-prod-min";
env.NEXTAUTH_URL = env.NEXTAUTH_URL ?? "http://localhost:3000";
env.NODE_ENV = env.NODE_ENV ?? "test";
env.CRON_SECRET = env.CRON_SECRET ?? "test-cron-secret-sixteen-chars-min";
