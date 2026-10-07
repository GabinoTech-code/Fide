// Spike S1 (docs/adr/0002): checks, on a real development build, that the
// native pieces Fide relies on work together. Opened with a long press on the
// header title. Results can be shared as text for the ADR.
import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SQLite from 'expo-sqlite';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { CameraView, useCameraPermissions } from 'expo-camera';
import sodium from 'react-native-libsodium';
import { runCryptoSelfTest, type SelfTestResult } from '@fide/crypto';
import { parseKioskToken } from '@fide/shared';
import { Colors } from '../../theme/colors';
import { CloseIcon } from '../common/Icons';

interface DiagnosticsModalProps {
  visible: boolean;
  onClose: () => void;
}

type Result = SelfTestResult & { group: string };

// A check returns true, a failure reason, or { info } for a pass with details.
async function attempt(group: string, name: string, fn: () => Promise<true | string | { info: string }>): Promise<Result> {
  try {
    const out = await fn();
    if (out === true) return { group, name, ok: true };
    if (typeof out === 'object') return { group, name, ok: true, detail: out.info };
    return { group, name, ok: false, detail: out };
  } catch (err) {
    return { group, name, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function runAutomaticChecks(): Promise<Result[]> {
  await sodium.ready;
  const results: Result[] = runCryptoSelfTest(sodium).map((r) => ({ ...r, group: 'libsodium' }));

  results.push(
    await attempt('expo-secure-store', 'write / read / delete (this device only)', async () => {
      const value = sodium.to_base64(sodium.randombytes_buf(64));
      const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
      await SecureStore.setItemAsync('fide_diag_key', value, options);
      const back = await SecureStore.getItemAsync('fide_diag_key', options);
      await SecureStore.deleteItemAsync('fide_diag_key', options);
      return back === value || 'value differs';
    }),
    await attempt('expo-local-authentication', 'hardware and enrolment', async () => {
      const hardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      return hardware && enrolled ? { info: `level ${level}` } : `hardware=${hardware} enrolled=${enrolled} level=${level}`;
    }),
    await attempt('expo-sqlite', 'offline outbox table', async () => {
      const db = await SQLite.openDatabaseAsync(':memory:');
      await db.execAsync('CREATE TABLE outbox (id TEXT PRIMARY KEY, payload TEXT NOT NULL)');
      await db.runAsync('INSERT INTO outbox (id, payload) VALUES (?, ?)', 'p1', '{"v":"1"}');
      const row = await db.getFirstAsync<{ payload: string }>('SELECT payload FROM outbox WHERE id = ?', 'p1');
      await db.closeAsync();
      return row?.payload === '{"v":"1"}' || 'row not found';
    }),
  );
  return results;
}

export function DiagnosticsModal({ visible, onClose }: DiagnosticsModalProps) {
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const add = useCallback((r: Result) => setResults((prev) => [...prev.filter((p) => p.name !== r.name), r]), []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    runAutomaticChecks().then((r) => {
      if (!cancelled) setResults(r);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const runInteractive = async (kind: 'biometric' | 'location' | 'push') => {
    setRunning(true);
    if (kind === 'biometric') {
      add(
        await attempt('expo-local-authentication', 'prompt (biometrics or device PIN)', async () => {
          const r = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Fide: verifica diagnostica',
            fallbackLabel: 'Usa il PIN',
          });
          return r.success || `failed: ${r.error}`;
        }),
      );
    }
    if (kind === 'location') {
      add(
        await attempt('expo-location', 'one foreground fix (coordinates are not shown)', async () => {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') return `permission ${status}`;
          // High = GPS: what a punch needs (Balanced uses network location, absent on emulators).
          const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          const accuracy = Math.round(fix.coords.accuracy ?? -1);
          return accuracy >= 0 ? { info: `accuracy ±${accuracy} m, mocked=${fix.mocked ?? false}` } : 'no accuracy reported';
        }),
      );
    }
    if (kind === 'push') {
      add(
        await attempt('expo-notifications', 'permission and Expo push token', async () => {
          if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
              name: 'Fide',
              importance: Notifications.AndroidImportance.DEFAULT,
            });
          }
          const { granted } = await Notifications.requestPermissionsAsync();
          if (!granted) return 'permission denied';
          const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
          if (!projectId) return 'no EAS projectId (run eas init)';
          const token = await Notifications.getExpoPushTokenAsync({ projectId });
          return /^Expo(nent)?PushToken\[/.test(token.data) ? { info: 'token received' } : `unexpected token ${token.data}`;
        }),
      );
    }
    setRunning(false);
  };

  const startScan = async () => {
    const permission = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    if (!permission.granted) {
      add({ group: 'expo-camera', name: 'QR scan', ok: false, detail: 'camera permission denied' });
      return;
    }
    setScanning(true);
  };

  const share = () => {
    const lines = results.map((r) => `${r.ok ? 'OK  ' : 'FAIL'} [${r.group}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    const header = `Fide S1 diagnostics · ${Platform.OS} ${Platform.Version} · ${Constants.expoConfig?.version ?? ''}`;
    Share.share({ message: [header, ...lines].join('\n') });
  };

  const failed = results.filter((r) => !r.ok).length;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Diagnostica dispositivo</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Chiudi">
            <CloseIcon size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.summary}>
          {results.length === 0 ? 'Verifica in corso…' : `${results.length - failed}/${results.length} verifiche superate`}
        </Text>

        {scanning ? (
          <View style={styles.cameraBox}>
            <CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                setScanning(false);
                const token = parseKioskToken(data);
                add({
                  group: 'expo-camera',
                  name: 'QR scan',
                  ok: true,
                  detail: token ? `Fide kiosk token, window ${token.window}` : `read ${data.length} chars (not a Fide token)`,
                });
              }}
            />
          </View>
        ) : null}

        <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 24 }}>
          {results.map((r) => (
            <View key={`${r.group}:${r.name}`} style={styles.row}>
              <Text style={[styles.badge, { color: r.ok ? Colors.accent : Colors.danger }]}>{r.ok ? 'OK' : 'KO'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{r.name}</Text>
                <Text style={styles.rowGroup}>
                  {r.group}
                  {r.detail ? ` · ${r.detail}` : ''}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.actions}>
          {(['biometric', 'location', 'push'] as const).map((kind) => (
            <TouchableOpacity key={kind} style={styles.button} disabled={running} onPress={() => runInteractive(kind)}>
              <Text style={styles.buttonText}>
                {kind === 'biometric' ? 'Biometria' : kind === 'location' ? 'Posizione' : 'Push'}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.button} onPress={startScan}>
            <Text style={styles.buttonText}>QR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.primary]} onPress={share} disabled={results.length === 0}>
            <Text style={[styles.buttonText, { color: '#fff' }]}>Condividi</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, paddingTop: Platform.OS === 'ios' ? 60 : 32, paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  summary: { marginTop: 6, marginBottom: 12, color: Colors.textSecondary },
  cameraBox: { height: 260, borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  list: { flex: 1 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Colors.cardBorder },
  badge: { fontWeight: '700', width: 28 },
  rowTitle: { color: Colors.textPrimary, fontWeight: '600' },
  rowGroup: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 16 },
  button: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.cardBorder },
  primary: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  buttonText: { color: Colors.textPrimary, fontWeight: '600' },
});
