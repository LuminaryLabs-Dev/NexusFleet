import { runProcess } from '../../tooling/process-runner.js';
import { validateSerial } from '../../tooling/command-policy.js';

export class FastbootAdapter {
  constructor({ executable }) { this.executable = executable; }
  async listDevices() {
    const result = await runProcess(this.executable, ['devices']);
    return result.stdout.toString('utf8').split(/\r?\n/).map(line => line.trim().split(/\s+/)[0]).filter(Boolean);
  }
  async reboot(serial) { validateSerial(serial); await runProcess(this.executable, ['-s', serial, 'reboot']); }
}
