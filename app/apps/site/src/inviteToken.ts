import { INVITE_TOKEN_PATTERN } from '@fide/shared';

/** The token from /invite/<token>, or null when the path is not a well-formed invitation. */
export function inviteToken(pathname: string): string | null {
  const match = pathname.match(/^\/invite\/([^/]+)\/?$/);
  return match && INVITE_TOKEN_PATTERN.test(match[1]) ? match[1] : null;
}
