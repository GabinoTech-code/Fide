import { beforeEach, describe, expect, it, vi } from 'vitest';
import { disablePush, observePushResponses, registerPush, unregisterPush } from './push';

const mocks = vi.hoisted(() => ({
  get: vi.fn(), set: vi.fn(), permissions: vi.fn(), request: vi.fn(), token: vi.fn(),
  rpc: vi.fn(), session: vi.fn(), channel: vi.fn(), dismiss: vi.fn(), handler: vi.fn(),
  lastResponse: vi.fn(), responseListener: vi.fn(), clearResponse: vi.fn(),
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: mocks.get, setItem: mocks.set } }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: { eas: { projectId: 'fide-project' } } } } }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-notifications', () => ({ getPermissionsAsync: mocks.permissions, requestPermissionsAsync: mocks.request,
  getExpoPushTokenAsync: mocks.token, setNotificationChannelAsync: mocks.channel,
  getLastNotificationResponse: mocks.lastResponse, addNotificationResponseReceivedListener: mocks.responseListener,
  clearLastNotificationResponse: mocks.clearResponse, dismissAllNotificationsAsync: mocks.dismiss, setNotificationHandler: mocks.handler, AndroidImportance: { DEFAULT: 3 } }));
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc, auth: { getSession: mocks.session } } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue('true'); mocks.set.mockResolvedValue(undefined);
  mocks.permissions.mockResolvedValue({ granted: true, canAskAgain: true });
  mocks.request.mockResolvedValue({ granted: true, canAskAgain: true });
  mocks.token.mockResolvedValue({ data: 'ExpoPushToken[test]' });
  mocks.rpc.mockResolvedValue({ error: null }); mocks.channel.mockResolvedValue(undefined);
  mocks.session.mockResolvedValue({ data: { session: { user: { id: 'user-a' } } } });
});
describe('mobile push lifecycle', () => {
  it('never prompts or registers until the worker opts in', async () => {
    mocks.get.mockResolvedValue(null);
    expect(await registerPush('key-a', 'user-a', false)).toBe(false);
    expect(mocks.request).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('creates Android channel before requesting permission and only sends public token plus key reference', async () => {
    mocks.permissions.mockResolvedValue({ granted: false, canAskAgain: true });
    expect(await registerPush('key-a', 'user-a', true)).toBe(true);
    expect(mocks.channel.mock.invocationCallOrder[0]).toBeLessThan(mocks.request.mock.invocationCallOrder[0]);
    expect(mocks.rpc).toHaveBeenCalledWith('register_push_token', { p_device_key_id: 'key-a', p_token: 'ExpoPushToken[test]', p_platform: 'android' });
  });
  it('permission withdrawal unregisters, never uploads a token and never reprompts on resume', async () => {
    mocks.permissions.mockResolvedValue({ granted: false, canAskAgain: false });
    expect(await registerPush('key-a', 'user-a', false)).toBe(false);
    expect(mocks.request).not.toHaveBeenCalled(); expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('unregister_push_token', { p_device_key_id: 'key-a' });
  });
  it('does not associate a token with a changed login session', async () => {
    mocks.session.mockResolvedValue({ data: { session: { user: { id: 'user-b' } } } });
    await expect(registerPush('key-a', 'user-a', true)).rejects.toThrow('push_session_changed');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('serializes a late registration before sign-out removal', async () => {
    let release: (value: { data: string }) => void = () => undefined;
    mocks.token.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const registration = registerPush('key-a', 'user-a', true);
    await vi.waitFor(() => expect(mocks.token).toHaveBeenCalled());
    const removal = unregisterPush('key-a');
    release({ data: 'ExpoPushToken[test]' });
    await registration; await removal;
    expect(mocks.rpc.mock.calls.map((c) => c[0])).toEqual(['unregister_push_token']);
    expect(await registerPush('key-a', 'user-a', false)).toBe(false);
  });
  it('routes cold and warm taps only through the authenticated entry, ignoring supplied URLs', () => {
    const remove = vi.fn();
    const open = vi.fn();
    mocks.lastResponse.mockReturnValue({ notification: { request: { content: { data: { url: 'https://evil.test' } } } } });
    mocks.responseListener.mockReturnValue({ remove });
    const cleanup = observePushResponses(open);
    expect(open).toHaveBeenCalledTimes(1);
    mocks.responseListener.mock.calls[0][0]();
    expect(open).toHaveBeenCalledTimes(2);
    expect(open.mock.calls).toEqual([[], []]);
    cleanup(); expect(remove).toHaveBeenCalled();
  });
  it('exposes registration/removal failures and never declares opt-out successful while server still holds token', async () => {
    mocks.rpc.mockResolvedValue({ error: { message: 'contains secret' } });
    await expect(registerPush('key-a', 'user-a', true)).rejects.toThrow('push_register_failed');
    await expect(disablePush('key-a')).rejects.toThrow('push_unregister_failed');
    expect(mocks.set).not.toHaveBeenCalled(); expect(mocks.dismiss).not.toHaveBeenCalled();
  });
});
