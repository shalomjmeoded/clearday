/** expo-file-system/legacy stub backed by the real filesystem (temp dir). */
import { mkdtempSync } from 'node:fs';
import { copyFile, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const cacheDirectory = `${mkdtempSync(join(tmpdir(), 'clearday-test-'))}/`;

export const EncodingType = { UTF8: 'utf8' as const };

export async function writeAsStringAsync(
  uri: string,
  contents: string
): Promise<void> {
  await writeFile(uri, contents, 'utf8');
}

export async function readAsStringAsync(uri: string): Promise<string> {
  return readFile(uri, 'utf8');
}


function fromUri(uri: string): string {
  return uri.replace(/^file:\/\//, '');
}

export async function getInfoAsync(
  uri: string
): Promise<{ exists: boolean; modificationTime?: number; size?: number }> {
  try {
    const info = await stat(fromUri(uri));
    return { exists: true, modificationTime: info.mtimeMs / 1000, size: info.size };
  } catch {
    return { exists: false };
  }
}

export async function copyAsync(options: { from: string; to: string }): Promise<void> {
  await copyFile(fromUri(options.from), fromUri(options.to));
}
