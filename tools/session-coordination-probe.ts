import { firstValueFrom, from, throwError } from 'rxjs';
import { CookieSessionCoordinatorEngine, CoordinationBrowser } from '../src/app/core/auth/session-coordinator';

const params = new URLSearchParams(location.search);
const run = params.get('run') ?? 'manual';
const tab = params.get('tab') ?? 'A';
const api = `/probe-api/${run}`;
const browser: CoordinationBrowser = {
  secure: isSecureContext, locks: navigator.locks,
  read: key => localStorage.getItem(key), write: (key, value) => localStorage.setItem(key, value),
  id: () => crypto.randomUUID(), channel: name => new BroadcastChannel(name),
  listen: callback => { window.addEventListener('storage', callback); return () => window.removeEventListener('storage', callback); }
};
const engine = new CookieSessionCoordinatorEngine(browser, api, document.baseURI, 60_000, 60_000);
const control = new BroadcastChannel(`unita-h035-probe-${run}`);
const output = document.querySelector('pre')!;
const report = (value: unknown) => { output.textContent = JSON.stringify(value, null, 2); };
const otherDone = new Promise<void>(resolve => { control.onmessage = event => { if (event.data === 'B-done') resolve(); }; });

(async () => {
  try {
    if (tab === 'reload') {
      let dispatched = false;
      try { await firstValueFrom(engine.execute('refresh', () => { dispatched = true; return from(fetch('/probe/should-not-run')); })); }
      catch { /* The marker from A must remain blocked after actual page reload. */ }
      const blocked = JSON.parse(localStorage.getItem(engine.key)!);
      report({ tab, passed: !dispatched && blocked.state === 'blocked', dispatched, persistedState: blocked.state });
      return;
    }
    report({ tab, phase: 'waiting', secure: isSecureContext, nativeWebLocks: !!navigator.locks });
    if (tab === 'B') await fetch(`/probe/ready?run=${run}`, { method: 'POST' });
    const result = await firstValueFrom(engine.execute('refresh', () => from(fetch(
      `/probe/rotate?run=${run}&tab=${tab}`, { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Protection': '1' } }
    ).then(async response => { if (!response.ok) throw new Error('concurrent cookie reuse'); return response.json(); }))));
    if (tab === 'B') {
      control.postMessage('B-done');
      report({ tab, passed: result.seen === 1 && result.rotated === 2, result });
    } else {
      await otherDone;
      // Lost-response simulation is separate from the rotation fixture.
      await firstValueFrom(engine.execute('refresh', () => throwError(() => ({ status: 0 })))).catch(() => {});
      report({ tab, passed: result.seen === 0 && result.rotated === 1,
        result, uncertainty: JSON.parse(localStorage.getItem(engine.key)!).state, reloadUrl: `/?run=${run}&tab=reload` });
    }
  } catch (error) { report({ tab, passed: false, error: (error as Error).message }); }
})();

window.addEventListener('pagehide', () => { engine.dispose(); control.close(); });
document.querySelector('button')!.addEventListener('click', async () => {
  engine.dispose(); control.close();
  localStorage.removeItem(engine.key); localStorage.removeItem(engine.invalidationKey);
  await fetch(`/probe/cleanup?run=${run}`, { method: 'POST' });
  report({ syntheticDataCleaned: true });
});
