import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startStaticServer } from '../desktop/static-server.mjs';

test('desktop static server delivers hydrated assets only from loopback root', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nexusfleet-static-test-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'nexusfleet-static-outside-'));
  await fs.mkdir(path.join(root, '_next'), { recursive: true });
  await fs.writeFile(path.join(root, 'index.html'), '<!doctype html><script src="/_next/app.js"></script>');
  await fs.writeFile(path.join(root, '_next', 'app.js'), 'window.NEXUSFLEET_READY=true;');
  await fs.writeFile(path.join(outside, 'secret.txt'), 'must-not-escape');
  await fs.symlink(path.join(outside, 'secret.txt'), path.join(root, 'escape.txt'));
  const server = await startStaticServer({ root });
  t.after(async () => { await server.close(); await Promise.all([fs.rm(root, { recursive: true }), fs.rm(outside, { recursive: true })]); });
  assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  const page = await fetch(server.url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(await page.text(), /_next\/app\.js/);
  const asset = await fetch(new URL('/_next/app.js', server.url));
  assert.equal(await asset.text(), 'window.NEXUSFLEET_READY=true;');
  const missing = await fetch(new URL('/../secret.txt', server.url));
  assert.equal(missing.status, 404);
  const escapedLink = await fetch(new URL('/escape.txt', server.url));
  assert.equal(escapedLink.status, 404);
});
