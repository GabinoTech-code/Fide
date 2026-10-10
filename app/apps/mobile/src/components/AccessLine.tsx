import { useT, type AppKey } from '../i18n/app';
import type { AccessEvent } from '../lib/data';
import { Mono } from '../ui/kit';

/** «27 sep 10:04 · RR. HH. · publicación»: who did what with a document. */
export function AccessLine({ event, me, title }: { event: AccessEvent; me?: string; title?: string }) {
  const { t, format } = useT();
  const who = event.actor_member_id === me ? t('access.you') : event.actor_member_id ? t('access.hr') : t('access.system');
  const when = format(event.created_at, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <Mono style={{ fontFamily: 'IBMPlexMono_400Regular' }}>
      {when} · {who} · {t(`access.event.${event.event}` as AppKey)}
      {title ? ` · ${title}` : ''}
    </Mono>
  );
}
