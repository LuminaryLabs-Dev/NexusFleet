import { FleetEngine } from '../src/core/fleet-engine.js';
import { DeviceState } from '../src/core/device.js';
import { MockAdb } from '../src/adapters/mock-adb.js';
import { MockFastboot } from '../src/adapters/mock-fastboot.js';
import { CommandSurface } from '../src/runtime/command-surface.js';

const engine = new FleetEngine({ seed: 42, failureRate: 0.03 });
const surface = new CommandSurface({ adb: new MockAdb(engine.devices), fastboot: new MockFastboot(engine.devices) });
let sequence = 0;
let selectedSerial = null;
let terminalLines = ['NexusFleet offline shell ready.', 'Type help for examples.'];

const el = id => document.getElementById(id);
const devicesEl = el('devices');
const stateLabel = state => state.replaceAll('_', ' ');
const escapeHtml = value => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

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

  const list = [...engine.devices.values()].slice().reverse();
  devicesEl.innerHTML = list.map(device => {
    const selected = device.serial === selectedSerial ? ' selected' : '';
    const error = device.error ? `<small class="device-error">${escapeHtml(device.error)}</small>` : '';
    return `<button class="device-row${selected}" data-select="${device.serial}" role="listitem">
      <span class="device-main"><strong>${device.serial}</strong><small>${device.model}</small>${error}</span>
      <span class="state-badge" data-state="${device.state}">${stateLabel(device.state)}</span>
    </button>`;
  }).join('') || '<div class="empty-state">No simulated headsets yet. Add one to start.</div>';

  renderSelected();
}

function renderSelected() {
  const device = selectedSerial ? engine.devices.get(selectedSerial) : null;
  el('selected-empty').classList.toggle('hidden', Boolean(device));
  el('selected-detail').classList.toggle('hidden', !device);
  if (!device) {
    el('selected-title').textContent = 'No headset selected';
    return;
  }

  el('selected-title').textContent = device.serial;
  el('selected-model').textContent = device.model;
  el('selected-state').textContent = stateLabel(device.state);
  el('selected-profile').textContent = device.profile;
  el('selected-packages').textContent = device.packages.size;
  el('retry-one').classList.toggle('hidden', device.state !== DeviceState.FAILED);
  el('deploy-one').disabled = [DeviceState.COMPLETE, DeviceState.META_ENROLLMENT, DeviceState.PROVISIONING, DeviceState.VERIFYING].includes(device.state);

  const recent = device.history.slice(-9);
  el('timeline').innerHTML = recent.map((item, index) => `<div class="timeline-item ${index === recent.length - 1 ? 'current' : ''}"><i></i><span>${stateLabel(item.state)}</span></div>`).join('');
}

function terminalWrite(command, output, isError = false) {
  terminalLines.push(`$ ${command}`);
  if (output !== undefined && output !== '') terminalLines.push(`${isError ? 'ERROR: ' : ''}${output}`);
  terminalLines = terminalLines.slice(-60);
  el('terminal-output').textContent = terminalLines.join('\n');
  el('terminal-output').scrollTop = el('terminal-output').scrollHeight;
}

function runShell(rawCommand) {
  let command = rawCommand.trim();
  if (!command) return;
  if (command === 'clear') {
    terminalLines = [];
    el('terminal-output').textContent = '';
    return;
  }
  if (command === 'help') {
    terminalWrite(command, [
      'adb devices',
      'fastboot devices',
      'adb -s SERIAL shell getprop ro.product.model',
      'adb -s SERIAL shell pm list packages',
      'adb -s SERIAL install reboot-demo.apk',
      'adb -s SERIAL push config.json /sdcard/config.json',
      'adb -s SERIAL shell settings put nexusfleet.kiosk enabled',
      'adb -s SERIAL shell settings get nexusfleet.kiosk'
    ].join('\n'));
    return;
  }
  if (command.includes('$SERIAL')) {
    if (!selectedSerial) return terminalWrite(command, 'Select a headset first.', true);
    command = command.replaceAll('$SERIAL', selectedSerial);
  }
  try {
    const output = surface.run(command);
    terminalWrite(command, output || 'OK');
    render();
  } catch (error) {
    terminalWrite(command, error.message, true);
  }
}

engine.onChange(() => render());
el('add').onclick = () => addDevice();
el('add10').onclick = () => { for (let i = 0; i < 10; i += 1) addDevice(); };
el('deploy').onclick = () => engine.deployAll({ concurrency: 24, delayMs: 90 });

devicesEl.onclick = event => {
  const row = event.target.closest('[data-select]');
  if (!row) return;
  selectedSerial = row.dataset.select;
  render();
};

el('fastboot').onclick = () => {
  const device = engine.devices.get(selectedSerial);
  if (!device) return;
  device.error = null;
  device.transition(DeviceState.WAITING_FOR_FASTBOOT);
  render();
  terminalWrite(`# simulate fastboot ${device.serial}`, `${device.serial}\tfastboot`);
};

el('deploy-one').onclick = () => selectedSerial && engine.deploy(selectedSerial, { delayMs: 130 });
el('retry-one').onclick = () => selectedSerial && engine.retry(selectedSerial, { delayMs: 130 });
el('clear-terminal').onclick = () => runShell('clear');
el('terminal-form').onsubmit = event => {
  event.preventDefault();
  const input = el('terminal-input');
  runShell(input.value);
  input.value = '';
  input.focus();
};
el('quick-commands').onclick = event => {
  const button = event.target.closest('[data-command]');
  if (button) runShell(button.dataset.command);
};

for (let i = 0; i < 6; i += 1) addDevice();
selectedSerial = 'REBOOT-0001';
render();
