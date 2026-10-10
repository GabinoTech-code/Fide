import { ErrorNotice, PageHead } from '../components/ui';
import { useI18n, type MessageKey } from '../lib/i18n';
import { useAuth } from '../auth/AuthProvider';
import { useAuditAttributionMembers, useAuditLog } from '../lib/queries';
import { auditActor, auditSubject } from '../lib/auditAttribution';

export function AuditPage() {
  const { t, formatDateTime } = useI18n();
  const { active } = useAuth();
  const { data: members = [] } = useAuditAttributionMembers();
  const { data = [], isLoading, error } = useAuditLog();

  return (
    <>
      <PageHead title={t('audit.title')} />
      <p className="muted small">{t('audit.note')}</p>
      <ErrorNotice error={error} />
      <section className="card">
        {isLoading ? (
          <p className="muted">{t('common.loading')}</p>
        ) : data.length === 0 ? (
          <p className="empty">{t('audit.empty')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('audit.when')}</th>
                  <th>{t('audit.what')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{formatDateTime(e.created_at)}</td>
                    <td>
                      <span className="mono">{e.table_name}</span> {t(`op.${e.operation}` as MessageKey)}
                      <div className="small">{t('audit.actor')}: {auditActor(e, active?.company_id ?? '', members) ?? t(e.actor_auth_user_id ? 'audit.actorUnknown' : 'audit.actorSystem')}</div>
                      {auditSubject(e, active?.company_id ?? '', members) ? <div className="small">{t('audit.subject')}: {auditSubject(e, active?.company_id ?? '', members)}</div> : null}
                    </td>
                    <td className="small muted">{e.changed_columns?.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
