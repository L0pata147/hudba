import { File, Paths } from 'expo-file-system';
import { create } from 'zustand';

/**
 * Crash log: the last crash is written to files/sonora-crash.txt — native ones by
 * the handler the with-crash-log config plugin installs in MainApplication, JS
 * ones by the global handler below — and shown on the next start, so it can be
 * shared instead of the app just closing.
 */
const NAME = 'sonora-crash.txt';

const file = () => new File(Paths.document, NAME);

/** Writes synchronously, so it lands before the process goes down. */
export function recordCrash(text: string) {
  try {
    file().write(text.slice(0, 20_000));
  } catch {
    // nothing more we can do
  }
}

export function readCrash(): string | null {
  try {
    const f = file();
    return f.exists ? f.textSync() : null;
  } catch {
    return null;
  }
}

export function clearCrash() {
  try {
    const f = file();
    if (f.exists) f.delete();
  } catch {
    // ignore
  }
}

export function describeCrash(error: unknown, extra?: string): string {
  const e = error instanceof Error ? error : new Error(String(error));
  return [`${e.name}: ${e.message}`, e.stack ?? '', extra ?? ''].filter(Boolean).join('\n');
}

interface ErrorUtilsLike {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}

let installed = false;
/** Records fatal JS errors before React Native's own handler ends the app. */
export function installJsCrashHandler() {
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (installed || !utils) return;
  installed = true;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    if (isFatal) recordCrash(`JS crash ${new Date().toISOString()}\n${describeCrash(error)}`);
    previous(error, isFatal);
  });
}

/** The crash from the previous run (read once at start-up), until dismissed. */
export const useCrashReport = create<{ text: string | null; load(): void; dismiss(): void }>((set) => ({
  text: null,
  load: () => set({ text: readCrash() }),
  dismiss: () => {
    clearCrash();
    set({ text: null });
  },
}));
