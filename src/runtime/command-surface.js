export class CommandSurface {
  constructor({ adb, fastboot }) { this.adb = adb; this.fastboot = fastboot; }
  run(command) {
    const args = tokenize(command);
    const tool = args.shift();
    if (tool === 'adb') return this.#adb(args);
    if (tool === 'fastboot') return this.#fastboot(args);
    throw new Error(`Unsupported tool: ${tool}`);
  }
  #adb(args) {
    if (args[0] === 'devices') return this.adb.list().map(s => `${s}\tdevice`).join('\n');
    const serial = takeSerial(args);
    const op = args.shift();
    if (op === 'shell') return this.adb.shell(serial, args.join(' '));
    if (op === 'install') return this.adb.install(serial, args.at(-1));
    if (op === 'push') return this.adb.push(serial, args[0], args[1]);
    if (op === 'reboot') return this.adb.reboot(serial);
    throw new Error(`Unsupported adb command: ${op}`);
  }
  #fastboot(args) {
    if (args[0] === 'devices') return this.fastboot.list().map(s => `${s}\tfastboot`).join('\n');
    const serial = takeSerial(args);
    const op = args.shift();
    if (op === 'getvar') return this.fastboot.getvar(serial, args[0]);
    if (op === 'reboot') return this.fastboot.reboot(serial);
    throw new Error(`Unsupported fastboot command: ${op}`);
  }
}
function takeSerial(args) {
  const i = args.indexOf('-s');
  if (i < 0) throw new Error('Serial required with -s');
  const serial = args[i + 1];
  args.splice(i, 2);
  return serial;
}
function tokenize(s) { return s.trim().match(/(?:[^\s"]+|"[^"]*")+/g)?.map(x => x.replace(/^"|"$/g, '')) ?? []; }
