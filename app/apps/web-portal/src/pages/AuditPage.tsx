import { ErrorNotice, PageHead } from '../components/ui';
import { useI18n, type MessageKey } from '../lib/i18n';
import { useAuditLog } from '../lib/queries';

export function AuditPage() {
  const { t, formatDateTime } = useI18n();
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
