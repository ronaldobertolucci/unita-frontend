import { CoordinationBrowser } from './session-coordinator';
import { isRecord } from './auth-contract';

export interface InvitationNotice {
  invitationId: number;
  groupName: string;
  invitingUserFirstName: string;
  invitingUserLastName: string;
}
export type StreamStatus = 'stopped' | 'waiting' | 'leader' | 'follower' | 'retrying' | 'unavailable' | 'exhausted';
export type StreamSource = Pick<EventSource, 'onopen' | 'onerror' | 'addEventListener' | 'close'>;

export function parseInvitationNotice(value: unknown): InvitationNotice | null {
  if (!isRecord(value) || !Number.isSafeInteger(value['invitationId']) || Number(value['invitationId']) <= 0 ||
      Object.keys(value).some(key => !['invitationId', 'groupName', 'invitingUserFirstName', 'invitingUserLastName'].includes(key))) return null;
  for (const key of ['groupName', 'invitingUserFirstName', 'invitingUserLastName']) {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > 1000) return null;
  }
  return { invitationId: value['invitationId'] as number, groupName: value['groupName'] as string,
    invitingUserFirstName: value['invitingUserFirstName'] as string, invitingUserLastName: value['invitingUserLastName'] as string };
}

/** One leader per API/user. Channel contents are transient; JWT never leaves its tab. */
export class InvitationStream {
  private readonly key: string;
  private readonly peer: string;
  private channel: ReturnType<CoordinationBrowser['channel']> = null;
  private source: StreamSource | null = null;
  private readonly abort = new AbortController();
  private release: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private leader = false;
  private leaderId: string | null = null;
  private challenge: string | null = null;
  private pendingChallenge: string | null = null;
  private sequence = 0;
  private received = 0;
  private attempts = 0;
  private readonly peers = new Map<string, string>();
  private readonly delays = [1000, 3000, 10000];

  constructor(private readonly browser: CoordinationBrowser, api: string, base: string,
      private readonly userId: number, private readonly getToken: () => string | null,
      private readonly createSource: (url: string) => StreamSource,
      private readonly notice: (payload: InvitationNotice) => void,
      private readonly status: (status: StreamStatus) => void,
      private readonly takeover: () => void = () => {}) {
    const url = new URL(api, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
        !Number.isSafeInteger(userId) || userId <= 0) throw new Error('Invalid stream configuration');
    this.key = `unita:sse:v1:${url.href.replace(/\/+$/, '')}:${userId}`;
    this.peer = browser.id();
  }

  start(): void {
    if (this.stopped || this.channel) return;
    if (!this.browser.secure || !this.browser.locks) { this.status('unavailable'); return; }
    try { this.channel = this.browser.channel(this.key); } catch { /* closed below */ }
    if (!this.channel) { this.status('unavailable'); return; }
    this.channel.onmessage = event => this.receive(event.data);
    this.status('waiting');
    this.hello();
    void this.browser.locks.request(this.key, { signal: this.abort.signal }, async () => {
      if (this.stopped) return;
      const wasFollower = this.leaderId !== null;
      this.leader = true; this.leaderId = this.peer;
      const untilStopped = new Promise<void>(resolve => { this.release = resolve; });
      this.status('leader'); this.post({ type: 'available', leaderId: this.peer });
      this.open(); if (wasFollower) this.takeover();
      try { await untilStopped; } finally { this.closeSource(); this.leader = false; this.release = null; }
    }).catch(() => { if (!this.stopped) { this.status('unavailable'); this.stop(); } });
  }

  private post(message: Record<string, unknown>): void {
    if (this.stopped) return;
    try { this.channel?.postMessage({ protocol: 1, userId: this.userId, ...message }); }
    catch { this.status('unavailable'); this.stop(); }
  }
  private hello(): void {
    this.pendingChallenge = this.browser.id();
    this.post({ type: 'hello', peer: this.peer, challenge: this.pendingChallenge });
  }
  private receive(value: unknown): void {
    if (this.stopped || !isRecord(value) || value['protocol'] !== 1 || value['userId'] !== this.userId) return;
    const id = (key: string) => typeof value[key] === 'string' && value[key].length > 0 && value[key].length <= 200;
    const allowed: Record<string, string[]> = {
      available: ['leaderId'], hello: ['peer', 'challenge'], bye: ['peer'],
      leader: ['leaderId', 'target', 'challenge', 'sequence'], event: ['leaderId', 'target', 'challenge', 'sequence', 'payload']
    };
    const type = value['type'];
    if (typeof type !== 'string' || !allowed[type] || Object.keys(value).some(key => !['protocol', 'userId', 'type', ...allowed[type]].includes(key))) return;
    if (type === 'available' && !this.leader && id('leaderId')) { this.hello(); return; }
    if (type === 'bye' && this.leader && id('peer')) { this.peers.delete(value['peer'] as string); return; }
    if (type === 'hello' && this.leader && id('peer') && id('challenge')) {
      if (this.peers.size >= 64 && !this.peers.has(value['peer'] as string)) return;
      this.peers.set(value['peer'] as string, value['challenge'] as string);
      this.post({ type: 'leader', leaderId: this.peer, target: value['peer'], challenge: value['challenge'], sequence: this.sequence }); return;
    }
    if (this.leader || value['target'] !== this.peer || !id('leaderId') || !id('challenge') ||
        !Number.isSafeInteger(value['sequence']) || Number(value['sequence']) < 0) return;
    if (type === 'leader' && this.pendingChallenge !== null && value['challenge'] === this.pendingChallenge) {
      this.leaderId = value['leaderId'] as string; this.challenge = this.pendingChallenge; this.pendingChallenge = null;
      this.received = value['sequence'] as number; this.status('follower'); return;
    }
    if (type === 'event' && value['leaderId'] === this.leaderId && value['challenge'] === this.challenge &&
        Number(value['sequence']) > this.received) {
      const payload = parseInvitationNotice(value['payload']);
      if (payload) { this.received = value['sequence'] as number; this.notice(payload); }
    }
  }

  private open(): void {
    if (this.stopped || !this.leader) return;
    const token = this.getToken(); if (!token) { this.stop(); return; }
    try {
      const api = this.key.slice('unita:sse:v1:'.length, this.key.lastIndexOf(':'));
      const source = this.createSource(`${api}/notifications/stream?token=${encodeURIComponent(token)}`);
      this.source = source;
      source.onopen = () => { if (!this.stopped && source === this.source) this.status('leader'); };
      source.addEventListener('invitation', (event: Event) => {
        if (this.stopped || source !== this.source || !this.getToken()) return;
        const data = (event as MessageEvent).data;
        if (typeof data !== 'string' || data.length > 8192) return;
        let value: unknown; try { value = JSON.parse(data); } catch { return; }
        const payload = parseInvitationNotice(value); if (!payload) return;
        this.notice(payload); this.sequence++;
        for (const [target, challenge] of this.peers) this.post({ type: 'event', leaderId: this.peer, target, challenge, sequence: this.sequence, payload });
      });
      source.onerror = () => { if (!this.stopped && source === this.source) this.failed(); };
    } catch { this.failed(); }
  }
  private failed(): void {
    this.closeSource();
    if (this.stopped) return;
    if (this.attempts >= this.delays.length) { this.status('exhausted'); this.stop(); return; }
    this.status('retrying');
    this.timer = setTimeout(() => { this.timer = null; this.open(); }, this.delays[this.attempts++]);
  }
  private closeSource(): void {
    const source = this.source; this.source = null;
    if (source) { source.onopen = null; source.onerror = null; source.close(); }
  }
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    try { this.channel?.postMessage({ protocol: 1, userId: this.userId, type: 'bye', peer: this.peer }); } catch { /* closing anyway */ }
    if (this.timer !== null) clearTimeout(this.timer); this.timer = null;
    this.closeSource(); this.channel?.close(); this.channel = null;
    this.peers.clear(); this.abort.abort(); this.release?.();
  }
}
