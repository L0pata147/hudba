import { create } from 'zustand';
import type { EqualizerStatus } from './audio-engine';

/** Live EQ state reported by the audio engine (for the UI). */
export const useEqualizerStatus = create<{ status: EqualizerStatus; set(status: EqualizerStatus): void }>()((set) => ({
  status: 'off',
  set: (status) => set({ status }),
}));
