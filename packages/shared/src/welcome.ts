import { isLocale, type Locale } from './i18n.js';

/** Card colour themes selectable per server. `midnight` is the neutral default. */
export const cardThemes = {
  midnight: { accent: '#818cf8', background: '#0f172a' },
  blurple: { accent: '#5865f2', background: '#1e1f22' },
  emerald: { accent: '#34d399', background: '#06201a' },
  rose: { accent: '#fb7185', background: '#1f0b14' },
  amber: { accent: '#fbbf24', background: '#1c1405' },
  ember: { accent: '#ff6600', background: '#09090b' },
} as const;
export type CardTheme = keyof typeof cardThemes;
export const DEFAULT_CARD_THEME: CardTheme = 'midnight';

export function isCardTheme(value: unknown): value is CardTheme {
  return typeof value === 'string' && Object.hasOwn(cardThemes, value);
}

/** Discord message content limit is 2000; leave room for substituted names. */
export const MAX_TEMPLATE_LENGTH = 1500;

/** Placeholders accepted in custom welcome/goodbye templates. */
export const templatePlaceholders = ['{user}', '{username}', '{server}', '{memberCount}'] as const;

const defaults: Record<
  Locale,
  { kicker: string; member: (n: number) => string; welcome: string[]; goodbye: string[] }
> = {
  en: {
    kicker: 'WELCOME TO THE SERVER',
    member: (n) => {
      const tens = n % 100;
      const suffix =
        tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
      return `${n}${suffix} member`;
    },
    welcome: [
      'Welcome aboard, {user}! Make yourself at home. 👋',
      'Everyone, say hello to {user}! 🎉',
      '{user} just joined **{server}**. Glad to have you here!',
      'Hey {user}, welcome to **{server}**! Check the rules and dive in.',
      'Good to see you, {user}. Enjoy your stay! 🚀',
    ],
    goodbye: [
      '{username} has left the server. Safe travels! 👋',
      'Goodbye, {username}. Thanks for stopping by.',
      '{username} left **{server}**. We hope to see you again.',
    ],
  },
  it: {
    kicker: 'BENVENUTO NEL SERVER',
    member: (n) => `${n}° membro`,
    welcome: [
      'Benvenuto a bordo, {user}! Fai come se fossi a casa. 👋',
      'Salutate tutti {user}! 🎉',
      '{user} è appena entrato in **{server}**. Felici di averti qui!',
      'Ciao {user}, benvenuto in **{server}**! Dai un’occhiata alle regole e buttati.',
      'Che bello vederti, {user}. Buona permanenza! 🚀',
    ],
    goodbye: [
      '{username} ha lasciato il server. Buon viaggio! 👋',
      'Ciao {username}, grazie di essere passato.',
      '{username} ha lasciato **{server}**. Speriamo di rivederti.',
    ],
  },
  es: {
    kicker: 'BIENVENIDO AL SERVIDOR',
    member: (n) => `miembro n.º ${n}`,
    welcome: [
      '¡Bienvenido a bordo, {user}! Estás en tu casa. 👋',
      '¡Saludad todos a {user}! 🎉',
      '{user} acaba de unirse a **{server}**. ¡Nos alegra tenerte aquí!',
      '¡Hola {user}, bienvenido a **{server}**! Lee las reglas y lánzate.',
      'Qué bueno verte, {user}. ¡Disfruta tu estancia! 🚀',
    ],
    goodbye: [
      '{username} ha dejado el servidor. ¡Buen viaje! 👋',
      'Adiós, {username}. Gracias por pasar.',
      '{username} dejó **{server}**. Esperamos verte de nuevo.',
    ],
  },
  ru: {
    kicker: 'ДОБРО ПОЖАЛОВАТЬ НА СЕРВЕР',
    member: (n) => `участник №${n}`,
    welcome: [
      'Добро пожаловать, {user}! Будь как дома. 👋',
      'Все, поприветствуйте {user}! 🎉',
      '{user} только что присоединился к **{server}**. Рады тебя видеть!',
      'Привет, {user}, добро пожаловать на **{server}**! Загляни в правила.',
      'Рады тебя видеть, {user}. Приятного времени! 🚀',
    ],
    goodbye: [
      '{username} покинул сервер. Счастливого пути! 👋',
      'Пока, {username}. Спасибо, что заглянул.',
      '{username} покинул **{server}**. Надеемся увидеть тебя снова.',
    ],
  },
  zh: {
    kicker: '欢迎加入服务器',
    member: (n) => `第 ${n} 位成员`,
    welcome: [
      '欢迎 {user}！把这里当成自己家吧。👋',
      '大家快来和 {user} 打个招呼！🎉',
      '{user} 刚刚加入了 **{server}**，很高兴见到你！',
      '嗨 {user}，欢迎来到 **{server}**！先看看规则吧。',
      '很高兴见到你，{user}。玩得开心！🚀',
    ],
    goodbye: [
      '{username} 离开了服务器。一路顺风！👋',
      '再见，{username}，感谢你的到来。',
      '{username} 离开了 **{server}**，期待再次相见。',
    ],
  },
};

export function welcomeTexts(locale: string | null | undefined) {
  return defaults[isLocale(locale) ? locale : 'en'];
}

export interface TemplateValues {
  user: string;
  username: string;
  server: string;
  memberCount: number;
}

export function renderTemplate(template: string, values: TemplateValues): string {
  return template
    .replaceAll('{user}', values.user)
    .replaceAll('{username}', values.username)
    .replaceAll('{server}', values.server)
    .replaceAll('{memberCount}', String(values.memberCount));
}

/** Custom template if set, otherwise a random default phrase in the server's message language. */
export function pickMessage(
  kind: 'welcome' | 'goodbye',
  custom: string | null | undefined,
  locale: string | null | undefined,
  values: TemplateValues,
  random = Math.random,
): string {
  const pool = welcomeTexts(locale)[kind];
  const template = custom?.trim() || pool[Math.floor(random() * pool.length)]!;
  return renderTemplate(template, values);
}
