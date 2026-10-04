import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Share,
  Platform,
  Modal,
} from 'react-native';
import { Colors } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { ShieldPrivacyIcon, CheckIcon, CloseIcon } from '../components/common/Icons';
import { CryptoService } from '../services/cryptoService';

export function PrivacidadScreen() {
  const {
    privacySettings,
    togglePrivacySetting,
    auditLogs,
    exportDataJson,
    showToast,
    setCurrentScreen,
    user,
    punches,
    requests,
    t,
  } = useApp();

  const [art15ModalVisible, setArt15ModalVisible] = useState(false);
  const [erasureConfirmation, setErasureConfirmation] = useState<string | null>(null);

  // Art. 20 - Data Portability Export
  const handleArt20Export = async () => {
    const { jsonString } = CryptoService.generateArticle20Export(user, punches, requests, auditLogs);
    try {
      await Share.share({
        title: `Fide_GDPR_Art20_Portabilita_${user.name.replace(/\s+/g, '_')}.json`,
        message: jsonString,
      });
      showToast('Export conforme Art. 20 GDPR generato con successo');
    } catch {
      showToast('Export generato in memoria');
    }
  };

  // Art. 17 - Right of Erasure & Key Shredding
  const handleArt17Erasure = () => {
    Alert.alert(
      'Diritto alla Cancellazione (Art. 17 GDPR)',
      'Questa procedura inoltra la richiesta formale al DPO aziendale e consente la distruzione immediata delle chiavi crittografiche locali X25519 su questo smartphone. Vuoi procedere?',
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: 'Conferma e distruggi chiavi locali',
          style: 'destructive',
          onPress: () => {
            const receipt = CryptoService.generateArticle17Receipt(user);
            setErasureConfirmation(receipt.confirmationCode);
            showToast('Richiesta registrata · Chiavi locali revocate');
          },
        },
      ]
    );
  };

  const toggles = [
    {
      key: 'push' as const,
      label: t.togglePush,
      desc: t.togglePushDesc,
      value: privacySettings.push,
    },
    {
      key: 'pk' as const,
      label: t.togglePasskey,
      desc: t.togglePasskeyDesc,
      value: privacySettings.pk,
    },
    {
      key: 'an' as const,
      label: t.toggleAnalytics,
      desc: t.toggleAnalyticsDesc,
      value: privacySettings.an,
    },
  ];

  const art15Data = CryptoService.generateArticle15Report(user);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* What the company sees section */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <ShieldPrivacyIcon size={20} color={Colors.accent} />
          <Text style={styles.cardTitle}>{t.whatCompanySees}</Text>
        </View>

        <View style={styles.dataPoint}>
          <Text style={styles.dataPointTitle}>{t.tabClock}</Text>
          <Text style={styles.dataPointDesc}>{t.companyPunches}</Text>
        </View>

        <View style={styles.dataPoint}>
          <Text style={styles.dataPointTitle}>{t.tabDocs}</Text>
          <Text style={styles.dataPointDesc}>{t.companyDocs}</Text>
        </View>

        <View style={styles.dataPoint}>
          <Text style={styles.dataPointTitle}>{t.tabAssistant}</Text>
          <Text style={styles.dataPointDesc}>{t.companyAssistant}</Text>
        </View>
      </View>

      {/* Self-service GDPR rights (Art. 15, 17, 20) */}
      <View style={styles.gdprHubCard}>
        <View style={styles.gdprHubHeader}>
          <Text style={styles.gdprHubBadge}>Regolamento UE 2016/679</Text>
          <Text style={styles.gdprHubTitle}>Diritti GDPR Self-Service</Text>
        </View>

        <View style={styles.gdprButtonsCol}>
          {/* Art. 15 - Right of Access */}
          <TouchableOpacity
            style={styles.gdprBtn}
            onPress={() => setArt15ModalVisible(true)}
            activeOpacity={0.8}
          >
            <View style={styles.gdprBtnContent}>
              <Text style={styles.gdprArticleNumber}>Art. 15</Text>
              <View style={styles.gdprBtnTextWrap}>
                <Text style={styles.gdprBtnTitle}>Diritto di Accesso e Trasparenza</Text>
                <Text style={styles.gdprBtnDesc}>Consulta le categorie di dati, finalità e tempi di conservazione</Text>
              </View>
            </View>
            <Text style={styles.arrowIcon}>→</Text>
          </TouchableOpacity>

          {/* Art. 20 - Data Portability */}
          <TouchableOpacity
            style={styles.gdprBtn}
            onPress={handleArt20Export}
            activeOpacity={0.8}
          >
            <View style={styles.gdprBtnContent}>
              <Text style={styles.gdprArticleNumber}>Art. 20</Text>
              <View style={styles.gdprBtnTextWrap}>
                <Text style={styles.gdprBtnTitle}>Diritto alla Portabilità (Export JSON/CSV)</Text>
                <Text style={styles.gdprBtnDesc}>Scarica istantaneamente tutti i tuoi dati in formato aperto e interoperabile</Text>
              </View>
            </View>
            <Text style={styles.arrowIcon}>→</Text>
          </TouchableOpacity>

          {/* Art. 17 - Erasure & Key Shredding */}
          <TouchableOpacity
            style={[styles.gdprBtn, styles.gdprBtnDanger]}
            onPress={handleArt17Erasure}
            activeOpacity={0.8}
          >
            <View style={styles.gdprBtnContent}>
              <Text style={[styles.gdprArticleNumber, { color: Colors.danger }]}>Art. 17</Text>
              <View style={styles.gdprBtnTextWrap}>
                <Text style={[styles.gdprBtnTitle, { color: Colors.danger }]}>Diritto all'Oblio e Revoca Chiavi</Text>
                <Text style={styles.gdprBtnDesc}>Inoltra istanza formale al DPO e distruggi le chiavi crittografiche locali</Text>
              </View>
            </View>
            <Text style={[styles.arrowIcon, { color: Colors.danger }]}>→</Text>
          </TouchableOpacity>
        </View>

        {erasureConfirmation && (
          <View style={styles.confirmationBox}>
            <CheckIcon size={16} color={Colors.success} />
            <Text style={styles.confirmationText}>
              Istanza registrata con codice: <Text style={{ fontWeight: '700' }}>{erasureConfirmation}</Text>
            </Text>
          </View>
        )}
      </View>

      {/* Device privacy settings toggles */}
      <View style={styles.togglesCard}>
        {toggles.map((tItem, idx) => (
          <View
            key={tItem.key}
            style={[styles.toggleRow, idx < toggles.length - 1 && styles.toggleBorder]}
          >
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>{tItem.label}</Text>
              <Text style={styles.toggleDesc}>{tItem.desc}</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.track,
                { backgroundColor: tItem.value ? Colors.accent : Colors.toggleTrackInactive },
              ]}
              onPress={() => togglePrivacySetting(tItem.key)}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.knob,
                  { transform: [{ translateX: tItem.value ? 20 : 0 }] },
                ]}
              />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* Log de accesos visible / Audit Trail */}
      <View style={styles.auditSection}>
        <View style={styles.auditHeader}>
          <Text style={styles.sectionTitle}>{t.auditTrail}</Text>
          <Text style={styles.auditSub}>Tracciamento crittografico verificato</Text>
        </View>
        <View style={styles.auditBox}>
          {auditLogs.map((log) => (
            <View key={log.id} style={styles.auditRow}>
              <View style={styles.auditDot} />
              <View style={styles.auditCol}>
                <Text style={styles.auditLine}>{log.formatted}</Text>
                <Text style={styles.auditSubActor}>Attore: {log.actor} · Registro: {log.action}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => setCurrentScreen('home')}
        activeOpacity={0.85}
      >
        <Text style={styles.backBtnText}>{t.back}</Text>
      </TouchableOpacity>

      {/* Art. 15 Modal */}
      <Modal visible={art15ModalVisible} transparent animationType="slide" onRequestClose={() => setArt15ModalVisible(false)}>
        <View style={styles.backdrop}>
          <View style={styles.art15Sheet}>
            <View style={styles.art15Header}>
              <View>
                <Text style={styles.art15Sub}>Regolamento UE 2016/679</Text>
                <Text style={styles.art15Title}>Diritto di Accesso (Art. 15)</Text>
              </View>
              <TouchableOpacity onPress={() => setArt15ModalVisible(false)} style={styles.closeBtn}>
                <CloseIcon size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ paddingHorizontal: 20 }} contentContainerStyle={{ paddingVertical: 16, gap: 14 }}>
              <View style={styles.art15Field}>
                <Text style={styles.art15Label}>Titolare del trattamento</Text>
                <Text style={styles.art15Val}>{art15Data.controller}</Text>
              </View>

              <View style={styles.art15Field}>
                <Text style={styles.art15Label}>Contatto DPO (Data Protection Officer)</Text>
                <Text style={styles.art15Val}>{art15Data.dpoContact}</Text>
              </View>

              <View style={styles.art15Field}>
                <Text style={styles.art15Label}>Base giuridica</Text>
                <Text style={styles.art15Val}>{art15Data.legalBasis}</Text>
              </View>

              <View style={styles.art15Field}>
                <Text style={styles.art15Label}>Periodo di conservazione</Text>
                <Text style={styles.art15Val}>{art15Data.retentionPeriod}</Text>
              </View>

              <Text style={[styles.art15Label, { marginTop: 6 }]}>Categorie di dati trattati:</Text>
              {art15Data.processedCategories.map((item, idx) => (
                <View key={idx} style={styles.categoryItem}>
                  <Text style={styles.catTitle}>{item.category}</Text>
                  <Text style={styles.catData}>{item.data}</Text>
                  <Text style={styles.catStorage}>Ubicazione: {item.storage}</Text>
                </View>
              ))}

              <Text style={[styles.art15Label, { marginTop: 6 }]}>Misure di sicurezza implementate:</Text>
              {art15Data.technicalGuarantees.map((item, idx) => (
                <View key={idx} style={styles.guaranteeRow}>
                  <CheckIcon size={16} color={Colors.accent} />
                  <Text style={styles.guaranteeText}>{item}</Text>
                </View>
              ))}
            </ScrollView>

            <View style={{ padding: 18, borderTopWidth: 1, borderTopColor: Colors.cardBorder }}>
              <TouchableOpacity style={styles.closeModalBtn} onPress={() => setArt15ModalVisible(false)}>
                <Text style={styles.closeModalBtnText}>{t.close}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
    gap: 16,
  },
  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  dataPoint: {
    gap: 2,
  },
  dataPointTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  dataPointDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  gdprHubCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
    gap: 12,
  },
  gdprHubHeader: {
    gap: 2,
  },
  gdprHubBadge: {
    fontSize: 11,
    color: Colors.accent,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  gdprHubTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  gdprButtonsCol: {
    gap: 8,
  },
  gdprBtn: {
    backgroundColor: Colors.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorderSubtle,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gdprBtnDanger: {
    borderColor: '#F5C2BC',
    backgroundColor: '#FDF3F2',
  },
  gdprBtnContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingRight: 8,
  },
  gdprArticleNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.accent,
    backgroundColor: Colors.cardBg,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  gdprBtnTextWrap: {
    flex: 1,
    gap: 2,
  },
  gdprBtnTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  gdprBtnDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  arrowIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.accent,
  },
  confirmationBox: {
    backgroundColor: Colors.successBg,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confirmationText: {
    fontSize: 13,
    color: Colors.success,
  },
  togglesCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    gap: 12,
  },
  toggleBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  toggleInfo: {
    flex: 1,
    gap: 2,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  toggleDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  track: {
    width: 52,
    height: 32,
    borderRadius: 16,
    padding: 3,
    justifyContent: 'center',
  },
  knob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.cardBg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  auditSection: {
    gap: 8,
  },
  auditHeader: {
    gap: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  auditSub: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  auditBox: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
    gap: 10,
  },
  auditRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  auditDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
    marginTop: 5,
  },
  auditCol: {
    flex: 1,
    gap: 2,
  },
  auditLine: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  auditSubActor: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  backBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    color: Colors.textPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 26, 23, 0.55)',
    justifyContent: 'flex-end',
  },
  art15Sheet: {
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: '85%',
  },
  art15Header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  art15Sub: {
    fontSize: 11,
    color: Colors.accent,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  art15Title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  closeBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: Colors.bg,
  },
  art15Field: {
    gap: 2,
  },
  art15Label: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  art15Val: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  categoryItem: {
    backgroundColor: Colors.bg,
    borderRadius: 12,
    padding: 10,
    gap: 2,
  },
  catTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  catData: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  catStorage: {
    fontSize: 11,
    color: Colors.accent,
    marginTop: 2,
  },
  guaranteeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  guaranteeText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textPrimary,
  },
  closeModalBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeModalBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textWhite,
  },
});
