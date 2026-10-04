import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Colors } from '../../theme/colors';
import { CloseIcon, LockIcon, CheckIcon } from '../common/Icons';
import { EncryptedPushPayload } from '../../services/pushService';

interface EncryptedPushModalProps {
  visible: boolean;
  pushData: EncryptedPushPayload | null;
  onClose: () => void;
  onNavigateToDocs: () => void;
}

export function EncryptedPushModal({
  visible,
  pushData,
  onClose,
  onNavigateToDocs,
}: EncryptedPushModalProps) {
  if (!pushData) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.subtitle}>Crittografia Push E2EE</Text>
              <Text style={styles.title}>Notifica Push con Payload Cifrato</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <CloseIcon size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {/* Opaque Server View */}
            <View style={styles.sectionCard}>
              <View style={styles.badgeRow}>
                <View style={styles.serverBadge}>
                  <Text style={styles.serverBadgeText}>Cosa vedono Apple APNs / Google FCM</Text>
                </View>
              </View>
              <Text style={styles.explainer}>
                I server intermedi di notifica vedono solo un pacchetto opaco cifrato. Zero testo o dati in chiaro transitano attraverso i server Apple o Google:
              </Text>
              <View style={styles.monoBox}>
                <Text style={styles.monoKey}>Ciphertext (XChaCha20):</Text>
                <Text style={styles.monoVal} numberOfLines={2}>{pushData.opaqueServerView.encryptedCiphertext}</Text>
                <Text style={styles.monoKey}>Poly1305 Auth Tag:</Text>
                <Text style={styles.monoVal}>{pushData.opaqueServerView.authTag}</Text>
                <Text style={styles.monoKey}>Nonce:</Text>
                <Text style={styles.monoVal}>{pushData.opaqueServerView.nonce}</Text>
              </View>
            </View>

            {/* Decrypted Local View */}
            <View style={[styles.sectionCard, styles.clientCard]}>
              <View style={styles.badgeRow}>
                <View style={styles.clientBadge}>
                  <CheckIcon size={14} color={Colors.success} />
                  <Text style={styles.clientBadgeText}>Decifrato in locale sul dispositivo</Text>
                </View>
              </View>
              <View style={styles.clearTextBox}>
                <Text style={styles.clearTitle}>{pushData.decryptedClientView.title}</Text>
                <Text style={styles.clearBody}>{pushData.decryptedClientView.body}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.openBtn}
              onPress={() => {
                onClose();
                onNavigateToDocs();
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.openBtnText}>Visualizza cedolino decifrato →</Text>
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
    fontSize: 18,
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
    gap: 14,
  },
  sectionCard: {
    backgroundColor: Colors.bg,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  clientCard: {
    backgroundColor: Colors.accentMuted,
  },
  badgeRow: {
    flexDirection: 'row',
  },
  serverBadge: {
    backgroundColor: Colors.cardBorderSubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  serverBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  clientBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  clientBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.success,
  },
  explainer: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  monoBox: {
    backgroundColor: Colors.cardBg,
    borderRadius: 10,
    padding: 10,
    gap: 2,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  monoKey: {
    fontSize: 10,
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
  monoVal: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: Colors.textPrimary,
  },
  clearTextBox: {
    gap: 4,
  },
  clearTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  clearBody: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  openBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textWhite,
  },
});
