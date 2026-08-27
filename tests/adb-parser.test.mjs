import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdbDevices } from '../packages/adapters/local/adb-output-parser.js';

test('ADB parser preserves connected, unauthorized, and Wi-Fi states', () => {
  const devices = parseAdbDevices(`List of devices attached\n1WMHH123456789 device product:eureka model:Quest_3S transport_id:1\n192.168.1.9:5555 unauthorized transport_id:2\n`);
  assert.equal(devices.length, 2);
  assert.deepEqual(devices[0], { serial: '1WMHH123456789', connectionState: 'device', connection: 'usb', model: 'Quest 3S', product: 'eureka', transportId: '1' });
  assert.equal(devices[1].connection, 'wifi');
  assert.equal(devices[1].connectionState, 'unauthorized');
});
