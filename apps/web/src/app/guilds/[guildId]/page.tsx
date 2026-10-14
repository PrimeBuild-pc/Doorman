import { notFound, redirect } from 'next/navigation';
import { prisma } from '@doorman/database';
import { getSession } from '@/lib/session';
import { assertCanManageGuild, fetchGuildChannels, fetchGuildRoles } from '@/lib/discordApi';
import { FormButton } from '../../form-button';
import {
  addInviteMap,
  decidePending,
  removeInviteMap,
  updateSettings,
  uploadBanner,
} from './actions';

const notices: Record<string, string> = {
  saved: 'Settings saved.',
  banner: 'Welcome banner uploaded.',
  mapping: 'Invite role mapping saved.',
  removed: 'Invite role mapping removed.',
  approved: 'Member approved. Configured roles assigned.',
  denied: 'Member denied. No roles assigned; the member was not kicked or banned.',
};

export default async function GuildSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ notice?: string | string[]; error?: string | string[] }>;
}) {
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
    typeof notice === 'string' && Object.hasOwn(notices, notice) ? notices[notice] : null;
  const hasError = typeof error === 'string' && error.length > 0;
  const roleName = (id: string) =>
    roles.find((r) => r.id === id)?.name ?? `Unavailable role (${id})`;
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
          ← All servers
        </a>
      </header>

      {hasError ? (
        <p
          role="alert"
          className="rounded border border-red-400 bg-gray-900 p-4 text-sm text-red-200"
        >
          We couldn&apos;t complete this change. Check your inputs and server permissions, then try
          again. If you approved a member, some roles may have been assigned already; check Discord
          before retrying.
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
          Autorole &amp; welcome
        </h2>
        <form action={updateSettings.bind(null, guildId)} className="space-y-4">
          <div>
            <label htmlFor="default-roles" className="mb-1 block text-sm text-gray-300">
              Default role(s) assigned on join
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
              Only safe roles below Doorman&apos;s highest role are available. Default roles must
              not grant administrator or moderation permissions, including channel overrides. Use
              Ctrl (Windows) or Command (Mac) to select or deselect multiple roles. Leave all
              unselected to assign none.
              {roles.length === 0 &&
                ' No assignable roles found. Create a non-admin member role in Discord and move Doorman above it.'}
              {unavailableDefaults &&
                ' Some saved roles are no longer assignable and will be removed when you save.'}
            </p>
          </div>
          <div>
            <label htmlFor="welcome-channel" className="mb-1 block text-sm text-gray-300">
              Welcome channel
            </label>
            <select
              id="welcome-channel"
              name="welcomeChannelId"
              defaultValue={guildConfig.welcomeChannelId ?? ''}
              className={inputClass}
            >
              <option value="">— none —</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
            {channels.length === 0 && (
              <p className="mt-2 text-sm text-gray-400">
                No text channels found. Check Doorman&apos;s channel access in Discord.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="account-age" className="mb-1 block text-sm text-gray-300">
              Anti-raid: minimum account age in hours
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
              0 turns off the age check. Younger accounts wait for approval before receiving roles.
            </p>
          </div>
          <FormButton className={buttonClass} pendingLabel="Saving…">
            Save
          </FormButton>
        </form>
      </section>

      <section aria-labelledby="banner-heading">
        <h2 id="banner-heading" className="mb-3 text-lg font-semibold">
          Welcome banner
        </h2>
        <p className="mb-3 text-sm text-gray-400">
          {guildConfig.bannerPath
            ? 'Current banner is set. Uploading replaces it.'
            : 'No custom banner yet. Upload an image to personalize welcomes.'}
        </p>
        <form action={uploadBanner.bind(null, guildId)} className="space-y-3">
          <label htmlFor="banner" className="block text-sm text-gray-300">
            Banner image
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
            PNG, JPEG or WebP, up to 5 MiB and 16 megapixels (single frame). Images are cropped to
            1024 × 450. A new member&apos;s avatar and name appear on top when they join.
          </p>
          <FormButton className={buttonClass} pendingLabel="Uploading…">
            Upload
          </FormButton>
        </form>
      </section>

      <section aria-labelledby="invites-heading">
        <h2 id="invites-heading" className="mb-3 text-lg font-semibold">
          Role by invite link
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
                  pendingLabel="Removing…"
                  aria-label={`Remove mapping for ${m.inviteCode}`}
                >
                  Remove
                </FormButton>
              </form>
            </li>
          ))}
          {inviteMaps.length === 0 && (
            <li className="text-sm text-gray-400">
              No mappings yet. Choose an invite code and a safe role to assign to members using that
              link.
            </li>
          )}
        </ul>
        <form
          action={addInviteMap.bind(null, guildId)}
          className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <div>
            <label htmlFor="invite-code" className="mb-1 block text-sm text-gray-300">
              Invite code
            </label>
            <input
              id="invite-code"
              name="inviteCode"
              placeholder="e.g. abc123"
              required
              aria-describedby="invite-hint"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="invite-role" className="mb-1 block text-sm text-gray-300">
              Role
            </label>
            <select id="invite-role" name="roleId" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                {roles.length ? 'Choose a role' : 'No assignable roles'}
              </option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <FormButton className={buttonClass} disabled={roles.length === 0} pendingLabel="Adding…">
            Add
          </FormButton>
        </form>
        <p id="invite-hint" className="mt-2 text-sm text-gray-400">
          Use only the code after discord.gg/, not the full URL. Adding an existing code replaces
          its role.
        </p>
      </section>

      <section aria-labelledby="pending-heading">
        <h2 id="pending-heading" className="mb-3 text-lg font-semibold">
          Pending approvals ({pending.length} shown)
        </h2>
        <p className="mb-3 text-sm text-gray-400">
          Approve assigns the configured default roles. Deny only withholds roles; it does not kick
          or ban the member.
        </p>
        <p className="mb-3 text-sm text-gray-400">
          Showing up to 100 pending members, newest first. Review this queue, then reload to see
          remaining members.
        </p>
        {pending.length === 0 && (
          <p className="text-sm text-gray-400">
            Nobody waiting. Accounts held by the age check will appear here.
          </p>
        )}
        <ul className="space-y-2">
          {pending.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-800 p-3 text-sm"
            >
              <span className="min-w-0 break-words">
                {p.username} — account created{' '}
                <time dateTime={p.accountCreatedAt.toISOString()}>
                  {p.accountCreatedAt.toLocaleDateString('en-US', { timeZone: 'UTC' })}
                </time>
              </span>
              <div className="flex flex-wrap gap-2">
                <form action={decidePending.bind(null, guildId, p.id, 'approved')}>
                  <FormButton
                    className="min-h-11 rounded px-3 py-2 text-green-300 hover:bg-gray-800"
                    pendingLabel="Approving…"
                    aria-label={`Approve ${p.username}`}
                  >
                    Approve
                  </FormButton>
                </form>
                <form action={decidePending.bind(null, guildId, p.id, 'denied')}>
                  <FormButton
                    className="min-h-11 rounded px-3 py-2 text-red-300 hover:bg-gray-800"
                    pendingLabel="Denying…"
                    aria-label={`Deny roles for ${p.username}`}
                  >
                    Deny
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
