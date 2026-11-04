import { describe, expect, it } from 'vitest';
import { WELCOME_PHRASES, pickWelcomePhrase } from './welcomePhrases.js';

describe('welcome phrases', () => {
  it('fills every placeholder in every phrase and mentions the member', () => {
    WELCOME_PHRASES.forEach((_, i) => {
      const text = pickWelcomePhrase('<@1>', 'PrimeBuild', () => i / WELCOME_PHRASES.length);
      expect(text).toContain('<@1>');
      expect(text).not.toMatch(/\{(mention|server)\}/);
    });
  });

  it('never indexes past the pool, even at the top of the random range', () => {
    expect(pickWelcomePhrase('<@1>', 'S', () => 0.999999)).toBe(
      WELCOME_PHRASES.at(-1)!.replaceAll('{mention}', '<@1>').replaceAll('{server}', 'S'),
    );
  });
});
