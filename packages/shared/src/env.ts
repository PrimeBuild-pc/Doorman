import { z } from 'zod';

// Single source of truth for every env var either the bot or the web app reads.
// Both processes validate against this at startup and fail fast on a bad .env
// instead of surfacing a confusing error deep in a Discord API call.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_BOT_TOKEN: z.string().min(1),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters (openssl rand -base64 32)'),
  PUBLIC_URL: z.string().url(),
  UPLOADS_DIR: z.string().default('/data/uploads'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) cached = envSchema.parse(process.env);
  return cached;
}
