import { assetUrl, audio, decode, loadPref, loadVolume, rampGain, savePref, saveVolume, sliderGain } from './audio.ts';

/** Which loop fits the screen: menu/map, normal levels and Bake-athon, boss levels. */
export type MusicScene = 'menu' | 'play' | 'boss';

type Track = {
  /** File base name in public/music/ (.ogg and .m4a). */
  file: string;
  /**
   * Loop region in seconds. Each file has 1 s of lead-in before loopStart
   * (a copy of the loop's tail) and 1 s after loopEnd (a copy of its head),
   * so the seam stays clean even if a decoder shifts the audio slightly.
   */
  loopStart: number;
  loopEnd: number;
};

/** Besky's Suno loops. Loop points come from the beat/bar analysis (see README). */
export const MUSIC_TRACKS: Partial<Record<MusicScene, Track>> = {
  // 'Café Jazz Loop': 32 bars, 80.84 s (source 7.024 s to 87.863 s)
  menu: { file: 'menu', loopStart: 1, loopEnd: 1 + 3565018 / 44100 },
  // 'Bakery Groove': 32 bars, 70.46 s (source 56.053 s to 126.513 s)
  play: { file: 'gameplay', loopStart: 1, loopEnd: 1 + 3107282 / 44100 },
  // 'Dough and Synth': 64 bars, 116.70 s (source 34.853 s to 151.555 s)
  boss: { file: 'boss', loopStart: 1, loopEnd: 1 + 5146545 / 44100 },
};

const MUSIC_KEY = 'cookies-and-crumbs-music';
const MUSIC_VOLUME_KEY = 'cookies-and-crumbs-music-volume';
export const MUSIC_VOLUME_DEFAULT = 70;
/** Music bus gain at 100%: 0.45 / 0.7^2, so 70% is the pre-slider level (0.45). */
export const MUSIC_GAIN_TOP = 0.45 / (0.7 * 0.7);
/** Crossfade between scenes and fade in/out on toggle, seconds. */
const FADE_S = 0.8;
/** Decoded tracks kept in memory (a decoded 2-minute stereo loop is ~40 MB). */
const KEEP_DECODED = 2;

/** AAC on Safari / iOS (no Vorbis there), Ogg elsewhere. */
function musicFormat(): 'm4a' | 'ogg' {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /^((?!chrome|chromium|crios|fxios|edg|android).)*safari/i.test(ua);
  if (iOS || safari) return 'm4a';
  try {
    return document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a';
  } catch {
    return 'm4a';
  }
}

type Playing = { file: string; src: AudioBufferSourceNode; gain: GainNode };

export type MusicLogEntry = { at: number; event: string; file?: string };
const devLog: MusicLogEntry[] = [];
function logMusic(event: string, file?: string): void {
  devLog.push({ at: Math.round(performance.now()), event, file });
}

class Music {
  enabled = loadPref(MUSIC_KEY, true);
  /** Slider value, 0-100. */
  volume = loadVolume(MUSIC_VOLUME_KEY, MUSIC_VOLUME_DEFAULT);
  private scene: MusicScene | null = null;
  private current: Playing | null = null;
  private format = musicFormat();
  /** Compressed bytes, fetched once and kept (small). */
  private bytes = new Map<string, Promise<ArrayBuffer | null>>();
  /** Decoded buffers, most recently used last. */
  private decoded = new Map<string, Promise<AudioBuffer | null>>();
  private out: GainNode | null = null;
  private applyGen = 0;
  private preloadTimer = 0;

  get available(): boolean {
    return Object.keys(MUSIC_TRACKS).length > 0;
  }

  /** Track file name now playing (or null). For checks. */
  get playing(): string | null {
    return this.current?.file ?? null;
  }

  /** Loop points and buffer length of the playing track. For checks. */
  get loopInfo(): { start: number; end: number; duration: number } | null {
    const src = this.current?.src;
    return src?.buffer ? { start: src.loopStart, end: src.loopEnd, duration: src.buffer.duration } : null;
  }

  init(): void {
    audio.onReady((ctx) => {
      this.out = ctx.createGain();
      this.out.gain.value = sliderGain(this.volume, MUSIC_GAIN_TOP);
      this.out.connect(audio.master ?? ctx.destination);
      void this.apply();
    });
  }

  /** Fetch the current scene's file early (after the art), without decoding. */
  prefetchCurrent(): void {
    const track = this.trackFor(this.scene);
    if (this.enabled && this.volume > 0 && track) void this.fetchBytes(track.file);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    savePref(MUSIC_KEY, on);
    void this.apply();
  }

  /** Live volume change; smooth, and 0 stops the track so it costs nothing. */
  setVolume(percent: number): void {
    const was = this.volume;
    this.volume = Math.max(0, Math.min(100, Math.round(percent)));
    saveVolume(MUSIC_VOLUME_KEY, this.volume);
    const ctx = audio.ctx;
    if (ctx && this.out) rampGain(this.out.gain, ctx, sliderGain(this.volume, MUSIC_GAIN_TOP));
    if ((was > 0) !== (this.volume > 0)) void this.apply();
  }

  /** Current music bus gain (for checks). */
  get busGain(): number | null {
    return this.out ? this.out.gain.value : null;
  }

  setScene(scene: MusicScene): void {
    if (scene === this.scene) return;
    this.scene = scene;
    void this.apply();
  }

  private trackFor(scene: MusicScene | null): Track | null {
    if (!scene) return null;
    return MUSIC_TRACKS[scene] ?? MUSIC_TRACKS.play ?? MUSIC_TRACKS.menu ?? null;
  }

  private wanted(): Track | null {
    return this.enabled && this.volume > 0 && this.available ? this.trackFor(this.scene) : null;
  }

  private fetchBytes(file: string, format: string = this.format): Promise<ArrayBuffer | null> {
    const key = `${file}.${format}`;
    let p = this.bytes.get(key);
    if (!p) {
      p = fetch(assetUrl(`music/${key}`))
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null);
      this.bytes.set(key, p);
    }
    return p;
  }

  private load(file: string): Promise<AudioBuffer | null> {
    let p = this.decoded.get(file);
    if (p) {
      // Mark as most recently used.
      this.decoded.delete(file);
      this.decoded.set(file, p);
      return p;
    }
    const ctx = audio.ctx!;
    p = (async () => {
      // decodeAudioData detaches its input, so decode a copy and keep the bytes.
      const bytes = await this.fetchBytes(file);
      let buf = bytes ? await decode(ctx, bytes.slice(0)).catch(() => null) : null;
      if (!buf && this.format === 'ogg') {
        const aac = await this.fetchBytes(file, 'm4a');
        buf = aac ? await decode(ctx, aac.slice(0)).catch(() => null) : null;
      }
      if (import.meta.env.DEV) logMusic(buf ? 'decoded' : 'decode-failed', file);
      return buf;
    })();
    this.decoded.set(file, p);
    while (this.decoded.size > KEEP_DECODED) {
      const oldest = this.decoded.keys().next().value!;
      if (oldest === this.current?.file) break;
      this.decoded.delete(oldest);
    }
    return p;
  }

  /** Crossfade to whatever the current scene and toggle call for. */
  private async apply(): Promise<void> {
    const ctx = audio.ctx;
    if (!ctx || !this.out) return;
    const gen = ++this.applyGen;
    const track = this.wanted();
    if ((track?.file ?? null) === (this.current?.file ?? null)) return;
    if (!track) {
      this.fadeOut();
      return;
    }
    // Fade the old scene out right away; the new one fades in once decoded.
    this.fadeOut();
    const buf = await this.load(track.file);
    if (gen !== this.applyGen || !buf || this.wanted()?.file !== track.file) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = track.loopStart;
    src.loopEnd = Math.min(track.loopEnd, buf.duration);
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + FADE_S);
    src.connect(gain);
    gain.connect(this.out);
    src.start(t, track.loopStart);
    this.current = { file: track.file, src, gain };
    if (import.meta.env.DEV) logMusic('play', track.file);
    this.preloadOthers();
  }

  /** After the first track starts, quietly fetch the other files (not decoded). */
  private preloadOthers(): void {
    if (this.preloadTimer) return;
    this.preloadTimer = window.setTimeout(() => {
      for (const t of Object.values(MUSIC_TRACKS)) if (t) void this.fetchBytes(t.file);
    }, 4000);
  }

  private fadeOut(): void {
    const ctx = audio.ctx;
    const cur = this.current;
    this.current = null;
    if (!ctx || !cur) return;
    const t = ctx.currentTime;
    cur.gain.gain.cancelScheduledValues(t);
    cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
    cur.gain.gain.linearRampToValueAtTime(0, t + FADE_S);
    cur.src.stop(t + FADE_S + 0.05);
    cur.src.onended = () => cur.gain.disconnect();
    if (import.meta.env.DEV) logMusic('fade-out', cur.file);
  }
}

export const music = new Music();

/** Dev-only: what music did, for automated checks. */
export function musicDebug() {
  return {
    log: devLog,
    playing: () => music.playing,
    loop: () => music.loopInfo,
    gain: () => music.busGain,
  };
}
