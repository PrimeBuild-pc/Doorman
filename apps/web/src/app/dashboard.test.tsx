import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getLocale: vi.fn(),
  manageableGuilds: vi.fn(),
  assertCanManageGuild: vi.fn(),
  fetchGuildRoles: vi.fn(),
  fetchGuildChannels: vi.fn(),
  findGuild: vi.fn(),
  findGuilds: vi.fn(),
  findMaps: vi.fn(),
  findPending: vi.fn(),
  formStatus: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/locale', () => ({ getLocale: mocks.getLocale }));
vi.mock('./locale-action', () => ({ changeLocale: vi.fn() }));
vi.mock('@/lib/discordApi', () => ({
  manageableGuilds: mocks.manageableGuilds,
  assertCanManageGuild: mocks.assertCanManageGuild,
  fetchGuildRoles: mocks.fetchGuildRoles,
  fetchGuildChannels: mocks.fetchGuildChannels,
}));
vi.mock('@doorman/database', () => ({
  prisma: {
    guild: { findUnique: mocks.findGuild, findMany: mocks.findGuilds },
    inviteRoleMap: { findMany: mocks.findMaps },
    pendingApproval: { findMany: mocks.findPending },
  },
}));
vi.mock('./guilds/[guildId]/actions', () => ({
  updateSettings: vi.fn(),
  uploadBanner: vi.fn(),
  addInviteMap: vi.fn(),
  removeInviteMap: vi.fn(),
  decidePending: vi.fn(),
}));
vi.mock('react-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-dom')>()),
  useFormStatus: mocks.formStatus,
}));

import GuildsPage from './guilds/page';
import GuildSettingsPage from './guilds/[guildId]/page';
import DashboardError from './error';
import { FormButton } from './form-button';
import RootLayout from './layout';
import Loading from './loading';
import NotFound from './not-found';
import { LocaleProvider } from './locale-provider';
import { locales, translate, type Locale } from '@doorman/shared';

const session = { accessToken: 'test-token' };
const guild = { id: '123', name: 'Test server' };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue(session);
  mocks.getLocale.mockResolvedValue('en');
  mocks.manageableGuilds.mockResolvedValue([guild]);
  mocks.assertCanManageGuild.mockResolvedValue(guild);
  mocks.findGuild.mockResolvedValue({ defaultRoleIds: [], minAccountAgeHours: 0 });
  mocks.findGuilds.mockResolvedValue([guild]);
  mocks.fetchGuildRoles.mockResolvedValue([]);
  mocks.fetchGuildChannels.mockResolvedValue([]);
  mocks.findMaps.mockResolvedValue([]);
  mocks.findPending.mockResolvedValue([]);
  mocks.formStatus.mockReturnValue({ pending: false });
});

async function settingsHtml(searchParams: { notice?: string; error?: string } = {}) {
  const page = await GuildSettingsPage({
    params: Promise.resolve({ guildId: guild.id }),
    searchParams: Promise.resolve(searchParams),
  });
  return renderToStaticMarkup(page);
}

describe('dashboard UI', () => {
  it.each(locales)(
    'renders all dashboard states in %s, preserving user content',
    async (locale) => {
      mocks.getLocale.mockResolvedValue(locale);
      mocks.manageableGuilds.mockResolvedValue([{ id: '123', name: '<Custom {name}>' }]);
      const list = renderToStaticMarkup(await GuildsPage());
      expect(list).toContain(translate(locale, 'servers'));
      expect(list).toContain('&lt;Custom {name}&gt;');
      expect(list).toContain(translate(locale, 'logout'));
      const settings = await settingsHtml({ notice: 'saved' });
      for (const key of [
        'settings',
        'defaultRoles',
        'welcomeBanner',
        'inviteRoles',
        'noPending',
        'saved',
        'save',
      ] as const) {
        expect(settings).toContain(translate(locale, key).replaceAll('&', '&amp;'));
      }
      const failed = await settingsHtml({ error: 'secret' });
      const renderText = (text: string) =>
        renderToStaticMarkup(React.createElement('span', null, text)).slice(6, -7);
      expect(failed).toContain(renderText(translate(locale, 'changeError')));
      const wrap = (child: React.ReactNode, value: Locale) =>
        React.createElement(LocaleProvider, { locale: value, children: child });
      expect(renderToStaticMarkup(wrap(React.createElement(Loading), locale))).toContain(
        translate(locale, 'loading'),
      );
      expect(renderToStaticMarkup(wrap(React.createElement(NotFound), locale))).toContain(
        translate(locale, 'notFound'),
      );
      const error = renderToStaticMarkup(
        wrap(
          React.createElement(DashboardError, { error: new Error('secret'), reset: vi.fn() }),
          locale,
        ),
      );
      expect(error).toContain(translate(locale, 'unavailable'));
      expect(error).not.toContain('secret');
      const layout = renderToStaticMarkup(await RootLayout({ children: 'child' }));
      expect(layout).toContain(`lang="${locale}"`);
      expect(layout).toContain('name="locale"');
      expect(layout).toContain(translate(locale, 'applyLanguage'));
    },
  );

  it('uses current authorization for the server list and shows an empty hint', async () => {
    mocks.manageableGuilds.mockResolvedValue([]);
    const html = renderToStaticMarkup(await GuildsPage());
    expect(mocks.manageableGuilds).toHaveBeenCalledWith(session);
    expect(html).toContain('Ask a server owner for access');
    expect(html).toContain('id="main-content"');
  });

  it('stops before database reads if current server authorization fails', async () => {
    mocks.assertCanManageGuild.mockRejectedValue(new Error('Denied'));
    await expect(settingsHtml()).rejects.toThrow('Denied');
    expect(mocks.assertCanManageGuild).toHaveBeenCalledWith(session, guild.id);
    expect(mocks.findGuild).not.toHaveBeenCalled();
    expect(mocks.fetchGuildRoles).not.toHaveBeenCalled();
  });

  it('labels each control and caps the pending queue with useful empty hints', async () => {
    const html = await settingsHtml();
    for (const id of [
      'default-roles',
      'welcome-channel',
      'account-age',
      'banner',
      'invite-code',
      'invite-role',
    ]) {
      expect(html).toContain(`for="${id}"`);
      expect(html).toContain(`id="${id}"`);
    }
    expect(mocks.findPending).toHaveBeenCalledWith({
      where: { guildId: '123', status: 'pending' },
      orderBy: { joinedAt: 'desc' },
      take: 100,
    });
    expect(html).toContain('No assignable roles found');
    expect(html).toContain('Showing up to 100');
    expect(html).toContain('does not kick or ban');
    expect(html).toContain('moderation permissions');
  });

  it('gives repeated member and mapping buttons distinct accessible names', async () => {
    mocks.findMaps.mockResolvedValue([{ id: 'map', inviteCode: 'abc123', roleId: 'member' }]);
    mocks.fetchGuildRoles.mockResolvedValue([{ id: 'member', name: 'Member' }]);
    mocks.findPending.mockResolvedValue([
      { id: 'pending', username: 'Morgan', accountCreatedAt: new Date('2026-01-01T00:00:00Z') },
    ]);
    const html = await settingsHtml();
    expect(html).toContain('aria-label="Approve Morgan"');
    expect(html).toContain('aria-label="Deny roles for Morgan"');
    expect(html).toContain('aria-label="Remove mapping for abc123"');
    expect(html).toMatch(/datetime="2026-01-01T00:00:00.000Z"/i);
  });

  it.each(['saved', 'banner', 'mapping', 'removed', 'approved', 'denied'])(
    'announces the known %s notice',
    async (notice) => {
      expect(await settingsHtml({ notice })).toContain('role="status"');
    },
  );

  it('does not reflect arbitrary query content or internal error details', async () => {
    const raw = 'secret Discord API response';
    const html = await settingsHtml({ error: raw, notice: 'saved' });
    expect(html).toContain('role="alert"');
    expect(html).not.toContain(raw);
    expect(html).not.toContain('Settings saved.');
    expect(await settingsHtml({ notice: '__proto__' })).not.toContain('role="status"');
    const errorHtml = renderToStaticMarkup(
      React.createElement(DashboardError, { error: new Error(raw), reset: vi.fn() }),
    );
    expect(errorHtml).toContain('role="alert"');
    expect(errorHtml).not.toContain(raw);
  });

  it('disables the submitting button and announces its pending label', () => {
    mocks.formStatus.mockReturnValue({ pending: true });
    const html = renderToStaticMarkup(
      React.createElement(FormButton, { pendingLabel: 'Uploading…' }, 'Upload'),
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Uploading…');
  });
});
