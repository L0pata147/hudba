import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Moon, MoonStar, TimerOff } from 'lucide-react-native';
import { sleepTimerStore, toast, useSleepTimer } from '@sonora/core';
import { useSheet } from '../sheet-store';
import { useTheme } from '../theme';
import { T } from './ui';

const MINUTES = [15, 30, 45, 60, 90];

function useRemaining(endsAt: number | null): string | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (endsAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  if (endsAt == null) return null;
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return left >= 60 ? `${Math.ceil(left / 60)} min` : `${left} s`;
}

/** Player button: pause after some minutes or at the end of the song. */
export function SleepTimerButton() {
  const t = useTheme();
  const open = useSheet((s) => s.open);
  const endsAt = useSleepTimer((s) => s.endsAt);
  const endOfSong = useSleepTimer((s) => s.endOfSong);
  const remaining = useRemaining(endsAt);
  const active = endsAt != null || endOfSong;
  const ic = t.textSecondary;
  const choose = () =>
    open({
      title: 'Sleep timer',
      subtitle: active ? (endOfSong ? 'Stops at the end of this song' : `Stops in ${remaining}`) : 'Stop the music after…',
      actions: [
        ...MINUTES.map((m) => ({
          label: `${m} minutes`,
          icon: <Moon color={ic} size={22} />,
          onPress: () => {
            sleepTimerStore.getState().start(m);
            toast.success(`Music stops in ${m} minutes`);
          },
        })),
        {
          label: 'End of this song',
          icon: <MoonStar color={ic} size={22} />,
          onPress: () => {
            sleepTimerStore.getState().startEndOfSong();
            toast.success('Music stops after this song');
          },
        },
        ...(active ? [{ label: 'Turn off the timer', danger: true, icon: <TimerOff color={t.danger} size={22} />, onPress: () => sleepTimerStore.getState().cancel() }] : []),
      ],
    });
  return (
    <Pressable onPress={choose} accessibilityRole="button" accessibilityLabel={active ? `Sleep timer on${remaining ? `, ${remaining} left` : ', end of song'}` : 'Sleep timer'} hitSlop={10}>
      <View style={{ alignItems: 'center', minWidth: 22 }}>
        <Moon color={active ? t.accent : t.textSecondary} fill={active ? t.accent : 'transparent'} size={22} />
        {active ? <T style={{ color: t.accent, fontSize: 10, fontWeight: '700', marginTop: 2 }}>{remaining ?? 'song'}</T> : null}
      </View>
    </Pressable>
  );
}
