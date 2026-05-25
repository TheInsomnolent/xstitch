import { savePattern, loadPattern, makeBitset, type Pattern } from './storage';
import starterPatternsRaw from '../data/starterPatterns.json';

const SEEDED_KEY = 'xstitch:startersSeededV1';

/**
 * Render a small thumbnail dataURL from a pattern's cells. We strip thumbnails
 * from the bundled starter JSON to keep it slim and regenerate them locally.
 */
function renderThumbnail(p: Pattern, size = 256): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, size, size);

  const cell = Math.floor(Math.min(size / p.gridW, size / p.gridH));
  if (cell <= 0) return '';
  const drawW = cell * p.gridW;
  const drawH = cell * p.gridH;
  const offX = Math.floor((size - drawW) / 2);
  const offY = Math.floor((size - drawH) / 2);

  // Background fabric tint (subtle, so transparent edges still blend).
  ctx.fillStyle = p.fabric?.hex ?? '#ffffff';
  ctx.fillRect(offX, offY, drawW, drawH);

  for (let y = 0; y < p.gridH; y++) {
    for (let x = 0; x < p.gridW; x++) {
      const v = p.cells[y * p.gridW + x];
      if (v === 0xff) continue;
      const entry = p.palette[v];
      if (!entry) continue;
      ctx.fillStyle = entry.displayHex || entry.threadHex || '#000';
      ctx.fillRect(offX + x * cell, offY + y * cell, cell, cell);
    }
  }

  return canvas.toDataURL('image/png');
}

/**
 * On first run, seed the user's library with a couple of starter patterns so
 * the app isn't empty when they arrive. Runs once per browser (tracked via
 * localStorage); user-deleted starters are not re-added.
 */
export async function seedStartersIfNeeded(): Promise<void> {
  try {
    if (localStorage.getItem(SEEDED_KEY)) return;
  } catch {
    // localStorage unavailable — bail rather than re-seed every load.
    return;
  }

  const starters = starterPatternsRaw as unknown as Pattern[];
  for (const raw of starters) {
    try {
      const existing = await loadPattern(raw.id);
      if (existing) continue;

      const pattern: Pattern = {
        ...raw,
        completion: Array.isArray(raw.completion) && raw.completion.length
          ? raw.completion
          : makeBitset(raw.gridW * raw.gridH),
        thumbnail: raw.thumbnail || '',
      };
      if (!pattern.thumbnail) {
        pattern.thumbnail = renderThumbnail(pattern);
      }
      await savePattern(pattern);
    } catch (err) {
      // Don't let one bad starter block the rest.
      console.warn('Failed to seed starter pattern', raw?.id, err);
    }
  }

  try {
    localStorage.setItem(SEEDED_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}
