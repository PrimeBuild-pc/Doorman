import { notFound, redirect } from 'next/navigation';
import { prisma } from '@doorman/database';
import { getSession } from '@/lib/session';
import {
  assertCanManageGuild,
  botFetch,
  fetchChannelGroups,
  fetchGuildRoles,
} from '@/lib/discordApi';
import { FormButton } from '../../form-button';
import {
  locales,
  MAX_TEMPLATE_LENGTH,
  translate,
  welcomeTexts,
  type Locale,
  type MessageKey,
} from '@doorman/shared';
import { getLocale } from '@/lib/locale';
import {
  addInviteMap,
  decidePending,
  removeInviteMap,
  updateMessages,
  updateSettings,
  uploadBanner,
} from './actions';
import { MessagesForm, type LocaleSample } from './messages-form';

const localeNames: Record<Locale, string> = {
  en: 'English',
  it: 'Italiano',
  es: 'Español',
  ru: 'Русский',
  zh: '中文',
};

const notices: Record<string, MessageKey> = {
  saved: 'saved',
  banner: 'banner',
  mapping: 'mapping',
  removed: 'removed',
  approved: 'approved',
  denied: 'denied',
};

const cdn = 'https://cdn.discordapp.com';
const avatarUrl = (id: string, hash?: string | null) =>
  hash ? `${cdn}/avatars/${id}/${hash}.png?size=128` : `${cdn}/embed/avatars/0.png`;

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-sm sm:p-6"
    >
      <h2 id={id} className="text-lg font-semibold text-white">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-gray-400">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default async function GuildSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ notice?: string | string[]; error?: string | string[] }>;
}) {
  const locale = await getLocale();
  const t = (key: MessageKey, values?: Record<string, string | number>) =>
    translate(locale, key, values);
  const { guildId } = await params;
  const session = await getSession();
  if (!session) redirect('/api/auth/login');
  const guild = await assertCanManageGuild(session, guildId);

  const guildConfig = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guildConfig) notFound();

  const [roles, channelGroups, inviteMaps, pending, bot, counts] = await Promise.all([
    fetchGuildRoles(guildId),
    fetchChannelGroups(guildId),
    prisma.inviteRoleMap.findMany({ where: { guildId } }),
    prisma.pendingApproval.findMany({
      where: { guildId, status: 'pending' },
      orderBy: { joinedAt: 'desc' },
      take: 100,
    }),
    botFetch<{ id: string; username: string; avatar?: string | null }>('/users/@me'),
    botFetch<{ approximate_member_count?: number }>(`/guilds/${guildId}?with_counts=true`),
  ]);
  const { notice, error } = await searchParams;
  const status =
    typeof notice === 'string' && Object.hasOwn(notices, notice) ? t(notices[notice]!) : null;
  const hasError = typeof error === 'string' && error.length > 0;
  const roleName = (id: string) =>
    roles.find((r) => r.id === id)?.name ?? t('unavailableRole', { id });
  const unavailableDefaults = guildConfig.defaultRoleIds.some(
    (id) => !roles.some((r) => r.id === id),
  );
  // The preview shows what the next member to join would see.
  const memberCount = (counts.approximate_member_count ?? 0) + 1;
  const samples = Object.fromEntries(
    locales.map((l) => {
      const texts = welcomeTexts(l);
      return [
        l,
        {
          kicker: texts.kicker,
          member: texts.member(memberCount),
          welcome: texts.welcome[0]!,
          goodbye: texts.goodbye[0]!,
        } satisfies LocaleSample,
      ];
    }),
  ) as Record<Locale, LocaleSample>;

  const field = 'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm';
  const label = 'mb-1.5 block text-sm font-medium text-gray-200';
  const primary =
    'min-h-11 rounded-lg bg-white px-5 py-2 text-sm font-semibold text-gray-950 transition hover:bg-gray-200';
  const icon = guild.icon ? `${cdn}/icons/${guild.id}/${guild.icon}.png?size=128` : null;

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {icon ? (
            <img src={icon} alt="" className="h-12 w-12 rounded-2xl" />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-lg font-bold"
            >
              {guild.name.slice(0, 1)}
            </span>
          )}
          <h1 className="min-w-0 break-words text-2xl font-bold text-white">{guild.name}</h1>
        </div>
        <a
          href="/guilds"
          className="rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white"
        >
          ← {t('allServers')}
        </a>
      </header>

      {hasError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200"
        >
          {t('changeError')}
        </p>
      ) : status ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-200"
        >
          {status}
        </p>
      ) : null}

      <Section id="messages-heading" title={t('messagesHeading')}>
        <MessagesForm
          action={updateMessages.bind(null, guildId)}
          labels={{
            welcomeChannel: t('welcomeChannel'),
            none: t('none'),
            cardTheme: t('cardTheme'),
            messageLanguage: t('messageLanguage'),
            welcomeText: t('welcomeText'),
            templateHint: t('templateHint'),
            randomDefault: t('randomDefault'),
            goodbyeEnabled: t('goodbyeEnabled'),
            goodbyeText: t('goodbyeText'),
            advanced: t('advanced'),
            goodbyeChannel: t('goodbyeChannel'),
            sameAsWelcome: t('sameAsWelcome'),
            showMemberCount: t('showMemberCount'),
            save: t('save'),
            saving: t('saving'),
            preview: t('preview'),
            previewHint: t('previewHint'),
            bannerNote: t('bannerNote'),
            noChannels: t('noChannels'),
          }}
          localeNames={localeNames}
          samples={samples}
          channels={channelGroups}
          initial={{
            welcomeChannelId: guildConfig.welcomeChannelId,
            cardTheme: guildConfig.cardTheme,
            messageLocale: guildConfig.messageLocale,
            welcomeMessage: guildConfig.welcomeMessage,
            goodbyeEnabled: guildConfig.goodbyeEnabled,
            goodbyeChannelId: guildConfig.goodbyeChannelId,
            goodbyeMessage: guildConfig.goodbyeMessage,
            showMemberCount: guildConfig.showMemberCount,
            hasBanner: Boolean(guildConfig.bannerPath),
          }}
          preview={{
            guildName: guild.name,
            memberCount,
            botName: bot.username,
            botAvatar: avatarUrl(bot.id, bot.avatar),
            userName: session.user.username,
            userAvatar: avatarUrl(session.user.id, session.user.avatar),
          }}
          maxLength={MAX_TEMPLATE_LENGTH}
        />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section id="settings-heading" title={t('settings')}>
          <form action={updateSettings.bind(null, guildId)} className="space-y-5">
            <fieldset aria-describedby="default-roles-hint">
              <legend className={label}>{t('defaultRoles')}</legend>
              {roles.length > 0 && (
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-white/10 p-2">
                  {roles.map((r) => (
                    <label
                      key={r.id}
                      className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-white/5 has-[:checked]:bg-white/10"
                    >
                      <input
                        type="checkbox"
                        name="defaultRoleIds"
                        value={r.id}
                        defaultChecked={guildConfig.defaultRoleIds.includes(r.id)}
                        className="h-4 w-4"
                      />
                      <span
                        aria-hidden="true"
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{
                          background: r.color
                            ? `#${r.color.toString(16).padStart(6, '0')}`
                            : '#99aab5',
                        }}
                      />
                      <span className="min-w-0 truncate">{r.name}</span>
                    </label>
                  ))}
                </div>
              )}
              <p id="default-roles-hint" className="mt-2 text-xs leading-relaxed text-gray-400">
                {t('roleHint')}
                {roles.length === 0 && t('noRolesHint')}
                {unavailableDefaults && t('unavailableDefaults')}
              </p>
            </fieldset>
            <div>
              <label htmlFor="account-age" className={label}>
                {t('accountAge')}
              </label>
              <input
                id="account-age"
                type="number"
                min={0}
                max={876000}
                step={1}
                required
                name="minAccountAgeHours"
                defaultValue={guildConfig.minAccountAgeHours}
                aria-describedby="account-age-hint"
                className={`${field} max-w-40`}
              />
              <p id="account-age-hint" className="mt-2 text-xs text-gray-400">
                {t('ageHint')}
              </p>
            </div>
            <FormButton className={primary} pendingLabel={t('saving')}>
              {t('save')}
            </FormButton>
          </form>
        </Section>

        <Section
          id="banner-heading"
          title={t('welcomeBanner')}
          description={guildConfig.bannerPath ? t('bannerSet') : t('noBanner')}
        >
          <form action={uploadBanner.bind(null, guildId)} className="space-y-4">
            <label htmlFor="banner" className={label}>
              {t('bannerImage')}
            </label>
            <input
              id="banner"
              type="file"
              name="banner"
              accept="image/png,image/jpeg,image/webp"
              required
              aria-describedby="banner-hint"
              className={`${field} file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white`}
            />
            <p id="banner-hint" className="text-xs text-gray-400">
              {t('bannerHint')}
            </p>
            <FormButton className={primary} pendingLabel={t('uploading')}>
              {t('upload')}
            </FormButton>
          </form>
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section id="invites-heading" title={t('inviteRoles')}>
          <ul className="mb-4 divide-y divide-white/5">
            {inviteMaps.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <span className="min-w-0 break-words">
                  <code className="rounded bg-black/30 px-1.5 py-0.5">
                    discord.gg/{m.inviteCode}
                  </code>{' '}
                  → {roleName(m.roleId)}
                </span>
                <form action={removeInviteMap.bind(null, guildId, m.id)}>
                  <FormButton
                    className="min-h-10 rounded-lg px-3 py-1.5 text-red-300 hover:bg-red-500/10"
                    pendingLabel={t('removing')}
                    aria-label={t('removeMapping', { code: m.inviteCode })}
                  >
                    {t('remove')}
                  </FormButton>
                </form>
              </li>
            ))}
            {inviteMaps.length === 0 && (
              <li className="py-2 text-sm text-gray-400">{t('noMappings')}</li>
            )}
          </ul>
          <form
            action={addInviteMap.bind(null, guildId)}
            className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
          >
            <div>
              <label htmlFor="invite-code" className={label}>
                {t('inviteCode')}
              </label>
              <input
                id="invite-code"
                name="inviteCode"
                placeholder={t('inviteExample')}
                required
                aria-describedby="invite-hint"
                className={field}
              />
            </div>
            <div>
              <label htmlFor="invite-role" className={label}>
                {t('role')}
              </label>
              <select id="invite-role" name="roleId" required defaultValue="" className={field}>
                <option value="" disabled>
                  {roles.length ? t('chooseRole') : t('noRoles')}
                </option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    @{r.name}
                  </option>
                ))}
              </select>
            </div>
            <FormButton
              className={primary}
              disabled={roles.length === 0}
              pendingLabel={t('adding')}
            >
              {t('add')}
            </FormButton>
          </form>
          <p id="invite-hint" className="mt-2 text-xs text-gray-400">
            {t('inviteHint')}
          </p>
        </Section>

        <Section
          id="pending-heading"
          title={t('pending', { count: pending.length })}
          description={t('approvalHint')}
        >
          <p className="mb-3 text-xs text-gray-400">{t('queueHint')}</p>
          {pending.length === 0 && <p className="text-sm text-gray-400">{t('noPending')}</p>}
          <ul className="space-y-2">
            {pending.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 p-3 text-sm"
              >
                <span className="min-w-0 break-words">
                  {p.username} — {t('accountCreated')}{' '}
                  <time dateTime={p.accountCreatedAt.toISOString()}>
                    {p.accountCreatedAt.toLocaleDateString(locale, { timeZone: 'UTC' })}
                  </time>
                </span>
                <div className="flex flex-wrap gap-2">
                  <form action={decidePending.bind(null, guildId, p.id, 'approved')}>
                    <FormButton
                      className="min-h-10 rounded-lg px-3 py-1.5 text-emerald-300 hover:bg-emerald-500/10"
                      pendingLabel={t('approving')}
                      aria-label={t('approveMember', { name: p.username })}
                    >
                      {t('approve')}
                    </FormButton>
                  </form>
                  <form action={decidePending.bind(null, guildId, p.id, 'denied')}>
                    <FormButton
                      className="min-h-10 rounded-lg px-3 py-1.5 text-red-300 hover:bg-red-500/10"
                      pendingLabel={t('denying')}
                      aria-label={t('denyMember', { name: p.username })}
                    >
                      {t('deny')}
                    </FormButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </main>
  );
}
