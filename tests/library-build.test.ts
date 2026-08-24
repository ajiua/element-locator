import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

async function runBuild() {
  const child = spawn(npmCommand, ['run', 'build'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { output += chunk; });
  child.stderr.on('data', (chunk: string) => { output += chunk; });
  const [code] = await once(child, 'exit');
  return { code, output };
}

test('完整构建保留扩展与库的全部消费产物', async () => {
  const build = await runBuild();
  assert.equal(build.code, 0, build.output);

  const outputs = [
    'dist/content.js',
    'dist/background.js',
    'dist/devtools.js',
    'dist/panel.js',
    'dist/inspected.js',
    'dist/devtools.html',
    'dist/panel.html',
    'dist/library/index.js',
    'dist/library/index.d.ts',
  ];

  for (const output of outputs) {
    assert.equal(existsSync(output), true, `${output} should exist after npm run build`);
  }
});

test('默认测试命令覆盖全部 library 回归测试', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts: { test: string };
  };

  assert.match(packageJson.scripts.test, /tests\/library-api\.test\.ts/);
  assert.match(packageJson.scripts.test, /tests\/library-build\.test\.ts/);
});

test('最终 library bundle 仅包含定位算法，不含扩展交互或 UI 副作用', async () => {
  const build = await runBuild();
  assert.equal(build.code, 0, build.output);

  const bundle = readFileSync('dist/library/index.js', 'utf8');
  // CSS 选择器算法是库的正当能力；不能以笼统的 "css" 字符串扫描造成误报。
  assert.match(bundle, /function escapeCssIdentifier\b/);

  const forbidden = [
    /\bchrome\b/,
    /\.addEventListener\s*\(/,
    /\b(?:renderLocatorWithPick|showPanel|createContextMenu)\s*\(/,
    /(?:<style>|style\.cssText|createElement\(\s*['"]style['"]\s*\)|insertAdjacentHTML\s*\()/,
  ];
  for (const pattern of forbidden) {
    assert.doesNotMatch(bundle, pattern, `library bundle must not contain ${pattern}`);
  }
});
