import { randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

export const PANDA_LOCAL_STATE_VERSION = 1 as const;

export function stateDirectory(
  dataDirectory: string,
  collection: "executions" | "goals",
): string {
  return join(dataDirectory, "state", collection);
}

export function persistedRecordPath(directory: string, id: string): string {
  const key = Buffer.from(id, "utf8").toString("base64url");
  return join(directory, `${key}.json`);
}

export function listPersistedRecordFiles(directory: string): string[] {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(directory, entry.name))
    .sort();
}

export function readPersistedJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

/**
 * Replaces one state snapshot atomically and asks the operating system to flush
 * both the file and its containing directory before returning.
 */
export function writePersistedJson(path: string, value: unknown): void {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = join(
    directory,
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let descriptor: number | undefined;

  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value, undefined, 2)}\n`, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, path);
    syncDirectory(directory);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the original persistence error.
      }
    }
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function describePersistenceError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function syncDirectory(directory: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } catch {
    // Some supported filesystems do not allow opening or syncing directories.
    // The snapshot rename remains atomic, but that platform cannot provide the
    // stronger directory-flush guarantee.
  } finally {
    if (descriptor !== undefined) {
      closeSync(descriptor);
    }
  }
}
