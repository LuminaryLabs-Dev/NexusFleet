export const DeviceState = Object.freeze({
  DETECTED: 'DETECTED',
  WAITING_FOR_FASTBOOT: 'WAITING_FOR_FASTBOOT',
  READY: 'READY',
  META_ENROLLMENT: 'META_ENROLLMENT',
  WAITING_FOR_BOOT: 'WAITING_FOR_BOOT',
  ADB_ONLINE: 'ADB_ONLINE',
  PROVISIONING: 'PROVISIONING',
  VERIFYING: 'VERIFYING',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED'
});

export class VirtualDevice {
  constructor({ serial, model = 'Quest 3S', profile = 'reboot-quest-kiosk' }) {
    this.serial = serial;
    this.model = model;
    this.profile = profile;
    this.state = DeviceState.DETECTED;
    this.battery = 100;
    this.packages = new Set();
    this.files = new Map();
    this.settings = new Map();
    this.history = [{ state: this.state, at: Date.now() }];
    this.error = null;
  }
  transition(state) {
    this.state = state;
    this.history.push({ state, at: Date.now() });
  }
}
