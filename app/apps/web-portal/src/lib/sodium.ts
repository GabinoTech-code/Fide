// libsodium for payslip encryption, loaded on first use. The cross-platform
// vectors (the same ones the phones run) must pass before any document is
// encrypted, so a broken build can never publish files the app cannot open.
import { runCryptoSelfTest, type SelfTestSodium } from '@fide/crypto';

let loading: Promise<SelfTestSodium> | null = null;

export function getSodium(): Promise<SelfTestSodium> {
  loading ??= (async () => {
    const { default: sodium } = await import('libsodium-wrappers');
    await sodium.ready;
    const s = sodium as unknown as SelfTestSodium;
    const failed = runCryptoSelfTest(s).filter((r) => !r.ok);
    if (failed.length) throw new Error(`crypto_selftest_failed: ${failed.map((f) => f.name).join(', ')}`);
    return s;
  })();
  loading.catch(() => {
    loading = null;
  });
  return loading;
}
