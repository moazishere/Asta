import type { ExpoConfig } from 'expo/config';

// TODO(before first release): replace the placeholder identifiers below.
const BUNDLE_ID = 'com.example.asta';

const config: ExpoConfig = {
  name: 'Asta',
  slug: 'asta',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'asta',
  // The app is dark-only. 'dark' also makes system UI (native tab bar, alerts, keyboard) follow suit.
  userInterfaceStyle: 'dark',
  ios: {
    bundleIdentifier: BUNDLE_ID,
    icon: './assets/expo.icon',
    infoPlist: {
      UIBackgroundModes: ['location'],
      NSLocationWhenInUseUsageDescription:
        'Asta uses your location to track your run and draw your route.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'Asta keeps tracking your run while your screen is locked or the app is in the background.',
    },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'POST_NOTIFICATIONS',
    ],
    config: {
      // react-native-maps needs a Google Maps key on Android (iOS uses Apple Maps).
      googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY },
    },
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      { backgroundColor: '#208AEF', image: './assets/images/splash-icon.png', imageWidth: 76 },
    ],
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Asta keeps tracking your run while your screen is locked or the app is in the background.',
        locationWhenInUsePermission:
          'Asta uses your location to track your run and draw your route.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        isIosBackgroundLocationEnabled: true,
      },
    ],
    'expo-secure-store',
    'expo-sqlite',
    'expo-notifications',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
