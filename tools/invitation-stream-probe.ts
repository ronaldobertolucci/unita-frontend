import { InvitationStream } from '../src/app/core/auth/invitation-stream';
import { CoordinationBrowser } from '../src/app/core/auth/session-coordinator';

// Local synthetic fixture only. No Unita accounts/API are used.
const parameters = new URLSearchParams(location.search);
const run = parameters.get('run')!, tab = parameters.get('tab')!;
const result = { tab, status: 'waiting', invitations: [] as number[] };
const render = () => { document.querySelector('pre')!.textContent = JSON.stringify(result, null, 2); };
const browser: CoordinationBrowser = {
  secure: window.isSecureContext, locks: navigator.locks, id: () => crypto.randomUUID(),
  read: () => null, write: () => { throw new Error('No persistence'); },
  channel: name => new BroadcastChannel(name), listen: () => () => {}
};
const stream = new InvitationStream(browser, `/fixture-api/${run}`, location.href, 99, () => `fixture-${tab}`,
  url => new EventSource(url), payload => { result.invitations.push(payload.invitationId); render(); },
  status => { result.status = status; render(); });
stream.start();
window.addEventListener('pagehide', () => stream.stop(), { once: true });
document.querySelector('#emit')!.addEventListener('click', () => void fetch(`/fixture-api/${run}/emit`, { method: 'POST' }));
document.querySelector('#stop')!.addEventListener('click', () => { stream.stop(); result.status = 'stopped'; render(); });
