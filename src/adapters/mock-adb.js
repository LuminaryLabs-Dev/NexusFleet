export class MockAdb {
  constructor(devices) { this.devices = devices; }
  list() { return [...this.devices.values()].filter(d => !['WAITING_FOR_FASTBOOT','READY','META_ENROLLMENT'].includes(d.state)).map(d => d.serial); }
  shell(serial, command) {
    const d = this.#device(serial);
    if (command === 'getprop ro.product.model') return d.model;
    if (command === 'pm list packages') return [...d.packages].map(p => `package:${p}`).join('\n');
    if (command.startsWith('settings get ')) return d.settings.get(command.slice(13)) ?? 'null';
    if (command.startsWith('settings put ')) { const [k, ...v] = command.slice(13).split(' '); d.settings.set(k, v.join(' ')); return ''; }
    return '';
  }
  install(serial, apk) { this.#device(serial).packages.add(apk.replace(/^.*\//, '').replace(/\.apk$/, '')); return 'Success'; }
  push(serial, from, to) { this.#device(serial).files.set(to, from); return `${from}: 1 file pushed`; }
  reboot(serial) { return this.#device(serial).serial; }
  #device(serial) { const d = this.devices.get(serial); if (!d) throw new Error(`Unknown device ${serial}`); return d; }
}
