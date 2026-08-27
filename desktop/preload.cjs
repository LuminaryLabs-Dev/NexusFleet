const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, listener) {
  const wrapped = (_event, value) => listener(value);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('nexusFleet', {
  runtime: {
    getStatus: () => ipcRenderer.invoke('runtime:status'),
    setMode: mode => ipcRenderer.invoke('runtime:set-mode', mode)
  },
  devices: {
    list: () => ipcRenderer.invoke('devices:list'),
    refresh: () => ipcRenderer.invoke('devices:refresh'),
    inspect: serial => ipcRenderer.invoke('devices:inspect', serial),
    addSimulated: count => ipcRenderer.invoke('devices:add-simulated', count),
    deploy: serial => ipcRenderer.invoke('devices:deploy', serial),
    connectWifi: endpoint => ipcRenderer.invoke('devices:connect-wifi', endpoint),
    disconnectWifi: endpoint => ipcRenderer.invoke('devices:disconnect-wifi', endpoint),
    subscribe: listener => subscribe('devices:changed', listener)
  },
  apps: {
    chooseApk: () => ipcRenderer.invoke('apps:choose-apk'),
    install: request => ipcRenderer.invoke('apps:install', request),
    launch: request => ipcRenderer.invoke('apps:launch', request),
    stop: request => ipcRenderer.invoke('apps:stop', request),
    uninstall: request => ipcRenderer.invoke('apps:uninstall', request)
  },
  diagnostics: {
    readInfo: serial => ipcRenderer.invoke('diagnostics:info', serial),
    captureScreenshot: serial => ipcRenderer.invoke('diagnostics:screenshot', serial),
    readLogs: serial => ipcRenderer.invoke('diagnostics:logs', serial),
    sidecarHealth: () => ipcRenderer.invoke('diagnostics:sidecar')
  },
  jobs: {
    list: () => ipcRenderer.invoke('jobs:list'),
    cancel: id => ipcRenderer.invoke('jobs:cancel', id),
    retry: id => ipcRenderer.invoke('jobs:retry', id),
    subscribe: listener => subscribe('jobs:changed', listener)
  }
});
