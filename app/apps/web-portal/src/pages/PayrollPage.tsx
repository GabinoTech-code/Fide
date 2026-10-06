// TODO(phase 3): bulk PDF → pdf.js page texts → splitPayroll() → pdf-lib split →
// encryptDocument() per employee → create_payroll_batch → Storage upload →
// publish_payroll_batch. All building blocks exist and are tested in
// @fide/payroll-parser (pdf-pipeline.test.ts) and @fide/crypto.
import { PageHead } from '../components/ui';
import { useI18n } from '../lib/i18n';

export function PayrollPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHead title={t('payroll.title')} />
      <div className="notice">{t('payroll.privacy')}</div>
    </>
  );
}
