import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { colors, radii, sizes } from '@/theme';

type Props = {
  name: string;
  uri?: string | null;
  size?: keyof Pick<typeof sizes, 'avatarSm' | 'avatarMd' | 'avatarLg'>;
  /** Lime outline, used for "me" / the leader. */
  ring?: boolean;
};

export function Avatar({ name, uri, size = 'avatarMd', ring = false }: Props) {
  const dim = sizes[size];
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      style={[
        styles.base,
        { width: dim, height: dim },
        ring && { borderWidth: 2, borderColor: colors.accent },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <Text variant={size === 'avatarLg' ? 'h1' : 'bodyStrong'}>{initial}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
