// Kiosk QR scanner. Returns the token to the punch screen through a tiny store.
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { parseKioskToken } from '@fide/shared';
import { useT } from '../i18n/app';
import { scannedToken } from '../lib/scanStore';
import { Colors } from '../theme/colors';
import { Body, Button, Notice, Screen, Title } from '../ui/kit';

export default function Scan() {
  const { t } = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const [wrong, setWrong] = useState(false);
  const done = useRef(false);

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <Screen>
        <Title>{t('scan.title')}</Title>
        <Body muted>{t('scan.permission')}</Body>
        <Button label={t('scan.allow')} icon="qr" onPress={requestPermission} />
        <Button kind="secondary" label={t('common.cancel')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.dark }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (done.current) return;
          if (!parseKioskToken(data)) {
            setWrong(true);
            return;
          }
          done.current = true;
          scannedToken.set(data);
          router.back();
        }}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <Title light>{t('scan.title')}</Title>
        <View style={styles.frame} />
        {wrong ? <Notice kind="warn">{t('scan.notFide')}</Notice> : null}
        <Button kind="secondary" label={t('common.cancel')} onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, padding: 24, paddingTop: 72, gap: 24, justifyContent: 'space-between' },
  frame: { alignSelf: 'center', width: 260, height: 260, borderRadius: 28, borderWidth: 3, borderColor: Colors.accentLight },
});
