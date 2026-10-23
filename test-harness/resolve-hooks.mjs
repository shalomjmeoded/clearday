import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const stubsDir = join(dirname(fileURLToPath(import.meta.url)), 'stubs');

const STUBS = {
  'expo-sqlite': 'expo-sqlite.mjs',
  'react-native': 'react-native.ts',
  'expo-constants': 'expo-constants.ts',
  'expo-notifications': 'expo-notifications.cjs',
  'expo-document-picker': 'expo-document-picker.ts',
  'expo-file-system/legacy': 'expo-file-system-legacy.ts',
  'expo-sharing': 'expo-sharing.ts',
  'expo-router': 'expo-router.ts',
};

export function resolve(specifier, context, nextResolve) {
  const stub = STUBS[specifier];
  if (stub) {
    return {
      url: pathToFileURL(join(stubsDir, stub)).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
