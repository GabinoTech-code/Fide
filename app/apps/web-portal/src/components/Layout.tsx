import { NavLink, Outlet } from 'react-router';
import type { IconName } from '@fide/shared';
import { useAuth } from '../auth/AuthProvider';
import { LOCALES, useI18n, type Locale, type MessageKey } from '../lib/i18n';
import { useGdprRequests } from '../lib/queries';
import { isOverdue } from '../pages/PrivacyPage';
import { Icon, Logo } from './Brand';

// Team managers see only presence and requests (of their team): the rest is HR's.
const MANAGER_NAV = new Set(['/', '/richieste']);

const NAV: Array<{ to: string; label: MessageKey; icon: IconName }> = [
  { to: '/', label: 'nav.presence', icon: 'fichar' },
  { to: '/dipendenti', label: 'nav.employees', icon: 'misdatos' },
  { to: '/sedi', label: 'nav.sites', icon: 'geo' },
  { to: '/cedolini', label: 'nav.payroll', icon: 'docs' },
  { to: '/richieste', label: 'nav.requests', icon: 'solicitudes' },
  { to: '/privacy', label: 'nav.privacy', icon: 'cifrado' },
  { to: '/registro', label: 'nav.audit', icon: 'registro' },
  { to: '/impostazioni', label: 'nav.settings', icon: 'passkey' },
];

export function Layout() {
  const { t, locale, setLocale } = useI18n();
  const { memberships, active, setActiveCompany, signOut, session, isHr } = useAuth();
  // Open GDPR requests have a legal deadline: keep them visible from every page.
  const gdpr = useGdprRequests().data ?? [];
  const gdprOpen = gdpr.filter((r) => r.status === 'pending' || r.status === 'in_progress');
  const gdprOverdue = gdprOpen.some((r) => isOverdue(r));

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Logo size={34} />
          <div>
            <div className="brand-name">fide</div>
            <div className="brand-sub">{t('app.tagline')}</div>
          </div>
        </div>

        {memberships.length > 1 ? (
          <select
            className="company-switch"
            value={active?.company_id}
            onChange={(e) => setActiveCompany(e.target.value)}
            aria-label="Azienda"
          >
            {memberships.map((m) => (
              <option key={m.company_id} value={m.company_id}>
                {m.companies?.legal_name}
              </option>
            ))}
          </select>
        ) : (
          <div className="small" style={{ padding: '0 8px', color: 'var(--mint-pale)' }}>
            {active?.companies?.legal_name}
          </div>
        )}
        {!isHr ? <div className="small" style={{ padding: '0 8px', color: 'var(--mint-pale)' }}>{t('access.managerScope')}</div> : null}

        <nav className="nav">
          {NAV.filter((item) => isHr || MANAGER_NAV.has(item.to)).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              <Icon name={item.icon} />
              {t(item.label)}
              {item.to === '/privacy' && gdprOpen.length > 0 ? (
                <span className={`nav-count${gdprOverdue ? ' nav-count-danger' : ''}`} aria-label={t('privacy.openCount', { n: gdprOpen.length })}>
                  {gdprOpen.length}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <span>{session?.user.email}</span>
          <div className="row" style={{ gap: 8 }}>
            <select
              className="company-switch"
              style={{ width: 'auto' }}
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              aria-label="Lingua"
            >
              {Object.entries(LOCALES).map(([code, l]) => (
                <option key={code} value={code}>
                  {l.label}
                </option>
              ))}
            </select>
            <button className="link-btn" onClick={signOut}>
              {t('common.logout')}
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
