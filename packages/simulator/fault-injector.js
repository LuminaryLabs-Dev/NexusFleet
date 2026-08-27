const SUPPORTED_FAULTS = new Set([
  'adb-daemon-down', 'command-timeout', 'install-timeout', 'storage-full', 'incompatible-apk',
  'signature-mismatch', 'version-downgrade', 'launch-failure', 'screenshot-failure', 'log-overflow',
  'wifi-drop', 'provider-rate-limit', 'provider-auth-expired'
]);

export class FaultInjector {
  constructor() { this.faults = new Map(); }

  inject({ serial = '*', type, persistent = false, message, payload = {} }) {
    if (!SUPPORTED_FAULTS.has(type)) throw new Error(`Unsupported Quest Twin fault: ${type}`);
    const fault = { serial, type, persistent: Boolean(persistent), message: message || defaultMessage(type), payload: structuredClone(payload) };
    this.faults.set(`${serial}:${type}`, fault);
    return structuredClone(fault);
  }

  consume(serial, types) {
    for (const type of types) {
      const key = this.faults.has(`${serial}:${type}`) ? `${serial}:${type}` : `*:${type}`;
      const fault = this.faults.get(key);
      if (!fault) continue;
      if (!fault.persistent) this.faults.delete(key);
      return structuredClone(fault);
    }
    return null;
  }

  clear() { this.faults.clear(); }
  snapshot() { return [...this.faults.values()].map(value => structuredClone(value)); }
}

export function throwFault(fault) {
  if (!fault) return;
  const error = new Error(fault.message);
  error.code = fault.type.toUpperCase().replaceAll('-', '_');
  error.details = fault.payload;
  throw error;
}

function defaultMessage(type) {
  return ({
    'adb-daemon-down': 'ADB daemon is unavailable.',
    'command-timeout': 'ADB command timed out.',
    'install-timeout': 'APK installation timed out.',
    'storage-full': 'INSTALL_FAILED_INSUFFICIENT_STORAGE',
    'incompatible-apk': 'INSTALL_FAILED_OLDER_SDK',
    'signature-mismatch': 'INSTALL_FAILED_UPDATE_INCOMPATIBLE',
    'version-downgrade': 'INSTALL_FAILED_VERSION_DOWNGRADE',
    'launch-failure': 'Application failed to launch.',
    'screenshot-failure': 'Screenshot capture failed.',
    'log-overflow': 'Log stream exceeded the configured limit.',
    'wifi-drop': 'Wireless ADB connection dropped.',
    'provider-rate-limit': 'Managed provider rate limit reached.',
    'provider-auth-expired': 'Managed provider authentication expired.'
  })[type] || 'Injected Quest Twin fault.';
}
