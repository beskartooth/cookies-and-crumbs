import { assetUrl, audio, decode, loadPref, pickFormat, savePref } from './audio.ts';

/** Which loop fits the screen: menu/map, normal levels and Bake-athon, boss levels. */
export type MusicScene = 'menu' | 'play' | 'boss';

/**
 * Music loops, by scene. None exist yet, so music stays off and the Music
 * toggle stays hidden. To add one, put `public/music/<name>.ogg` and `.mp3`
 * in place and list the name here, e.g. `{ menu: 'menu', play: 'play', boss: 'boss' }`.
 * A scene without its own track falls back to `play` (and `boss` to `play`).
 * Optional loop points (seconds) trim intro/tail silence for a seamless loop.
 */
export const MUSIC_TRACKS: Partial<Record<MusicScene, string>> = {};
export const MUSIC_LOOPS: Record<string, { start: number; end: number }> = {};

const MUSIC_KEY = 'cookies-and-crumbs-music';
const MUSIC_VOLUME = 0.55;
/** Crossfade between scenes, seconds. */
const FADE_S = 1.2;

type Playing = { track: string; src: AudioBufferSourceNode; gain: GainNode };

class Music {
  enabled = loadPref(MUSIC_KEY, true);
  private scene: MusicScene | null = null;
  private current: Playing | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private out: GainNode | null = null;
  private format = pickFormat();

  /** True once at least one track is listed. */
  get available(): boolean {
    return Object.keys(MUSIC_TRACKS).length > 0;
  }

  init(): void {
    audio.onReady((ctx) => {
      this.out = ctx.createGain();
      this.out.gain.value = MUSIC_VOLUME;
      this.out.connect(ctx.destination);
      void this.apply();
    });
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    savePref(MUSIC_KEY, on);
    void this.apply();
  }

  setScene(scene: MusicScene): void {
    if (scene === this.scene) return;
    this.scene = scene;
    void this.apply();
  }

  private trackFor(scene: MusicScene | null): string | null {
    if (!scene) return null;
    return MUSIC_TRACKS[scene] ?? MUSIC_TRACKS.play ?? MUSIC_TRACKS.menu ?? null;
  }

  private load(track: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(track);
    if (!p) {
      const ctx = audio.ctx!;
      p = fetch(assetUrl(`music/${track}.${this.format}`))
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((b) => (b ? decode(ctx, b) : null))
        .catch(() => null);
      this.buffers.set(track, p);
    }
    return p;
  }

  /** Crossfade to whatever the current scene and toggle call for. */
  private async apply(): Promise<void> {
    const ctx = audio.ctx;
    if (!ctx || !this.out) return;
    const track = this.enabled && this.available ? this.trackFor(this.scene) : null;
    if (track === (this.current?.track ?? null)) return;
    if (!track) {
      this.fadeOut();
      return;
    }
    const buf = await this.load(track);
    // The scene may have changed while loading.
    const want = this.enabled && this.available ? this.trackFor(this.scene) : null;
    if (!buf || want !== track || this.current?.track === track) return;
    this.fadeOut();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true; // sample-accurate, gapless
    const loop = MUSIC_LOOPS[track];
    if (loop) {
      src.loopStart = loop.start;
      src.loopEnd = loop.end;
    }
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + FADE_S);
    src.connect(gain);
    gain.connect(this.out);
    src.start(t);
    this.current = { track, src, gain };
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
  }
}

export const music = new Music();
