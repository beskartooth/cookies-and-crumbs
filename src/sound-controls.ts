/**
 * Sound controls shared by Settings and the in-game Sound sheet.
 *
 * Every control reads and writes the same saved per-device settings
 * (`sound`, `sfx-volume`, `music`, `music-volume`; defaults SFX 80%, music
 * 70%) through `sfx` and `music`, so changes apply live (music, one-shots and
 * the Cherry Bomb fuse loops all run through those two buses) and are saved
 * at once. Any change repaints every bound control, so Settings and the sheet
 * never disagree.
 *
 * Mute all and Quiet mode are one-tap presets. Before applying one, the
 * current levels are saved (`sound-restore`); tapping the lit preset again
 * puts them back. Touching any switch or slider by hand forgets the saved
 * levels, since the player has picked new ones.
 */
import { SFX_VOLUME_DEFAULT, sfx } from './audio.ts';
import { MUSIC_VOLUME_DEFAULT, music } from './music.ts';
import { storageKey } from './storage.ts';

export type SoundState = { musicOn: boolean; musicVol: number; sfxOn: boolean; sfxVol: number };

/** Quiet mode: music off, effects soft. TUNE HERE. */
export const QUIET_PRESET: SoundState = { musicOn: false, musicVol: -1, sfxOn: true, sfxVol: 30 };
/** Below this (loudest audible channel, 0-100) the speaker icon shows "low". */
export const LOW_VOLUME = 40;

const RESTORE_KEY = storageKey('sound-restore');
const listeners: (() => void)[] = [];

export function soundState(): SoundState {
  return { musicOn: music.enabled, musicVol: music.volume, sfxOn: sfx.enabled, sfxVol: sfx.volume };
}

export function onSoundChange(fn: () => void): void {
  listeners.push(fn);
}

function emit(): void {
  for (const fn of listeners) fn();
}

function loadRestore(): SoundState | null {
  try {
    const p: unknown = JSON.parse(localStorage.getItem(RESTORE_KEY) ?? 'null');
    if (p && typeof p === 'object') {
      const s = p as Record<string, unknown>;
      const vol = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Math.round(Number(v)))) : d);
      return {
        musicOn: s.musicOn !== false,
        musicVol: vol(s.musicVol, MUSIC_VOLUME_DEFAULT),
        sfxOn: s.sfxOn !== false,
        sfxVol: vol(s.sfxVol, SFX_VOLUME_DEFAULT),
      };
    }
  } catch {
    /* bad JSON or blocked storage */
  }
  return null;
}

function saveRestore(s: SoundState | null): void {
  try {
    if (s) localStorage.setItem(RESTORE_KEY, JSON.stringify(s));
    else localStorage.removeItem(RESTORE_KEY);
  } catch {
    /* blocked storage */
  }
}

/** Apply a whole state (a negative volume means "leave that slider alone"). */
function apply(s: SoundState): void {
  if (s.musicVol >= 0 && s.musicVol !== music.volume) music.setVolume(s.musicVol);
  if (s.musicOn !== music.enabled) music.setEnabled(s.musicOn);
  if (s.sfxVol >= 0 && s.sfxVol !== sfx.volume) sfx.setVolume(s.sfxVol);
  if (s.sfxOn !== sfx.enabled) sfx.setEnabled(s.sfxOn);
}

// ---------- Manual changes (switches and sliders) ----------

export function setMusicOn(on: boolean): void {
  saveRestore(null);
  music.setEnabled(on);
  emit();
}
export function setMusicVolume(v: number): void {
  saveRestore(null);
  music.setVolume(v);
  // Moving the slider up means "I want to hear this": turn the switch on.
  if (v > 0 && !music.enabled) music.setEnabled(true);
  emit();
}
export function setSfxOn(on: boolean): void {
  saveRestore(null);
  sfx.setEnabled(on);
  emit();
}
export function setSfxVolume(v: number): void {
  saveRestore(null);
  sfx.setVolume(v);
  if (v > 0 && !sfx.enabled) sfx.setEnabled(true);
  emit();
}

// ---------- Presets ----------

/** Loudest channel the player can actually hear, 0-100. */
export function audibleLevel(s = soundState()): number {
  const m = s.musicOn && music.available ? s.musicVol : 0;
  const f = s.sfxOn ? s.sfxVol : 0;
  return Math.max(m, f);
}

export type SpeakerLevel = 'muted' | 'low' | 'normal';

export function speakerLevel(): SpeakerLevel {
  const n = audibleLevel();
  return n <= 0 ? 'muted' : n < LOW_VOLUME ? 'low' : 'normal';
}

export function isMuted(): boolean {
  const s = soundState();
  return !s.sfxOn && !(s.musicOn && music.available);
}

export function isQuiet(): boolean {
  const s = soundState();
  return !s.musicOn && s.sfxOn && s.sfxVol === QUIET_PRESET.sfxVol && loadRestore() !== null;
}

/** Remember the levels the presets will restore (the first preset keeps them). */
function rememberCurrent(): void {
  if (!loadRestore()) saveRestore(soundState());
}

/** Restore what was there before Mute all / Quiet mode. */
export function restoreSound(): void {
  const prev = loadRestore();
  saveRestore(null);
  if (prev) {
    // Restoring to silence would look broken: bring the effects back at least.
    if (!prev.sfxOn && !prev.musicOn) prev.sfxOn = true;
    apply(prev);
  } else {
    // Muted from Settings with nothing saved: turn both on at their sliders.
    apply({
      musicOn: true,
      musicVol: music.volume > 0 ? -1 : MUSIC_VOLUME_DEFAULT,
      sfxOn: true,
      sfxVol: sfx.volume > 0 ? -1 : SFX_VOLUME_DEFAULT,
    });
  }
  emit();
}

/** One tap: everything off (sliders keep their values). Tap again to restore. */
export function toggleMuteAll(): void {
  if (isMuted()) {
    restoreSound();
    return;
  }
  rememberCurrent();
  apply({ musicOn: false, musicVol: -1, sfxOn: false, sfxVol: -1 });
  emit();
}

/** One tap: Quiet mode (music off, effects soft). Tap again to restore. */
export function toggleQuiet(): void {
  if (isQuiet()) {
    restoreSound();
    return;
  }
  rememberCurrent();
  apply(QUIET_PRESET);
  emit();
}

// ---------- DOM ----------

const SPEAKER_BODY = 'M4 9.5h3.2L12 5.2v13.6l-4.8-4.3H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z';
const SPEAKER_PATHS: Record<SpeakerLevel, string> = {
  muted: `<path fill="currentColor" d="${SPEAKER_BODY}"/><path d="m15.5 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  low: `<path fill="currentColor" d="${SPEAKER_BODY}"/><path d="M15.2 9.3a3.8 3.8 0 0 1 0 5.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  normal: `<path fill="currentColor" d="${SPEAKER_BODY}"/><path d="M15.2 9.3a3.8 3.8 0 0 1 0 5.4M17.9 6.6a7.6 7.6 0 0 1 0 10.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
};

/** Repaint every speaker button (`[data-sound-btn]`) for the current state. */
export function paintSpeakers(): void {
  const level = speakerLevel();
  const label = level === 'muted' ? 'Sound: muted' : level === 'low' ? 'Sound: low' : 'Sound';
  for (const btn of document.querySelectorAll<HTMLElement>('[data-sound-btn]')) {
    if (btn.dataset.level === level) continue;
    btn.dataset.level = level;
    btn.setAttribute('aria-label', label);
    btn.title = label;
    const svg = btn.querySelector('svg');
    if (svg) svg.innerHTML = SPEAKER_PATHS[level];
  }
}

export type VolumeChannel = {
  getOn: () => boolean;
  setOn: (on: boolean) => void;
  getVolume: () => number;
  setVolume: (percent: number) => void;
  /** Played when the slider is released (SFX preview). */
  onRelease?: () => void;
};

export const MUSIC_CHANNEL: VolumeChannel = {
  getOn: () => music.enabled,
  setOn: setMusicOn,
  getVolume: () => music.volume,
  setVolume: setMusicVolume,
};

export function sfxChannel(onRelease?: () => void): VolumeChannel {
  return { getOn: () => sfx.enabled, setOn: setSfxOn, getVolume: () => sfx.volume, setVolume: setSfxVolume, onRelease };
}

/**
 * Wire one volume row (`.setting-row` holding a `.setting-switch`, a
 * `.volume-slider` and a `.setting-value`). It repaints on every change made
 * anywhere, so all rows stay in sync.
 */
export function bindVolumeRow(row: HTMLElement, ch: VolumeChannel): void {
  const btn = row.querySelector<HTMLButtonElement>('.setting-switch');
  const slider = row.querySelector<HTMLInputElement>('.volume-slider');
  const out = row.querySelector<HTMLElement>('.setting-value');
  if (!btn || !slider || !out) throw new Error('Volume row markup is missing');
  const paint = () => {
    const on = ch.getOn();
    const v = ch.getVolume();
    btn.setAttribute('aria-checked', String(on));
    btn.classList.toggle('is-on', on);
    btn.querySelector('.setting-state')!.textContent = on ? 'On' : 'Off';
    row.classList.toggle('is-muted', !on);
    if (document.activeElement !== slider || slider.value !== String(v)) slider.value = String(v);
    slider.setAttribute('aria-valuetext', on ? `${v}%` : `${v}%, off`);
    slider.style.setProperty('--fill', `${v}%`);
    out.textContent = `${v}%`;
  };
  btn.addEventListener('click', () => ch.setOn(!ch.getOn()));
  slider.addEventListener('input', () => ch.setVolume(Number(slider.value)));
  slider.addEventListener('change', () => ch.onRelease?.());
  onSoundChange(paint);
  paint();
}
