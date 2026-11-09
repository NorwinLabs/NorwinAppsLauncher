// Pure helpers for reading GitHub release assets (kept dependency-free so they can be unit tested).

const OS_LABEL = { windows: 'Windows', macos: 'macOS', linux: 'Linux', android: 'Android', ios: 'iOS' };
const PLATFORM_TO_OS = { win32: 'windows', darwin: 'macos', linux: 'linux' };

// Work out which OS / CPU architecture a release asset is for, from its file name.
function classify(name) {
  if (/blockmap|\.ya?ml$|\.sig$|\.sha\d*$|\.txt$/i.test(name)) return null;
  let os = null;
  if (/\.(exe|msi|msix)$/i.test(name)) os = 'windows';
  else if (/\.(dmg|pkg)$/i.test(name) || /(mac|darwin|osx).*\.zip$/i.test(name)) os = 'macos';
  else if (/\.(appimage|deb|rpm|snap)$/i.test(name)) os = 'linux';
  else if (/\.apk$/i.test(name)) os = 'android';
  else if (/\.ipa$/i.test(name)) os = 'ios';
  if (!os) return null;
  const arch = /arm64|aarch64/i.test(name) ? 'arm64'
    : /universal/i.test(name) ? 'universal'
    : /x64|x86_64|amd64/i.test(name) ? 'x64'
    : /ia32|i386|\bx86\b/i.test(name) ? 'ia32'
    : null;
  return { os, arch };
}

// Choose the installable asset for this machine (.exe / .dmg / .AppImage).
function pickAsset(assets, platform, cpu) {
  const os = PLATFORM_TO_OS[platform];
  const ext = platform === 'win32' ? /\.exe$/i : platform === 'darwin' ? /\.dmg$/i : /\.AppImage$/i;
  const c = assets.filter((x) => ext.test(x.name) && classify(x.name)?.os === os);
  const want = cpu === 'arm64' ? 'arm64' : 'x64';
  const other = want === 'arm64' ? 'x64' : 'arm64';
  const arch = (x) => classify(x.name).arch;
  return c.find((x) => arch(x) === want)
    || c.find((x) => arch(x) === 'universal' || arch(x) === null)
    || c.find((x) => arch(x) !== other)
    || c[0];
}

// GitHub rewrites spaces etc. in asset names, so compare names loosely.
const normalizeName = (n) => String(n).toLowerCase().replace(/[^a-z0-9]/g, '');

// Parse electron-builder's latest*.yml into Map(normalizedFileName -> sha512 base64).
function parseChecksums(yml, into = new Map()) {
  const re = /(?:url|path):\s*['"]?(.+?)['"]?\s*\r?\n\s*sha512:\s*(\S+)/g;
  let m;
  while ((m = re.exec(yml))) into.set(normalizeName(m[1]), m[2].replace(/['"]/g, ''));
  return into;
}

const parts = (v) => String(v).replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10));

// True when `latest` is a newer version than `installed` (falls back to "different").
function isNewer(installed, latest) {
  if (!installed || !latest) return false;
  const a = parts(installed);
  const b = parts(latest);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return String(installed) !== String(latest);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (b[i] || 0) - (a[i] || 0);
    if (d) return d > 0;
  }
  return false;
}

module.exports = { OS_LABEL, PLATFORM_TO_OS, classify, pickAsset, normalizeName, parseChecksums, isNewer };
