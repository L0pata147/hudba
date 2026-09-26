import { Platform } from 'react-native';
import { bootstrapSonora, setAudioEngine, startQueueSync } from '@sonora/core';
import { asyncStorage, secureStorage } from './storage';
import { ExpoAudioEngine } from './audio-engine';
import { createFileSystemOfflineAdapter } from './offline';

let started = false;

export async function initPlatform(): Promise<void> {
  if (started) return;
  started = true;
  await bootstrapSonora({
    storage: asyncStorage,
    secureStorage,
    offline: createFileSystemOfflineAdapter(),
    clientName: 'Sonora',
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  });
  setAudioEngine(new ExpoAudioEngine());
  startQueueSync();
}
