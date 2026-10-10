import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export const pushSupported = Platform.OS === 'ios' || Platform.OS === 'android';
const preference = (keyId: string) => `fide.push.enabled.${keyId}`;
// Serialize register/remove: a late token request must never undo sign-out.
let pending: Promise<unknown> = Promise.resolve();
const stopping = new Set<string>();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = pending.then(work, work);
  pending = next.catch(() => undefined);
  return next;
}

export async function pushEnabled(keyId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(preference(keyId))) === 'true';
}

export function unregisterPush(keyId: string): Promise<void> {
  stopping.add(keyId);
  return serial(async () => {
    const { error } = await supabase.rpc('unregister_push_token', { p_device_key_id: keyId });
    if (error) throw new Error('push_unregister_failed');
    await AsyncStorage.setItem(preference(keyId), 'false');
  });
}

export function registerPush(keyId: string, userId: string, askPermission: boolean): Promise<boolean> {
  // Only a new explicit opt-in may resume after logout/disable.
  if (askPermission) stopping.delete(keyId);
  return serial(async () => {
    if (!pushSupported || stopping.has(keyId)) return false;
    if (!askPermission && !await pushEnabled(keyId)) return false;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Fide', importance: Notifications.AndroidImportance.DEFAULT });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && askPermission && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) {
      const { error } = await supabase.rpc('unregister_push_token', { p_device_key_id: keyId });
      if (error) throw new Error('push_unregister_failed');
      return false;
    }
    const projectId: unknown = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (typeof projectId !== 'string' || !projectId) throw new Error('push_project_missing');
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    if (stopping.has(keyId)) return false;
    const { data } = await supabase.auth.getSession();
    if (stopping.has(keyId)) return false;
    if (data.session?.user.id !== userId) throw new Error('push_session_changed');
    const { error } = await supabase.rpc('register_push_token', {
      p_device_key_id: keyId, p_token: token.data, p_platform: Platform.OS,
    });
    if (error) throw new Error('push_register_failed');
    await AsyncStorage.setItem(preference(keyId), 'true');
    return true;
  });
}

export async function disablePush(keyId: string): Promise<void> {
  await unregisterPush(keyId);
  await Notifications.dismissAllNotificationsAsync();
}

/** A tap always uses the app's authenticated entry gate, never a supplied URL. */
export function observePushResponses(openHome: () => void): () => void {
  if (!pushSupported) return () => undefined;
  const open = () => { Notifications.clearLastNotificationResponse(); openHome(); };
  const subscription = Notifications.addNotificationResponseReceivedListener(open);
  if (Notifications.getLastNotificationResponse()) open();
  return () => subscription.remove();
}

if (pushSupported) {
  Notifications.setNotificationHandler({ handleNotification: async () => {
    const { data } = await supabase.auth.getSession();
    return { shouldShowBanner: !!data.session, shouldShowList: !!data.session, shouldPlaySound: false, shouldSetBadge: false };
  } });
}
