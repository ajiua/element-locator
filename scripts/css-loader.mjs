// CSS loader for the node:test runner.
//
// panel.ts does `import cssText from "../styles/panel.css"`, which esbuild
// inlines at bundle time (loader: { '.css': 'text' }). Under the plain
// node:test + tsx runner Node cannot load a ".css" file (ERR_UNKNOWN_FILE_EXTENSION),
// so these hooks serve any "*.css" module as a JS module default-exporting its text.
//
// Usage: node --experimental-loader ./scripts/css-loader.mjs --import tsx --test ...

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  // Let the normal chain resolve first; we only special-case the final load.
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.css')) {
    const fn = url.startsWith('file:') ? fileURLToPath(url) : url;
    const source = readFileSync(fn, 'utf8');
    return {
      format: 'module',
      source: `export default ${JSON.stringify(source)};`,
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
