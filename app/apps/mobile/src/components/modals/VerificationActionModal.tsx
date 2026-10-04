import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Colors } from '../../theme/colors';
import { CloseIcon, ShieldPrivacyIcon, CheckIcon } from '../common/Icons';
import { GeofenceService, GeofenceResult, RotatingQrCode } from '../../services/geofenceService';
import { VerificationMethod } from '../../types';

interface VerificationActionModalProps {
  visible: boolean;
  method: VerificationMethod;
  onClose: () => void;
  onConfirm: () => void;
}

export function VerificationActionModal({
  visible,
  method,
  onClose,
  onConfirm,
}: VerificationActionModalProps) {
  const [geofenceData, setGeofenceData] = useState<GeofenceResult | null>(null);
  const [rotatingQr, setRotatingQr] = useState<RotatingQrCode | null>(null);
  const [qrCountdown, setQrCountdown] = useState(30);

  useEffect(() => {
    if (visible && method === 'geo') {
      const result = GeofenceService.evaluateOnDeviceGeofence();
      setGeofenceData(result);
    }
  }, [visible, method]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (visible && method === 'qr') {
      const updateQr = () => {
        const qr = GeofenceService.getRotatingQr();
        setRotatingQr(qr);
        setQrCountdown(qr.expiresInSeconds);
      };
      updateQr();
      interval = setInterval(updateQr, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [visible, method]);

  const handleExecute = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.subtitle}>Verifica presenze</Text>
              <Text style={styles.title}>
                {method === 'geo'
                  ? 'Geofence sul dispositivo'
                  : method === 'qr'
                  ? 'QR dinamico sede'
                  : 'Tag NFC sicuro'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <CloseIcon size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {/* Geovalla on-device evaluation */}
            {method === 'geo' && geofenceData && (
              <View style={styles.box}>
                <View style={styles.successPill}>
                  <CheckIcon size={16} color={Colors.success} />
                  <Text style={styles.successPillText}>Dentro la sede aziendale ({geofenceData.distanceMeters} m dal perimetro)</Text>
                </View>

                <View style={styles.privacyCard}>
                  <ShieldPrivacyIcon size={20} color={Colors.accent} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.privacyHeading}>Privacy by Design attiva</Text>
                    <Text style={styles.privacyText}>{geofenceData.privacyGuarantee}</Text>
                  </View>
                </View>

                <View style={styles.payloadPreview}>
                  <Text style={styles.payloadTitle}>Payload trasmesso all'azienda:</Text>
                  <Text style={styles.payloadMono}>
                    {JSON.stringify(geofenceData.payloadToSend, null, 2)}
                  </Text>
                </View>
              </View>
            )}

            {/* Rotating 30s QR code */}
            {method === 'qr' && rotatingQr && (
              <View style={styles.box}>
                <View style={styles.qrDisplayBox}>
                  <Text style={styles.qrSite}>{rotatingQr.siteName}</Text>
                  <Text style={styles.qrTokenMono}>{rotatingQr.token}</Text>
                  <View style={styles.countdownRow}>
                    <Text style={styles.countdownLabel}>Aggiornamento tra:</Text>
                    <Text style={styles.countdownVal}>{qrCountdown}s</Text>
                  </View>
                </View>

                <Text style={styles.qrExplainer}>
                  Il token QR ruota ogni 30 secondi con firma HMAC-SHA256 crittografica. Le fotografie inoltrate o memorizzate non sono valide.
                </Text>
              </View>
            )}

            {/* NFC Contactless Tap */}
            {method === 'nfc' && (
              <View style={styles.box}>
                <View style={styles.nfcBox}>
                  <Text style={styles.nfcWave}>📡</Text>
                  <Text style={styles.nfcTitle}>Pronto per lettura tag NFC</Text>
                  <Text style={styles.nfcSub}>Avvicina lo smartphone all'etichetta NFC all'ingresso dell'edificio.</Text>
                </View>

                <View style={styles.nfcChallenge}>
                  <Text style={styles.nfcChallengeLabel}>Sfida crittografica istantanea:</Text>
                  <Text style={styles.nfcChallengeVal}>CHALLENGE-ED25519-NONCE-88F4 (82 ms)</Text>
                </View>
              </View>
            )}

            <TouchableOpacity style={styles.confirmBtn} onPress={handleExecute} activeOpacity={0.85}>
              <Text style={styles.confirmBtnText}>Conferma e Timbra</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 26, 23, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingBottom: 28,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 11,
    color: Colors.accent,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  closeBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: Colors.bg,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  box: {
    gap: 12,
  },
  successPill: {
    backgroundColor: Colors.successBg,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  successPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.success,
  },
  privacyCard: {
    backgroundColor: Colors.accentMuted,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  privacyHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.accentHover,
  },
  privacyText: {
    fontSize: 12,
    color: '#13372B',
    lineHeight: 16,
  },
  payloadPreview: {
    backgroundColor: Colors.bg,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  payloadTitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  payloadMono: {
    fontSize: 11,
    color: Colors.textPrimary,
    fontFamily: 'monospace',
  },
  qrDisplayBox: {
    backgroundColor: Colors.bg,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorderSubtle,
  },
  qrSite: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  qrTokenMono: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: Colors.accent,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  countdownLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  countdownVal: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.accent,
  },
  qrExplainer: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  nfcBox: {
    backgroundColor: Colors.bg,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 6,
  },
  nfcWave: {
    fontSize: 36,
  },
  nfcTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  nfcSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  nfcChallenge: {
    backgroundColor: Colors.accentMuted,
    borderRadius: 12,
    padding: 12,
    gap: 2,
  },
  nfcChallengeLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  nfcChallengeVal: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.accent,
    fontFamily: 'monospace',
  },
  confirmBtn: {
    height: 50,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textWhite,
  },
});
