import { create } from 'zustand';
import type { FabricPreset } from '../lib/storage';

export type AspectRatio =
  | { id: '1:1'; w: 1; h: 1 }
  | { id: '4:5'; w: 4; h: 5 }
  | { id: '5:7'; w: 5; h: 7 }
  | { id: '4:6'; w: 4; h: 6 }
  | { id: '8:10'; w: 8; h: 10 }
  | { id: '11:14'; w: 11; h: 14 }
  | { id: '16:20'; w: 16; h: 20 }
  | { id: 'free'; w: 0; h: 0 };

export const ASPECT_RATIOS: AspectRatio[] = [
  { id: '1:1', w: 1, h: 1 },
  { id: '4:5', w: 4, h: 5 },
  { id: '5:7', w: 5, h: 7 },
  { id: '4:6', w: 4, h: 6 },
  { id: '8:10', w: 8, h: 10 },
  { id: '11:14', w: 11, h: 14 },
  { id: '16:20', w: 16, h: 20 },
  { id: 'free', w: 0, h: 0 },
];

export type SizeUnit = 'stitches' | 'inches';

export interface WizardState {
  imageDataUrl: string | null;
  imageNaturalW: number;
  imageNaturalH: number;
  aspect: AspectRatio;
  crop: { x: number; y: number }; // react-easy-crop position
  zoom: number;
  /** crop frame size in display pixels; only used when aspect.id === 'free' */
  freeCropSize: { width: number; height: number } | null;
  croppedAreaPixels: { x: number; y: number; width: number; height: number } | null;
  stitchesWide: number;
  sizeUnit: SizeUnit;
  colorCount: number;
  useHalfStitches: boolean;
  fabricPreset: FabricPreset;
  fabricCustomHex: string;
  aidaCount: number;
  strands: number;
  name: string;
}

const initialState: WizardState = {
  imageDataUrl: null,
  imageNaturalW: 0,
  imageNaturalH: 0,
  aspect: ASPECT_RATIOS[1], // 4:5
  crop: { x: 0, y: 0 },
  zoom: 1,
  freeCropSize: null,
  croppedAreaPixels: null,
  stitchesWide: 80,
  sizeUnit: 'stitches',
  colorCount: 30,
  useHalfStitches: true,
  fabricPreset: 'white',
  fabricCustomHex: '#FFFFFF',
  aidaCount: 14,
  strands: 2,
  name: '',
};

export const useWizard = create<WizardState & {
  reset: () => void;
  set: (partial: Partial<WizardState>) => void;
}>((set) => ({
  ...initialState,
  reset: () => set({ ...initialState }),
  set: (partial) => set(partial),
}));
