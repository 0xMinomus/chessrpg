// Adapter audio WebAudio: synth bunyi gim (satu-satunya pemilik AudioContext).
// Tabel nada diport verbatim dari prototipe dungeon aktif. Preferensi suara
// disimpan lokal (FR-16); reduced-motion tidak memengaruhi audio.

import type { StorageBacking } from './browser-storage.ts';

export type SoundKind =
  | 'move'
  | 'capture'
  | 'skill'
  | 'roll'
  | 'reveal'
  | 'enemy'
  | 'error'
  | 'toggle'
  | 'cardHover'
  | 'select'
  | 'undo'
  | 'restart'
  | 'promotion';

/** Key preferensi suara; default ON bila belum pernah disimpan. */
export const SOUND_PREF_KEY = 'crown-catalyst-sound-v1';

type Tone = [frequency: number, wave: OscillatorType, peak: number, duration?: number];

const TONES: Record<SoundKind, Tone> = {
  move: [310, 'square', 0.035],
  capture: [190, 'triangle', 0.055],
  skill: [520, 'triangle', 0.045],
  roll: [220, 'square', 0.025],
  reveal: [440, 'triangle', 0.04],
  enemy: [145, 'sawtooth', 0.04],
  error: [120, 'square', 0.025],
  toggle: [350, 'sine', 0.025],
  cardHover: [760, 'square', 0.009, 0.045],
  select: [430, 'triangle', 0.016, 0.06],
  undo: [260, 'triangle', 0.025, 0.105],
  restart: [280, 'square', 0.023, 0.085],
  promotion: [880, 'triangle', 0.035, 0.16],
};

interface WebAudioWindow {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

function audioContextClass(): typeof AudioContext | null {
  const scope = globalThis as unknown as WebAudioWindow;
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

export interface BrowserAudio {
  play(kind: SoundKind): void;
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
}

export function createBrowserAudio(backing: StorageBacking | null = null): BrowserAudio {
  let enabled = true;
  try {
    enabled = !backing || backing.getItem(SOUND_PREF_KEY) !== '0';
  } catch (_error) {
    enabled = true;
  }
  let context: AudioContext | null = null;

  function persist(): void {
    try {
      backing?.setItem(SOUND_PREF_KEY, enabled ? '1' : '0');
    } catch (_error) {
      /* Preferensi suara opsional; abaikan kegagalan tulis. */
    }
  }

  function play(kind: SoundKind): void {
    if (!enabled) return;
    const ContextClass = audioContextClass();
    if (!ContextClass) return;
    try {
      if (!context) context = new ContextClass();
      if (context.state === 'suspended') void context.resume();
      const tone = TONES[kind] ?? TONES.move;
      const duration = tone[3] ?? 0.11;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = tone[1];
      oscillator.frequency.setValueAtTime(tone[0], context.currentTime);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(tone[2], context.currentTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration + 0.01);
      if (kind === 'capture') {
        const layers: Array<[number, OscillatorType, number, number, number]> = [
          [720, 'square', 0.018, 0.045, 0.004],
          [105, 'sine', 0.042, 0.13, 0.006],
        ];
        for (const layer of layers) {
          const hit = context.createOscillator();
          const hitGain = context.createGain();
          const start = context.currentTime + layer[4];
          hit.type = layer[1];
          hit.frequency.setValueAtTime(layer[0], start);
          if (layer[0] < 150) hit.frequency.exponentialRampToValueAtTime(58, start + layer[3]);
          hitGain.gain.setValueAtTime(0.0001, start);
          hitGain.gain.exponentialRampToValueAtTime(layer[2], start + 0.008);
          hitGain.gain.exponentialRampToValueAtTime(0.0001, start + layer[3]);
          hit.connect(hitGain);
          hitGain.connect(context.destination);
          hit.start(start);
          hit.stop(start + layer[3] + 0.01);
        }
      }
    } catch (_error) {
      /* Audio opsional; kegagalan browser tidak boleh merusak gim. */
    }
  }

  return {
    play,
    setEnabled(value: boolean) {
      enabled = value;
      persist();
      if (enabled) play('toggle');
    },
    isEnabled() {
      return enabled;
    },
  };
}
