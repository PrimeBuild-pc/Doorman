import { redirect } from 'next/navigation';
import { prisma } from '@doorman/database';
import { getSession, manageableGuilds } from '@/lib/session';

export default async function GuildsPage() {
  const session = await getSession();
  if (!session) redirect('/api/auth/login');

  const candidates = manageableGuilds(session);
  const installed = await prisma.guild.findMany({
    where: { id: { in: candidates.map((g) => g.id) } },
    select: { id: true },
  });
  const installedIds = new Set(installed.map((g) => g.id));

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your servers</h1>
        <form action="/api/auth/logout" method="post">
          <button className="text-sm text-gray-400 hover:text-white">Log out</button>
        </form>
      </div>

      <ul className="space-y-2">
        {candidates.map((guild) => {
          const active = installedIds.has(guild.id);
          return (
            <li
              key={guild.id}
              className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 p-4"
            >
              <span className="font-medium">{guild.name}</span>
              {active ? (
                <a href={`/guilds/${guild.id}`} className="text-amber-400 hover:underline">
                  Configure →
                </a>
              ) : (
                <span className="text-sm text-gray-500">Doorman not invited yet</span>
              )}
            </li>
          );
        })}
      </ul>

      {candidates.length === 0 && (
        <p className="text-gray-400">
          No servers found where you have Manage Server permission.
        </p>
      )}
    </main>
  );
}
