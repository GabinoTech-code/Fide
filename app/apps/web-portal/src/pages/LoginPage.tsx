import { useState, type FormEvent } from 'react';
import { Icon, Logo } from '../components/Brand';
import { ErrorNotice } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';

export function LoginPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const normalized = email.trim().toLowerCase();

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const { error } = await supabase.auth.signInWithOtp({ email: normalized, options: { shouldCreateUser: true } });
      if (error) throw error;
      setSent(true);
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const { error } = await supabase.auth.verifyOtp({ email: normalized, token: code.trim(), type: 'email' });
      if (error) throw error;
    });
  };

  const passkey = () =>
    run(async () => {
      const { error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;
    });

  return (
    <div className="center">
      <div className="auth-card">
        <div className="row" style={{ gap: 14 }}>
          <span style={{ background: 'var(--slate)', borderRadius: 14, padding: 10, display: 'inline-flex' }}>
            <Logo size={36} />
          </span>
          <div>
            <div className="brand-name" style={{ color: 'var(--slate)' }}>
              fide
            </div>
            <div className="small muted">{t('app.tagline')}</div>
          </div>
        </div>
        <div className="card stack" style={{ gap: 18 }}>
          <div className="stack" style={{ gap: 6 }}>
            <h1>{t('login.title')}</h1>
            <p className="muted">{t('login.subtitle')}</p>
          </div>

          {!sent ? (
            <form className="stack" onSubmit={sendCode}>
              <label className="field">
                {t('login.email')}
                <input
                  type="email"
                  autoComplete="username webauthn"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button className="btn btn-primary btn-block" disabled={busy || !email}>
                {t('login.sendCode')}
              </button>
            </form>
          ) : (
            <form className="stack" onSubmit={verify}>
              <p className="small">{t('login.codeSent', { email: normalized })}</p>
              <label className="field">
                {t('login.code')}
                <input
                  className="code-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                />
              </label>
              <button className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>
                {t('login.verify')}
              </button>
              <button
                type="button"
                className="link-btn small"
                onClick={() => {
                  setSent(false);
                  setCode('');
                }}
              >
                {t('login.changeEmail')}
              </button>
            </form>
          )}

          <div className="divider">{t('login.or')}</div>
          <button className="btn btn-block" onClick={passkey} disabled={busy}>
            <Icon name="passkey" />
            {t('login.passkey')}
          </button>
          <ErrorNotice error={error} />
        </div>
      </div>
    </div>
  );
}
