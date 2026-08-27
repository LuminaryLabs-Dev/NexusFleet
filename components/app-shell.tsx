'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBridge } from '../lib/bridge';
import type { ApkSelection, DeviceRecord, JobRecord, RuntimeMode, RuntimeStatus } from '../lib/types';
import { stateLabel, StatusPill } from './status-pill';

type View = 'fleet' | 'jobs' | 'apps' | 'diagnostics' | 'simulation';

export function AppShell() {
  const [bridge] = useState(() => getBridge());
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [runtime, setRuntime] = useState<RuntimeStatus>({ mode: 'simulation', ready: false, message: 'Starting…' });
  const [view, setView] = useState<View>('fleet');
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);
  const [apk, setApk] = useState<ApkSelection | null>(null);
  const [output, setOutput] = useState('Choose a diagnostic check.');
  const [busy, setBusy] = useState(false);
  const [wifiEndpoint, setWifiEndpoint] = useState('');

  const refresh = useCallback(async () => {
    const [nextDevices, nextJobs, nextRuntime] = await Promise.all([bridge.devices.refresh(), bridge.jobs.list(), bridge.runtime.getStatus()]);
    setDevices(nextDevices); setJobs(nextJobs); setRuntime(nextRuntime);
    setSelectedSerial(current => current && nextDevices.some(device => device.serial === current) ? current : nextDevices[0]?.serial || null);
  }, [bridge]);

  useEffect(() => {
    void refresh();
    const stopDevices = bridge.devices.subscribe(setDevices);
    const stopJobs = bridge.jobs.subscribe(setJobs);
    return () => { stopDevices(); stopJobs(); };
  }, [bridge, refresh]);

  const selected = devices.find(device => device.serial === selectedSerial) || null;
  const summary = useMemo(() => ({
    total: devices.length,
    active: devices.filter(device => !['COMPLETE', 'FAILED'].includes(device.state)).length,
    complete: devices.filter(device => device.state === 'COMPLETE').length,
    failed: devices.filter(device => device.state === 'FAILED' || ['unauthorized', 'offline'].includes(device.connectionState)).length
  }), [devices]);

  async function withBusy(operation: () => Promise<void>) {
    setBusy(true);
    try { await operation(); }
    catch (error) { setOutput(error instanceof Error ? error.message : String(error)); setView('diagnostics'); }
    finally { setBusy(false); }
  }

  async function changeMode(mode: RuntimeMode) {
    await withBusy(async () => { setRuntime(await bridge.runtime.setMode(mode)); await refresh(); });
  }

  async function chooseApk() {
    const selection = await bridge.apps.chooseApk();
    if (selection) setApk(selection);
  }

  async function deviceOperation(type: 'install' | 'launch' | 'stop' | 'uninstall') {
    if (!selected) return;
    await withBusy(async () => {
      const request = { serial: selected.serial, apkPath: apk?.path, packageName: apk?.packageName || selected.packages[0] };
      const job = await bridge.apps[type](request);
      setOutput(`${stateLabel(job.status)}: ${job.message}`);
      await refresh();
    });
  }

  async function diagnostic(type: 'info' | 'logs' | 'screenshot' | 'sidecar') {
    await withBusy(async () => {
      if (type === 'sidecar') {
        const result = await bridge.diagnostics.sidecarHealth(); setOutput(result.message); return;
      }
      if (!selected) throw new Error('Select a headset first.');
      if (type === 'info') setOutput(await bridge.diagnostics.readInfo(selected.serial));
      if (type === 'logs') setOutput((await bridge.diagnostics.readLogs(selected.serial)).join('\n'));
      if (type === 'screenshot') setOutput(`Screenshot saved: ${(await bridge.diagnostics.captureScreenshot(selected.serial)).path}`);
    });
  }

  async function connectWifi() {
    await withBusy(async () => { setOutput(await bridge.devices.connectWifi(wifiEndpoint)); await refresh(); });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand"><span className="brand-mark">N</span><span>NexusFleet</span></div>
        <nav className="nav-list">
          <NavButton active={view === 'fleet'} label="Fleet" count={summary.total} onClick={() => setView('fleet')} />
          <NavButton active={view === 'jobs'} label="Jobs" count={jobs.filter(job => ['queued', 'running'].includes(job.status)).length} onClick={() => setView('jobs')} />
          <NavButton active={view === 'apps'} label="Apps" onClick={() => setView('apps')} />
          <NavButton active={view === 'diagnostics'} label="Diagnostics" onClick={() => setView('diagnostics')} />
          <NavButton active={view === 'simulation'} label="Simulation" onClick={() => setView('simulation')} />
        </nav>
        <div className="sidebar-bottom">
          <button className="sidebar-action" type="button" onClick={() => void bridge.devices.addSimulated(1)} disabled={runtime.mode !== 'simulation'}>+ Add headset</button>
          <span>{runtime.mode === 'local' ? 'Local device mode' : runtime.mode === 'managed' ? 'Managed adapter pending' : 'Simulation active'}</span>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="workspace-label"><strong>NexusFleet</strong><span>/</span><span>Quest Operations</span><span className="status-dot" aria-hidden="true" /><small>{stateLabel(runtime.mode)}</small></div>
          <div className="top-actions">
            <select className="mode-select" aria-label="Runtime mode" value={runtime.mode} onChange={event => void changeMode(event.target.value as RuntimeMode)} disabled={busy}>
              <option value="simulation">Simulation</option><option value="local">Local device</option><option value="managed">Managed fleet</option>
            </select>
            <button className="button secondary" type="button" onClick={() => void refresh()} disabled={busy}>Refresh</button>
            <button className="button primary" type="button" onClick={() => void bridge.devices.deploy()} disabled={busy || devices.length === 0}>Deploy ready</button>
          </div>
        </header>

        <div className="dashboard-grid">
          <main className="content">
            <div className="connection-note"><strong className={runtime.ready ? 'runtime-ready' : 'runtime-warning'}>{runtime.ready ? 'Ready' : 'Needs attention'}:</strong> {runtime.message}</div>
            {view === 'fleet' && <FleetView devices={devices} selectedSerial={selectedSerial} setSelectedSerial={setSelectedSerial} summary={summary} />}
            {view === 'jobs' && <JobsView jobs={jobs} setSelectedSerial={serial => { setSelectedSerial(serial); setView('fleet'); }} />}
            {view === 'apps' && <AppsView selected={selected} apk={apk} chooseApk={chooseApk} run={deviceOperation} busy={busy} />}
            {view === 'diagnostics' && <DiagnosticsView output={output} run={diagnostic} busy={busy} />}
            {view === 'simulation' && <SimulationView runtime={runtime} add={count => void bridge.devices.addSimulated(count)} deploy={() => void bridge.devices.deploy()} />}
          </main>
          <DeviceInspector device={selected} apk={apk} busy={busy} clear={() => setSelectedSerial(null)} chooseApk={chooseApk} deploy={() => selected && void bridge.devices.deploy(selected.serial)} run={deviceOperation} diagnostic={diagnostic} wifiEndpoint={wifiEndpoint} setWifiEndpoint={setWifiEndpoint} connectWifi={connectWifi} />
        </div>
      </div>
    </div>
  );
}

function NavButton({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick(): void }) {
  return <button className={`nav-item${active ? ' active' : ''}`} type="button" onClick={onClick}><span>{label}</span>{count !== undefined && <b>{count}</b>}</button>;
}

function FleetView({ devices, selectedSerial, setSelectedSerial, summary }: { devices: DeviceRecord[]; selectedSerial: string | null; setSelectedSerial(value: string): void; summary: { total: number; active: number; complete: number; failed: number } }) {
  return <section className="view active"><div className="view-heading"><div><h1>Fleet</h1><p>Virtual and physical headsets use the same operating surface.</p></div></div>
    <div className="summary-strip"><Summary label="Total" value={summary.total} /><Summary label="In progress" value={summary.active} /><Summary label="Complete" value={summary.complete} /><Summary label="Attention" value={summary.failed} /></div>
    <div className="table-wrap"><div className="table-head"><span>Headset</span><span>Model</span><span>Stage</span><span>Status</span></div><div className="device-table" role="list">
      {devices.map(device => <button key={device.serial} type="button" className={`device-row${selectedSerial === device.serial ? ' selected' : ''}`} onClick={() => setSelectedSerial(device.serial)}><strong>{device.serial}</strong><span>{device.model}</span><span>{stateLabel(device.state)}</span><StatusPill state={device.state}>{stateLabel(device.connectionState)}</StatusPill></button>)}
      {!devices.length && <div className="inspector-empty">No headsets detected.</div>}
    </div></div>
  </section>;
}

function Summary({ label, value }: { label: string; value: number }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

function JobsView({ jobs, setSelectedSerial }: { jobs: JobRecord[]; setSelectedSerial(serial: string): void }) {
  return <section className="view active"><div className="view-heading"><div><h1>Jobs</h1><p>Every operation has an independent, durable result.</p></div></div><div className="jobs-list">
    {jobs.map(job => <button className="job-row" type="button" key={job.id} onClick={() => setSelectedSerial(job.serial)}><strong>{job.serial}</strong><span>{job.type}</span><span className="job-message">{job.message}</span><StatusPill state={job.status} /></button>)}
    {!jobs.length && <div className="inspector-empty">No jobs yet.</div>}
  </div></section>;
}

function AppsView({ selected, apk, chooseApk, run, busy }: { selected: DeviceRecord | null; apk: ApkSelection | null; chooseApk(): Promise<void>; run(type: 'install' | 'launch' | 'stop' | 'uninstall'): Promise<void>; busy: boolean }) {
  return <section className="view active"><div className="view-heading"><div><h1>Apps</h1><p>Select an APK, then install and operate it on the selected headset.</p></div></div>
    <div className="test-result"><div><span>Selected APK</span><button className="text-button" type="button" onClick={() => void chooseApk()}>Choose APK</button></div><pre>{apk?.path || 'No APK selected.'}</pre></div>
    <div className="test-actions"><Action title="Install" detail="Install or replace the selected APK." disabled={!selected || !apk || busy} onClick={() => void run('install')} /><Action title="Launch" detail="Start the selected package." disabled={!selected || busy} onClick={() => void run('launch')} /><Action title="Stop" detail="Stop the selected package." disabled={!selected || busy} onClick={() => void run('stop')} /><Action title="Uninstall" detail="Remove the selected package." disabled={!selected || busy} onClick={() => void run('uninstall')} /></div>
  </section>;
}

function DiagnosticsView({ output, run, busy }: { output: string; run(type: 'info' | 'logs' | 'screenshot' | 'sidecar'): Promise<void>; busy: boolean }) {
  return <section className="view active"><div className="view-heading"><div><h1>Diagnostics</h1><p>Approved checks only; no raw shell is exposed.</p></div></div><div className="test-actions">
    <Action title="Read headset info" detail="Confirm serial, model and connection." disabled={busy} onClick={() => void run('info')} /><Action title="Read recent logs" detail="Collect a bounded diagnostic snapshot." disabled={busy} onClick={() => void run('logs')} /><Action title="Capture screenshot" detail="Save the current headset frame." disabled={busy} onClick={() => void run('screenshot')} /><Action title="Check Python sidecar" detail="Verify optional specialist tooling." disabled={busy} onClick={() => void run('sidecar')} />
  </div><div className="test-result"><div><span>Latest result</span></div><pre className="logs">{output}</pre></div></section>;
}

function Action({ title, detail, disabled, onClick }: { title: string; detail: string; disabled?: boolean; onClick(): void }) { return <button type="button" disabled={disabled} onClick={onClick}><strong>{title}</strong><span>{detail}</span></button>; }

function SimulationView({ runtime, add, deploy }: { runtime: RuntimeStatus; add(count: number): void; deploy(): void }) {
  return <section className="view active"><div className="view-heading"><div><h1>Simulation</h1><p>Exercise the same fleet and job contracts without hardware.</p></div></div><div className="test-actions"><Action title="Add one headset" detail="Create one deterministic virtual Quest." disabled={runtime.mode !== 'simulation'} onClick={() => add(1)} /><Action title="Add ten headsets" detail="Expand the virtual fleet." disabled={runtime.mode !== 'simulation'} onClick={() => add(10)} /><Action title="Deploy fleet" detail="Run every virtual device asynchronously." disabled={runtime.mode !== 'simulation'} onClick={deploy} /><Action title="5,000-device proof" detail="Run with npm run stress from the repository." disabled onClick={() => undefined} /></div></section>;
}

function DeviceInspector({ device, apk, busy, clear, chooseApk, deploy, run, diagnostic, wifiEndpoint, setWifiEndpoint, connectWifi }: { device: DeviceRecord | null; apk: ApkSelection | null; busy: boolean; clear(): void; chooseApk(): Promise<void>; deploy(): void; run(type: 'install' | 'launch' | 'stop' | 'uninstall'): Promise<void>; diagnostic(type: 'info' | 'logs' | 'screenshot' | 'sidecar'): Promise<void>; wifiEndpoint: string; setWifiEndpoint(value: string): void; connectWifi(): Promise<void> }) {
  return <aside className="inspector" aria-label="Selected headset information"><div className="inspector-heading"><span>Selected headset</span><button className="icon-button" type="button" onClick={clear} aria-label="Clear selected headset">×</button></div>
    {!device && <div className="inspector-empty">Select a headset to see its status and actions.</div>}
    {device && <div className="selected-detail"><div className="selected-title-row"><div><h2>{device.serial}</h2><p>{device.model}</p></div><StatusPill state={device.state} /></div>
      <dl className="detail-list"><div><dt>Connection</dt><dd>{stateLabel(device.connectionState)}</dd></div><div><dt>Current stage</dt><dd>{stateLabel(device.state)}</dd></div><div><dt>Apps installed</dt><dd>{device.packages.length}</dd></div></dl>
      <div className="inspector-actions"><button className="button secondary" type="button" onClick={() => void chooseApk()} disabled={busy}>Choose APK</button><button className="button primary" type="button" onClick={deploy} disabled={busy}>Deploy</button></div>
      <div className="inspector-section"><span>Application</span><div className="field-value">{apk?.name || device.packages[0] || 'No APK selected'}</div><button className="button primary wide-action" type="button" onClick={() => void run('install')} disabled={!apk || busy}>Install APK</button><div className="inspector-actions three"><button className="button secondary" type="button" onClick={() => void run('launch')} disabled={busy}>Launch</button><button className="button secondary" type="button" onClick={() => void run('stop')} disabled={busy}>Stop</button><button className="button secondary" type="button" onClick={() => void diagnostic('logs')} disabled={busy}>Logs</button></div></div>
      <div className="inspector-section"><span>Wi-Fi ADB</span><input className="field-value" value={wifiEndpoint} onChange={event => setWifiEndpoint(event.target.value)} placeholder="192.168.1.20:5555" aria-label="Wi-Fi ADB endpoint" /><button className="button secondary wide-action" type="button" onClick={() => void connectWifi()} disabled={!wifiEndpoint || busy}>Connect</button></div>
      <div className="history-section"><span>Progress</span><div className="timeline">{device.history.slice(-9).map((item, index, values) => <div className={`timeline-item${index === values.length - 1 ? ' current' : ''}`} key={`${item.at}-${index}`}><i /><span>{stateLabel(item.state)}</span></div>)}</div></div>
    </div>}
  </aside>;
}
