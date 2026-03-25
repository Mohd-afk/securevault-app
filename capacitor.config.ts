import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mohdj.securevault',
  appName: 'SecureVault',
  webDir: 'dist',
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false,         // We control updates manually via updater.ts
      appReadyTimeout: 15000,    // 15s — if notifyAppReady() not called, auto-rollback
      resetWhenUpdate: true,     // Clear old bundles when a new update is applied
    },
  },
};

export default config;
