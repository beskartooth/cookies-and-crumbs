/**
 * localStorage key names. Every key is `<prefix>-<name>`. The prefix is
 * `cookies-and-crumbs` unless the build sets VITE_STORAGE_PREFIX, which a
 * hidden test build uses so it can share an origin with the live game
 * without touching its saves.
 */
const LIVE_PREFIX = 'cookies-and-crumbs';
const PREFIX: string = import.meta.env.VITE_STORAGE_PREFIX || LIVE_PREFIX;

export function storageKey(name: string): string {
  return `${PREFIX}-${name}`;
}

/** Saves a test build copies (read only) from the live game the first time it runs. */
const COPY_FROM_LIVE = ['unlocked', 'stars', 'save-version', 'sound', 'sfx-volume', 'music', 'music-volume'];

/**
 * Test builds only: start from the live game's progress and settings, once.
 * Reads the live keys and writes only this build's own keys, so the live save
 * is never changed. Boosters are not copied.
 */
export function seedFromLive(): void {
  if (PREFIX === LIVE_PREFIX) return;
  try {
    const marker = storageKey('seeded');
    if (localStorage.getItem(marker) !== null) return;
    for (const name of COPY_FROM_LIVE) {
      const value = localStorage.getItem(`${LIVE_PREFIX}-${name}`);
      if (value !== null) localStorage.setItem(storageKey(name), value);
    }
    localStorage.setItem(marker, '1');
  } catch {
    /* private mode or blocked storage */
  }
}
