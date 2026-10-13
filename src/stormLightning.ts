export const STORM_STRIKE_INTERVAL = 30;
export const STORM_STRIKE_DELAY = 30;
// Timeline of a strike (seconds from the strike start):
//   0.00 – 0.95  build-up: escalating strobes with visible bolts
//   0.95 – 2.00  main flash: the sky is lit up white
//   2.00 – 3.00  the flash slowly fades out and is fully gone at 3s
const FLICKER_END = 0.95;
const PEAK_END = 2.0;
const STRIKE_END = 3.0;

let syncedGameTime = 0;

export function setStormLightningGameTime(time: number) {
  syncedGameTime = time;
}

export function getStormLightningGameTime() {
  return syncedGameTime;
}

export function getStormStrikePhase(time: number): number {
  if (time < STORM_STRIKE_DELAY) return -1;
  return (time - STORM_STRIKE_DELAY) % STORM_STRIKE_INTERVAL;
}

export function getStormStrikeIndex(time: number): number {
  if (time < STORM_STRIKE_DELAY) return -1;
  return Math.floor((time - STORM_STRIKE_DELAY) / STORM_STRIKE_INTERVAL);
}

// Escalating strobes before the main flash: [start, end, peak]. Each pulse is
// a distinct bolt so the sky "builds up" rather than just blinking once.
const PULSES: Array<[number, number, number]> = [
  [0.0, 0.09, 0.28],
  [0.13, 0.21, 0.42],
  [0.27, 0.33, 0.36],
  [0.4, 0.52, 0.66],
  [0.58, 0.66, 0.5],
  [0.72, 0.86, 0.9],
  [0.88, 0.95, 1],
];

type Pulse = { index: number; envelope: number; peak: number };

function activePulse(phase: number): Pulse | null {
  for (let index = 0; index < PULSES.length; index += 1) {
    const [start, end, peak] = PULSES[index];
    if (phase >= start && phase < end) {
      // Sharp attack, softer decay – like a real discharge.
      const t = (phase - start) / (end - start);
      const envelope = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75;
      return { index, envelope: Math.max(0, envelope), peak };
    }
  }
  return null;
}

const smoothstep = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Opacity of the full-screen flash layer. */
export function getStormScreenOpacity(time: number): number {
  const phase = getStormStrikePhase(time);
  if (phase < 0 || phase >= STRIKE_END) return 0;
  if (phase < FLICKER_END) {
    // Ambient glow that slowly brightens, plus the strobes on top.
    const glow = 0.08 * (phase / FLICKER_END);
    const pulse = activePulse(phase);
    return Math.min(1, glow + (pulse ? pulse.peak * pulse.envelope * 0.85 : 0));
  }
  if (phase < PEAK_END) {
    // Hold near-white with a faint tremor so it reads as lightning, not a cut.
    const tremor = 0.03 * (0.5 + 0.5 * Math.sin(phase * 58));
    return 1 - tremor;
  }
  return 1 - smoothstep((phase - PEAK_END) / (STRIKE_END - PEAK_END));
}

/** Which bolt is firing right now (-1 if none) and how bright it is. */
export function getStormBoltState(time: number): { pulse: number; opacity: number } {
  const phase = getStormStrikePhase(time);
  if (phase < 0) return { pulse: -1, opacity: 0 };
  if (phase < FLICKER_END) {
    const pulse = activePulse(phase);
    if (!pulse) return { pulse: -1, opacity: 0 };
    return { pulse: pulse.index, opacity: Math.min(1, 0.45 + pulse.envelope * 0.7) };
  }
  // The final bolt lingers into the start of the main flash, then burns out.
  if (phase < PEAK_END) {
    const fade = 1 - (phase - FLICKER_END) / 0.35;
    return { pulse: PULSES.length - 1, opacity: Math.max(0, fade) };
  }
  return { pulse: -1, opacity: 0 };
}

export function getStormBoltOpacity(time: number): number {
  return getStormBoltState(time).opacity;
}

/** Labels are hidden once the build-up is bright, until the flash has mostly faded. */
export function isStormFlashHidingLabels(time: number): boolean {
  const phase = getStormStrikePhase(time);
  return phase >= 0.4 && phase < 2.62;
}

export function getStormSceneLightIntensity(time: number): number {
  const phase = getStormStrikePhase(time);
  if (phase < 0 || phase >= STRIKE_END) return 0;
  if (phase < FLICKER_END) {
    const pulse = activePulse(phase);
    return 4 + (pulse ? pulse.peak * pulse.envelope * 34 : 0);
  }
  if (phase < PEAK_END) return 40;
  return 40 * (1 - smoothstep((phase - PEAK_END) / (STRIKE_END - PEAK_END)));
}

export function seededRandom(seed: number) {
  let state = (seed + 1) * 9301 + 49297;
  return () => {
    state = (state * 233280 + 12345) % 233280;
    return state / 233280;
  };
}

export type StormBoltLayout = {
  x: number;
  z: number;
  scale: number;
  branches: number;
};

export const STORM_PULSE_COUNT = PULSES.length;

/** One bolt per build-up pulse so each strobe lights a different part of the sky. */
export function stormBoltLayouts(strikeIndex: number): StormBoltLayout[] {
  if (strikeIndex < 0) return [];
  const rng = seededRandom(strikeIndex * 17 + 3);
  return Array.from({ length: PULSES.length }, (_, pulse) => ({
    x: -11 + rng() * 22,
    z: -12 + rng() * 24,
    scale: (pulse === PULSES.length - 1 ? 1.35 : 0.8) + rng() * 0.5,
    branches: 2 + Math.floor(rng() * 3),
  }));
}

export function buildBoltPoints(
  layout: StormBoltLayout,
  strikeIndex: number,
): Array<[number, number, number]> {
  const rng = seededRandom(strikeIndex * 41 + layout.x * 7);
  const topY = 14 + rng() * 4;
  const groundY = 2.2 + rng() * 1.2;
  const segments = 9 + Math.floor(rng() * 4);
  const points: Array<[number, number, number]> = [];
  let x = layout.x;
  let y = topY;
  const targetX = layout.x + (rng() - 0.5) * 3.5;
  const targetZ = layout.z;

  points.push([x, y, layout.z - 2]);
  for (let index = 1; index <= segments; index += 1) {
    const t = index / segments;
    y = topY + (groundY - topY) * t;
    x = layout.x + (targetX - layout.x) * t + (rng() - 0.5) * 1.35;
    const z = layout.z + (targetZ - layout.z) * t + (rng() - 0.5) * 1.1;
    points.push([x, y, z]);
  }
  return points;
}
