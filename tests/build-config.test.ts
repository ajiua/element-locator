import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

async function run(command: string, args: string[]) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32' && command === npmCommand,
  });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { output += chunk; });
  child.stderr.on('data', (chunk: string) => { output += chunk; });
  const [code] = await once(child, 'exit');
  return { code, output };
}

test('DevTools panel page is relative to the extension root', async () => {
  const source = await readFile('src/devtools/devtools.ts', 'utf8');
  assert.match(source, /panels\.create\([^\n]+['"]dist\/panel\.html['"]/);
});

test('build emits an ESM library entry and its type declarations', async () => {
  const { code } = await run(npmCommand, ['run', 'build']);

  assert.equal(code, 0, 'build should succeed');

  const libraryEntry = 'dist/library/index.js';
  const declaration = 'dist/library/index.d.ts';
  const declarationMap = 'dist/library/index.d.ts.map';
  assert.equal(existsSync(libraryEntry), true, `${libraryEntry} should exist`);
  assert.equal(existsSync(declaration), true, `${declaration} should exist`);
  assert.equal(existsSync(declarationMap), true, `${declarationMap} should exist`);

  const source = await readFile(libraryEntry, 'utf8');
  const declarationSource = await readFile(declaration, 'utf8');
  assert.match(source, /generateLocator/);
  assert.doesNotMatch(source, /chrome\.contextMenus/);
  assert.match(declarationSource, /generateLocator/);
});

test('build commands separate extension, library, and extension watch outputs', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(packageJson.scripts.build, 'npm run build:extension && npm run build:library');
  assert.equal(packageJson.scripts['build:extension'], 'node scripts/build.mjs --extension');
  assert.equal(packageJson.scripts['build:library'], 'node scripts/build.mjs --library');
  assert.equal(packageJson.scripts.watch, 'node scripts/build.mjs --extension --watch');

  const extensionBuild = await run(npmCommand, ['run', 'build:extension']);
  assert.equal(extensionBuild.code, 0, extensionBuild.output);
  assert.equal(existsSync('dist/content.js'), true);
  assert.equal(existsSync('dist/library/index.js'), false);

  const libraryBuild = await run(npmCommand, ['run', 'build:library']);
  assert.equal(libraryBuild.code, 0, libraryBuild.output);
  assert.equal(existsSync('dist/library/index.js'), true);
  assert.equal(existsSync('dist/content.js'), true, 'library build preserves extension artifacts');
});

test('library declaration resolves under NodeNext when only dist/library is available', async () => {
  const build = await run(npmCommand, ['run', 'build:library']);
  assert.equal(build.code, 0, build.output);

  const contractDir = await mkdtemp(join(process.cwd(), '.library-contract-'));
  try {
    const isolatedLibrary = join(contractDir, 'library');
    await cp('dist/library', isolatedLibrary, { recursive: true });
    const consumer = join(contractDir, 'consumer.ts');
    await writeFile(
      consumer,
      "import { generateLocator, type LocatorResult } from './library/index.js';\nvoid generateLocator;\ndeclare const result: LocatorResult;\nvoid result;\n",
    );

    const typecheck = await run(process.execPath, [
      'node_modules/typescript/bin/tsc',
      '--noEmit',
      '--module', 'nodenext',
      '--moduleResolution', 'nodenext',
      '--target', 'es2022',
      '--lib', 'ES2022,DOM',
      consumer,
    ]);
    assert.equal(typecheck.code, 0, typecheck.output);
  } finally {
    await rm(contractDir, { recursive: true, force: true });
  }
});

test('packed library contains no extension artifacts or source declarations', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(packageJson.types, './dist/library/index.d.ts');
  assert.deepEqual(packageJson.files, ['dist/library', 'LICENSE', 'README.md']);
  assert.deepEqual(packageJson.exports, {
    '.': {
      types: './dist/library/index.d.ts',
      import: './dist/library/index.js',
    },
  });

  const cacheDir = await mkdtemp(join(process.cwd(), '.npm-pack-cache-'));
  try {
    const packed = await run(npmCommand, ['pack', '--dry-run', '--json', '--cache', cacheDir]);
    assert.equal(packed.code, 0, packed.output);
    const [{ files }] = JSON.parse(packed.output) as [{ files: Array<{ path: string }> }];
    assert(files.every(({ path }) => (
      path === 'package.json'
      || path === 'LICENSE'
      || path === 'README.md'
      || path.startsWith('dist/library/')
    )));
    assert.equal(files.some(({ path }) => path.startsWith('dist/content')), false);
    assert.equal(files.some(({ path }) => path.endsWith('.d.ts.map')), false);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test('watch mode completes an initial build and stays active', async () => {
  const child = spawn(process.execPath, ['scripts/build.mjs', '--watch'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { output += chunk; });
  child.stderr.on('data', (chunk: string) => { output += chunk; });

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`watch startup timed out:\n${output}`)), 8_000);
      const poll = setInterval(() => {
        const outputs = [
          'dist/background.js',
          'dist/content.js',
          'dist/devtools.html',
          'dist/devtools.js',
          'dist/inspected.js',
          'dist/panel.html',
          'dist/panel.js',
        ];
        const buildStarted = /watching for changes|build finished/i.test(output);
        if (buildStarted && outputs.every((file) => existsSync(file))) {
          clearInterval(poll);
          clearTimeout(timeout);
          resolve();
        }
      }, 25);
      child.once('exit', (code) => {
        clearInterval(poll);
        clearTimeout(timeout);
        reject(new Error(`watch exited early with code ${code}:\n${output}`));
      });
    });
    assert.equal(child.exitCode, null);
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  }
});
