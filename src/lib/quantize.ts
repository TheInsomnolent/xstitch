// Quantization pipeline: image pixels -> cell averages -> K-means in LAB ->
// snap centroids to nearest unique DMC threads -> expand to 2N effective
// palette (half-stitches over fabric) -> assign each cell to nearest entry.
import { deltaE76, rgbToLab, type LAB, type RGB } from './color';
import { kmeans } from './kmeans';
import { getPalette, type ThreadWithLab } from './threads';
import { expandPalette, type EffectivePaletteEntry } from './halfStitch';

export interface QuantizeInput {
  /** RGBA pixel buffer of the (cropped) source image */
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  gridW: number;
  gridH: number;
  /** number of thread colors to pick (1..200) */
  k: number;
  fabricHex: string;
  /** if false, the palette will only contain full stitches (no half stitches) */
  useHalfStitches?: boolean;
  seed?: number;
}

export interface QuantizeResult {
  gridW: number;
  gridH: number;
  /** length gridW*gridH; value = index into palette (0xFF means blank) */
  cells: Uint8Array;
  palette: EffectivePaletteEntry[];
  /** unique threads chosen, in palette order (each appears as palette[2i] full / palette[2i+1] half) */
  threads: ThreadWithLab[];
}

/** Average source image pixels into a gridW x gridH array of avg RGB. */
function averageCells(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  gridW: number,
  gridH: number
): RGB[] {
  const out: RGB[] = new Array(gridW * gridH);
  for (let gy = 0; gy < gridH; gy++) {
    const y0 = Math.floor((gy * height) / gridH);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / gridH));
    for (let gx = 0; gx < gridW; gx++) {
      const x0 = Math.floor((gx * width) / gridW);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / gridW));
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      for (let y = y0; y < y1; y++) {
        let p = (y * width + x0) * 4;
        for (let x = x0; x < x1; x++) {
          r += pixels[p];
          g += pixels[p + 1];
          b += pixels[p + 2];
          p += 4;
          n++;
        }
      }
      if (n === 0) n = 1;
      out[gy * gridW + gx] = [
        Math.round(r / n),
        Math.round(g / n),
        Math.round(b / n),
      ];
    }
  }
  return out;
}

/** Snap each LAB centroid to nearest unique thread by ΔE76. */
function snapToThreads(centroids: LAB[], palette: ThreadWithLab[]): ThreadWithLab[] {
  // Greedy: order centroids by best-match strength descending, claim threads.
  type Candidate = { ci: number; best: { ti: number; d: number }[] };
  const cands: Candidate[] = centroids.map((c, ci) => {
    const dists = palette.map((p, ti) => ({ ti, d: deltaE76(c, p.lab) }));
    dists.sort((a, b) => a.d - b.d);
    return { ci, best: dists };
  });
  // sort so the centroid whose top-1 is strongest claims first
  cands.sort((a, b) => a.best[0].d - b.best[0].d);
  const used = new Set<number>();
  const result: ThreadWithLab[] = new Array(centroids.length);
  for (const c of cands) {
    let pick = c.best[0].ti;
    for (const opt of c.best) {
      if (!used.has(opt.ti)) {
        pick = opt.ti;
        break;
      }
    }
    used.add(pick);
    result[c.ci] = palette[pick];
  }
  return result;
}

export function quantize(input: QuantizeInput): QuantizeResult {
  const { pixels, width, height, gridW, gridH, k, fabricHex, seed } = input;
  const useHalfStitches = input.useHalfStitches !== false;

  // 1. Per-cell average colors.
  const cellRgb = averageCells(pixels, width, height, gridW, gridH);
  const cellLab: LAB[] = cellRgb.map(rgbToLab);

  // 2. K-means in LAB on cells (cells already form a reasonably small dataset).
  const effectiveK = Math.min(Math.max(1, k), cellLab.length);
  const km = kmeans(cellLab, effectiveK, { seed: seed ?? 1, maxIter: 30 });

  // 3. Snap centroids to nearest unique threads.
  const dmcPalette = getPalette('DMC');
  const threads = snapToThreads(km.centroids, dmcPalette);

  // 4. Expand palette (full + optional half).
  const palette = expandPalette(threads, fabricHex, useHalfStitches);

  // 5. Assign each cell to closest entry in the expanded palette by ΔE76.
  const cells = new Uint8Array(gridW * gridH);
  for (let i = 0; i < cellLab.length; i++) {
    let best = 0;
    let bestD = Infinity;
    for (let p = 0; p < palette.length; p++) {
      const d = deltaE76(cellLab[i], palette[p].displayLab);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    cells[i] = best;
  }

  return { gridW, gridH, cells, palette, threads };
}
