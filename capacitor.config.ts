import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mohdj.securevault',
  appName: 'SecureVault',
  webDir: 'dist',
  bundledWebRuntime: false,
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false, // We control updates manually via updater.ts
    },
  },
};

export default config;
