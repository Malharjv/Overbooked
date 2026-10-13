import { turbulenceEnvelope } from "./maps";
import type { MapId } from "./types";
import {
  getStormBoltState,
  getStormLightningGameTime,
  getStormStrikeIndex,
  getStormStrikePhase,
} from "./stormLightning";

const SOUND_KEY = "overbooked-sound";

export function readSoundEnabled() {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* private browsing can block storage */
  }
}

function noiseBuffer(context: AudioContext) {
  const length = context.sampleRate * 2;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
  return buffer;
}

function normalize(data: Float32Array, peakTarget: number) {
  let peak = 0;
  for (let index = 0; index < data.length; index += 1) peak = Math.max(peak, Math.abs(data[index]));
  if (peak < 0.0001) return;
  const scale = peakTarget / peak;
  for (let index = 0; index < data.length; index += 1) data[index] *= scale;
}

/** Electrical snaps: impulses, not a wash of noise, so the flash is a crackle. */
function crackleBuffer(context: AudioContext) {
  const rate = context.sampleRate;
  const length = Math.floor(rate * 1.2);
  const buffer = context.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const bursts = 78;
  for (let burst = 0; burst < bursts; burst += 1) {
    const start = Math.floor((burst / bursts) * length * 0.9 + Math.random() * rate * 0.006);
    const snaps = 1 + Math.floor(Math.random() * 4);
    for (let snap = 0; snap < snaps; snap += 1) {
      const at = Math.min(length - 28, start + Math.floor(Math.random() * rate * 0.012));
      const amp = 0.5 + Math.random() * 0.5;
      data[at] += amp;
      data[at + 1] -= amp * 0.92;
      for (let step = 2; step < 18; step += 1) {
        data[at + step] += amp * (Math.random() * 2 - 1) * Math.exp(-step * 0.42);
      }
    }
  }
  normalize(data, 0.95);
  return buffer;
}

/** Irregular metal hits, looped while the cabin is shaking. */
function rattleBuffer(context: AudioContext) {
  const rate = context.sampleRate;
  const length = Math.floor(rate * 1.6);
  const buffer = context.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let cursor = Math.floor(rate * 0.02);
  while (cursor < length - 90) {
    const amp = 0.6 + Math.random() * 0.4;
    const tone = 180 + Math.random() * 1600;
    for (let step = 0; step < 80; step += 1) {
      const env = Math.exp(-step * 0.1);
      data[cursor + step] += Math.sin((step / rate) * tone * Math.PI * 2) * amp * env;
      data[cursor + step] += (Math.random() * 2 - 1) * amp * 0.6 * env;
    }
    cursor += Math.floor(rate * (0.034 + Math.random() * 0.04));
  }
  normalize(data, 0.92);
  return buffer;
}

/** Looping cabin weather: breeze, gusts, rain, and lightning timed to the storm. */
class FlightAmbience {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private hits: GainNode | null = null;
  private buffer: AudioBuffer | null = null;
  private crackle: AudioBuffer | null = null;
  private rattle: AudioBuffer | null = null;
  private stops: Array<() => void> = [];
  private frame = 0;
  private active: MapId | null = null;
  private lastBolt = -2;
  private lastStrike = -2;
  private shaking = false;

  unlock() {
    const context = this.ensure();
    if (context.state === "suspended") void context.resume();
  }

  play(mapId: MapId) {
    if (this.active === mapId && this.master) {
      this.unlock();
      return;
    }
    const context = this.ensure();
    this.teardown();
    this.active = mapId;
    const now = context.currentTime;
    this.master!.gain.cancelScheduledValues(now);
    this.master!.gain.setValueAtTime(Math.max(0.0001, this.master!.gain.value), now);
    this.master!.gain.linearRampToValueAtTime(0.85, now + 0.45);
    if (mapId === "smooth-skies") this.smooth(context);
    else if (mapId === "turbulent-torrent") this.turbulent(context);
    else this.storm(context);
    this.unlock();
  }

  stop() {
    this.active = null;
    this.teardown();
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.0001, now + 0.2);
  }

  private ensure() {
    if (this.context && this.master && this.buffer) return this.context;
    const context = new AudioContext();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -8;
    compressor.knee.value = 12;
    compressor.ratio.value = 1.8;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.18;
    const master = context.createGain();
    master.gain.value = 0.0001;
    master.connect(compressor);
    const hits = context.createGain();
    hits.gain.value = 1;
    hits.connect(context.destination);
    compressor.connect(context.destination);
    this.context = context;
    this.master = master;
    this.hits = hits;
    this.buffer = noiseBuffer(context);
    this.crackle = crackleBuffer(context);
    this.rattle = rattleBuffer(context);
    return context;
  }

  private teardown() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const stop of this.stops) {
      try {
        stop();
      } catch {
        /* node already stopped */
      }
    }
    this.stops = [];
    this.lastBolt = -2;
    this.lastStrike = -2;
    this.shaking = false;
  }

  private keep(stop: () => void) {
    this.stops.push(stop);
  }

  private gain(context: AudioContext, value: number) {
    const node = context.createGain();
    node.gain.value = value;
    node.connect(this.master!);
    return node;
  }

  private loop(context: AudioContext, destination: AudioNode) {
    const source = context.createBufferSource();
    source.buffer = this.buffer;
    source.loop = true;
    source.connect(destination);
    source.start();
    this.keep(() => source.stop());
    return source;
  }

  private tone(context: AudioContext, frequency: number, type: OscillatorType, level: number) {
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    const levelNode = this.gain(context, level);
    oscillator.connect(levelNode);
    oscillator.start();
    this.keep(() => oscillator.stop());
    return oscillator;
  }

  private smooth(context: AudioContext) {
    const air = this.gain(context, 0.045);
    const low = context.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 640;
    const high = context.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 140;
    low.connect(high);
    high.connect(air);
    this.loop(context, low);
    this.tone(context, 78, "sine", 0.03);
    this.tone(context, 117, "triangle", 0.012);
    const drift = context.createOscillator();
    drift.frequency.value = 0.08;
    const driftAmount = context.createGain();
    driftAmount.gain.value = 0.012;
    drift.connect(driftAmount);
    driftAmount.connect(air.gain);
    drift.start();
    this.keep(() => drift.stop());
  }

  private whoosh(context: AudioContext, peak: number) {
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = this.buffer;
    const band = context.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 1.2;
    band.frequency.setValueAtTime(260, now);
    band.frequency.exponentialRampToValueAtTime(peak, now + 0.28);
    band.frequency.exponentialRampToValueAtTime(380, now + 0.85);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.16);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
    source.connect(band);
    band.connect(gain);
    gain.connect(this.master!);
    source.start(now);
    source.stop(now + 1);
  }

  private turbulent(context: AudioContext) {
    const body = this.gain(context, 0.16);
    const band = context.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 720;
    band.Q.value = 0.65;
    band.connect(body);
    this.loop(context, band);
    const gust = this.gain(context, 0.05);
    const gustBand = context.createBiquadFilter();
    gustBand.type = "bandpass";
    gustBand.frequency.value = 1400;
    gustBand.Q.value = 0.8;
    gustBand.connect(gust);
    this.loop(context, gustBand);
    this.tone(context, 52, "sine", 0.04);
    const shake = this.cabinShake(context);
    const started = performance.now();
    const sway = () => {
      if (this.active !== "turbulent-torrent") return;
      const wave = 0.5 + 0.5 * Math.sin((performance.now() - started) / 900);
      const envelope = this.followTurbulence(context, "turbulent-torrent", shake);
      gust.gain.value = (0.03 + wave * 0.16) * (1 - Math.min(1, envelope) * 0.75);
      body.gain.value = 0.16 * (1 - Math.min(1, envelope) * 0.7);
      this.frame = requestAnimationFrame(sway);
    };
    this.frame = requestAnimationFrame(sway);
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (this.active !== "turbulent-torrent") return;
        this.whoosh(context, 900 + Math.random() * 1100);
        schedule();
      }, 1800 + Math.random() * 2600);
    };
    schedule();
    this.keep(() => window.clearTimeout(timer));
  }

  private cabinShake(context: AudioContext) {
    const bed = this.gain(context, 0);
    const band = context.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 980;
    band.Q.value = 0.55;
    band.connect(bed);
    const source = context.createBufferSource();
    source.buffer = this.rattle;
    source.loop = true;
    source.connect(band);
    source.start();
    this.keep(() => source.stop());
    const thump = context.createOscillator();
    thump.type = "sine";
    thump.frequency.value = 38;
    const thumpGain = this.gain(context, 0);
    thump.connect(thumpGain);
    thump.start();
    this.keep(() => thump.stop());
    return { bed, thumpGain };
  }

  private followTurbulence(
    context: AudioContext,
    mapId: MapId,
    shake: { bed: GainNode; thumpGain: GainNode },
  ) {
    const time = getStormLightningGameTime();
    const envelope = turbulenceEnvelope(mapId, time);
    const severe = mapId === "stormy-service";
    const shaking = envelope > 0.05;
    const level = shaking ? (severe ? 0.78 : 0.68) + Math.min(envelope, 1.2) * 0.22 : 0;
    shake.bed.gain.value = level;
    shake.thumpGain.gain.value = shaking ? 0.22 + Math.min(envelope, 1.2) * 0.2 : 0;
    if (!this.shaking && shaking) {
      this.shaking = true;
      this.jolt(context, severe ? 1 : 0.85);
    } else if (this.shaking && !shaking) {
      this.shaking = false;
    }
    return envelope;
  }

  private jolt(context: AudioContext, level: number) {
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = this.rattle;
    const band = context.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 640;
    band.Q.value = 0.5;
    const gain = context.createGain();
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    source.connect(band);
    band.connect(gain);
    gain.connect(this.master!);
    source.start(now);
    source.stop(now + 0.75);
    const drop = context.createOscillator();
    drop.type = "sine";
    drop.frequency.setValueAtTime(96, now);
    drop.frequency.exponentialRampToValueAtTime(30, now + 0.3);
    const dropGain = context.createGain();
    dropGain.gain.setValueAtTime(0.62 * level, now);
    dropGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    drop.connect(dropGain);
    dropGain.connect(this.master!);
    drop.start(now);
    drop.stop(now + 0.42);
  }

  private flashCrack(context: AudioContext) {
    const now = context.currentTime;
    const bus = this.hits ?? context.destination;
    const layers: Array<[number, number, number]> = [
      [0, 0.95, 700],
      [0.05, 0.62, 2200],
      [0.16, 0.48, 3400],
    ];
    for (const [delay, level, cutoff] of layers) {
      const source = context.createBufferSource();
      source.buffer = this.crackle;
      const high = context.createBiquadFilter();
      high.type = "highpass";
      high.frequency.value = cutoff;
      const gain = context.createGain();
      gain.gain.setValueAtTime(level, now + delay);
      source.connect(high);
      high.connect(gain);
      gain.connect(bus);
      source.start(now + delay);
      source.stop(now + delay + 1.25);
    }
  }

  private thunder(context: AudioContext, intensity: number) {
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = this.buffer;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.6;
    filter.frequency.setValueAtTime(1400 + intensity * 2800, now);
    filter.frequency.exponentialRampToValueAtTime(90, now + 0.45 + intensity * 0.7);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07 + intensity * 0.16, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18 + intensity * 0.12);
    const boom = context.createOscillator();
    boom.type = "sine";
    boom.frequency.setValueAtTime(70 + intensity * 30, now);
    boom.frequency.exponentialRampToValueAtTime(28, now + 0.55);
    const boomGain = context.createGain();
    boomGain.gain.setValueAtTime(0.0001, now);
    boomGain.gain.exponentialRampToValueAtTime(0.04 + intensity * 0.1, now + 0.02);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master!);
    boom.connect(boomGain);
    boomGain.connect(this.master!);
    source.start(now);
    source.stop(now + 2);
    boom.start(now);
    boom.stop(now + 1.2);
  }

  private storm(context: AudioContext) {
    const wind = this.gain(context, 0.14);
    const windFilter = context.createBiquadFilter();
    windFilter.type = "lowpass";
    windFilter.frequency.value = 480;
    windFilter.connect(wind);
    this.loop(context, windFilter);
    const gust = this.gain(context, 0.08);
    const gustFilter = context.createBiquadFilter();
    gustFilter.type = "bandpass";
    gustFilter.frequency.value = 900;
    gustFilter.Q.value = 0.7;
    gustFilter.connect(gust);
    this.loop(context, gustFilter);
    const rain = this.gain(context, 0.2);
    const rainFilter = context.createBiquadFilter();
    rainFilter.type = "highpass";
    rainFilter.frequency.value = 1700;
    rainFilter.connect(rain);
    this.loop(context, rainFilter);
    const hiss = this.gain(context, 0.07);
    const hissFilter = context.createBiquadFilter();
    hissFilter.type = "highpass";
    hissFilter.frequency.value = 4200;
    hissFilter.connect(hiss);
    this.loop(context, hissFilter);
    this.tone(context, 46, "sine", 0.045);
    const shake = this.cabinShake(context);
    const watch = () => {
      if (this.active !== "stormy-service") return;
      const time = getStormLightningGameTime();
      const phase = getStormStrikePhase(time);
      const bolt = getStormBoltState(time);
      const strike = getStormStrikeIndex(time);
      const brewing = phase >= 0 && phase < 3;
      const envelope = this.followTurbulence(context, "stormy-service", shake);
      const ducked = 1 - Math.min(1, envelope) * 0.65;
      gust.gain.value = (brewing ? 0.16 : 0.06) * ducked;
      wind.gain.value = (brewing ? 0.2 : 0.12) * ducked;
      rain.gain.value = 0.2 * (envelope > 0.2 ? 0.55 : 1);
      if (bolt.pulse !== this.lastBolt && bolt.pulse >= 0 && bolt.pulse < 6 && phase < 0.9) {
        this.thunder(context, 0.22 + bolt.pulse * 0.08);
      }
      this.lastBolt = bolt.pulse;
      if (strike !== this.lastStrike && phase >= 0.95 && phase < 1.25) {
        this.lastStrike = strike;
        this.flashCrack(context);
      }
      this.frame = requestAnimationFrame(watch);
    };
    this.frame = requestAnimationFrame(watch);
  }
}

let ambience: FlightAmbience | null = null;

export function getFlightAudio() {
  if (!ambience) ambience = new FlightAmbience();
  return ambience;
}
