const test = require('node:test');
const assert = require('node:assert');
const { classify, pickAsset, parseChecksums, normalizeName, isNewer } = require('../lib/assets');

const A = (...names) => names.map((name) => ({ name }));

test('classify detects OS and architecture', () => {
  assert.deepStrictEqual(classify('App-Setup-1.0.exe'), { os: 'windows', arch: null });
  assert.deepStrictEqual(classify('App-1.0-arm64.dmg'), { os: 'macos', arch: 'arm64' });
  assert.deepStrictEqual(classify('App-1.0-mac.zip'), { os: 'macos', arch: null });
  assert.deepStrictEqual(classify('App-1.0-x86_64.AppImage'), { os: 'linux', arch: 'x64' });
  assert.deepStrictEqual(classify('app.apk'), { os: 'android', arch: null });
  assert.deepStrictEqual(classify('app.ipa'), { os: 'ios', arch: null });
});

test('classify ignores metadata files', () => {
  for (const n of ['latest.yml', 'latest-mac.yml', 'App.exe.blockmap', 'notes.txt']) assert.strictEqual(classify(n), null);
});

test('pickAsset prefers the matching architecture', () => {
  const assets = A('App-1.0-arm64.dmg', 'App-1.0-x64.dmg', 'App-Setup-1.0.exe', 'App-1.0.AppImage');
  assert.strictEqual(pickAsset(assets, 'darwin', 'arm64').name, 'App-1.0-arm64.dmg');
  assert.strictEqual(pickAsset(assets, 'darwin', 'x64').name, 'App-1.0-x64.dmg');
  assert.strictEqual(pickAsset(assets, 'win32', 'x64').name, 'App-Setup-1.0.exe');
  assert.strictEqual(pickAsset(assets, 'linux', 'x64').name, 'App-1.0.AppImage');
});

test('pickAsset returns undefined when nothing fits and avoids the wrong arch', () => {
  assert.strictEqual(pickAsset(A('App.exe'), 'linux', 'x64'), undefined);
  assert.strictEqual(pickAsset(A('App-arm64.dmg'), 'darwin', 'x64').name, 'App-arm64.dmg'); // last resort
  assert.strictEqual(pickAsset(A('App-arm64.dmg', 'App.dmg'), 'darwin', 'x64').name, 'App.dmg');
});

test('parseChecksums reads electron-builder yml and matches renamed assets', () => {
  const yml = `version: 1.0.0
files:
  - url: Norwin Apps Setup 1.0.0.exe
    sha512: AAAA==
    size: 10
path: Norwin Apps Setup 1.0.0.exe
sha512: AAAA==
`;
  const m = parseChecksums(yml);
  assert.strictEqual(m.get(normalizeName('Norwin.Apps.Setup.1.0.0.exe')), 'AAAA==');
});

test('isNewer compares versions', () => {
  assert.ok(isNewer('0.2.1', 'v0.2.2'));
  assert.ok(isNewer('0.9.0', '0.10.0'));
  assert.ok(!isNewer('1.0.0', '1.0.0'));
  assert.ok(!isNewer('1.2.0', '1.1.9'));
  assert.ok(!isNewer('', '1.0.0'));
});
