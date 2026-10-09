/**
 * Sound for Cookies and Crumbs: one shared Web Audio context, the SFX player,
 * and the format choice. The context is created and resumed inside the first
 * user gesture (iOS needs that), and resumed again after any interruption.
 */

export type SfxName =
  | 'swap'
  | 'swap-invalid'
  | 'match-1'
  | 'match-2'
  | 'match-3'
  | 'line-clear'
  | 'bomb-plant'
  | 'bomb-boom'
  | 'cookie-crush'
  | 'jar-smash'
  | 'prize'
  | 'quest-done'
  | 'goal-reached'
  | 'star-1'
  | 'star-2'
  | 'star-3'
  | 'unlock'
  | 'tap'
  | 'moves-low';

/**
 * Per-sound volume. The files are peak-matched, not loudness-matched, so the
 * small UI sounds sit lower and line-clear (the loudest in set B) is pulled down.
 */
const VOLUME: Record<SfxName, number> = {
  swap: 0.55,
  'swap-invalid': 0.7,
  'match-1': 0.8,
  'match-2': 0.8,
  'match-3': 0.8,
  'line-clear': 0.7,
  'bomb-plant': 0.85,
  'bomb-boom': 0.9,
  'cookie-crush': 0.85,
  'jar-smash': 0.85,
  prize: 1,
  'quest-done': 0.8,
  'goal-reached': 0.9,
  'star-1': 0.9,
  'star-2': 0.9,
  'star-3': 0.9,
  unlock: 0.9,
  tap: 0.5,
  'moves-low': 0.45,
};

const SFX_NAMES = Object.keys(VOLUME) as SfxName[];

/** Same sound again within this window is dropped (cascade spam). */
const THROTTLE_MS = 40;
/** Most sounds playing at once; the oldest fades out to make room. */
const MAX_VOICES = 8;
/** Files carry 8 ms of silent pre-roll (mp3 adds encoder padding). Skip to the onset. */
const ONSET_THRESHOLD = 0.0015;
const ONSET_LEAD_S = 0.001;

const SOUND_KEY = 'cookies-and-crumbs-sound';

type AudioCtor = typeof AudioContext;

function audioCtor(): AudioCtor | null {
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** iPhone/iPad (any browser there is WebKit) or desktop Safari. */
function isAppleWebKit(): boolean {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /^((?!chrome|chromium|crios|fxios|edg|android).)*safari/i.test(ua);
  return iOS || safari;
}

/** Ogg where it is supported; mp3 on Safari / iOS and as the fallback. */
export function pickFormat(): 'ogg' | 'mp3' {
  if (isAppleWebKit()) return 'mp3';
  try {
    const ok = document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"');
    return ok ? 'ogg' : 'mp3';
  } catch {
    return 'mp3';
  }
}

export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

/** decodeAudioData with the old callback form for older Safari. */
export function decode(ctx: BaseAudioContext, bytes: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(bytes, resolve, reject) as Promise<AudioBuffer> | undefined;
    p?.catch(reject);
  });
}

export function loadPref(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
}

export function savePref(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* blocked storage */
  }
}

type ReadyHook = (ctx: AudioContext) => void;

/** The single AudioContext, unlocked on the first gesture. */
class AudioCore {
  ctx: AudioContext | null = null;
  private hooks: ReadyHook[] = [];
  private pausedForHide = false;

  install(): void {
    const unlock = () => this.unlock();
    for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) {
      window.addEventListener(type, unlock, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => this.onVisibility());
  }

  /** Run now if the context exists, else once it is created. */
  onReady(hook: ReadyHook): void {
    if (this.ctx) hook(this.ctx);
    else this.hooks.push(hook);
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Must run inside a user gesture. Also revives iOS 'interrupted' contexts. */
  private unlock(): void {
    if (this.ctx?.state === 'running') return;
    if (!this.ctx) {
      const Ctor = audioCtor();
      if (!Ctor) return;
      try {
        // Respect the iOS ring/silent switch and mix with the player's own audio.
        const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
        if (session) session.type = 'ambient';
      } catch {
        /* not supported */
      }
      try {
        this.ctx = new Ctor({ latencyHint: 'interactive' });
      } catch {
        try {
          this.ctx = new Ctor();
        } catch {
          return;
        }
      }
      const ctx = this.ctx;
      const hooks = this.hooks;
      this.hooks = [];
      for (const hook of hooks) hook(ctx);
    }
    if (document.hidden) return;
    const ctx = this.ctx;
    void ctx.resume().catch(() => {});
    // Older iOS only starts output after a sound is played inside the gesture.
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      /* ignore */
    }
  }

  /** Stop the audio thread while the tab is hidden; pick it back up after. */
  private onVisibility(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (document.hidden) {
      if (ctx.state === 'running') {
        this.pausedForHide = true;
        void ctx.suspend().catch(() => {});
      }
    } else if (this.pausedForHide) {
      this.pausedForHide = false;
      void ctx.resume().catch(() => {});
    }
  }
}

export const audio = new AudioCore();

type Voice = { id: number; src: AudioBufferSourceNode; gain: GainNode; end: number };

export type SfxLogEntry = { name: SfxName; at: number; result: string };
const devLog: SfxLogEntry[] = [];
function logPlay(name: SfxName, result: string): void {
  devLog.push({ name, at: Math.round(performance.now()), result });
}

class Sfx {
  enabled = loadPref(SOUND_KEY, true);
  private format = pickFormat();
  private bytes = new Map<SfxName, Promise<ArrayBuffer | null>>();
  private buffers = new Map<SfxName, { buf: AudioBuffer; offset: number }>();
  private last = new Map<SfxName, number>();
  private voices: Voice[] = [];
  private nextId = 1;
  private out: GainNode | null = null;
  private decoding = false;

  /** Download the files early (no context needed); decode once audio unlocks. */
  init(): void {
    if (this.enabled) this.prefetch();
    audio.onReady((ctx) => {
      this.out = ctx.createGain();
      this.out.gain.value = 0.9;
      this.out.connect(ctx.destination);
      if (this.enabled) void this.decodeAll(ctx);
    });
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    savePref(SOUND_KEY, on);
    if (!on) {
      for (const v of [...this.voices]) this.release(v, 0.02);
      return;
    }
    this.prefetch();
    if (audio.ctx) void this.decodeAll(audio.ctx);
  }

  /** Voices scheduled or playing right now. */
  get activeVoices(): number {
    const t = audio.ctx?.currentTime ?? 0;
    return this.voices.filter((v) => v.end > t).length;
  }

  /** Number of decoded sounds (for checks). */
  get loaded(): number {
    return this.buffers.size;
  }

  get fileFormat(): string {
    return this.format;
  }

  private fetchBytes(name: SfxName, format: string): Promise<ArrayBuffer | null> {
    return fetch(assetUrl(`sfx/${name}.${format}`))
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
  }

  private prefetch(): void {
    for (const name of SFX_NAMES) {
      if (!this.bytes.has(name)) this.bytes.set(name, this.fetchBytes(name, this.format));
    }
  }

  private async decodeAll(ctx: AudioContext): Promise<void> {
    if (this.decoding) return;
    this.decoding = true;
    await Promise.all(
      SFX_NAMES.map(async (name) => {
        if (this.buffers.has(name)) return;
        let buf: AudioBuffer | null = null;
        const bytes = await this.bytes.get(name);
        if (bytes) buf = await decode(ctx, bytes).catch(() => null);
        if (!buf && this.format !== 'mp3') {
          // Claimed ogg support but could not decode: fall back to mp3.
          const mp3 = await this.fetchBytes(name, 'mp3');
          if (mp3) buf = await decode(ctx, mp3).catch(() => null);
        }
        if (buf) this.buffers.set(name, { buf, offset: onset(buf) });
      }),
    );
    this.decoding = false;
  }

  /**
   * Play a sound now (or `delayMs` later on the audio clock). Returns a voice
   * id that `cancel` can stop, or 0 when nothing was scheduled.
   */
  play(name: SfxName, delayMs = 0): number {
    if (!this.enabled) {
      if (import.meta.env.DEV) logPlay(name, 'off');
      return 0;
    }
    const ctx = audio.ctx;
    // A suspended context would queue sounds and burst them later: drop instead.
    if (!ctx || ctx.state !== 'running' || !this.out) {
      if (import.meta.env.DEV) logPlay(name, 'locked');
      return 0;
    }
    const entry = this.buffers.get(name);
    if (!entry) {
      if (import.meta.env.DEV) logPlay(name, 'not-ready');
      return 0;
    }
    const now = performance.now() + delayMs;
    const prev = this.last.get(name);
    if (prev !== undefined && Math.abs(now - prev) < THROTTLE_MS) {
      if (import.meta.env.DEV) logPlay(name, 'throttled');
      return 0;
    }
    this.last.set(name, now);

    const t = ctx.currentTime;
    this.voices = this.voices.filter((v) => v.end > t);
    while (this.voices.length >= MAX_VOICES) this.release(this.voices[0]!, 0.015);

    const src = ctx.createBufferSource();
    src.buffer = entry.buf;
    const gain = ctx.createGain();
    gain.gain.value = VOLUME[name];
    src.connect(gain);
    gain.connect(this.out);
    const when = t + Math.max(0, delayMs) / 1000;
    src.start(when, entry.offset);
    const voice: Voice = { id: this.nextId++, src, gain, end: when + entry.buf.duration - entry.offset };
    this.voices.push(voice);
    src.onended = () => {
      this.voices = this.voices.filter((v) => v !== voice);
      gain.disconnect();
    };
    if (import.meta.env.DEV) logPlay(name, delayMs > 0 ? `scheduled+${Math.round(delayMs)}` : 'played');
    return voice.id;
  }

  /** Stop scheduled or playing voices (e.g. star chimes when the overlay closes). */
  cancel(ids: number[]): void {
    for (const id of ids) {
      const v = this.voices.find((x) => x.id === id);
      if (v) this.release(v, 0.02);
    }
  }

  private release(v: Voice, fade: number): void {
    this.voices = this.voices.filter((x) => x !== v);
    const ctx = audio.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    try {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(v.gain.gain.value, t);
      v.gain.gain.linearRampToValueAtTime(0, t + fade);
      v.src.stop(t + fade + 0.005);
    } catch {
      /* already stopped */
    }
  }
}

/** Seconds of leading silence to skip (pre-roll plus any mp3 encoder delay). */
function onset(buf: AudioBuffer): number {
  const data = buf.getChannelData(0);
  const max = Math.min(data.length, Math.floor(buf.sampleRate * 0.1));
  for (let i = 0; i < max; i++) {
    if (Math.abs(data[i]!) > ONSET_THRESHOLD) return Math.max(0, i / buf.sampleRate - ONSET_LEAD_S);
  }
  return 0;
}

export const sfx = new Sfx();

/** Dev-only: what the game asked to play, for automated checks. */
export function sfxDebug() {
  return {
    log: devLog,
    play: (name: SfxName, delayMs = 0) => sfx.play(name, delayMs),
    voices: () => sfx.activeVoices,
    loaded: () => sfx.loaded,
    format: sfx.fileFormat,
    state: () => audio.ctx?.state ?? 'none',
  };
}
