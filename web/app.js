import { FleetEngine } from '../src/core/fleet-engine.js';
import { DeviceState } from '../src/core/device.js';
import { MockAdb } from '../src/adapters/mock-adb.js';
import { MockFastboot } from '../src/adapters/mock-fastboot.js';
import { CommandSurface } from '../src/runtime/command-surface.js';

let engine;
let surface;
let sequence = 0;
let selectedSerial = null;
let activeView = 'fleet';
let deployDelayMs = 160;
let failureSimulation = true;

const el = id => document.getElementById(id);
const devicesEl = el('devices');
const jobsEl = el('jobs-list');
const stateLabel = state => ({
  DETECTED: 'Detected', WAITING_FOR_FASTBOOT: 'Waiting for Fastboot', READY: 'Ready', META_ENROLLMENT: 'Meta enrollment',
  WAITING_FOR_BOOT: 'Restarting', ADB_ONLINE: 'Connected', PROVISIONING: 'Installing', VERIFYING: 'Verifying', COMPLETE: 'Complete', FAILED: 'Needs attention'
}[state] ?? state);

function makeEngine() {
  engine = new FleetEngine({ seed: 42, failureRate: failureSimulation ? 0.03 : 0 });
  surface = new CommandSurface({ adb: new MockAdb(engine.devices), fastboot: new MockFastboot(engine.devices) });
  engine.onChange(() => render());
}

function addDevice(model) {
  sequence += 1;
  const serial = `REBOOT-${String(sequence).padStart(4, '0')}`;
  engine.addDevice({ serial, model: model ?? (sequence % 3 === 0 ? 'Quest 3' : 'Quest 3S') });
  selectedSerial = serial;
  render();
  return serial;
}

function render() {
  const summary = engine.summary();
  for (const key of ['total', 'complete', 'active', 'failed']) el(key).textContent = summary[key];
  el('nav-total').textContent = summary.total;
  el('nav-active').textContent = summary.active;

  const list = [...engine.devices.values()].slice().reverse();
  devicesEl.innerHTML = list.map(device => {
    const selected = device.serial === selectedSerial ? ' selected' : '';
    return `<button class="device-row${selected}" data-select="${device.serial}" role="listitem" type="button">
      <strong>${device.serial}</strong>
      <span>${device.model}</span>
      <span>${stateLabel(device.state)}</span>
      <span class="state-pill" data-state="${device.state}">${device.state === DeviceState.FAILED ? 'Attention' : device.state === DeviceState.COMPLETE ? 'Done' : 'Active'}</span>
    </button>`;
  }).join('') || '<div class="inspector-empty">No simulated headsets yet.</div>';

  jobsEl.innerHTML = list.map(device => `<button class="job-row" data-select="${device.serial}" type="button">
    <strong>${device.serial}</strong><span>${device.model}</span><span>${stateLabel(device.state)}</span><span class="state-pill" data-state="${device.state}">${device.state === DeviceState.COMPLETE ? 'Done' : device.state === DeviceState.FAILED ? 'Attention' : 'Running'}</span>
  </button>`).join('') || '<div class="inspector-empty">No jobs yet.</div>';

  renderSelected();
}

function renderSelected() {
  const device = selectedSerial ? engine.devices.get(selectedSerial) : null;
  el('selected-empty').classList.toggle('hidden', Boolean(device));
  el('selected-detail').classList.toggle('hidden', !device);
  if (!device) return;

  el('selected-title').textContent = device.serial;
  el('selected-model').textContent = device.model;
  el('selected-state').textContent = stateLabel(device.state);
  el('selected-profile').textContent = 'Reboot Quest Kiosk';
  el('selected-packages').textContent = device.packages.size;
  el('selected-status').textContent = device.state === DeviceState.COMPLETE ? 'Done' : device.state === DeviceState.FAILED ? 'Attention' : 'Active';
  el('selected-status').dataset.state = device.state;
  el('retry-one').classList.toggle('hidden', device.state !== DeviceState.FAILED);
  el('deploy-one').classList.toggle('hidden', device.state === DeviceState.FAILED);
  el('deploy-one').disabled = [DeviceState.COMPLETE, DeviceState.META_ENROLLMENT, DeviceState.WAITING_FOR_BOOT, DeviceState.ADB_ONLINE, DeviceState.PROVISIONING, DeviceState.VERIFYING].includes(device.state);

  const recent = device.history.slice(-9);
  el('timeline').innerHTML = recent.map((item, index) => `<div class="timeline-item ${index === recent.length - 1 ? 'current' : ''}"><i></i><span>${stateLabel(item.state)}</span></div>`).join('');
}

function setView(view) {
  activeView = view;
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  document.querySelectorAll('[data-view-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.viewPanel === view));
}

function selectSerial(serial) {
  selectedSerial = serial;
  render();
}

function testWrite(title, detail) {
  el('test-output').textContent = `${title}\n\n${detail}`;
}

function runFriendlyTest(action) {
  const device = selectedSerial ? engine.devices.get(selectedSerial) : null;
  if (!device) return testWrite('No headset selected', 'Choose a headset from Fleet or Jobs first.');
  try {
    if (action === 'connection') {
      const visible = surface.run('adb devices');
      const fastboot = surface.run('fastboot devices');
      const found = `${visible}\n${fastboot}`.includes(device.serial);
      return testWrite(found ? 'Connection passed' : 'Connection not ready', found ? `${device.serial} is visible to the setup computer.` : `${device.serial} is not currently visible. Put it in Fastboot or continue the simulated deployment.`);
    }
    if (action === 'fastboot') {
      const output = surface.run('fastboot devices');
      return testWrite(output.includes(device.serial) ? 'Fastboot passed' : 'Fastboot not active', output.includes(device.serial) ? `${device.serial} is ready for the enrollment handoff.` : 'Use “Put in Fastboot” on the right, then run this check again.');
    }
    if (action === 'info') {
      const model = ['WAITING_FOR_FASTBOOT','READY','META_ENROLLMENT'].includes(device.state)
        ? surface.run(`fastboot -s ${device.serial} getvar product`)
        : surface.run(`adb -s ${device.serial} shell getprop ro.product.model`);
      return testWrite('Headset info passed', `Serial: ${device.serial}\nModel: ${model || device.model}\nStage: ${stateLabel(device.state)}`);
    }
    if (action === 'install') {
      if (['WAITING_FOR_FASTBOOT','READY','META_ENROLLMENT'].includes(device.state)) return testWrite('App install waiting', 'The headset needs to finish booting before an app can be installed.');
      const output = surface.run(`adb -s ${device.serial} install reboot-demo.apk`);
      render();
      return testWrite('Test install passed', `${output}. The simulated Reboot app is now on ${device.serial}.`);
    }
  } catch (error) {
    testWrite('Check could not complete', error.message);
  }
}

function resetSimulator() {
  sequence = 0;
  selectedSerial = null;
  makeEngine();
  for (let i = 0; i < 6; i += 1) addDevice();
  selectedSerial = 'REBOOT-0001';
  el('test-output').textContent = 'Choose a check above. No real headset will be changed.';
  render();
}

makeEngine();

document.querySelector('.nav-list').addEventListener('click', event => {
  const button = event.target.closest('[data-view]');
  if (button) setView(button.dataset.view);
});

devicesEl.addEventListener('click', event => {
  const row = event.target.closest('[data-select]');
  if (row) selectSerial(row.dataset.select);
});

jobsEl.addEventListener('click', event => {
  const row = event.target.closest('[data-select]');
  if (row) selectSerial(row.dataset.select);
});

el('add').addEventListener('click', () => { addDevice(); setView('fleet'); });
el('add10').addEventListener('click', () => { for (let i = 0; i < 10; i += 1) addDevice(); setView('fleet'); });
el('deploy').addEventListener('click', () => engine.deployAll({ concurrency: 24, delayMs: deployDelayMs }));
el('fastboot').addEventListener('click', () => {
  const device = engine.devices.get(selectedSerial);
  if (!device) return;
  device.error = null;
  device.transition(DeviceState.WAITING_FOR_FASTBOOT);
  render();
});
el('deploy-one').addEventListener('click', () => selectedSerial && engine.deploy(selectedSerial, { delayMs: deployDelayMs }));
el('retry-one').addEventListener('click', () => selectedSerial && engine.retry(selectedSerial, { delayMs: deployDelayMs }));
el('close-inspector').addEventListener('click', () => { selectedSerial = null; render(); });

document.querySelector('.test-actions').addEventListener('click', event => {
  const button = event.target.closest('[data-test-action]');
  if (button) runFriendlyTest(button.dataset.testAction);
});
el('clear-test').addEventListener('click', () => { el('test-output').textContent = 'Choose a check above. No real headset will be changed.'; });

const settings = el('settings-dialog');
el('settings-button').addEventListener('click', () => settings.showModal());
el('failure-toggle').addEventListener('change', event => {
  failureSimulation = event.target.checked;
  engine.failureRate = failureSimulation ? 0.03 : 0;
});
el('speed-select').addEventListener('change', event => { deployDelayMs = Number(event.target.value) || 160; });
el('reset-simulator').addEventListener('click', () => { resetSimulator(); settings.close(); });

for (let i = 0; i < 6; i += 1) addDevice();
selectedSerial = 'REBOOT-0001';
render();
