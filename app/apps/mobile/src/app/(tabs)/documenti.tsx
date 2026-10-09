import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useT, type AppKey } from '../../i18n/app';
import { AccessLine } from '../../components/AccessLine';
import { useAccessEvents, useDocuments } from '../../lib/data';
import { DocumentError, openDocument, type DocumentRow } from '../../lib/documents';
import { useLiveQueries } from '../../lib/refresh';
import { useSession } from '../../lib/session';
import { unlock, LockedError } from '../../lib/vault';
import { BrandIcon } from '../../components/common/Icons';
import { Colors } from '../../theme/colors';
import { Badge, Button, Fonts, Header, ListItem, Mono, Notice, Row, Screen, Sheet, Small } from '../../ui/kit';

const ERRORS: Record<string, AppKey> = {
  not_for_device: 'docs.notForDevice',
  integrity: 'docs.integrity',
  needs_update: 'docs.needsUpdate',
};

const caps = { fontFamily: Fonts.text, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: Colors.textSecondary } as const;

export default function Documents() {
  const { t, date } = useT();
  const { membership, keys } = useSession();
  const queryClient = useQueryClient();
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<DocumentRow | null>(null);
  const docs = useDocuments();
  const events = useAccessEvents();
  const refresh = useLiveQueries(docs, events);

  async function open(doc: DocumentRow) {
    if (!keys) return;
    setError(null);
    setOpening(doc.id);
    try {
      await unlock(t('unlock.document'), t('unlock.fallback'));
      await openDocument(doc, keys, doc.title);
      setSheet(null);
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['access_events'] });
    } catch (err) {
      if (err instanceof DocumentError) setError(t(ERRORS[err.code]));
      else if (err instanceof LockedError) setError(t('unlock.failed'));
      else if (err instanceof TypeError) setError(t('common.offline'));
      else setError(t('common.error'));
    } finally {
      setOpening(null);
    }
  }

  const docEvents = sheet ? (events.data ?? []).filter((e) => e.document_id === sheet.id).slice(0, 4) : [];

  return (
    <Screen refresh={refresh}>
      <Header eyebrow={t('docs.eyebrow')} title={t('docs.title')} privacyLabel={t('tabs.privacy')} />

      <View style={{ backgroundColor: Colors.dark, borderRadius: 16, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <BrandIcon name="cifrado" size={20} color={Colors.accentLight} />
        <Text style={{ flex: 1, fontFamily: Fonts.text, fontSize: 13, lineHeight: 19, color: Colors.darkText }}>{t('docs.e2ee')}</Text>
      </View>

      {error && !sheet ? <Notice kind="danger">{error}</Notice> : null}
      {docs.data && docs.data.length === 0 ? <Notice>{t('docs.empty')}</Notice> : null}

      <View style={{ gap: 12 }}>
        {(docs.data ?? []).map((doc) => (
          <ListItem
            key={doc.id}
            icon="docs"
            title={doc.title}
            subtitle={`PDF · ${date(doc.published_at)}`}
            onPress={() => {
              setError(null);
              setSheet(doc);
            }}
            trailing={
              doc.status === 'superseded' ? (
                <Badge label={t('docs.superseded')} kind="muted" />
              ) : !doc.first_opened_at ? (
                <Badge label={t('docs.new')} />
              ) : null
            }
          />
        ))}
      </View>

      <Sheet visible={Boolean(sheet)} onClose={() => setSheet(null)}>
        {sheet ? (
          <>
            <Text style={{ fontFamily: Fonts.display, fontSize: 20, color: Colors.textPrimary }}>{sheet.title}</Text>
            <View style={{ backgroundColor: Colors.bg, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, gap: 6 }}>
              <Text style={caps}>{t('docs.cipher')}</Text>
              <Text style={{ fontFamily: Fonts.text, fontSize: 13, color: Colors.textPrimary }}>{t('docs.cipherValue')}</Text>
              <Small>{t('docs.deviceKey')}</Small>
              <Mono style={{ color: Colors.textPrimary, letterSpacing: 0.5 }}>{keys?.fingerprint}</Mono>
              {keys && sheet.device_key_id !== keys.deviceKeyId ? <Small color={Colors.warningText}>{t('docs.notForDevice')}</Small> : null}
            </View>
            <View style={{ gap: 4 }}>
              <Text style={caps}>{t('docs.access')}</Text>
              {docEvents.length === 0 ? <Small>{t('docs.noAccess')}</Small> : null}
              {docEvents.map((e) => (
                <AccessLine key={e.id} event={e} me={membership?.id} />
              ))}
              {!sheet.first_opened_at ? <Small>{t('docs.notOpenedYet')}</Small> : null}
            </View>
            {error ? <Notice kind="danger">{error}</Notice> : null}
            <Row style={{ flexWrap: 'nowrap' }}>
              <Button kind="secondary" label={t('docs.close')} onPress={() => setSheet(null)} style={{ flex: 1 }} />
              <Button label={t('docs.decryptOpen')} busy={opening === sheet.id} onPress={() => open(sheet)} style={{ flex: 1 }} />
            </Row>
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
