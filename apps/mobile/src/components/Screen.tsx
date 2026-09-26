import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useTheme } from '../theme';

/** Floating back button for pushed detail screens. */
export function BackButton() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={10}
      style={{ position: 'absolute', top: insets.top + 8, left: 12, zIndex: 10, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}
    >
      <ChevronLeft color={t.textPrimary} size={24} />
    </Pressable>
  );
}

export function TopInset({ children }: { children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={{ paddingTop: insets.top + 8 }}>{children}</View>;
}
