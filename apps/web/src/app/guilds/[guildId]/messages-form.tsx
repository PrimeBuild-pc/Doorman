'use client';

import { useState, type CSSProperties } from 'react';
import { cardThemes, renderTemplate, type CardTheme, type Locale } from '@doorman/shared';
import { FormButton } from '../../form-button';
import { ChannelSelect, type ChannelGroup } from './channel-select';

export interface LocaleSample {
  kicker: string;
  member: string;
  welcome: string;
  goodbye: string;
}

export interface MessagesFormProps {
  action: (formData: FormData) => Promise<void>;
  labels: Record<
    | 'welcomeChannel'
    | 'none'
    | 'cardTheme'
    | 'messageLanguage'
    | 'welcomeText'
    | 'templateHint'
    | 'randomDefault'
    | 'goodbyeEnabled'
    | 'goodbyeText'
    | 'advanced'
    | 'goodbyeChannel'
    | 'sameAsWelcome'
    | 'showMemberCount'
    | 'save'
    | 'saving'
    | 'preview'
    | 'previewHint'
    | 'bannerNote'
    | 'noChannels',
    string
  >;
  localeNames: Record<Locale, string>;
  samples: Record<Locale, LocaleSample>;
  channels: ChannelGroup[];
  initial: {
    welcomeChannelId: string | null;
    cardTheme: string;
    messageLocale: string;
    welcomeMessage: string | null;
    goodbyeEnabled: boolean;
    goodbyeChannelId: string | null;
    goodbyeMessage: string | null;
    showMemberCount: boolean;
    hasBanner: boolean;
  };
  preview: {
    guildName: string;
    memberCount: number;
    botName: string;
    botAvatar: string;
    userName: string;
    userAvatar: string;
  };
  maxLength: number;
}

const field = 'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm';
const label = 'mb-1.5 block text-sm font-medium text-gray-200';

export function MessagesForm(props: MessagesFormProps) {
  const { labels: t, initial, preview, samples } = props;
  const [theme, setTheme] = useState(initial.cardTheme);
  const [locale, setLocale] = useState(initial.messageLocale as Locale);
  const [welcome, setWelcome] = useState(initial.welcomeMessage ?? '');
  const [goodbye, setGoodbye] = useState(initial.goodbyeMessage ?? '');
  const [goodbyeEnabled, setGoodbyeEnabled] = useState(initial.goodbyeEnabled);
  const [showCount, setShowCount] = useState(initial.showMemberCount);

  const sample = samples[locale] ?? samples.en;
  const colors = cardThemes[(theme in cardThemes ? theme : 'midnight') as CardTheme];
  const values = {
    user: `@${preview.userName}`,
    username: preview.userName,
    server: preview.guildName,
    memberCount: preview.memberCount,
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <form action={props.action} className="space-y-5">
        <div>
          <label htmlFor="welcome-channel" className={label}>
            {t.welcomeChannel}
          </label>
          <ChannelSelect
            id="welcome-channel"
            name="welcomeChannelId"
            groups={props.channels}
            defaultValue={initial.welcomeChannelId ?? ''}
            emptyLabel={t.none}
            className={field}
          />
          {props.channels.length === 0 && (
            <p className="mt-2 text-sm text-gray-400">{t.noChannels}</p>
          )}
        </div>

        <fieldset>
          <legend className={label}>{t.cardTheme}</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-3 xl:grid-cols-6">
            {Object.entries(cardThemes).map(([id, c]) => (
              <label
                key={id}
                className="group flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-white/10 p-2 text-xs capitalize text-gray-300 transition has-[:checked]:border-white/60 has-[:checked]:bg-white/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white/60"
              >
                <input
                  type="radio"
                  name="cardTheme"
                  value={id}
                  checked={theme === id}
                  onChange={() => setTheme(id)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className="h-7 w-full rounded-md"
                  style={{
                    background: `radial-gradient(circle at 80% 20%, ${c.accent}66, transparent 70%), ${c.background}`,
                    boxShadow: `inset 3px 0 0 ${c.accent}`,
                  }}
                />
                {id}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="message-locale" className={label}>
            {t.messageLanguage}
          </label>
          <select
            id="message-locale"
            name="messageLocale"
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            className={field}
          >
            {Object.entries(props.localeNames).map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="welcome-message" className={label}>
            {t.welcomeText}
          </label>
          <textarea
            id="welcome-message"
            name="welcomeMessage"
            rows={2}
            maxLength={props.maxLength}
            value={welcome}
            onChange={(e) => setWelcome(e.target.value)}
            placeholder={`${t.randomDefault} — ${sample.welcome}`}
            aria-describedby="template-hint"
            className={field}
          />
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-white/10 p-3 text-sm text-gray-200">
          <input
            type="checkbox"
            name="goodbyeEnabled"
            checked={goodbyeEnabled}
            onChange={(e) => setGoodbyeEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-current"
          />
          {t.goodbyeEnabled}
        </label>

        {goodbyeEnabled && (
          <div>
            <label htmlFor="goodbye-message" className={label}>
              {t.goodbyeText}
            </label>
            <textarea
              id="goodbye-message"
              name="goodbyeMessage"
              rows={2}
              maxLength={props.maxLength}
              value={goodbye}
              onChange={(e) => setGoodbye(e.target.value)}
              placeholder={`${t.randomDefault} — ${sample.goodbye}`}
              aria-describedby="template-hint"
              className={field}
            />
          </div>
        )}
        {/* Keep the saved text when the goodbye is switched off. */}
        {!goodbyeEnabled && <input type="hidden" name="goodbyeMessage" value={goodbye} />}

        <p id="template-hint" className="text-xs leading-relaxed text-gray-400">
          {t.templateHint}
        </p>

        <details className="rounded-lg border border-white/10 p-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-200">
            {t.advanced}
          </summary>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="goodbye-channel" className={label}>
                {t.goodbyeChannel}
              </label>
              <ChannelSelect
                id="goodbye-channel"
                name="goodbyeChannelId"
                groups={props.channels}
                defaultValue={initial.goodbyeChannelId ?? ''}
                emptyLabel={t.sameAsWelcome}
                className={field}
              />
            </div>
            <label className="flex items-start gap-3 text-sm text-gray-200">
              <input
                type="checkbox"
                name="showMemberCount"
                checked={showCount}
                onChange={(e) => setShowCount(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              {t.showMemberCount}
            </label>
          </div>
        </details>

        <FormButton
          className="min-h-11 rounded-lg px-5 py-2 text-sm font-semibold text-gray-950 transition hover:brightness-110"
          style={{ background: colors.accent }}
          pendingLabel={t.saving}
        >
          {t.save}
        </FormButton>
      </form>

      <aside aria-label={t.preview} className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-1 text-sm font-medium text-gray-200">{t.preview}</p>
        <p className="mb-3 text-xs text-gray-400">{t.previewHint}</p>
        <div className="space-y-5 rounded-xl bg-[#313338] p-4 text-[15px] text-[#dbdee1] shadow-xl">
          <DiscordMessage name={preview.botName} avatar={preview.botAvatar}>
            <Mention>@{preview.userName}</Mention>
            <div
              className="mt-1 max-w-[520px] rounded-[4px] bg-[#2b2d31] p-3"
              style={{ borderLeft: `4px solid ${colors.accent}` }}
            >
              <p className="whitespace-pre-wrap break-words text-sm">
                <Formatted
                  text={renderTemplate(welcome.trim() || sample.welcome, values)}
                  mention={values.user}
                />
              </p>
              <CardPreview
                theme={colors}
                kicker={sample.kicker}
                name={preview.userName}
                avatar={preview.userAvatar}
                details={[preview.guildName, showCount ? sample.member : null]
                  .filter(Boolean)
                  .join('  ·  ')}
              />
              {initial.hasBanner && <p className="mt-2 text-xs text-gray-400">{t.bannerNote}</p>}
            </div>
          </DiscordMessage>
          {goodbyeEnabled && (
            <DiscordMessage name={preview.botName} avatar={preview.botAvatar}>
              <p className="whitespace-pre-wrap break-words">
                <Formatted
                  text={renderTemplate(goodbye.trim() || sample.goodbye, {
                    ...values,
                    user: preview.userName,
                  })}
                />
              </p>
            </DiscordMessage>
          )}
        </div>
      </aside>
    </div>
  );
}

function DiscordMessage({
  name,
  avatar,
  children,
}: {
  name: string;
  avatar: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <img src={avatar} alt="" className="h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 flex items-center gap-1.5">
          <span className="font-medium text-white">{name}</span>
          <span className="rounded bg-[#5865f2] px-1 text-[10px] font-semibold leading-4 text-white">
            APP
          </span>
        </p>
        {children}
      </div>
    </div>
  );
}

function Mention({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-[#5865f2]/30 px-0.5 font-medium text-[#c9cdfb]">{children}</span>
  );
}

/** Renders the Discord **bold** syntax and highlights the member mention. */
function Formatted({ text, mention }: { text: string; mention?: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (!mention || !part.includes(mention)) return <span key={i}>{part}</span>;
        return (
          <span key={i}>
            {part.split(mention).map((chunk, j, all) => (
              <span key={j}>
                {chunk}
                {j < all.length - 1 && <Mention>{mention}</Mention>}
              </span>
            ))}
          </span>
        );
      })}
    </>
  );
}

/** CSS twin of the bot's canvas card (apps/bot/src/lib/welcomeCard.ts), scaled to fit. */
function CardPreview({
  theme,
  kicker,
  name,
  avatar,
  details,
}: {
  theme: { accent: string; background: string };
  kicker: string;
  name: string;
  avatar: string;
  details: string;
}) {
  const grid = 'rgba(255,255,255,0.04)';
  const style: CSSProperties = {
    aspectRatio: '1024 / 360',
    containerType: 'inline-size',
    background: `radial-gradient(circle at 88% 11%, ${theme.accent}59 0, transparent 51%),
      repeating-linear-gradient(0deg, ${grid} 0 1px, transparent 1px 4.6875cqw),
      repeating-linear-gradient(90deg, ${grid} 0 1px, transparent 1px 4.6875cqw), ${theme.background}`,
  };
  // 1cqw = 10.24 px of the 1024 px card, so canvas sizes divide by 10.24.
  return (
    <div className="relative mt-3 overflow-hidden rounded" style={style} aria-hidden="true">
      <div
        className="absolute"
        style={{ inset: '1.17cqw', border: `0.2cqw solid ${theme.accent}59` }}
      />
      <div
        className="absolute"
        style={{
          left: '1.17cqw',
          top: '5.86cqw',
          bottom: '5.86cqw',
          width: '0.39cqw',
          background: theme.accent,
        }}
      />
      <img
        src={avatar}
        alt=""
        className="absolute rounded-full object-cover"
        style={{
          left: '6.25cqw',
          top: '7.81cqw',
          width: '19.53cqw',
          height: '19.53cqw',
          boxShadow: `0 0 0 0.39cqw ${theme.background}, 0 0 0 0.98cqw ${theme.accent}`,
        }}
      />
      <div className="absolute" style={{ left: '30.47cqw', right: '5.47cqw', top: '10.5cqw' }}>
        <p
          className="truncate font-bold leading-none"
          style={{ color: theme.accent, fontSize: '2.34cqw' }}
        >
          {kicker}
        </p>
        <p
          className="mt-[2.2cqw] truncate font-bold leading-none text-[#fafafa]"
          style={{ fontSize: '5.86cqw' }}
        >
          {name}
        </p>
        <p
          className="mt-[1.9cqw] truncate leading-none text-[#a1a1aa]"
          style={{ fontSize: '2.73cqw', whiteSpace: 'pre' }}
        >
          {details}
        </p>
      </div>
    </div>
  );
}
