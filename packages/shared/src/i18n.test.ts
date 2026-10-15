import { describe, expect, it } from 'vitest';
import {
  formatMessage,
  isLocale,
  locales,
  negotiateLocale,
  resolveLocale,
  selectLocale,
} from './i18n.js';
import { english, messages, translate, type MessageKey } from './messages.js';

const placeholders = (value: string) =>
  [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('localization', () => {
  it.each(locales)('%s has all English keys and matching placeholders', (locale) => {
    expect(Object.keys(messages[locale]).sort()).toEqual(Object.keys(english).sort());
    for (const key of Object.keys(english) as MessageKey[]) {
      expect(messages[locale][key].trim()).not.toBe('');
      expect(placeholders(messages[locale][key])).toEqual(placeholders(english[key]));
    }
  });

  it.each([
    ['it-IT', 'it'],
    ['es-419', 'es'],
    ['ru', 'ru'],
    ['zh-TW', 'zh'],
    ['EN-us', 'en'],
    ['de-DE', 'en'],
    ['__proto__', 'en'],
    ['constructor', 'en'],
    ['it<script>', 'en'],
    ['', 'en'],
    [null, 'en'],
    [undefined, 'en'],
  ])('resolves regional or untrusted locale %s to %s', (input, expected) => {
    expect(resolveLocale(input)).toBe(expected);
  });

  it.each([
    ['fr-FR,ru-RU;q=0.8,en;q=0.2', 'ru'],
    ['en;q=0.2,it;q=0.9', 'it'],
    ['it ;q=1,en;q=0.5', 'it'],
    ['it;Q=1,en;q=0.5', 'it'],
    ['es-MX,zh-CN;q=0.8', 'es'],
    ['zh-Hans-CN', 'zh'],
    ['ru;q=0,it;q=0.4', 'it'],
    ['de,*;q=0.5', 'en'],
    ['ru;q=2,it;q=0.5', 'it'],
    ['ru;q=NaN', 'en'],
    ['it;q=0.8;bad=yes,es;q=0.5', 'es'],
    ['ru;q=0.4,it;q=0.4', 'ru'],
    ['__proto__,constructor', 'en'],
    ['', 'en'],
    [null, 'en'],
  ])('negotiates %s to %s', (header, expected) => {
    expect(negotiateLocale(header)).toBe(expected);
  });

  it('only accepts exact supported cookie values, overriding browser preferences', () => {
    expect(isLocale('it')).toBe(true);
    for (const value of ['it-IT', '__proto__', 'constructor', '<script>', null, {}, ['it']]) {
      expect(isLocale(value)).toBe(false);
      expect(selectLocale(value, 'ru-RU')).toBe('ru');
    }
    expect(selectLocale('en', 'zh')).toBe('en');
    expect(selectLocale('it', 'ru')).toBe('it');
    expect(selectLocale(undefined, undefined)).toBe('en');
  });

  it('substitutes user content once, without translating or interpreting it', () => {
    const name = '<b>{count}</b> $&';
    expect(translate('zh', 'configureServer', { name })).toBe(`配置 ${name}`);
    expect(formatMessage('{name}: {missing}', { name })).toBe(`${name}: {missing}`);
    expect(formatMessage('{constructor}')).toBe('{constructor}');
  });
});
