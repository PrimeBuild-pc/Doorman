import { createCanvas, loadImage } from '@napi-rs/canvas';
import { resolveLocale } from '@doorman/shared';
import { t } from './i18n.js';

const WIDTH = 1024;
const HEIGHT = 450;
const AVATAR_SIZE = 160;

/** Composites the member's avatar and username onto the guild's uploaded banner. */
export async function renderWelcomeCard(
  bannerFilePath: string,
  avatarUrl: string,
  username: string,
  locale?: string | null,
): Promise<Buffer> {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const banner = await loadImage(bannerFilePath);
  ctx.drawImage(banner, 0, 0, WIDTH, HEIGHT);

  // Dark gradient over the bottom band so white text stays legible over any banner.
  const gradient = ctx.createLinearGradient(0, HEIGHT - 170, 0, HEIGHT);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.78)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, HEIGHT - 170, WIDTH, 170);

  const response = await fetch(avatarUrl, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Avatar fetch failed: HTTP ${response.status}`);
  const avatarBytes = Buffer.from(await response.arrayBuffer());
  const avatar = await loadImage(avatarBytes);

  const ax = 40;
  const ay = HEIGHT - AVATAR_SIZE - 40;
  const r = AVATAR_SIZE / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(ax + r, ay + r, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, ax, ay, AVATAR_SIZE, AVATAR_SIZE);
  ctx.restore();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(ax + r, ay + r, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px sans-serif';
  const textX = ax + AVATAR_SIZE + 30;
  ctx.fillText(username, textX, ay + r - 10, WIDTH - textX - 40);

  ctx.fillStyle = '#d1d5db';
  ctx.font = '28px sans-serif';
  ctx.fillText(t(resolveLocale(locale), 'welcomeCard'), textX, ay + r + 34, WIDTH - textX - 40);

  return canvas.encode('png');
}
