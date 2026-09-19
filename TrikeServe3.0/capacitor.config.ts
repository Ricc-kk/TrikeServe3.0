import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.trikeserve.app',
  appName: 'TrikeServe',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    // Android 15+ enforces edge-to-edge for apps targeting SDK 35. Without this
    // the WebView is drawn underneath the phone's status bar and navigation bar,
    // which hides app content (and the bottom nav) behind them. "auto" makes
    // Capacitor inset the WebView to the system bars on those devices.
    adjustMarginsForEdgeToEdge: 'auto',
  },
};

export default config;
