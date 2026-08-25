import { FleetEngine } from './core/fleet-engine.js';
import { MockAdb } from './adapters/mock-adb.js';
import { MockFastboot } from './adapters/mock-fastboot.js';
import { CommandSurface } from './runtime/command-surface.js';

const args = process.argv.slice(2);
const count = Number(args[args.indexOf('--simulate') + 1] || 25);
const quiet = args.includes('--quiet');
const engine = new FleetEngine({ seed: 42 });
for (let i = 1; i <= count; i++) engine.addDevice({ serial: `NF-${String(i).padStart(5, '0')}`, model: i % 3 === 0 ? 'Quest 3' : 'Quest 3S' });
const commands = new CommandSurface({ adb: new MockAdb(engine.devices), fastboot: new MockFastboot(engine.devices) });
if (!quiet) console.log(`NexusFleet simulation: ${count} devices`);
await engine.deployAll({ concurrency: 256 });
if (!quiet) {
  console.log(engine.summary());
  console.log('adb devices sample:\n' + commands.run('adb devices').split('\n').slice(0, 3).join('\n'));
} else console.log(JSON.stringify(engine.summary()));
