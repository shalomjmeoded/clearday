// Registers a resolve hook that redirects native/Expo modules to test stubs
// for every importer (src files included). Register AFTER tsx (--import tsx
// first) so this hook runs first in the chain.
import { register } from 'node:module';

register(new URL('./resolve-hooks.mjs', import.meta.url));
