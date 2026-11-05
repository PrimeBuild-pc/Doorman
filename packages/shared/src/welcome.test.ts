import { describe, expect, it } from 'vitest';
import { locales } from './i18n.js';
import { cardThemes, isCardTheme, pickMessage, renderTemplate, welcomeTexts } from './welcome.js';

const values = { user: '<@1>', username: 'Ann', server: 'S', memberCount: 169 };

describe('welcome texts', () => {
  it.each(locales)('%s defaults mention the member and leave no placeholder behind', (locale) => {
    const texts = welcomeTexts(locale);
    for (const kind of ['welcome', 'goodbye'] as const) {
      texts[kind].forEach((_, i) => {
        const text = pickMessage(kind, null, locale, values, () => i / texts[kind].length);
        expect(text).toContain(kind === 'welcome' ? '<@1>' : 'Ann');
        expect(text).not.toMatch(/\{(user|username|server|memberCount)\}/);
      });
    }
    expect(texts.member(169)).toContain('169');
  });

  it.each([
    [1, '1st member'],
    [2, '2nd member'],
    [3, '3rd member'],
    [11, '11th member'],
    [13, '13th member'],
    [21, '21st member'],
    [112, '112th member'],
    [169, '169th member'],
  ])('formats English ordinal %i', (n, expected) => {
    expect(welcomeTexts('en').member(n)).toBe(expected);
  });

  it('prefers a non-blank custom template and falls back to English for unknown locales', () => {
    expect(pickMessage('welcome', '  Hi {user}  ', 'it', values)).toBe('Hi <@1>');
    expect(pickMessage('goodbye', '   ', 'xx', values, () => 0)).toBe(
      'Ann has left the server. Safe travels! 👋',
    );
    expect(renderTemplate('{memberCount}/{server}/{server}', values)).toBe('169/S/S');
  });

  it('validates theme ids', () => {
    expect(Object.keys(cardThemes)).toContain('midnight');
    expect(isCardTheme('ember')).toBe(true);
    expect(isCardTheme('toString')).toBe(false);
  });
});
