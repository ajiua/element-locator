import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('DevTools panel page is relative to the extension root', async () => {
  const source = await readFile('src/devtools/devtools.ts', 'utf8');
  assert.match(source, /panels\.create\([^\n]+['"]dist\/panel\.html['"]/);
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
