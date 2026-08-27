import type { DeviceRecord, JobStatus } from '../lib/types';

export function StatusPill({ state, children }: { state: DeviceRecord['state'] | JobStatus; children?: React.ReactNode }) {
  return <span className="state-pill" data-state={state}>{children || stateLabel(state)}</span>;
}

export function stateLabel(state: string) {
  const labels: Record<string, string> = {
    DETECTED: 'Detected', WAITING_FOR_FASTBOOT: 'Waiting for Fastboot', READY: 'Ready', META_ENROLLMENT: 'Meta enrollment',
    WAITING_FOR_BOOT: 'Restarting', ADB_ONLINE: 'Connected', PROVISIONING: 'Installing', VERIFYING: 'Verifying', COMPLETE: 'Complete', FAILED: 'Needs attention',
    queued: 'Queued', running: 'Running', completed: 'Done', failed: 'Attention', cancelled: 'Cancelled',
    device: 'Connected', unauthorized: 'Authorization required', offline: 'Offline', simulated: 'Simulation'
  };
  return labels[state] || state.replaceAll('_', ' ').toLowerCase().replace(/^./, value => value.toUpperCase());
}
