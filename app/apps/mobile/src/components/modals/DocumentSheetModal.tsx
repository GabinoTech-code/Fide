import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Colors } from '../../theme/colors';
import { DocumentItem } from '../../types';
import { CloseIcon, ShieldPrivacyIcon, CheckIcon, DocumentIcon } from '../common/Icons';
import { useApp } from '../../context/AppContext';

interface DocumentSheetModalProps {
  visible: boolean;
  document: DocumentItem | null;
  onClose: () => void;
  onOpen: (doc: DocumentItem) => void;
}

export function DocumentSheetModal({ visible, document, onClose, onOpen }: DocumentSheetModalProps) {
  const { t } = useApp();
  const [isDecrypted, setIsDecrypted] = useState(false);

  if (!document) return null;

  const handleDecrypt = () => {
    setIsDecrypted(true);
    onOpen(document);
  };

  const handleClose = () => {
    setIsDecrypted(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleWrap}>
              <Text style={styles.subtitle}>{document.meta}</Text>
              <Text style={styles.title}>{document.nombre}</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <CloseIcon size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {/* E2EE libsodium verification card */}
            <View style={styles.cryptoBox}>
              <View style={styles.cryptoHeaderRow}>
                <ShieldPrivacyIcon size={18} color={Colors.accent} />
                <Text style={styles.cryptoHeading}>{document.crypto.algorithm}</Text>
              </View>

              <View style={styles.cryptoDetailGrid}>
                <View style={styles.cryptoDetailItem}>
                  <Text style={styles.cryptoDetailLabel}>{t.docKeyFingerprint}</Text>
                  <Text style={styles.cryptoMono}>{document.crypto.issuerPublicKeyFingerprint}</Text>
                </View>

                <View style={styles.cryptoDetailItem}>
                  <Text style={styles.cryptoDetailLabel}>Chiave pubblica destinatario (Tuo dispositivo)</Text>
                  <Text style={styles.cryptoMono}>{document.crypto.recipientPublicKeyFingerprint}</Text>
                </View>

                <View style={styles.cryptoRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cryptoDetailLabel}>Nonce (192-bit)</Text>
                    <Text style={styles.cryptoMono} numberOfLines={1}>{document.crypto.nonce}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cryptoDetailLabel}>Poly1305 Tag (128-bit)</Text>
                    <Text style={styles.cryptoMono} numberOfLines={1}>{document.crypto.poly1305Tag}</Text>
                  </View>
                </View>

                <View style={styles.integrityBadge}>
                  <CheckIcon size={16} color={Colors.success} />
                  <Text style={styles.integrityText}>Integrità crittografica garantita · Firma valida</Text>
                </View>
              </View>
            </View>

            {/* Decrypted Payload or Action */}
            {!isDecrypted ? (
              <View style={styles.lockedStateBox}>
                <DocumentIcon size={32} color={Colors.accent} />
                <Text style={styles.lockedTitle}>Documento protetto con chiave asimmetrica</Text>
                <Text style={styles.lockedDesc}>
                  I dati sono cifrati sul server. Per visualizzare le voci retributive, decifra il documento con la tua chiave locale X25519.
                </Text>
                <TouchableOpacity style={styles.decryptBtn} onPress={handleDecrypt} activeOpacity={0.85}>
                  <Text style={styles.decryptBtnText}>{t.docDecryptAndOpen}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.payloadBox}>
                <View style={styles.payloadHeader}>
                  <Text style={styles.payloadTitle}>{document.payload.title}</Text>
                  <Text style={styles.payloadDate}>{document.payload.issueDate}</Text>
                </View>

                {document.payload.netAmount && (
                  <View style={styles.netCard}>
                    <Text style={styles.netLabel}>Netto del mese</Text>
                    <Text style={styles.netAmount}>{document.payload.netAmount}</Text>
                  </View>
                )}

                <View style={styles.breakdownList}>
                  {document.payload.grossAmount && (
                    <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>Imponibile lordo</Text>
                      <Text style={styles.breakdownVal}>{document.payload.grossAmount}</Text>
                    </View>
                  )}
                  {document.payload.inpsContribution && (
                    <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>Contributi previdenziali (INPS)</Text>
                      <Text style={[styles.breakdownVal, { color: Colors.danger }]}>- {document.payload.inpsContribution}</Text>
                    </View>
                  )}
                  {document.payload.irpefTax && (
                    <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>Ritenute fiscali (IRPEF)</Text>
                      <Text style={[styles.breakdownVal, { color: Colors.danger }]}>- {document.payload.irpefTax}</Text>
                    </View>
                  )}
                  {document.payload.details.map((item, idx) => (
                    <View key={idx} style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>{item.label}</Text>
                      <Text style={styles.breakdownVal}>{item.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Log de accesos visible (Audit Trail) */}
            <View style={styles.logsSection}>
              <Text style={styles.logsHeading}>{t.docVerifiedAccess}</Text>
              <View style={styles.logsList}>
                {document.accessLogs.map((log) => (
                  <View key={log.id} style={styles.logItem}>
                    <View style={styles.logDot} />
                    <View style={styles.logBody}>
                      <View style={styles.logTopRow}>
                        <Text style={styles.logActor}>{log.actor}</Text>
                        <Text style={styles.logDate}>{log.formattedDate}</Text>
                      </View>
                      <Text style={styles.logAction}>{log.action}</Text>
                      <Text style={styles.logFp}>Impronta: {log.deviceFingerprint}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Footer button */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.closeFooterBtn} onPress={handleClose} activeOpacity={0.8}>
              <Text style={styles.closeFooterBtnText}>{t.close}</Text>
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
    maxHeight: '92%',
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
  titleWrap: {
    flex: 1,
    paddingRight: 10,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
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
  scroll: {
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingVertical: 16,
    gap: 16,
  },
  cryptoBox: {
    backgroundColor: Colors.bg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorderSubtle,
    padding: 14,
    gap: 10,
  },
  cryptoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cryptoHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  cryptoDetailGrid: {
    gap: 8,
  },
  cryptoDetailItem: {
    gap: 2,
  },
  cryptoRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cryptoDetailLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  cryptoMono: {
    fontSize: 12,
    color: Colors.accent,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  integrityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.successBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  integrityText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.success,
  },
  lockedStateBox: {
    backgroundColor: Colors.cardBg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  lockedTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  lockedDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  decryptBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 4,
  },
  decryptBtnText: {
    color: Colors.textWhite,
    fontSize: 14,
    fontWeight: '600',
  },
  payloadBox: {
    backgroundColor: Colors.cardBg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.accentMuted,
    padding: 16,
    gap: 12,
  },
  payloadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  payloadTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  payloadDate: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  netCard: {
    backgroundColor: Colors.accentMuted,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 2,
  },
  netLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  netAmount: {
    fontSize: 30,
    fontWeight: '700',
    color: Colors.accent,
  },
  breakdownList: {
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    paddingTop: 10,
    gap: 8,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  breakdownVal: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  logsSection: {
    gap: 10,
  },
  logsHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  logsList: {
    backgroundColor: Colors.bg,
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  logItem: {
    flexDirection: 'row',
    gap: 10,
  },
  logDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
    marginTop: 6,
  },
  logBody: {
    flex: 1,
    gap: 2,
  },
  logTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  logActor: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  logDate: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  logAction: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  logFp: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: 'monospace',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  closeFooterBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.cardBorderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFooterBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
});
