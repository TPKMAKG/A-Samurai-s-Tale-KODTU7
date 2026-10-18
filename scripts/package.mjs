import { existsSync, mkdirSync, copyFileSync, cpSync, renameSync, rmSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const BUILDS = path.join(ROOT, 'builds');
const CACHE = path.join(BUILDS, 'cache');

mkdirSync(BUILDS, { recursive: true });
mkdirSync(CACHE, { recursive: true });

// Ensure Vite build is up to date
console.log('==> Ensuring production build in dist/...');
execSync('npm.cmd run build', { stdio: 'inherit' });

// NW.js package.json manifest for desktop window
const appManifest = {
  name: 'a-samurais-tale',
  description: "A Samurai's Tale",
  main: 'index.html',
  window: {
    title: "A Samurai's Tale",
    width: 960,
    height: 540,
    min_width: 640,
    min_height: 360,
    position: 'center',
    resizable: true,
    fullscreen: false
  }
};

const NW_VERSION = 'v0.88.0';

// Helper to download via curl if not cached
function download(url, dest) {
  if (existsSync(dest)) {
    console.log(`==> Using cached ${path.basename(dest)}`);
    return;
  }
  console.log(`==> Downloading ${url} ...`);
  execSync(`curl.exe -L -f -o "${dest}" "${url}"`, { stdio: 'inherit' });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. WINDOWS BUILD
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n========================================');
console.log('Building Windows Package...');
console.log('========================================');

const winZipUrl = `https://dl.nwjs.io/${NW_VERSION}/nwjs-${NW_VERSION}-win-x64.zip`;
const winZipPath = path.join(CACHE, `nwjs-${NW_VERSION}-win-x64.zip`);
download(winZipUrl, winZipPath);

const winOutputDir = path.join(BUILDS, 'a-samurais-tale-windows');
if (existsSync(winOutputDir)) rmSync(winOutputDir, { recursive: true, force: true });
mkdirSync(winOutputDir, { recursive: true });

console.log('==> Extracting NW.js Windows runtime...');
execSync(`tar.exe -xf "${winZipPath}" --strip-components=1 -C "${winOutputDir}"`, { stdio: 'inherit' });

// Rename nw.exe to game executable
const oldExe = path.join(winOutputDir, 'nw.exe');
const newExe = path.join(winOutputDir, 'a-samurais-tale.exe');
if (existsSync(oldExe)) {
  renameSync(oldExe, newExe);
  copyFileSync(newExe, path.join(winOutputDir, 'autumns-vengeance.exe'));
}

// Copy dist contents & manifest into the root of the app directory
console.log('==> Bundling game assets into Windows package...');
cpSync(DIST, winOutputDir, { recursive: true });
writeFileSync(path.join(winOutputDir, 'package.json'), JSON.stringify(appManifest, null, 2));

// Create gamename-windows.zip
console.log('==> Creating Windows archives...');
const winZipOut1 = path.join(ROOT, 'a-samurais-tale-windows.zip');
const winZipOut2 = path.join(ROOT, 'autumns-vengeance-windows.zip');
if (existsSync(winZipOut1)) rmSync(winZipOut1);
if (existsSync(winZipOut2)) rmSync(winZipOut2);

execSync(`tar.exe -a -cf "${winZipOut1}" -C "${BUILDS}" a-samurais-tale-windows`, { stdio: 'inherit' });
copyFileSync(winZipOut1, winZipOut2);
console.log(`✓ Created: ${winZipOut1}`);
console.log(`✓ Created: ${winZipOut2}`);

// ─────────────────────────────────────────────────────────────────────────────
// 2. LINUX BUILD
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n========================================');
console.log('Building Linux Package...');
console.log('========================================');

const linuxTarUrl = `https://dl.nwjs.io/${NW_VERSION}/nwjs-${NW_VERSION}-linux-x64.tar.gz`;
const linuxTarPath = path.join(CACHE, `nwjs-${NW_VERSION}-linux-x64.tar.gz`);
download(linuxTarUrl, linuxTarPath);

const linuxOutputDir = path.join(BUILDS, 'a-samurais-tale-linux');
if (existsSync(linuxOutputDir)) rmSync(linuxOutputDir, { recursive: true, force: true });
mkdirSync(linuxOutputDir, { recursive: true });

console.log('==> Extracting NW.js Linux runtime...');
execSync(`tar.exe -xzf "${linuxTarPath}" --strip-components=1 -C "${linuxOutputDir}"`, { stdio: 'inherit' });

// Rename nw to game binary
const oldBin = path.join(linuxOutputDir, 'nw');
const newBin = path.join(linuxOutputDir, 'a-samurais-tale');
if (existsSync(oldBin)) {
  renameSync(oldBin, newBin);
  copyFileSync(newBin, path.join(linuxOutputDir, 'autumns-vengeance'));
}

// Copy dist contents & manifest
console.log('==> Bundling game assets into Linux package...');
cpSync(DIST, linuxOutputDir, { recursive: true });
writeFileSync(path.join(linuxOutputDir, 'package.json'), JSON.stringify(appManifest, null, 2));

// Create gamename-linux.tar.gz
console.log('==> Creating Linux archives...');
const linuxTarOut1 = path.join(ROOT, 'a-samurais-tale-linux.tar.gz');
const linuxTarOut2 = path.join(ROOT, 'autumns-vengeance-linux.tar.gz');
if (existsSync(linuxTarOut1)) rmSync(linuxTarOut1);
if (existsSync(linuxTarOut2)) rmSync(linuxTarOut2);

execSync(`tar.exe -czf "${linuxTarOut1}" -C "${BUILDS}" a-samurais-tale-linux`, { stdio: 'inherit' });
copyFileSync(linuxTarOut1, linuxTarOut2);
console.log(`✓ Created: ${linuxTarOut1}`);
console.log(`✓ Created: ${linuxTarOut2}`);

console.log('\n========================================');
console.log('ALL BUILDS GENERATED SUCCESSFULLY!');
console.log('========================================');
