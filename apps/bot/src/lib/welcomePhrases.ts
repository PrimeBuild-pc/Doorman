/** English greetings shown above the welcome card; one is picked at random per join. */
export const WELCOME_PHRASES = [
  'Welcome aboard, {mention}! Make yourself at home. 👋',
  'Everyone, say hello to {mention}! 🎉',
  '{mention} just joined **{server}**. Glad to have you here!',
  'A new face around here: welcome, {mention}! 🔧',
  'Hey {mention}, welcome to **{server}**! Check the rules and dive in.',
  '{mention} has entered the server. Give them a warm welcome! 🔥',
  'Welcome, {mention}! Your seat at **{server}** is ready.',
  'Good to see you, {mention}. Enjoy your stay! 🚀',
] as const;

export function pickWelcomePhrase(mention: string, server: string, random = Math.random): string {
  const phrase = WELCOME_PHRASES[Math.floor(random() * WELCOME_PHRASES.length)]!;
  return phrase.replaceAll('{mention}', mention).replaceAll('{server}', server);
}
