import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Colors } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { DocumentItem } from '../types';
import { DocumentIcon, LockIcon } from '../components/common/Icons';
import { DocumentSheetModal } from '../components/modals/DocumentSheetModal';
import { EmptyState } from '../components/common/EmptyState';

export function DocsScreen() {
  const { documents, markDocumentRead, t } = useApp();
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Privacy banner */}
      <View style={styles.securityBanner}>
        <LockIcon size={20} color={Colors.accent} />
        <Text style={styles.securityText}>{t.securityBanner}</Text>
      </View>

      {/* Documents List */}
      <View style={styles.listSection}>
        <Text style={styles.sectionTitle}>{t.availableDocs}</Text>

        {documents.length === 0 ? (
          <EmptyState
            icon={<DocumentIcon size={24} color={Colors.accent} />}
            title={t.noDocs}
            description={t.noDocsDesc}
          />
        ) : (
          documents.map((doc) => (
            <TouchableOpacity
              key={doc.id}
              style={styles.docCard}
              onPress={() => setSelectedDoc(doc)}
              activeOpacity={0.7}
            >
              <View style={styles.docIconBox}>
                <DocumentIcon size={20} color={Colors.accent} />
              </View>

              <View style={styles.docBody}>
                <View style={styles.titleRow}>
                  <Text style={styles.docTitle} numberOfLines={1}>
                    {doc.nombre}
                  </Text>
                  {doc.nuevo && (
                    <View style={styles.newBadge}>
                      <Text style={styles.newBadgeText}>{t.badgeNew}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.docMeta}>{doc.meta}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Cryptographic Sheet Detail Modal */}
      <DocumentSheetModal
        visible={selectedDoc !== null}
        document={selectedDoc}
        onClose={() => setSelectedDoc(null)}
        onOpen={(doc) => {
          markDocumentRead(doc.id);
        }}
      />
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
    paddingBottom: 24,
    gap: 16,
  },
  securityBanner: {
    backgroundColor: Colors.accentMuted,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  securityText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#13372B',
  },
  listSection: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  docCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  docIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docBody: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  docTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  newBadge: {
    backgroundColor: Colors.accentMuted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  newBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.accent,
  },
  docMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});
