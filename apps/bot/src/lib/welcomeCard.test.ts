import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadImage } from '@napi-rs/canvas';
import { renderWelcomeCard } from './welcomeCard.js';

const { ctx, encode } = vi.hoisted(() => ({
  ctx: {
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillRect: vi.fn(),
    save: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    restore: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
  },
  encode: vi.fn(),
}));

vi.mock('@napi-rs/canvas', () => ({
  createCanvas: vi.fn(() => ({ getContext: () => ctx, encode })),
  loadImage: vi.fn(),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.mocked(loadImage).mockResolvedValue({} as never);
  encode.mockResolvedValue(Buffer.from('png'));
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// No real HTTP calls or native canvas rendering are needed for these contracts.
describe('welcome card', () => {
  it('fetches the avatar with a timeout and bounds a long username to the remaining width', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const username = 'Long username '.repeat(20);
    await expect(
      renderWelcomeCard('banner.png', 'https://cdn.discordapp.com/avatar.png', username),
    ).resolves.toEqual(Buffer.from('png'));
    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(fetch).toHaveBeenCalledWith('https://cdn.discordapp.com/avatar.png', {
      signal: expect.any(AbortSignal),
    });
    expect(ctx.fillText).toHaveBeenCalledWith(username, 230, 320, 754);
    expect(ctx.fillText).toHaveBeenCalledWith('welcome to the server', 230, 364);
    expect(encode).toHaveBeenCalledWith('png');
  });

  it('rejects HTTP errors before reading or decoding the avatar body', async () => {
    const arrayBuffer = vi.fn();
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      arrayBuffer,
    } as unknown as Response);
    await expect(
      renderWelcomeCard('banner.png', 'https://cdn.discordapp.com/missing.png', 'Member'),
    ).rejects.toThrow('404');
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(loadImage).toHaveBeenCalledTimes(1);
    expect(encode).not.toHaveBeenCalled();
  });

  it('keeps the timeout signal active while reading a stalled avatar body', async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const arrayBuffer = vi.fn(
      () =>
        new Promise<ArrayBuffer>((_resolve, reject) => {
          controller.signal.addEventListener('abort', () => reject(controller.signal.reason), {
            once: true,
          });
        }),
    );
    vi.mocked(fetch).mockResolvedValue({ ok: true, arrayBuffer } as unknown as Response);
    const rendering = renderWelcomeCard(
      'banner.png',
      'https://cdn.discordapp.com/avatar.png',
      'Member',
    );
    const rejected = expect(rendering).rejects.toThrow('Avatar timed out');
    await vi.waitFor(() => expect(arrayBuffer).toHaveBeenCalled());
    controller.abort(new Error('Avatar timed out'));
    await rejected;
    expect(fetch).toHaveBeenCalledWith(expect.any(String), { signal: controller.signal });
    expect(encode).not.toHaveBeenCalled();
  });
});
