// Half-stitch palette expansion.
//
// For a chosen set of N threads + a fabric color, we build a 2N effective
// palette: each thread C as a full stitch (color C) and as a half stitch
// (linear-light midpoint of C and fabric).
import { blendLinear, hexToRgb, rgbToHex, rgbToLab, type LAB, type RGB } from './color';
import type { ThreadWithLab } from './threads';
import { symbolFor } from './symbols';

export type StitchKind = 'full' | 'half';

export interface EffectivePaletteEntry {
  threadFloss: string;
  threadName: string;
  threadHex: string;
  /** displayed (rendered) color — full = thread color, half = blend with fabric */
  displayHex: string;
  displayRgb: RGB;
  displayLab: LAB;
  kind: StitchKind;
  symbol: string;
}

export function expandPalette(
  threads: ThreadWithLab[],
  fabricHex: string,
  includeHalfStitches: boolean = true
): EffectivePaletteEntry[] {
  const fabricRgb = hexToRgb(fabricHex);
  const out: EffectivePaletteEntry[] = [];
  threads.forEach((t, i) => {
    out.push({
      threadFloss: t.floss,
      threadName: t.name,
      threadHex: t.hex,
      displayHex: t.hex.toUpperCase(),
      displayRgb: t.rgb,
      displayLab: t.lab,
      kind: 'full',
      symbol: symbolFor(i),
    });
    if (!includeHalfStitches) return;
    const halfRgb = blendLinear(t.rgb, fabricRgb, 0.5);
    out.push({
      threadFloss: t.floss,
      threadName: t.name,
      threadHex: t.hex,
      displayHex: rgbToHex(halfRgb),
      displayRgb: halfRgb,
      displayLab: rgbToLab(halfRgb),
      kind: 'half',
      symbol: symbolFor(i),
    });
  });
  return out;
}
