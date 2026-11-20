/**
 * Draws a 1080x1920 WhatsApp-status flyer (name, one line, QR, link) on a canvas.
 * Nothing is uploaded: the image is made in the browser from data the dashboard already has.
 */
export type FlyerStyle = 'green' | 'gold' | 'dark';
export type FlyerKind = 'shop' | 'booking' | 'both';

export interface FlyerInput {
  name: string;
  url: string;
  qrDataUrl: string;
  kind: FlyerKind;
  style: FlyerStyle;
  /** Short line under the name. Falls back to a sensible default for the page type. */
  line?: string;
}

const W = 1080;
const H = 1920;

const THEMES: Record<FlyerStyle, { bg1: string; bg2: string; ink: string; accent: string; card: string }> = {
  green: { bg1: '#08302d', bg2: '#0e7c3f', ink: '#ffffff', accent: '#ffc21a', card: '#ffffff' },
  gold: { bg1: '#ffc21a', bg2: '#ffd45c', ink: '#08302d', accent: '#08302d', card: '#ffffff' },
  dark: { bg1: '#0b1f1d', bg2: '#062421', ink: '#ffffff', accent: '#1fa855', card: '#ffffff' },
};

export const DEFAULT_LINE: Record<FlyerKind, string> = {
  shop: 'Order on WhatsApp in seconds',
  booking: 'Book your slot online',
  both: 'Order or book online',
};

const FONT = `'Avenir Next', 'Segoe UI', 'Helvetica Neue', Roboto, Arial, sans-serif`;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the QR image.'));
    img.src = src;
  });
}

/** Breaks text into at most `maxLines` lines that fit `maxWidth`; the last line ends with "..." if cut. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const test = cur ? `${cur} ${words[i]}` : words[i];
    if (ctx.measureText(test).width <= maxWidth || !cur) {
      cur = test;
    } else {
      lines.push(cur);
      cur = words[i];
      if (lines.length === maxLines - 1) {
        cur = words.slice(i).join(' ');
        break;
      }
    }
  }
  if (cur) {
    lines.push(cur);
  }
  const last = lines.length - 1;
  while (last >= 0 && ctx.measureText(lines[last]).width > maxWidth && lines[last].length > 1) {
    lines[last] = lines[last].slice(0, -2).trimEnd() + '…';
  }
  return lines.slice(0, maxLines);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function renderFlyer(input: FlyerInput): Promise<Blob> {
  const t = THEMES[input.style];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Your browser cannot draw the flyer.');
  }
  const qr = await loadImage(input.qrDataUrl);

  // Background
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, t.bg1);
  g.addColorStop(1, t.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Soft circles for a little life
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = t.accent;
  ctx.beginPath();
  ctx.arc(W + 40, 120, 340, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-60, H - 260, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // Business name (up to 3 lines, shrinks for long names)
  const size = input.name.length > 28 ? 84 : input.name.length > 16 ? 104 : 124;
  ctx.fillStyle = t.ink;
  ctx.font = `800 ${size}px ${FONT}`;
  const nameLines = wrap(ctx, input.name, W - 160, 3);
  let y = 330;
  for (const line of nameLines) {
    ctx.fillText(line, W / 2, y);
    y += size * 1.12;
  }

  // Accent bar + one-line promise
  y += 10;
  ctx.fillStyle = t.accent;
  roundRect(ctx, W / 2 - 70, y, 140, 12, 6);
  ctx.fill();
  y += 90;
  ctx.fillStyle = t.ink;
  ctx.font = `600 54px ${FONT}`;
  for (const line of wrap(ctx, input.line?.trim() || DEFAULT_LINE[input.kind], W - 200, 2)) {
    ctx.fillText(line, W / 2, y);
    y += 68;
  }

  // QR card
  const card = 640;
  const cx = (W - card) / 2;
  const cy = Math.max(y + 60, 800);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = t.card;
  roundRect(ctx, cx, cy, card, card, 48);
  ctx.fill();
  ctx.restore();
  ctx.imageSmoothingEnabled = false; // keeps QR edges sharp
  const pad = 34;
  ctx.drawImage(qr, cx + pad, cy + pad, card - pad * 2, card - pad * 2);
  ctx.imageSmoothingEnabled = true;

  // Scan prompt
  const sy = cy + card + 110;
  ctx.fillStyle = t.ink;
  ctx.font = `800 64px ${FONT}`;
  ctx.fillText('Scan to open my page', W / 2, sy);

  // Link pill
  const link = input.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  ctx.font = `700 52px ${FONT}`;
  const lw = Math.min(W - 120, ctx.measureText(link).width + 120);
  const ly = sy + 50;
  ctx.fillStyle = t.accent;
  roundRect(ctx, (W - lw) / 2, ly, lw, 110, 55);
  ctx.fill();
  ctx.fillStyle = input.style === 'gold' ? '#ffffff' : input.style === 'dark' ? '#ffffff' : '#08302d';
  ctx.fillText(wrap(ctx, link, lw - 60, 1)[0], W / 2, ly + 72);

  // Footer
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = t.ink;
  ctx.font = `600 34px ${FONT}`;
  ctx.fillText('Made with Bookam', W / 2, H - 80);
  ctx.globalAlpha = 1;

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the image.'))), 'image/png'));
}