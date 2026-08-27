import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { validateApkPath, validatePackageName, validateSerial } from '../packages/tooling/command-policy.js';

test('command policy accepts bounded identifiers', () => {
  assert.equal(validateSerial('192.168.1.2:5555'), '192.168.1.2:5555');
  assert.equal(validatePackageName('dev.luminarylabs.reboot'), 'dev.luminarylabs.reboot');
  assert.equal(validateApkPath(path.resolve('fixture.apk')), path.resolve('fixture.apk'));
});

test('command policy rejects shell-shaped inputs', () => {
  assert.throws(() => validateSerial('quest; rm'), /Invalid/);
  assert.throws(() => validatePackageName('not-a-package'), /valid Android/);
  assert.throws(() => validateApkPath('../fixture.apk'), /valid APK/);
});
