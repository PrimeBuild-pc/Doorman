import { describe, expect, it } from 'vitest';
import { envSchema } from './env.js';

const input = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_CLIENT_SECRET: 'fake-secret',
  DISCORD_BOT_TOKEN: 'fake-token',
  AUTH_SECRET: 'a'.repeat(64),
  PUBLIC_URL: 'http://localhost:3000',
};

describe('deployment configuration validation', () => {
  it('accepts and canonicalizes local/HTTPS origins', () => {
    for (const url of [
      'http://localhost:3000/',
      'http://127.0.0.1:3000',
      'http://[::1]:3000',
      'https://doorman.example.org/',
    ]) {
      expect(envSchema.parse({ ...input, PUBLIC_URL: url }).PUBLIC_URL).toBe(new URL(url).origin);
    }
  });
  it.each([
    'not-a-url',
    'http://example.org',
    'ftp://example.org',
    'https://example.org/path',
    'https://user:password@example.org',
    'https://example.org/?token=x',
    'https://example.org/#fragment',
  ])('rejects unsafe or ambiguous PUBLIC_URL %s', (url) => {
    expect(envSchema.safeParse({ ...input, PUBLIC_URL: url }).success).toBe(false);
  });
  it('fails early for weak secrets, invalid app IDs and non-PostgreSQL databases', () => {
    for (const value of [
      { AUTH_SECRET: 'weak' },
      { DISCORD_CLIENT_ID: 'wrong' },
      { DATABASE_URL: 'file:test' },
    ]) {
      expect(envSchema.safeParse({ ...input, ...value }).success).toBe(false);
    }
  });
});
