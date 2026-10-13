import { InvitationStream, StreamSource, parseInvitationNotice } from './invitation-stream';
import { coordinationHarness, flushCoordination } from '../testing/session-browser.mock';

const payload = { invitationId: 1, groupName: 'Sintético', invitingUserFirstName: 'Nome', invitingUserLastName: 'Sobrenome' };
class Source {
  onopen: EventSource['onopen'] = null;
  onerror: EventSource['onerror'] = null;
  close = jest.fn();
  invitation?: (event: Event) => void;
  addEventListener(type: string, listener: (event: Event) => void) { if (type === 'invitation') this.invitation = listener; }
  event(data: unknown = payload) { this.invitation?.({ data: JSON.stringify(data) } as MessageEvent); }
  error() { this.onerror?.call(this as unknown as EventSource, new Event('error')); }
}

describe('H12 bounded stream, leadership and transient notices', () => {
  let harness: ReturnType<typeof coordinationHarness>, streams: InvitationStream[], sources: Source[];
  let token: string | null;
  beforeEach(() => { harness = coordinationHarness(); streams = []; sources = []; token = 'synthetic+/='; });
  afterEach(() => { streams.forEach(stream => stream.stop()); jest.useRealTimers(); });
  function make(owner: string, user = 1, browser = harness.browser(owner)) {
    const notice = jest.fn(), status = jest.fn(), takeover = jest.fn();
    const factory = jest.fn((_url: string) => { const source = new Source(); sources.push(source); return source as unknown as StreamSource; });
    const stream = new InvitationStream(browser, '/api', 'http://localhost/', user, () => token, factory, notice, status, takeover);
    streams.push(stream); stream.start(); return { stream, notice, status, factory, takeover };
  }
  it('has one native-like stream for two tabs and distributes only validated payloads', async () => {
    const a = make('A'), b = make('B'); await flushCoordination();
    expect(sources).toHaveLength(1); expect(a.factory).toHaveBeenCalledWith('http://localhost/api/notifications/stream?token=synthetic%2B%2F%3D');
    sources[0].event(); await flushCoordination(); expect(a.notice).toHaveBeenCalledWith(payload); expect(b.notice).toHaveBeenCalledWith(payload);
    expect(b.status).toHaveBeenCalledWith('follower'); expect(harness.storage.size).toBe(0);
    expect(JSON.stringify(harness.messages)).not.toContain('synthetic+/=');
    const distributed = harness.messages.find(message => (message.value as { type: string }).type === 'event')!;
    const replay = harness.browser('replay').channel(distributed.name)!; replay.postMessage(distributed.value);
    await flushCoordination(); expect(b.notice).toHaveBeenCalledTimes(1); replay.close();
    sources[0].event({ ...payload, invitationId: '1' }); sources[0].event({ ...payload, privateExtra: 'not accepted' }); await flushCoordination();
    expect(a.notice).toHaveBeenCalledTimes(1); expect(b.notice).toHaveBeenCalledTimes(1);
  });
  it('releases leadership on close, lets the waiting tab connect and ignores events from the old source', async () => {
    const a = make('A'), b = make('B'); await flushCoordination(); const old = sources[0];
    a.stream.stop(); expect(old.close).toHaveBeenCalledTimes(1); await flushCoordination();
    expect(sources).toHaveLength(2); expect(b.takeover).toHaveBeenCalledTimes(1);
    old.event(); expect(a.notice).not.toHaveBeenCalled(); sources[1].event(); expect(b.notice).toHaveBeenCalledWith(payload);
  });
  it('cancels a waiting follower without stealing the lock or opening another stream', async () => {
    make('A'); const b = make('B'); await flushCoordination(); b.stream.stop(); await flushCoordination();
    expect(sources).toHaveLength(1); expect(b.factory).not.toHaveBeenCalled();
  });
  it('uses a new context on token update and never accepts the old connection again', async () => {
    const old = make('A'); await flushCoordination(); const source = sources[0]; old.stream.stop();
    token = 'renewed'; const current = make('A-next'); await flushCoordination();
    expect(current.factory).toHaveBeenCalledWith('http://localhost/api/notifications/stream?token=renewed');
    source.event(); expect(old.notice).not.toHaveBeenCalled(); expect(current.notice).not.toHaveBeenCalled();
  });
  it('stops native auto-reconnect and permits only 3 delayed reconnects without refresh', async () => {
    jest.useFakeTimers(); const client = make('A'); await flushCoordination();
    for (const [index, wait] of [1000, 3000, 10000].entries()) {
      sources[index].error(); expect(sources[index].close).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(wait - 1); expect(sources).toHaveLength(index + 1);
      jest.advanceTimersByTime(1); expect(sources).toHaveLength(index + 2);
    }
    sources[3].error(); jest.advanceTimersByTime(60000); expect(sources).toHaveLength(4);
    expect(client.status).toHaveBeenLastCalledWith('exhausted');
  });
  it('does not reuse an expired token during a delayed reconnect and cancels retry timers on close', async () => {
    jest.useFakeTimers(); make('A'); await flushCoordination(); sources[0].error(); token = null;
    jest.advanceTimersByTime(1000); expect(sources).toHaveLength(1);
    token = 'new'; const next = make('B'); await flushCoordination(); sources[1].error(); next.stream.stop();
    jest.advanceTimersByTime(60000); expect(sources).toHaveLength(2);
  });
  it.each(['secure', 'locks', 'channel'] as const)('fails closed when %s is unavailable', async missing => {
    const browser = harness.browser('A');
    if (missing === 'secure') browser.secure = false;
    else if (missing === 'locks') browser.locks = undefined;
    else browser.channel = () => null;
    const client = make('A', 1, browser); await flushCoordination(); expect(client.factory).not.toHaveBeenCalled(); expect(client.status).toHaveBeenCalledWith('unavailable');
  });
  it('does not distribute notices across users or to a restarted old context', async () => {
    make('A', 1); const other = make('B', 2); await flushCoordination(); sources[0].event(); await flushCoordination();
    expect(other.notice).not.toHaveBeenCalled(); sources[1].event(); expect(other.notice).toHaveBeenCalledWith(payload);
  });
  it('ignores forged/replayed envelopes and permits a fresh context handshake after close', async () => {
    const a = make('A'), b = make('B'); await flushCoordination();
    const channel = harness.browser('noise').channel('unita:sse:v1:http://localhost/api:1')!;
    for (const value of [null, {}, { protocol: 1, type: 'event', userId: 1, target: 'B', leaderId: 'A', sequence: 1, challenge: 'unknown', payload },
      { protocol: 1, type: 'leader', userId: 1, target: 'B', leaderId: 'old', sequence: 1, challenge: 'old' }]) channel.postMessage(value);
    await flushCoordination(); expect(b.notice).not.toHaveBeenCalled();
    b.stream.stop(); const fresh = make('B-next'); await flushCoordination(); sources[0].event(); await flushCoordination();
    expect(fresh.notice).toHaveBeenCalledTimes(1); expect(b.notice).not.toHaveBeenCalled(); a.stream.stop(); channel.close();
  });
  it('handles a broken channel without recursive close or leaking a source', async () => {
    const browser = harness.browser('A'); browser.channel = () => ({ onmessage: null, postMessage: () => { throw new Error(); }, close: jest.fn() });
    const client = make('A', 1, browser); await flushCoordination(); expect(client.status).toHaveBeenCalledWith('unavailable'); expect(client.factory).not.toHaveBeenCalled();
  });
  it.each([null, {}, { ...payload, invitationId: 0 }, { ...payload, groupName: ' ' }])('rejects malformed notice %j', value => {
    expect(parseInvitationNotice(value)).toBeNull();
  });
});
