import { FleetEngine } from '../src/core/fleet-engine.js';
const engine = new FleetEngine({ seed: 42, failureRate: .02 });
let n = 0;
const el = id => document.getElementById(id);
const devices = el('devices');
function addOne() {
  n++;
  engine.addDevice({ serial: `REBOOT-${String(n).padStart(4, '0')}`, model: n % 3 === 0 ? 'Quest 3' : 'Quest 3S' });
  render();
}
function render() {
  const s = engine.summary();
  for (const k of ['total', 'complete', 'active', 'failed']) el(k).textContent = s[k];
  devices.innerHTML = [...engine.devices.values()].slice().reverse().map(d => `<article class="device"><div><strong>${d.serial}</strong><span>${d.model}</span></div><b data-state="${d.state}">${d.state.replaceAll('_', ' ')}</b>${d.state === 'FAILED' ? `<button data-retry="${d.serial}">Retry</button>` : ''}</article>`).join('');
}
engine.onChange(() => render());
el('add').onclick = addOne;
el('add50').onclick = () => { for (let i = 0; i < 50; i++) addOne(); };
el('deploy').onclick = () => engine.deployAll({ concurrency: 32, delayMs: 45 });
devices.onclick = e => { const serial = e.target.dataset.retry; if (serial) engine.retry(serial, { delayMs: 45 }); };
for (let i = 0; i < 8; i++) addOne();
