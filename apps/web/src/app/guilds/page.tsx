import { redirect } from 'next/navigation';
import { prisma } from '@doorman/database';
import { getSession } from '@/lib/session';
import { manageableGuilds } from '@/lib/discordApi';
import { getEnv, translate } from '@doorman/shared';
import { getLocale } from '@/lib/locale';

export default async function GuildsPage() {
  const locale = await getLocale();
  const session = await getSession();
  if (!session) redirect('/api/auth/login');

  const candidates = await manageableGuilds(session);
  const installed = await prisma.guild.findMany({
    where: { id: { in: candidates.map((g) => g.id) } },
    select: { id: true },
  });
  const installedIds = new Set(installed.map((g) => g.id));
  // Same minimum permissions as docs/self-hosting.md: Manage Roles, View Channel,
  // Send Messages, Embed Links, Attach Files.
  const invite = (guildId: string) =>
    `https://discord.com/oauth2/authorize?client_id=${getEnv().DISCORD_CLIENT_ID}&scope=bot+applications.commands&permissions=268487680&guild_id=${guildId}&disable_guild_select=true`;

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{translate(locale, 'servers')}</h1>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="rounded px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            {translate(locale, 'logout')}
          </button>
        </form>
      </header>
      <p className="mb-6 text-sm text-gray-300">{translate(locale, 'chooseServer')}</p>

      <ul className="space-y-3">
        {candidates.map((guild) => {
          const active = installedIds.has(guild.id);
          return (
            <li
              key={guild.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
            >
              <span className="flex min-w-0 items-center gap-3">
                {guild.icon ? (
                  <img
                    src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`}
                    alt=""
                    className="h-10 w-10 rounded-xl"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 font-bold"
                  >
                    {guild.name.slice(0, 1)}
                  </span>
                )}
                <span className="min-w-0 break-words font-medium">{guild.name}</span>
              </span>
              {active ? (
                <a
                  href={`/guilds/${guild.id}`}
                  aria-label={translate(locale, 'configureServer', { name: guild.name })}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-gray-200"
                >
                  {translate(locale, 'configure')}
                </a>
              ) : (
                <span className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-gray-400">{translate(locale, 'inviteBot')}</span>
                  <a
                    href={invite(guild.id)}
                    className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/5"
                  >
                    {translate(locale, 'inviteButton')}
                  </a>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {candidates.length === 0 && <p className="text-gray-400">{translate(locale, 'noServers')}</p>}
    </main>
  );
}
