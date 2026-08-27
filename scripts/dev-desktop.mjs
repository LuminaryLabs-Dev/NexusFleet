import { spawn } from 'node:child_process';

const next = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'dev'], { stdio: 'inherit', shell: false });
let electron;
const timer = setInterval(async () => {
  try {
    const response = await fetch('http://127.0.0.1:3000');
    if (!response.ok || electron) return;
    clearInterval(timer);
    electron = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['electron', '.'], { stdio: 'inherit', shell: false, env: { ...process.env, NEXUSFLEET_DEV_URL: 'http://127.0.0.1:3000' } });
    electron.once('exit', () => next.kill());
  } catch { /* Next is still starting */ }
}, 300);

process.on('SIGINT', () => { clearInterval(timer); electron?.kill(); next.kill(); });
