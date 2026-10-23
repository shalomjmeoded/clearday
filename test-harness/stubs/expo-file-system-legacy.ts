/** expo-file-system/legacy stub backed by the real filesystem (temp dir). */
import { mkdtempSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
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
