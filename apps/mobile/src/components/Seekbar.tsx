import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { playerStore, usePlayerShallow } from '@sonora/core';
import { formatDuration } from '@sonora/utils';
import { useTheme } from '../theme';
import { T } from './ui';

export function Seekbar() {
  const t = useTheme();
  const { position, duration } = usePlayerShallow((s) => ({ position: s.position, duration: s.duration }));
  const [width, setWidth] = useState(1);
  const [scrub, setScrub] = useState<number | null>(null);
  const shown = scrub ?? position;
  const pct = duration > 0 ? Math.min(1, shown / duration) : 0;
  const at = (x: number) => Math.max(0, Math.min(1, x / width)) * duration;
  const commit = (x: number) => {
    playerStore.getState().seek(at(x));
    setScrub(null);
  };
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => runOnJS(setScrub)(at(e.x)))
    .onUpdate((e) => runOnJS(setScrub)(at(e.x)))
    .onEnd((e) => runOnJS(commit)(e.x));
  return (
    <View>
      <GestureDetector gesture={pan}>
        <View
          onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
          style={{ height: 28, justifyContent: 'center' }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Seek"
          accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(shown), text: `${formatDuration(shown)} of ${formatDuration(duration)}` }}
          onAccessibilityAction={(e) => playerStore.getState().seekBy(e.nativeEvent.actionName === 'increment' ? 10 : -10)}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        >
          <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <View style={{ height: 4, borderRadius: 2, width: `${pct * 100}%`, backgroundColor: t.textPrimary }} />
          </View>
          <View style={{ position: 'absolute', left: `${pct * 100}%`, marginLeft: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: t.textPrimary }} />
        </View>
      </GestureDetector>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T variant="caption" dim={1}>{formatDuration(shown)}</T>
        <T variant="caption" dim={1}>{formatDuration(duration)}</T>
      </View>
    </View>
  );
}
