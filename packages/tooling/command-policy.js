import path from 'node:path';

const serialPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const packagePattern = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/;

export function validateSerial(serial) {
  if (typeof serial !== 'string' || !serialPattern.test(serial)) throw new Error('Invalid device serial.');
  return serial;
}

export function validatePackageName(packageName) {
  if (typeof packageName !== 'string' || !packagePattern.test(packageName)) throw new Error('A valid Android package name is required.');
  return packageName;
}

export function validateApkPath(apkPath) {
  if (typeof apkPath !== 'string' || !path.isAbsolute(apkPath) || path.extname(apkPath).toLowerCase() !== '.apk') throw new Error('Select a valid APK file.');
  return apkPath;
}

export function validateEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || !/^(?:\d{1,3}\.){3}\d{1,3}:\d{2,5}$/.test(endpoint)) throw new Error('Use an IPv4 address and port, for example 192.168.1.20:5555.');
  return endpoint;
}
