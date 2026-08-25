export class MockFastboot {
  constructor(devices) { this.devices = devices; }
  list() { return [...this.devices.values()].filter(d => ['WAITING_FOR_FASTBOOT','READY','META_ENROLLMENT'].includes(d.state)).map(d => d.serial); }
  getvar(serial, name) { const d = this.#device(serial); return name === 'product' ? d.model : ''; }
  reboot(serial) { return this.#device(serial).serial; }
  #device(serial) { const d = this.devices.get(serial); if (!d) throw new Error(`Unknown device ${serial}`); return d; }
}
