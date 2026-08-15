import { notFound, redirect } from 'next/navigation';
import { prisma } from '@doorman/database';
import { getSession, manageableGuilds } from '@/lib/session';
import { fetchGuildChannels, fetchGuildRoles } from '@/lib/discordApi';
import { addInviteMap, decidePending, removeInviteMap, updateSettings, uploadBanner } from './actions';

export default async function GuildSettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await getSession();
  if (!session) redirect('/api/auth/login');
  if (!manageableGuilds(session).some((g) => g.id === guildId)) notFound();

  const guildConfig = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guildConfig) notFound();

  const [roles, channels, inviteMaps, pending] = await Promise.all([
    fetchGuildRoles(guildId),
    fetchGuildChannels(guildId),
    prisma.inviteRoleMap.findMany({ where: { guildId } }),
    prisma.pendingApproval.findMany({ where: { guildId, status: 'pending' }, orderBy: { joinedAt: 'desc' } }),
  ]);
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;

  const inputClass = 'w-full rounded border border-gray-700 bg-gray-900 p-2 text-sm';
  const buttonClass = 'rounded bg-amber-500 px-4 py-2 text-sm font-medium text-gray-950 hover:bg-amber-400';

  return (
    <main className="mx-auto max-w-2xl space-y-10 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{guildConfig.name}</h1>
        <a href="/guilds" className="text-sm text-gray-400 hover:text-white">
          ← All servers
        </a>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Autorole &amp; welcome</h2>
        <form action={updateSettings.bind(null, guildId)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-400">Default role(s) assigned on join</label>
            <select name="defaultRoleIds" multiple defaultValue={guildConfig.defaultRoleIds} className={inputClass}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-400">Welcome channel</label>
            <select name="welcomeChannelId" defaultValue={guildConfig.welcomeChannelId ?? ''} className={inputClass}>
              <option value="">— none —</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-400">
              Anti-raid: minimum account age in hours before a role is auto-assigned (0 = off)
            </label>
            <input
              type="number"
              min={0}
              name="minAccountAgeHours"
              defaultValue={guildConfig.minAccountAgeHours}
              className={inputClass}
            />
          </div>
          <button className={buttonClass}>Save</button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Welcome banner</h2>
        {guildConfig.bannerPath && (
          <p className="mb-2 text-sm text-gray-400">Current banner is set.</p>
        )}
        <form action={uploadBanner.bind(null, guildId)} className="flex items-center gap-3">
          <input type="file" name="banner" accept="image/png,image/jpeg,image/webp" required className="text-sm" />
          <button className={buttonClass}>Upload</button>
        </form>
        <p className="mt-2 text-xs text-gray-500">
          A new member&apos;s avatar and name are composited on top of this image when they join.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Role by invite link</h2>
        <ul className="mb-3 space-y-1">
          {inviteMaps.map((m) => (
            <li key={m.id} className="flex items-center justify-between text-sm">
              <span>
                discord.gg/{m.inviteCode} → {roleName(m.roleId)}
              </span>
              <form action={removeInviteMap.bind(null, guildId, m.id)}>
                <button className="text-red-400 hover:underline">remove</button>
              </form>
            </li>
          ))}
          {inviteMaps.length === 0 && <li className="text-sm text-gray-500">No mappings yet.</li>}
        </ul>
        <form action={addInviteMap.bind(null, guildId)} className="flex gap-2">
          <input name="inviteCode" placeholder="invite code" required className={inputClass} />
          <select name="roleId" required className={inputClass}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button className="rounded bg-gray-800 px-3 py-2 text-sm hover:bg-gray-700">Add</button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Pending approvals ({pending.length})</h2>
        {pending.length === 0 && <p className="text-sm text-gray-500">Nobody waiting.</p>}
        <ul className="space-y-2">
          {pending.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded border border-gray-800 p-3 text-sm"
            >
              <span>
                {p.username} — account created {p.accountCreatedAt.toLocaleDateString()}
              </span>
              <div className="flex gap-3">
                <form action={decidePending.bind(null, guildId, p.id, 'approved')}>
                  <button className="text-green-400 hover:underline">approve</button>
                </form>
                <form action={decidePending.bind(null, guildId, p.id, 'denied')}>
                  <button className="text-red-400 hover:underline">deny</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
