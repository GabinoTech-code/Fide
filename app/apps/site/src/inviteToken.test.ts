import { expect, it } from 'vitest';
import { inviteToken } from './inviteToken';

const TOKEN = 'Qm9uZ2lvcm5vLUZpZGUtaW52aXRvLXRva2VuLTMyYg'; // 42 chars
const VALID = `${TOKEN}A`; // 43, as create_invitation() returns

it('reads the token from /invite/<token>', () => {
  expect(inviteToken(`/invite/${VALID}`)).toBe(VALID);
  expect(inviteToken(`/invite/${VALID}/`)).toBe(VALID);
});

it('rejects anything that is not a whole, well-formed token', () => {
  expect(inviteToken('/invite/')).toBeNull();
  expect(inviteToken(`/invite/${TOKEN}`)).toBeNull(); // truncated (copied from a wrapped e-mail line)
  expect(inviteToken(`/invite/${VALID}x`)).toBeNull();
  expect(inviteToken(`/invite/${VALID.slice(0, 40)}+/=`)).toBeNull(); // standard base64
  expect(inviteToken(`/invite/${VALID}/extra`)).toBeNull();
  expect(inviteToken(`/other/${VALID}`)).toBeNull();
  // Would end up inside the fide:// link: no scheme or path tricks.
  expect(inviteToken(`/invite/${encodeURIComponent('javascript:alert(1)')}`)).toBeNull();
});
