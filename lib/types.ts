export type RuntimeMode = 'simulation' | 'local' | 'managed';
export type DeviceConnectionState = 'device' | 'unauthorized' | 'offline' | 'simulated';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface DeviceRecord {
  serial: string;
  model: string;
  state: string;
  connectionState: DeviceConnectionState;
  connection: 'simulation' | 'usb' | 'wifi';
  profile: string;
  packages: string[];
  history: Array<{ state: string; at: number }>;
  error?: string | null;
}

export interface RuntimeStatus {
  mode: RuntimeMode;
  ready: boolean;
  message: string;
  adbPath?: string | null;
  sidecarAvailable?: boolean;
}

export interface JobRecord {
  id: string;
  type: string;
  serial: string;
  status: JobStatus;
  progress: number;
  message: string;
  createdAt: number;
  completedAt?: number;
}

export interface ApkSelection { path: string; name: string; packageName?: string; }
export interface OperationRequest { serial: string; apkPath?: string; packageName?: string; }
export interface FileResult { path: string; }
export type Unsubscribe = () => void;

export interface NexusFleetBridge {
  runtime: {
    getStatus(): Promise<RuntimeStatus>;
    setMode(mode: RuntimeMode): Promise<RuntimeStatus>;
  };
  devices: {
    list(): Promise<DeviceRecord[]>;
    refresh(): Promise<DeviceRecord[]>;
    inspect(serial: string): Promise<DeviceRecord>;
    addSimulated(count?: number): Promise<DeviceRecord[]>;
    deploy(serial?: string): Promise<JobRecord[]>;
    connectWifi(endpoint: string): Promise<string>;
    disconnectWifi(endpoint: string): Promise<void>;
    subscribe(listener: (devices: DeviceRecord[]) => void): Unsubscribe;
  };
  apps: {
    chooseApk(): Promise<ApkSelection | null>;
    install(request: OperationRequest): Promise<JobRecord>;
    launch(request: OperationRequest): Promise<JobRecord>;
    stop(request: OperationRequest): Promise<JobRecord>;
    uninstall(request: OperationRequest): Promise<JobRecord>;
  };
  diagnostics: {
    readInfo(serial: string): Promise<string>;
    captureScreenshot(serial: string): Promise<FileResult>;
    readLogs(serial: string): Promise<string[]>;
    sidecarHealth(): Promise<{ available: boolean; message: string }>;
  };
  jobs: {
    list(): Promise<JobRecord[]>;
    cancel(jobId: string): Promise<void>;
    retry(jobId: string): Promise<JobRecord>;
    subscribe(listener: (jobs: JobRecord[]) => void): Unsubscribe;
  };
}

declare global {
  interface Window { nexusFleet?: NexusFleetBridge; }
}
