import { notFound, redirect } from 'next/navigation';
import { prisma } from '@doorman/database';
import { getSession } from '@/lib/session';
import { assertCanManageGuild, fetchGuildChannels, fetchGuildRoles } from '@/lib/discordApi';
import { FormButton } from '../../form-button';
import {
  cardThemes,
  locales,
  MAX_TEMPLATE_LENGTH,
  translate,
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

const localeNames: Record<(typeof locales)[number], string> = {
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

  const [roles, channels, inviteMaps, pending] = await Promise.all([
    fetchGuildRoles(guildId),
    fetchGuildChannels(guildId),
    prisma.inviteRoleMap.findMany({ where: { guildId } }),
    prisma.pendingApproval.findMany({
      where: { guildId, status: 'pending' },
      orderBy: { joinedAt: 'desc' },
      take: 100,
    }),
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

  const inputClass = 'w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm';
  const buttonClass =
    'min-h-11 rounded bg-amber-500 px-4 py-2 text-sm font-medium text-gray-950 hover:bg-amber-400';

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-2xl space-y-8 px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="min-w-0 break-words text-2xl font-bold">{guild.name}</h1>
        <a href="/guilds" className="rounded py-2 text-sm text-gray-300 hover:text-white">
          ← {t('allServers')}
        </a>
      </header>

      {hasError ? (
        <p
          role="alert"
          className="rounded border border-red-400 bg-gray-900 p-4 text-sm text-red-200"
        >
          {t('changeError')}
        </p>
      ) : status ? (
        <p
          role="status"
          className="rounded border border-amber-700 bg-gray-900 p-4 text-sm text-amber-200"
        >
          {status}
        </p>
      ) : null}

      <section aria-labelledby="settings-heading">
        <h2 id="settings-heading" className="mb-3 text-lg font-semibold">
          {t('settings')}
        </h2>
        <form action={updateSettings.bind(null, guildId)} className="space-y-4">
          <div>
            <label htmlFor="default-roles" className="mb-1 block text-sm text-gray-300">
              {t('defaultRoles')}
            </label>
            <select
              id="default-roles"
              name="defaultRoleIds"
              multiple
              defaultValue={guildConfig.defaultRoleIds}
              aria-describedby="default-roles-hint"
              className={inputClass}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <p id="default-roles-hint" className="mt-2 text-sm text-gray-400">
              {t('roleHint')}
              {roles.length === 0 && t('noRolesHint')}
              {unavailableDefaults && t('unavailableDefaults')}
            </p>
          </div>
          <div>
            <label htmlFor="welcome-channel" className="mb-1 block text-sm text-gray-300">
              {t('welcomeChannel')}
            </label>
            <select
              id="welcome-channel"
              name="welcomeChannelId"
              defaultValue={guildConfig.welcomeChannelId ?? ''}
              className={inputClass}
            >
              <option value="">{t('none')}</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
            {channels.length === 0 && (
              <p className="mt-2 text-sm text-gray-400">{t('noChannels')}</p>
            )}
          </div>
          <div>
            <label htmlFor="account-age" className="mb-1 block text-sm text-gray-300">
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
              className={inputClass}
            />
            <p id="account-age-hint" className="mt-2 text-sm text-gray-400">
              {t('ageHint')}
            </p>
          </div>
          <FormButton className={buttonClass} pendingLabel={t('saving')}>
            {t('save')}
          </FormButton>
        </form>
      </section>

      <section aria-labelledby="messages-heading">
        <h2 id="messages-heading" className="mb-3 text-lg font-semibold">
          {t('messagesHeading')}
        </h2>
        <form action={updateMessages.bind(null, guildId)} className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm text-gray-300">{t('cardTheme')}</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(cardThemes).map(([id, theme]) => (
                <label
                  key={id}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded border border-gray-700 px-3 py-2 text-sm has-[:checked]:border-white"
                >
                  <input
                    type="radio"
                    name="cardTheme"
                    value={id}
                    defaultChecked={guildConfig.cardTheme === id}
                  />
                  <span
                    aria-hidden="true"
                    className="inline-block h-4 w-4 rounded-full"
                    style={{ background: theme.accent, boxShadow: `0 0 0 3px ${theme.background}` }}
                  />
                  <span className="capitalize">{id}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="message-locale" className="mb-1 block text-sm text-gray-300">
              {t('messageLanguage')}
            </label>
            <select
              id="message-locale"
              name="messageLocale"
              defaultValue={guildConfig.messageLocale}
              className={inputClass}
            >
              {locales.map((l) => (
                <option key={l} value={l}>
                  {localeNames[l]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="welcome-message" className="mb-1 block text-sm text-gray-300">
              {t('welcomeText')}
            </label>
            <textarea
              id="welcome-message"
              name="welcomeMessage"
              rows={2}
              maxLength={MAX_TEMPLATE_LENGTH}
              defaultValue={guildConfig.welcomeMessage ?? ''}
              placeholder={t('randomDefault')}
              aria-describedby="template-hint"
              className={inputClass}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              name="goodbyeEnabled"
              defaultChecked={guildConfig.goodbyeEnabled}
            />
            {t('goodbyeEnabled')}
          </label>
          <div>
            <label htmlFor="goodbye-message" className="mb-1 block text-sm text-gray-300">
              {t('goodbyeText')}
            </label>
            <textarea
              id="goodbye-message"
              name="goodbyeMessage"
              rows={2}
              maxLength={MAX_TEMPLATE_LENGTH}
              defaultValue={guildConfig.goodbyeMessage ?? ''}
              placeholder={t('randomDefault')}
              aria-describedby="template-hint"
              className={inputClass}
            />
            <p id="template-hint" className="mt-2 text-sm text-gray-400">
              {t('templateHint')}
            </p>
          </div>
          <details className="rounded border border-gray-800 p-3">
            <summary className="cursor-pointer text-sm text-gray-300">{t('advanced')}</summary>
            <div className="mt-3 space-y-4">
              <div>
                <label htmlFor="goodbye-channel" className="mb-1 block text-sm text-gray-300">
                  {t('goodbyeChannel')}
                </label>
                <select
                  id="goodbye-channel"
                  name="goodbyeChannelId"
                  defaultValue={guildConfig.goodbyeChannelId ?? ''}
                  className={inputClass}
                >
                  <option value="">{t('sameAsWelcome')}</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  name="showMemberCount"
                  defaultChecked={guildConfig.showMemberCount}
                />
                {t('showMemberCount')}
              </label>
            </div>
          </details>
          <FormButton className={buttonClass} pendingLabel={t('saving')}>
            {t('save')}
          </FormButton>
        </form>
      </section>

      <section aria-labelledby="banner-heading">
        <h2 id="banner-heading" className="mb-3 text-lg font-semibold">
          {t('welcomeBanner')}
        </h2>
        <p className="mb-3 text-sm text-gray-400">
          {guildConfig.bannerPath ? t('bannerSet') : t('noBanner')}
        </p>
        <form action={uploadBanner.bind(null, guildId)} className="space-y-3">
          <label htmlFor="banner" className="block text-sm text-gray-300">
            {t('bannerImage')}
          </label>
          <input
            id="banner"
            type="file"
            name="banner"
            accept="image/png,image/jpeg,image/webp"
            required
            aria-describedby="banner-hint"
            className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-gray-700 file:px-3 file:py-2 file:text-white`}
          />
          <p id="banner-hint" className="text-sm text-gray-400">
            {t('bannerHint')}
          </p>
          <FormButton className={buttonClass} pendingLabel={t('uploading')}>
            {t('upload')}
          </FormButton>
        </form>
      </section>

      <section aria-labelledby="invites-heading">
        <h2 id="invites-heading" className="mb-3 text-lg font-semibold">
          {t('inviteRoles')}
        </h2>
        <ul className="mb-4 space-y-2">
          {inviteMaps.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 py-2 text-sm"
            >
              <span className="min-w-0 break-words">
                discord.gg/{m.inviteCode} → {roleName(m.roleId)}
              </span>
              <form action={removeInviteMap.bind(null, guildId, m.id)}>
                <FormButton
                  className="min-h-11 rounded px-3 py-2 text-red-300 hover:bg-gray-800"
                  pendingLabel={t('removing')}
                  aria-label={t('removeMapping', { code: m.inviteCode })}
                >
                  {t('remove')}
                </FormButton>
              </form>
            </li>
          ))}
          {inviteMaps.length === 0 && <li className="text-sm text-gray-400">{t('noMappings')}</li>}
        </ul>
        <form
          action={addInviteMap.bind(null, guildId)}
          className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <div>
            <label htmlFor="invite-code" className="mb-1 block text-sm text-gray-300">
              {t('inviteCode')}
            </label>
            <input
              id="invite-code"
              name="inviteCode"
              placeholder={t('inviteExample')}
              required
              aria-describedby="invite-hint"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="invite-role" className="mb-1 block text-sm text-gray-300">
              {t('role')}
            </label>
            <select id="invite-role" name="roleId" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                {roles.length ? t('chooseRole') : t('noRoles')}
              </option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <FormButton
            className={buttonClass}
            disabled={roles.length === 0}
            pendingLabel={t('adding')}
          >
            {t('add')}
          </FormButton>
        </form>
        <p id="invite-hint" className="mt-2 text-sm text-gray-400">
          {t('inviteHint')}
        </p>
      </section>

      <section aria-labelledby="pending-heading">
        <h2 id="pending-heading" className="mb-3 text-lg font-semibold">
          {t('pending', { count: pending.length })}
        </h2>
        <p className="mb-3 text-sm text-gray-400">{t('approvalHint')}</p>
        <p className="mb-3 text-sm text-gray-400">{t('queueHint')}</p>
        {pending.length === 0 && <p className="text-sm text-gray-400">{t('noPending')}</p>}
        <ul className="space-y-2">
          {pending.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-800 p-3 text-sm"
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
                    className="min-h-11 rounded px-3 py-2 text-green-300 hover:bg-gray-800"
                    pendingLabel={t('approving')}
                    aria-label={t('approveMember', { name: p.username })}
                  >
                    {t('approve')}
                  </FormButton>
                </form>
                <form action={decidePending.bind(null, guildId, p.id, 'denied')}>
                  <FormButton
                    className="min-h-11 rounded px-3 py-2 text-red-300 hover:bg-gray-800"
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
      </section>
    </main>
  );
}
