import assert from 'node:assert/strict';
import { FleetEngine } from '../src/core/fleet-engine.js';
import { MockAdb } from '../src/adapters/mock-adb.js';
import { MockFastboot } from '../src/adapters/mock-fastboot.js';
import { CommandSurface } from '../src/runtime/command-surface.js';

const engine=new FleetEngine({seed:7});
engine.addDevice({serial:'Q-001',model:'Quest 3'});
await engine.deploy('Q-001');
assert.equal(engine.summary().complete,1);
const surface=new CommandSurface({adb:new MockAdb(engine.devices),fastboot:new MockFastboot(engine.devices)});
assert.match(surface.run('adb devices'),/Q-001/);
assert.equal(surface.run('adb -s Q-001 shell getprop ro.product.model'),'Quest 3');
assert.equal(surface.run('adb -s Q-001 install reboot.apk'),'Success');
assert.match(surface.run('adb -s Q-001 shell pm list packages'),/reboot/);
assert.match(surface.run('adb -s Q-001 push config.json /sdcard/config.json'),/1 file pushed/);
assert.equal(surface.run('adb -s Q-001 shell settings put nexusfleet.kiosk enabled'),'');
assert.equal(surface.run('adb -s Q-001 shell settings get nexusfleet.kiosk'),'enabled');

const fastbootEngine=new FleetEngine({seed:11});
const fastbootDevice=fastbootEngine.addDevice({serial:'FB-001',model:'Quest 3S'});
fastbootDevice.transition('WAITING_FOR_FASTBOOT');
const fastbootSurface=new CommandSurface({adb:new MockAdb(fastbootEngine.devices),fastboot:new MockFastboot(fastbootEngine.devices)});
assert.match(fastbootSurface.run('fastboot devices'),/FB-001/);
assert.equal(fastbootSurface.run('fastboot -s FB-001 getvar product'),'Quest 3S');

const stress=new FleetEngine({seed:99});
for(let i=0;i<5000;i++) stress.addDevice({serial:`S-${i}`});
const started=Date.now();
const summary=await stress.deployAll({concurrency:512});
assert.deepEqual(summary,{total:5000,complete:5000,failed:0,active:0});
assert.ok(Date.now()-started < 10000,'5000-device simulation should finish under 10s offline');

const flaky=new FleetEngine({seed:3,failureRate:.2});
flaky.addDevice({serial:'F-1'});
await flaky.deploy('F-1');
assert.ok(['FAILED','COMPLETE'].includes(flaky.devices.get('F-1').state));
console.log(`PASS: core, command surface, 5000-device stress (${Date.now()-started}ms)`);
