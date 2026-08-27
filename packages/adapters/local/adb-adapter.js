import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../../tooling/process-runner.js';
import { validateApkPath, validateEndpoint, validatePackageName, validateSerial } from '../../tooling/command-policy.js';
import { parseAdbDevices } from './adb-output-parser.js';

export class AdbAdapter {
  constructor({ executable }) { this.executable = executable; }
  async run(args, options) { return runProcess(this.executable, args, options); }
  async listDevices() { return parseAdbDevices((await this.run(['devices', '-l'])).stdout.toString('utf8')); }
  async inspectDevice(serial) {
    validateSerial(serial);
    const [model, version, battery] = await Promise.all([
      this.run(['-s', serial, 'shell', 'getprop', 'ro.product.model']),
      this.run(['-s', serial, 'shell', 'getprop', 'ro.build.version.release']),
      this.run(['-s', serial, 'shell', 'dumpsys', 'battery'])
    ]);
    return { serial, model: model.stdout.toString('utf8').trim() || 'Meta Quest', osVersion: version.stdout.toString('utf8').trim(), battery: parseBattery(battery.stdout.toString('utf8')) };
  }
  async install(serial, apkPath, { signal } = {}) {
    validateSerial(serial); validateApkPath(apkPath);
    const result = await this.run(['-s', serial, 'install', '-r', apkPath], { timeoutMs: 180_000, signal });
    return result.stdout.toString('utf8').trim() || 'Success';
  }
  async uninstall(serial, packageName) { validateSerial(serial); validatePackageName(packageName); await this.run(['-s', serial, 'uninstall', packageName], { timeoutMs: 60_000 }); }
  async launch(serial, packageName) { validateSerial(serial); validatePackageName(packageName); await this.run(['-s', serial, 'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1']); }
  async stop(serial, packageName) { validateSerial(serial); validatePackageName(packageName); await this.run(['-s', serial, 'shell', 'am', 'force-stop', packageName]); }
  async listPackages(serial) {
    validateSerial(serial);
    const result = await this.run(['-s', serial, 'shell', 'pm', 'list', 'packages', '-3']);
    return result.stdout.toString('utf8').split(/\r?\n/).map(value => value.replace(/^package:/, '').trim()).filter(Boolean);
  }
  async reboot(serial) { validateSerial(serial); await this.run(['-s', serial, 'reboot']); }
  async readLogs(serial) {
    validateSerial(serial);
    const result = await this.run(['-s', serial, 'logcat', '-d', '-t', '200'], { timeoutMs: 15_000, maxBytes: 2 * 1024 * 1024 });
    return result.stdout.toString('utf8').split(/\r?\n/).filter(Boolean);
  }
  async screenshot(serial, destination) {
    validateSerial(serial);
    const remote = '/sdcard/nexusfleet-screenshot.png';
    await this.run(['-s', serial, 'shell', 'screencap', '-p', remote]);
    await this.run(['-s', serial, 'pull', remote, destination], { timeoutMs: 60_000 });
    await this.run(['-s', serial, 'shell', 'rm', remote]);
    return destination;
  }
  async screenshotToTemp(serial) { const destination = path.join(os.tmpdir(), `nexusfleet-${Date.now()}.png`); await this.screenshot(serial, destination); return destination; }
  async connectWifi(endpoint) { validateEndpoint(endpoint); return (await this.run(['connect', endpoint])).stdout.toString('utf8').trim(); }
  async disconnectWifi(endpoint) { validateEndpoint(endpoint); await this.run(['disconnect', endpoint]); }
  async verifyApkReadable(apkPath) { validateApkPath(apkPath); await fs.access(apkPath); }
}

function parseBattery(output) { const match = output.match(/^\s*level:\s*(\d+)/m); return match ? Number(match[1]) : null; }
