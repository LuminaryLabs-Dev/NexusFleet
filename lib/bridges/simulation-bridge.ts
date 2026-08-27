import type { DeviceRecord, JobRecord, JobStatus, NexusFleetBridge, OperationRequest, RuntimeMode } from '../types';

const pipeline = ['WAITING_FOR_FASTBOOT', 'READY', 'META_ENROLLMENT', 'WAITING_FOR_BOOT', 'ADB_ONLINE', 'PROVISIONING', 'VERIFYING', 'COMPLETE'];

export class SimulationBridge implements NexusFleetBridge {
  private devicesMap = new Map<string, DeviceRecord>();
  private jobRecords: JobRecord[] = [];
  private deviceListeners = new Set<(devices: DeviceRecord[]) => void>();
  private jobListeners = new Set<(jobs: JobRecord[]) => void>();
  private sequence = 0;
  private mode: RuntimeMode = 'simulation';

  constructor() { this.addDevices(6); }

  runtime = {
    getStatus: async () => ({ mode: this.mode, ready: this.mode === 'simulation', message: this.mode === 'simulation' ? 'Simulation active' : 'Desktop app required for local devices', sidecarAvailable: false }),
    setMode: async (mode: RuntimeMode) => { this.mode = mode; return this.runtime.getStatus(); }
  };

  devices = {
    list: async () => this.snapshot(),
    refresh: async () => this.snapshot(),
    inspect: async (serial: string) => {
      const device = this.requireDevice(serial);
      return structuredClone(device);
    },
    addSimulated: async (count = 1) => this.addDevices(count),
    deploy: async (serial?: string) => {
      const targets = serial ? [serial] : [...this.devicesMap.keys()];
      const jobs = targets.map(target => this.makeJob('deploy', target));
      void Promise.all(targets.map((target, index) => this.runDeployment(target, jobs[index])));
      return jobs;
    },
    connectWifi: async (endpoint: string) => `Simulated Wi-Fi connection to ${endpoint}`,
    disconnectWifi: async () => undefined,
    subscribe: (listener: (devices: DeviceRecord[]) => void) => {
      this.deviceListeners.add(listener);
      return () => { this.deviceListeners.delete(listener); };
    }
  };

  apps = {
    chooseApk: async () => ({ path: 'reboot-demo.apk', name: 'reboot-demo.apk', packageName: 'reboot-demo' }),
    install: async (request: OperationRequest) => this.completeOperation('install', request.serial, `${request.apkPath || 'demo.apk'} installed`, device => {
      const packageName = (request.apkPath || 'demo.apk').split(/[\\/]/).pop()!.replace(/\.apk$/i, '');
      if (!device.packages.includes(packageName)) device.packages.push(packageName);
    }),
    launch: async (request: OperationRequest) => this.completeOperation('launch', request.serial, `${request.packageName || 'app'} launched`),
    stop: async (request: OperationRequest) => this.completeOperation('stop', request.serial, `${request.packageName || 'app'} stopped`),
    uninstall: async (request: OperationRequest) => this.completeOperation('uninstall', request.serial, `${request.packageName || 'app'} removed`, device => {
      device.packages = device.packages.filter(name => name !== request.packageName);
    })
  };

  diagnostics = {
    readInfo: async (serial: string) => {
      const device = this.requireDevice(serial);
      return `Serial: ${device.serial}\nModel: ${device.model}\nConnection: Simulation`;
    },
    captureScreenshot: async (serial: string) => ({ path: `simulation://${serial}/screenshot.png` }),
    readLogs: async (serial: string) => [`${serial}: simulated log stream ready`, `${serial}: no physical headset changed`],
    sidecarHealth: async () => ({ available: false, message: 'Python sidecar is available only in the desktop build' })
  };

  jobs = {
    list: async () => structuredClone(this.jobRecords),
    cancel: async (jobId: string) => {
      const job = this.jobRecords.find(candidate => candidate.id === jobId);
      if (job && ['queued', 'running'].includes(job.status)) {
        job.status = 'cancelled'; job.message = 'Cancelled'; this.emitJobs();
      }
    },
    retry: async (jobId: string) => {
      const prior = this.jobRecords.find(candidate => candidate.id === jobId);
      if (!prior) throw new Error(`Unknown job ${jobId}`);
      return this.completeOperation(prior.type, prior.serial, `${prior.type} completed after retry`);
    },
    subscribe: (listener: (jobs: JobRecord[]) => void) => {
      this.jobListeners.add(listener);
      return () => { this.jobListeners.delete(listener); };
    }
  };

  private addDevices(count: number) {
    for (let index = 0; index < count; index += 1) {
      this.sequence += 1;
      const serial = `REBOOT-${String(this.sequence).padStart(4, '0')}`;
      this.devicesMap.set(serial, {
        serial, model: this.sequence % 3 === 0 ? 'Quest 3' : 'Quest 3S', state: 'DETECTED', connectionState: 'simulated', connection: 'simulation', profile: 'Reboot Quest Kiosk', packages: [], history: [{ state: 'DETECTED', at: Date.now() }]
      });
    }
    this.emitDevices();
    return this.snapshot();
  }

  private snapshot() { return structuredClone([...this.devicesMap.values()].reverse()); }
  private requireDevice(serial: string) {
    const device = this.devicesMap.get(serial);
    if (!device) throw new Error(`Unknown device ${serial}`);
    return device;
  }
  private makeJob(type: string, serial: string) {
    const job: JobRecord = { id: crypto.randomUUID(), type, serial, status: 'queued', progress: 0, message: 'Queued', createdAt: Date.now() };
    this.jobRecords.unshift(job); this.emitJobs(); return structuredClone(job);
  }
  private async runDeployment(serial: string, jobCopy: JobRecord) {
    const job = this.jobRecords.find(candidate => candidate.id === jobCopy.id)!;
    const device = this.requireDevice(serial);
    job.status = 'running';
    for (let index = 0; index < pipeline.length; index += 1) {
      if ((job.status as JobStatus) === 'cancelled') return;
      await new Promise(resolve => setTimeout(resolve, 90));
      device.state = pipeline[index]; device.history.push({ state: device.state, at: Date.now() });
      job.progress = (index + 1) / pipeline.length; job.message = device.state.replaceAll('_', ' ').toLowerCase();
      this.emitDevices(); this.emitJobs();
    }
    job.status = 'completed'; job.message = 'Deployment complete'; job.completedAt = Date.now(); this.emitJobs();
  }
  private async completeOperation(type: string, serial: string, message: string, mutate?: (device: DeviceRecord) => void) {
    const created = this.makeJob(type, serial);
    const job = this.jobRecords.find(candidate => candidate.id === created.id)!;
    const device = this.requireDevice(serial);
    job.status = 'running'; this.emitJobs(); await new Promise(resolve => setTimeout(resolve, 100));
    mutate?.(device); job.status = 'completed'; job.progress = 1; job.message = message; job.completedAt = Date.now();
    this.emitDevices(); this.emitJobs(); return structuredClone(job);
  }
  private emitDevices() { const value = this.snapshot(); for (const listener of this.deviceListeners) listener(value); }
  private emitJobs() { const value = structuredClone(this.jobRecords); for (const listener of this.jobListeners) listener(value); }
}
