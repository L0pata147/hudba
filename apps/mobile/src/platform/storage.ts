import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { KeyValueStorage } from '@sonora/core';

export const asyncStorage: KeyValueStorage = {
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
  removeItem: (k) => AsyncStorage.removeItem(k),
};

/** SecureStore keys may only contain [A-Za-z0-9._-]. */
const secureKey = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

/** Session token in the iOS Keychain / Android Keystore. */
export const secureStorage: KeyValueStorage = {
  getItem: (k) => SecureStore.getItemAsync(secureKey(k)),
  setItem: (k, v) => SecureStore.setItemAsync(secureKey(k), v, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }),
  removeItem: (k) => SecureStore.deleteItemAsync(secureKey(k)),
};
