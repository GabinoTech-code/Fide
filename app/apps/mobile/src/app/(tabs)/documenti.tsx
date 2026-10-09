import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useT, type AppKey } from '../../i18n/app';
import { DocumentError, listDocuments, openDocument, type DocumentRow } from '../../lib/documents';
import { useLiveQueries } from '../../lib/refresh';
import { useSession } from '../../lib/session';
import { unlock, LockedError } from '../../lib/vault';
import { BrandIcon } from '../../components/common/Icons';
import { Colors } from '../../theme/colors';
import { Badge, Body, Card, Mono, Notice, Row, Screen, Title } from '../../ui/kit';

const ERRORS: Record<string, AppKey> = {
  not_for_device: 'docs.notForDevice',
  integrity: 'docs.integrity',
  needs_update: 'docs.needsUpdate',
};

export default function Documents() {
  const { t, date } = useT();
  const { membership, keys } = useSession();
  const queryClient = useQueryClient();
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const docs = useQuery({ queryKey: ['documents', membership?.id], enabled: Boolean(membership), queryFn: listDocuments });
  const refresh = useLiveQueries(docs);

  async function open(doc: DocumentRow) {
    if (!keys) return;
    setError(null);
    setOpening(doc.id);
    try {
      await unlock(t('unlock.document'), t('unlock.fallback'));
      await openDocument(doc, keys, doc.title);
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    } catch (err) {
      if (err instanceof DocumentError) setError(t(ERRORS[err.code]));
      else if (err instanceof LockedError) setError(t('unlock.failed'));
      else if (err instanceof TypeError) setError(t('common.offline'));
      else setError(t('common.error'));
    } finally {
      setOpening(null);
    }
  }

  return (
    <Screen refresh={refresh}>
      <Title>{t('docs.title')}</Title>
      {error ? <Notice kind="danger">{error}</Notice> : null}
      {docs.data && docs.data.length === 0 ? <Notice>{t('docs.empty')}</Notice> : null}
      {(docs.data ?? []).map((doc) => (
        <Pressable key={doc.id} onPress={() => open(doc)} disabled={Boolean(opening)} accessibilityRole="button">
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <BrandIcon name="cifrado" size={28} color={Colors.accent} />
            <View style={{ flex: 1, gap: 4 }}>
              <Body>{doc.title}</Body>
              <Mono>{opening === doc.id ? t('docs.opening') : `${date(doc.published_at)} · ${t('docs.encrypted')}`}</Mono>
            </View>
            <Row>
              {doc.status === 'superseded' ? <Badge label={t('docs.superseded')} kind="muted" /> : null}
              {!doc.first_opened_at && doc.status === 'published' ? <Badge label={t('docs.new')} /> : null}
            </Row>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
