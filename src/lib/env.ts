// Single place that reads public env vars. Fails loudly instead of sending requests to "undefined".
// NOTE: EXPO_PUBLIC_* values are inlined into the bundle, so they must never be secrets.
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}

export const env = {
  // Base URL of the Express API, no trailing slash. A phone cannot reach "localhost": use your PC's
  // LAN IP (http://192.168.x.x:3000) in development, or the deployed https URL.
  apiUrl: required('EXPO_PUBLIC_API_URL', process.env.EXPO_PUBLIC_API_URL).replace(/\/+$/, ''),
};
