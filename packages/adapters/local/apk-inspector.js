import { createRequire } from 'node:module';
import path from 'node:path';
import { validateApkPath } from '../../tooling/command-policy.js';

const require = createRequire(import.meta.url);
const ApkReader = require('@devicefarmer/adbkit-apkreader');

export async function inspectApk(apkPath) {
  validateApkPath(apkPath);
  const reader = await ApkReader.open(apkPath);
  const manifest = await reader.readManifest();
  return { path: apkPath, name: path.basename(apkPath), packageName: manifest.package, versionName: manifest.versionName || null, versionCode: manifest.versionCode || null };
}
