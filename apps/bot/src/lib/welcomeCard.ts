import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas';

const WIDTH = 1024;
const HEIGHT = 360;
const AVATAR_SIZE = 200;
const ACCENT = '#FF6600';
const BACKGROUND = '#09090b';

/** 1 → "1st", 12 → "12th", 169 → "169th". */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');
  return `${n}${suffix}`;
}

/** Built-in PrimeBuild look used when the guild has not uploaded its own banner. */
function drawDefaultBackground(ctx: SKRSContext2D): void {
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(WIDTH - 120, 40, 0, WIDTH - 120, 40, 520);
  glow.addColorStop(0, 'rgba(255,102,0,0.38)');
  glow.addColorStop(1, 'rgba(255,102,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= WIDTH; x += 48) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
  }
  for (let y = 0; y <= HEIGHT; y += 48) {
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
  }
  ctx.stroke();
}

/**
 * Renders the English welcome plate: the guild's uploaded banner (or the built-in
 * PrimeBuild background when `bannerFilePath` is null) with the member's avatar,
 * name, server name and join position.
 */
export async function renderWelcomeCard(
  bannerFilePath: string | null,
  avatarUrl: string,
  username: string,
  guildName?: string | null,
  memberCount?: number | null,
): Promise<Buffer> {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  if (bannerFilePath) {
    const banner = await loadImage(bannerFilePath);
    // Cover-crop (centered) so uploads of any aspect ratio are not stretched.
    const scale = Math.max(WIDTH / banner.width, HEIGHT / banner.height) || 1;
    const w = WIDTH / scale;
    const h = HEIGHT / scale;
    ctx.drawImage(
      banner,
      (banner.width - w) / 2,
      (banner.height - h) / 2,
      w,
      h,
      0,
      0,
      WIDTH,
      HEIGHT,
    );
    // Darken any uploaded banner so white text stays legible.
    const shade = ctx.createLinearGradient(0, 0, WIDTH, 0);
    shade.addColorStop(0, 'rgba(9,9,11,0.88)');
    shade.addColorStop(1, 'rgba(9,9,11,0.35)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  } else {
    drawDefaultBackground(ctx);
  }

  // Thin accent frame and left accent bar, as on primebuild cards.
  ctx.strokeStyle = 'rgba(255,102,0,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, WIDTH - 24, HEIGHT - 24);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(12, 60, 4, HEIGHT - 120);

  const response = await fetch(avatarUrl, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Avatar fetch failed: HTTP ${response.status}`);
  const avatarBytes = Buffer.from(await response.arrayBuffer());
  const avatar = await loadImage(avatarBytes);

  const ax = 64;
  const ay = (HEIGHT - AVATAR_SIZE) / 2;
  const r = AVATAR_SIZE / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(ax + r, ay + r, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, ax, ay, AVATAR_SIZE, AVATAR_SIZE);
  ctx.restore();

  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(ax + r, ay + r, r + 4, 0, Math.PI * 2);
  ctx.stroke();

  const textX = ax + AVATAR_SIZE + 48;
  const maxWidth = WIDTH - textX - 56;

  ctx.fillStyle = ACCENT;
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('WELCOME TO THE SERVER', textX, ay + 52, maxWidth);

  ctx.fillStyle = '#fafafa';
  ctx.font = 'bold 60px sans-serif';
  ctx.fillText(username, textX, ay + 122, maxWidth);

  const details = [guildName, memberCount ? `${ordinal(memberCount)} member` : null]
    .filter(Boolean)
    .join('  ·  ');
  if (details) {
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '28px sans-serif';
    ctx.fillText(details, textX, ay + 170, maxWidth);
  }

  return canvas.encode('png');
}
