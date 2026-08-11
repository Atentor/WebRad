import type { WebRadBridge } from '../shared/contracts';

declare global {
  interface Window {
    webrad: WebRadBridge;
  }
}

export {};
