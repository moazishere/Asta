import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import 'react-native-url-polyfill/auto';

import { env } from './env';

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    // AsyncStorage (not SecureStore): the session JSON exceeds SecureStore's ~2 KB value limit.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // There is no browser URL to parse in a native app; OAuth codes are exchanged manually.
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

// Only refresh tokens while the app is in the foreground (recommended by Supabase for React Native).
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
