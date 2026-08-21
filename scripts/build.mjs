import { build, context } from 'esbuild';
import { rmSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';

const watch = process.argv.includes('--watch');

const options = {
  bundle: true,
  sourcemap: false,
  minify: false,
  target: 'es2022',
  loader: { '.css': 'text' },
  logLevel: 'info',
};

const entries = [
  { format: 'iife', entryPoints: ['src/content/content.ts'], outfile: 'dist/content.js' },
  { format: 'esm', entryPoints: ['src/background/background.ts'], outfile: 'dist/background.js' },
  // MAIN-world 注入：供 DevTools $0 调用。
  { format: 'iife', entryPoints: ['src/inspected/inspected.ts'], outfile: 'dist/inspected.js' },
  // DevTools 面板。
  { format: 'iife', entryPoints: ['src/devtools/devtools.ts'], outfile: 'dist/devtools.js' },
  { format: 'iife', entryPoints: ['src/devtools/panel.ts'], outfile: 'dist/panel.js' },
];

// 需要原样拷到 dist/ 的静态 HTML（devtools_page / 面板）。
const statics = [
  ['src/devtools/devtools.html', 'dist/devtools.html'],
  ['src/devtools/panel.html', 'dist/panel.html'],
];

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

for (const [src, out] of statics) {
  if (existsSync(src)) copyFileSync(src, out);
}

if (watch) {
  const contexts = await Promise.all(entries.map((e) => context({ ...options, ...e })));
  await Promise.all(contexts.map((ctx) => ctx.watch()));

  const dispose = async () => {
    await Promise.all(contexts.map((ctx) => ctx.dispose()));
    process.exit(0);
  };
  process.once('SIGINT', () => { void dispose(); });
  process.once('SIGTERM', () => { void dispose(); });
} else {
  await Promise.all(entries.map((e) => build({ ...options, ...e })));
}
