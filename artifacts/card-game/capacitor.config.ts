import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.donkey.cardgame',
  appName: 'Donkey',
  webDir: 'dist/public',
  server: { androidScheme: process.env.DONKEY_USB_DEBUG === '1' ? 'http' : 'https' },
  android: { backgroundColor: '#080e12' },
};

export default config;
