import { build, context } from 'esbuild';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const watch = process.argv.includes('--watch');
const library = process.argv.includes('--library');

if (watch && library) {
  throw new Error('Library watch is not supported; use npm run build:library for synchronized JS and declarations.');
}

const options = {
  bundle: true,
  sourcemap: false,
  minify: false,
  target: 'es2022',
  loader: { '.css': 'text' },
  logLevel: 'info',
};

const extensionEntries = [
  { format: 'iife', entryPoints: ['src/content/content.ts'], outfile: 'dist/content.js' },
  { format: 'esm', entryPoints: ['src/background/background.ts'], outfile: 'dist/background.js' },
  // MAIN-world 注入：供 DevTools $0 调用。
  { format: 'iife', entryPoints: ['src/inspected/inspected.ts'], outfile: 'dist/inspected.js' },
  // DevTools 面板。
  { format: 'iife', entryPoints: ['src/devtools/devtools.ts'], outfile: 'dist/devtools.js' },
  { format: 'iife', entryPoints: ['src/devtools/panel.ts'], outfile: 'dist/panel.js' },
];

const libraryEntry = {
  format: 'esm',
  entryPoints: ['src/library/index.ts'],
  outfile: 'dist/library/index.js',
  platform: 'browser',
};

// 需要原样拷到 dist/ 的静态 HTML（devtools_page / 面板）。
const statics = [
  ['src/devtools/devtools.html', 'dist/devtools.html'],
  ['src/devtools/panel.html', 'dist/panel.html'],
];

function buildDeclarations() {
  const declarationBuild = spawnSync(
    process.execPath,
    ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.library.json'],
    { stdio: 'inherit' },
  );
  if (declarationBuild.status !== 0) {
    throw new Error('Library declaration build failed');
  }

  cpSync('dist/content', 'dist/library/content', { recursive: true });
  const entryDeclaration = 'dist/library/index.d.ts';
  const declarationSource = readFileSync(entryDeclaration, 'utf8')
    .replaceAll("'../content/", "'./content/");
  writeFileSync(entryDeclaration, declarationSource);
  rewriteRelativeDeclarationSpecifiers('dist/library');
  writeFileSync('dist/library/.npmignore', '*.d.ts.map\n');
  rmSync('dist/content', { recursive: true, force: true });
}

function rewriteRelativeDeclarationSpecifiers(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      rewriteRelativeDeclarationSpecifiers(path);
    } else if (entry.name.endsWith('.d.ts')) {
      const source = readFileSync(path, 'utf8').replace(
        /(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g,
        (_match, prefix, specifier, suffix) => `${prefix}${specifier}.js${suffix}`,
      );
      writeFileSync(path, source);
    }
  }
}

if (library) {
  rmSync('dist/library', { recursive: true, force: true });
  rmSync('dist/content', { recursive: true, force: true });
  mkdirSync('dist/library', { recursive: true });
  await build({ ...options, ...libraryEntry });
  buildDeclarations();
} else {
  rmSync('dist', { recursive: true, force: true });
  mkdirSync('dist', { recursive: true });

  for (const [src, out] of statics) {
    if (existsSync(src)) copyFileSync(src, out);
  }

  if (watch) {
    const contexts = await Promise.all(extensionEntries.map((entry) => context({ ...options, ...entry })));
    await Promise.all(contexts.map((buildContext) => buildContext.watch()));

    const dispose = async () => {
      await Promise.all(contexts.map((buildContext) => buildContext.dispose()));
      process.exit(0);
    };
    process.once('SIGINT', () => { void dispose(); });
    process.once('SIGTERM', () => { void dispose(); });
  } else {
    await Promise.all(extensionEntries.map((entry) => build({ ...options, ...entry })));
  }
}
