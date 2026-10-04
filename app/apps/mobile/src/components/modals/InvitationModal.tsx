import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Colors } from '../../theme/colors';
import { CloseIcon, PasskeyIcon, CheckIcon } from '../common/Icons';
import { OnboardingService, InvitationData } from '../../services/onboardingService';
import { useApp } from '../../context/AppContext';

interface InvitationModalProps {
  visible: boolean;
  onClose: () => void;
  onEnrolled: () => void;
}

export function InvitationModal({ visible, onClose, onEnrolled }: InvitationModalProps) {
  const { updateUser, login, showToast, t } = useApp();
  const [inviteText, setInviteText] = useState('fide://invite?code=AURORA-2026&company=Officine Aurora S.r.l.&name=Marco Rossi&dept=Operazioni&shift=08:30 - 17:30');
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'input' | 'biometrics' | 'success'>('input');
  const [parsedData, setParsedData] = useState<InvitationData | null>(null);

  const handleStartEnrollment = () => {
    const data = OnboardingService.parseInvitation(inviteText);
    setParsedData(data);
    setStep('biometrics');
  };

  const handleCreatePasskey = async () => {
    if (!parsedData) return;
    setIsProcessing(true);
    try {
      const result = await OnboardingService.createPasskeyCredential(parsedData);
      await updateUser(result.userProfile);
      setStep('success');
      setTimeout(() => {
        setIsProcessing(false);
        login();
        onEnrolled();
        showToast('Passkey FIDO2 attivata con successo · Iscrizione completata in meno di 1 min');
      }, 1000);
    } catch {
      setIsProcessing(false);
    }
  };

  const handleResetAndClose = () => {
    setStep('input');
    setIsProcessing(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleResetAndClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.subtitle}>Onboarding Zero-Password</Text>
              <Text style={styles.title}>Attivazione con Invito</Text>
            </View>
            <TouchableOpacity onPress={handleResetAndClose} style={styles.closeBtn}>
              <CloseIcon size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {step === 'input' && (
              <View style={styles.stepBox}>
                <Text style={styles.desc}>
                  Incolla il link ricevuto via email o generato dal responsabile aziendale (oppure scansiona il QR dell'invito):
                </Text>

                <TextInput
                  style={styles.input}
                  value={inviteText}
                  onChangeText={setInviteText}
                  placeholder="fide://invite?code=..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  numberOfLines={3}
                />

                <TouchableOpacity style={styles.actionBtn} onPress={handleStartEnrollment} activeOpacity={0.85}>
                  <Text style={styles.actionBtnText}>Verifica invito →</Text>
                </TouchableOpacity>
              </View>
            )}

            {step === 'biometrics' && parsedData && (
              <View style={styles.stepBox}>
                <View style={styles.invitePreview}>
                  <Text style={styles.previewLabel}>Invito verificato da:</Text>
                  <Text style={styles.previewCompany}>{parsedData.company}</Text>
                  <Text style={styles.previewUser}>{parsedData.employeeName} · {parsedData.department}</Text>
                  <Text style={styles.previewShift}>Orario: {parsedData.shiftSchedule}</Text>
                </View>

                <View style={styles.fidoBox}>
                  <PasskeyIcon size={24} color={Colors.accent} />
                  <Text style={styles.fidoTitle}>Generazione credenziale FIDO2 locale</Text>
                  <Text style={styles.fidoDesc}>
                    Nessuna password creata o trasmessa. La chiave crittografica viene salvata nell'enclave sicura del tuo smartphone.
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.actionBtn, isProcessing && { opacity: 0.7 }]}
                  onPress={handleCreatePasskey}
                  disabled={isProcessing}
                  activeOpacity={0.85}
                >
                  {isProcessing ? (
                    <ActivityIndicator color={Colors.textWhite} size="small" />
                  ) : (
                    <Text style={styles.actionBtnText}>Registra Passkey (Biometria)</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {step === 'success' && (
              <View style={[styles.stepBox, { alignItems: 'center', paddingVertical: 20 }]}>
                <View style={styles.successIcon}>
                  <CheckIcon size={32} color={Colors.success} />
                </View>
                <Text style={styles.successTitle}>Benvenuto in Fide!</Text>
                <Text style={styles.successDesc}>
                  Dispositivo autorizzato e associato in meno di 60 secondi. Reindirizzamento in corso...
                </Text>
              </View>
            )}
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
  },
  stepBox: {
    gap: 14,
  },
  desc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.cardBorderSubtle,
    borderRadius: 14,
    padding: 12,
    fontSize: 13,
    backgroundColor: Colors.bg,
    color: Colors.textPrimary,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  actionBtn: {
    height: 50,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textWhite,
  },
  invitePreview: {
    backgroundColor: Colors.bg,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  previewLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  previewCompany: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  previewUser: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  previewShift: {
    fontSize: 12,
    color: Colors.accent,
    fontWeight: '600',
    marginTop: 2,
  },
  fidoBox: {
    backgroundColor: Colors.accentMuted,
    borderRadius: 14,
    padding: 14,
    gap: 6,
    alignItems: 'center',
  },
  fidoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  fidoDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  successIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  successDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
});
