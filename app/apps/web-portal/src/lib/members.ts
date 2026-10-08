import type { Member } from './types';

/** PostgREST returns embedded one-to-one rows as an object or a one-element array. */
export function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export function activeKey(m: Member) {
  return (m.device_keys ?? []).find((k) => k.status === 'active') ?? null;
}

/** Languages of the employee app (members.preferred_language). */
export const APP_LANGUAGES = ['it', 'es', 'en', 'ro', 'ar', 'sq', 'uk', 'fr', 'zh'] as const;
