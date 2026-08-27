import type { NexusFleetBridge } from './types';
import { getElectronBridge } from './bridges/electron-bridge';
import { SimulationBridge } from './bridges/simulation-bridge';

let simulationBridge: SimulationBridge | null = null;
export function getBridge(): NexusFleetBridge {
  const electron = getElectronBridge();
  if (electron) return electron;
  simulationBridge ??= new SimulationBridge();
  return simulationBridge;
}
