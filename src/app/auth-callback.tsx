import { Redirect } from 'expo-router';

// Google sign-in returns to asta://auth-callback. The code is consumed by openAuthSessionAsync in
// AuthProvider; this route only exists so the router has somewhere to land instead of "unmatched route".
export default function AuthCallback() {
  return <Redirect href="/" />;
}
