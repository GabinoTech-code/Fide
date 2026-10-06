// Fullscreen kiosk for the tablet at the entrance. After pairing it computes
// the rotating QR locally (HMAC over 30 s windows), so a weak connection at the
// door never blocks clocking in. No user session: the kiosk only holds its own
// HMAC secret, which can be revoked from the portal.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { KIOSK_WINDOW_SECONDS, fromBase64, kioskWindow, makeKioskToken } from '@fide/shared';
import { Logo } from '../components/Brand';
import { ErrorNotice } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { callFunction } from '../lib/supabase';

const STORAGE_KEY = 'fide.kiosk';
const MAX_SKEW_S = 10;

interface Pairing {
  kiosk_id: string;
  site_id: string;
  company_id: string;
  secret: string;
}

function loadPairing(): Pairing | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Pairing) : null;
  } catch {
    return null;
  }
}

export function KioskPage() {
  const [pairing, setPairing] = useState<Pairing | null>(loadPairing);
  return pairing ? (
    <KioskDisplay
      pairing={pairing}
      onUnpair={() => {
        localStorage.removeItem(STORAGE_KEY);
        setPairing(null);
      }}
    />
  ) : (
    <PairKiosk
      onPaired={(p) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
        setPairing(p);
      }}
    />
  );
}

function PairKiosk({ onPaired }: { onPaired: (p: Pairing) => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onPaired(await callFunction<Pairing>('kiosk-pair', { code: code.trim().toUpperCase() }, { auth: false }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="kiosk">
      <Logo size={72} />
      <h1>{t('kiosk.pairTitle')}</h1>
      <p className="muted">{t('kiosk.pairBody')}</p>
      <form className="stack" style={{ width: 'min(420px, 100%)' }} onSubmit={submit}>
        <input
          className="code-input"
          aria-label={t('kiosk.code')}
          autoCapitalize="characters"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, ''))}
        />
        <button className="btn btn-primary btn-block" disabled={busy || code.length !== 8}>
          {t('kiosk.pair')}
        </button>
        <ErrorNotice error={error} />
      </form>
    </div>
  );
}

function KioskDisplay({ pairing, onUnpair }: { pairing: Pairing; onUnpair: () => void }) {
  const { t, formatDateTime } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const [skew, setSkew] = useState(0);
  const qrWindow = kioskWindow(now / 1000);
  const secondsLeft = KIOSK_WINDOW_SECONDS - Math.floor((now / 1000) % KIOSK_WINDOW_SECONDS);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Redraw the QR once per window.
  useEffect(() => {
    let cancelled = false;
    makeKioskToken(fromBase64(pairing.secret), pairing.kiosk_id, qrWindow * KIOSK_WINDOW_SECONDS).then((token) => {
      if (!cancelled && canvas.current) {
        QRCode.toCanvas(canvas.current, token, { margin: 1, width: 520, errorCorrectionLevel: 'M', color: { dark: '#0F1A17', light: '#FFFFFF' } });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pairing, qrWindow]);

  // Keep the screen on.
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    const acquire = () =>
      (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock
        ?.request('screen')
        .then((l) => (lock = l))
        .catch(() => undefined);
    acquire();
    const onVisible = () => document.visibilityState === 'visible' && acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release();
    };
  }, []);

  // The server accepts a token within ±1 window of the phone's clock: check ours
  // against the hosting server's Date header (same origin) every hour.
  useEffect(() => {
    const check = async () => {
      try {
        const started = Date.now();
        const res = await fetch(`${location.origin}/?clock=${started}`, { method: 'HEAD', cache: 'no-store' });
        const server = Date.parse(res.headers.get('Date') ?? '');
        if (!Number.isNaN(server)) setSkew(Math.round((started + (Date.now() - started) / 2 - server) / 1000));
      } catch {
        // offline: keep the last measurement
      }
    };
    check();
    const id = setInterval(check, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="kiosk">
      <div className="row" style={{ gap: 12 }}>
        <Logo size={40} />
        <span className="brand-name">fide</span>
      </div>
      <div className="kiosk-clock">{formatDateTime(new Date(now), { timeStyle: 'short' })}</div>
      <div className="kiosk-qr">
        <canvas ref={canvas} aria-label={t('kiosk.scan')} />
      </div>
      <div className="progress" aria-hidden="true">
        <div style={{ width: `${(secondsLeft / KIOSK_WINDOW_SECONDS) * 100}%` }} />
      </div>
      <p style={{ fontSize: 22, fontWeight: 600 }}>{t('kiosk.scan')}</p>
      <p className="muted small">{t('kiosk.refresh', { s: secondsLeft })}</p>
      {Math.abs(skew) > MAX_SKEW_S ? <div className="notice notice-warn">{t('kiosk.clockWarning', { s: skew })}</div> : null}
      <button className="link-btn small" style={{ color: 'var(--muted)' }} onClick={() => confirm(t('kiosk.unpair') + '?') && onUnpair()}>
        {t('kiosk.unpair')}
      </button>
    </div>
  );
}
