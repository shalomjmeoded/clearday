// CJS counterpart of resolve-hooks.mjs: tsx compiles the TS files to CommonJS
// (package has no "type": "module"), so stub redirection must happen in the
// CJS resolver as well.
const Module = require('node:module');
const path = require('node:path');

const STUBS = {
  'expo-sqlite': 'expo-sqlite.mjs',
  'react-native': 'react-native.ts',
  'expo-constants': 'expo-constants.ts',
  'expo-notifications': 'expo-notifications.cjs',
  'expo-document-picker': 'expo-document-picker.ts',
  'expo-file-system/legacy': 'expo-file-system-legacy.ts',
  'expo-sharing': 'expo-sharing.ts',
};

const original = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (STUBS[request]) {
    return path.join(__dirname, 'stubs', STUBS[request]);
  }
  return original.call(this, request, ...args);
};
