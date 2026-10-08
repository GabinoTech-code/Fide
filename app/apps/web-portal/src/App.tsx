import { lazy, Suspense, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { useAuth } from './auth/AuthProvider';
import { Logo } from './components/Brand';
import { Layout } from './components/Layout';
import { useI18n } from './lib/i18n';
import { supabaseConfigured } from './lib/supabase';
import { AuditPage } from './pages/AuditPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { KioskPage } from './pages/KioskPage';
import { LoginPage } from './pages/LoginPage';
import { PresencePage } from './pages/PresencePage';
import { RegisterCompanyPage } from './pages/RegisterCompanyPage';
import { RequestsPage } from './pages/RequestsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SitesPage } from './pages/SitesPage';

// pdf.js, pdf-lib and libsodium load only when HR opens the payslip page.
const PayrollPage = lazy(() => import('./pages/PayrollPage').then((m) => ({ default: m.PayrollPage })));

function Message({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="center">
      <div className="card auth-card">
        <span style={{ background: 'var(--slate)', borderRadius: 14, padding: 10, alignSelf: 'flex-start', display: 'inline-flex' }}>
          <Logo size={32} />
        </span>
        <h1>{title}</h1>
        <p className="muted">{body}</p>
        {action}
      </div>
    </div>
  );
}

function Portal() {
  const { t } = useI18n();
  const { ready, session, memberships, membershipsLoading, isHr, signOut } = useAuth();
  const [registering, setRegistering] = useState(false);

  if (!ready || (session && membershipsLoading)) {
    return <div className="center muted">{t('common.loading')}</div>;
  }
  if (!session) return <LoginPage />;
  if (memberships.length === 0) {
    if (registering) return <RegisterCompanyPage onCancel={() => setRegistering(false)} />;
    return (
      <Message
        title={t('access.noCompanyTitle')}
        body={t('access.noCompanyBody')}
        action={
          <div className="row">
            <button className="btn btn-primary" onClick={() => setRegistering(true)}>
              {t('access.registerCompany')}
            </button>
            <button className="btn" onClick={signOut}>
              {t('common.logout')}
            </button>
          </div>
        }
      />
    );
  }
  if (!isHr) {
    return (
      <Message
        title={t('access.employeeTitle')}
        body={t('access.employeeBody')}
        action={
          <button className="btn" onClick={signOut}>
            {t('common.logout')}
          </button>
        }
      />
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<PresencePage />} />
        <Route path="dipendenti" element={<EmployeesPage />} />
        <Route path="sedi" element={<SitesPage />} />
        <Route
          path="cedolini"
          element={
            <Suspense fallback={<p className="muted">{t('common.loading')}</p>}>
              <PayrollPage />
            </Suspense>
          }
        />
        <Route path="richieste" element={<RequestsPage />} />
        <Route path="registro" element={<AuditPage />} />
        <Route path="impostazioni" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  const { t } = useI18n();
  if (!supabaseConfigured) return <Message title={t('config.missingTitle')} body={t('config.missingBody')} />;
  return (
    <BrowserRouter>
      <Routes>
        {/* The kiosk tablet has no user session. */}
        <Route path="/kiosk" element={<KioskPage />} />
        <Route path="/*" element={<Portal />} />
      </Routes>
    </BrowserRouter>
  );
}
