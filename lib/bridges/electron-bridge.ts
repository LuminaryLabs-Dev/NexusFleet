import type { NexusFleetBridge } from '../types';
export function getElectronBridge(): NexusFleetBridge | null {
  return typeof window !== 'undefined' && window.nexusFleet ? window.nexusFleet : null;
}
