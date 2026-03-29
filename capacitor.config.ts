import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mohdj.securevault',
  appName: 'SecureVault',
  webDir: 'dist',
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false,         // We control updates manually via updater.ts
      appReadyTimeout: 30000,    // 30s — generous timeout to account for slow first load
      resetWhenUpdate: false,    // Do NOT clear localStorage on update — breaks our OTA debug markers and session state
    },
  },
};

export default config;
