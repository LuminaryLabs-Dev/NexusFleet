import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const sidecarRoot = path.resolve('sidecars/python');
const result = spawnSync(process.env.NEXUSFLEET_PYTHON || 'python3', ['-m', 'PyInstaller', '--noconfirm', '--distpath', 'dist', '--workpath', 'build', 'nexusfleet-sidecar.spec'], { cwd: sidecarRoot, stdio: 'inherit', shell: false });
if (result.status !== 0) throw new Error('Python sidecar build failed. Install the pinned build requirement with: python3 -m pip install pyinstaller==6.22.2');
const executable = path.join(sidecarRoot, 'dist', process.platform === 'win32' ? 'nexusfleet-sidecar.exe' : 'nexusfleet-sidecar');
if (!fs.existsSync(executable)) throw new Error(`Sidecar build did not produce ${executable}`);
console.log(`PASS: packaged Python sidecar at ${executable}`);
