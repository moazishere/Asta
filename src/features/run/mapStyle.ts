import { colors } from '@/theme';

// Dark map style for Google Maps (Android), built from the theme tokens so the map matches the app.
// Apple Maps (iOS) ignores this and uses userInterfaceStyle="dark" instead.
export const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: colors.surface }] },
  { elementType: 'labels.text.fill', stylers: [{ color: colors.textMuted }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: colors.bg }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: colors.surfaceRaised }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: colors.border }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: colors.bg }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];
