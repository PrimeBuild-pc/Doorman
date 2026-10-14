import { z } from 'zod';

// Single source of truth for every env var either the bot or the web app reads.
// The bot validates at startup; web requests validate before using credentials.
export const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .regex(/^postgres(?:ql)?:\/\//, 'DATABASE_URL must be a PostgreSQL connection URL'),
  DISCORD_CLIENT_ID: z
    .string()
    .regex(/^\d{17,20}$/, 'DISCORD_CLIENT_ID must be the Discord Application ID'),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_BOT_TOKEN: z.string().min(1),
  AUTH_SECRET: z
    .string()
    .min(32, 'AUTH_SECRET must be at least 32 characters (openssl rand -base64 32)'),
  PUBLIC_URL: z
    .string()
    .url()
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          url.pathname === '/' &&
          (url.protocol === 'https:' ||
            (url.protocol === 'http:' &&
              ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
        );
      } catch {
        return false;
      }
    }, 'PUBLIC_URL must be an HTTPS origin, or HTTP on localhost without a path')
    .transform((value) => new URL(value).origin),
  UPLOADS_DIR: z.string().default('/data/uploads'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) cached = envSchema.parse(process.env);
  return cached;
}
