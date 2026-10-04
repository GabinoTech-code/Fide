import AsyncStorage from '@react-native-async-storage/async-storage';

const memoryFallback = new Map<string, string>();

export const StorageService = {
  async getItem<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const value = await AsyncStorage.getItem(key);
      if (value !== null) {
        return JSON.parse(value) as T;
      }
    } catch {
      const memVal = memoryFallback.get(key);
      if (memVal) {
        try {
          return JSON.parse(memVal) as T;
        } catch {
          // fallback to default
        }
      }
    }
    return defaultValue;
  },

  async setItem<T>(key: string, value: T): Promise<void> {
    const json = JSON.stringify(value);
    try {
      await AsyncStorage.setItem(key, json);
    } catch {
      memoryFallback.set(key, json);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      memoryFallback.delete(key);
    }
  },

  async clear(): Promise<void> {
    try {
      await AsyncStorage.clear();
    } catch {
      memoryFallback.clear();
    }
  }
};
