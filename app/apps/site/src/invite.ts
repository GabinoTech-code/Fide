// Fallback page for invitation links (https://fide-work.it/invite/<token>).
// With the app installed the phone opens the link in the app directly (Android
// App Links / iOS universal links); otherwise it lands here. The token never
// leaves this page: it only goes into the fide:// link and the on-screen QR code.
import QRCode from 'qrcode';
import { inviteToken } from './inviteToken';
import './main';

const token = inviteToken(location.pathname);
const show = (id: string) => (document.getElementById(id)!.hidden = false);

if (!token) {
  show('invite-bad');
} else {
  show('invite-ok');
  (document.getElementById('open-app') as HTMLAnchorElement).href = `fide://invite/${token}`;
  // On a computer, hand the link over to the phone.
  if (matchMedia('(pointer: fine)').matches) {
    QRCode.toDataURL(`${location.origin}/invite/${token}`, {
      margin: 1,
      width: 200,
      color: { dark: '#0F1A17', light: '#FFFFFF' },
    }).then((url) => {
      (document.getElementById('qr') as HTMLImageElement).src = url;
      show('qr-block');
    });
  }
}
