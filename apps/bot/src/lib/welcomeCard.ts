import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import { cardThemes, DEFAULT_CARD_THEME, isCardTheme, welcomeTexts } from '@doorman/shared';

const WIDTH = 1024;
const HEIGHT = 360;
const AVATAR_SIZE = 200;

export interface WelcomeCardOptions {
  /** Uploaded banner file, or null for the theme's built-in background. */
  bannerFilePath: string | null;
  avatarUrl: string;
  displayName: string;
  guildName?: string | null;
  /** Join position; omitted from the card when null. */
  memberCount?: number | null;
  theme?: string | null;
  locale?: string | null;
}

function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function drawDefaultBackground(ctx: SKRSContext2D, accent: string, background: string): void {
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(WIDTH - 120, 40, 0, WIDTH - 120, 40, 520);
  glow.addColorStop(0, rgba(accent, 0.35));
  glow.addColorStop(1, rgba(accent, 0));
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
 * Renders the welcome card: the guild's uploaded banner (or the theme's built-in
 * background) with the member's avatar, name, server name and join position.
 */
export async function renderWelcomeCard(options: WelcomeCardOptions): Promise<Buffer> {
  const { accent, background } =
    cardThemes[isCardTheme(options.theme) ? options.theme : DEFAULT_CARD_THEME];
  const texts = welcomeTexts(options.locale);
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  if (options.bannerFilePath) {
    const banner = await loadImage(options.bannerFilePath);
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
    shade.addColorStop(0, rgba(background, 0.88));
    shade.addColorStop(1, rgba(background, 0.35));
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  } else {
    drawDefaultBackground(ctx, accent, background);
  }

  // Thin accent frame and left accent bar.
  ctx.strokeStyle = rgba(accent, 0.35);
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, WIDTH - 24, HEIGHT - 24);
  ctx.fillStyle = accent;
  ctx.fillRect(12, 60, 4, HEIGHT - 120);

  const response = await fetch(options.avatarUrl, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Avatar fetch failed: HTTP ${response.status}`);
  const avatar = await loadImage(Buffer.from(await response.arrayBuffer()));

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

  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(ax + r, ay + r, r + 4, 0, Math.PI * 2);
  ctx.stroke();

  const textX = ax + AVATAR_SIZE + 48;
  const maxWidth = WIDTH - textX - 56;

  ctx.fillStyle = accent;
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(texts.kicker, textX, ay + 52, maxWidth);

  ctx.fillStyle = '#fafafa';
  ctx.font = 'bold 60px sans-serif';
  ctx.fillText(options.displayName, textX, ay + 122, maxWidth);

  const details = [
    options.guildName,
    options.memberCount ? texts.member(options.memberCount) : null,
  ]
    .filter(Boolean)
    .join('  ·  ');
  if (details) {
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '28px sans-serif';
    ctx.fillText(details, textX, ay + 170, maxWidth);
  }

  return canvas.encode('png');
}
