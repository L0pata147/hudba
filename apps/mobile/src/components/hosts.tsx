import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, AlertCircle, Info, Plus } from 'lucide-react-native';
import { toastStore, usePlaylistMutations, usePlaylists, useSession, useToasts } from '@sonora/core';
import { pluralize } from '@sonora/utils';
import { useSheet } from '../sheet-store';
import { useTheme } from '../theme';
import { Artwork, Button, T } from './ui';

function SheetFrame({ visible, onClose, children, label }: { visible: boolean; onClose: () => void; children: React.ReactNode; label: string }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: t.overlay }} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View accessibilityViewIsModal accessibilityLabel={label} style={{ backgroundColor: t.bgElevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 10, paddingBottom: insets.bottom + 12, maxHeight: 620 }}>
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: t.surfaceActive, marginBottom: 12 }} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ActionSheetHost() {
  const t = useTheme();
  const { sheet, close } = useSheet();
  return (
    <SheetFrame visible={Boolean(sheet)} onClose={close} label={sheet?.title ?? 'Options'}>
      {sheet ? (
        <>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderColor: t.border }}>
            <Artwork coverArtId={sheet.coverArtId} size={96} style={{ width: 48, height: 48, borderRadius: 6 }} />
            <View style={{ flex: 1 }}>
              <T numberOfLines={1} style={{ fontWeight: '700' }}>{sheet.title}</T>
              {sheet.subtitle ? <T variant="caption" dim={1} numberOfLines={1}>{sheet.subtitle}</T> : null}
            </View>
          </View>
          <ScrollView>
            {sheet.actions.map((a) => (
              <Pressable
                key={a.label}
                accessibilityRole="button"
                onPress={() => {
                  close();
                  a.onPress();
                }}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, height: 54, backgroundColor: pressed ? t.surfaceHover : 'transparent' })}
              >
                {a.icon}
                <Text style={{ color: a.danger ? t.danger : t.textPrimary, fontSize: 16, fontWeight: '500' }}>{a.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}
    </SheetFrame>
  );
}

export function AddToPlaylistHost() {
  const t = useTheme();
  const { addToPlaylist: songs, close, openPrompt } = useSheet();
  const playlists = usePlaylists();
  const username = useSession((s) => s.session?.credentials.username);
  const { addSongs, create } = usePlaylistMutations();
  const own = (playlists.data ?? []).filter((p) => !p.owner || p.owner === username);
  return (
    <SheetFrame visible={Boolean(songs)} onClose={close} label="Add to playlist">
      <T variant="h2" style={{ paddingHorizontal: 20, marginBottom: 8 }}>Add to playlist</T>
      <ScrollView>
        <Pressable
          accessibilityRole="button"
          onPress={() => songs && openPrompt({ title: 'New playlist', confirm: 'Create', onSubmit: (name) => create.mutate({ name, songs }) })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 10 }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 6, backgroundColor: t.surfaceActive, alignItems: 'center', justifyContent: 'center' }}>
            <Plus color={t.textPrimary} size={24} />
          </View>
          <T style={{ fontWeight: '600' }}>New playlist</T>
        </Pressable>
        {own.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            onPress={() => {
              if (songs) addSongs.mutate({ id: p.id, name: p.name, songs });
              close();
            }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: pressed ? t.surfaceHover : 'transparent' })}
          >
            <Artwork coverArtId={p.coverArtId} kind="playlist" size={96} style={{ width: 48, height: 48, borderRadius: 6 }} />
            <View style={{ flex: 1 }}>
              <T numberOfLines={1} style={{ fontWeight: '500' }}>{p.name}</T>
              <T variant="caption" dim={1}>{pluralize(p.songCount, 'song')}</T>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SheetFrame>
  );
}

export function PromptHost() {
  const t = useTheme();
  const { prompt, close } = useSheet();
  const [value, setValue] = useState('');
  useEffect(() => setValue(prompt?.initial ?? ''), [prompt]);
  const submit = () => {
    const v = value.trim();
    if (!v || !prompt) return;
    prompt.onSubmit(v);
    close();
  };
  return (
    <SheetFrame visible={Boolean(prompt)} onClose={close} label={prompt?.title ?? 'Input'}>
      <View style={{ paddingHorizontal: 20, gap: 16 }}>
        <T variant="h2">{prompt?.title}</T>
        <TextInput
          value={value}
          onChangeText={setValue}
          autoFocus
          placeholder="Name"
          placeholderTextColor={t.textMuted}
          onSubmitEditing={submit}
          accessibilityLabel="Name"
          style={{ height: 52, borderRadius: 10, backgroundColor: t.surfaceHover, color: t.textPrimary, paddingHorizontal: 16, fontSize: 16 }}
        />
        <Button title={prompt?.confirm ?? 'OK'} onPress={submit} disabled={!value.trim()} />
      </View>
    </SheetFrame>
  );
}

export function ToastHost({ bottom }: { bottom: number }) {
  const t = useTheme();
  const toasts = useToasts();
  const last = toasts.at(-1);
  useEffect(() => {
    if (!last?.duration) return;
    const timer = setTimeout(() => toastStore.getState().dismiss(last.id), last.duration);
    return () => clearTimeout(timer);
  }, [last]);
  if (!last) return null;
  const Icon = last.tone === 'success' ? CheckCircle2 : last.tone === 'error' ? AlertCircle : Info;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, bottom, alignItems: 'center' }}>
      <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.textPrimary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, maxWidth: 520 }}>
        <Icon size={18} color={last.tone === 'error' ? t.danger : last.tone === 'success' ? t.success : t.bg} />
        <Text style={{ color: t.bg, fontWeight: '600', flexShrink: 1 }}>{last.message}</Text>
        {last.action ? (
          <Pressable onPress={() => { last.action?.run(); toastStore.getState().dismiss(last.id); }} hitSlop={8}>
            <Text style={{ color: t.bg, fontWeight: '800' }}>{last.action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
