import { CoordinationBrowser } from '../auth/session-coordinator';

export async function flushCoordination(): Promise<void> {
  for (let i = 0; i < 16; i++) await Promise.resolve();
}

/** Two independent runtimes sharing only native-like locks/storage/messages. */
export function coordinationHarness() {
  const storage = new Map<string, string>();
  const listeners = new Map<string, (event: Pick<StorageEvent, 'key' | 'newValue'>) => void>();
  const channels: Array<{ owner: string; name: string; handle: Pick<BroadcastChannel, 'onmessage' | 'postMessage' | 'close'> }> = [];
  const messages: Array<{ name: string; value: unknown }> = [];
  let id = 0;
  let storageDenied = false;
  type Job = { active: boolean; invoke: () => Promise<unknown>; resolve: (value: unknown) => void; reject: (error: unknown) => void; signal?: AbortSignal; abort?: () => void };
  const queues = new Map<string, Job[]>();
  const held = new Set<string>();
  function drain(name: string): void {
    if (held.has(name)) return;
    const job = queues.get(name)?.shift();
    if (!job) return;
    held.add(name); job.active = true;
    if (job.abort) job.signal?.removeEventListener('abort', job.abort);
    Promise.resolve().then(job.invoke).then(job.resolve, job.reject).finally(() => {
      held.delete(name); drain(name);
    });
  }
  const locks = {
    request(name: string, options: { signal: AbortSignal }, callback: () => Promise<unknown>) {
      return new Promise((resolve, reject) => {
        const job: Job = { active: false, invoke: callback, resolve, reject, signal: options.signal };
        job.abort = () => {
          if (job.active) return;
          const queue = queues.get(name)!;
          const index = queue.indexOf(job);
          if (index >= 0) queue.splice(index, 1);
          reject(new DOMException('Aborted', 'AbortError'));
        };
        if (options.signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
        options.signal.addEventListener('abort', job.abort);
        if (!queues.has(name)) queues.set(name, []);
        queues.get(name)!.push(job); drain(name);
      });
    }
  } as unknown as Pick<LockManager, 'request'>;
  function browser(owner: string): CoordinationBrowser {
    return {
      secure: true, locks, id: () => `${owner}-${++id}`,
      read: key => { if (storageDenied) throw new Error('denied'); return storage.get(key) ?? null; },
      write: (key, value) => {
        if (storageDenied) throw new Error('denied');
        storage.set(key, value);
        for (const [other, callback] of listeners) if (other !== owner) {
          Promise.resolve().then(() => callback({ key, newValue: value }));
        }
      },
      listen: callback => { listeners.set(owner, callback); return () => { listeners.delete(owner); }; },
      channel: name => {
        const handle: Pick<BroadcastChannel, 'onmessage' | 'postMessage' | 'close'> = {
          onmessage: null,
          postMessage: value => {
            messages.push({ name, value });
            for (const other of channels) if (other.owner !== owner && other.name === name) {
              Promise.resolve().then(() => other.handle.onmessage?.call(other.handle as BroadcastChannel, { data: value } as MessageEvent));
            }
          },
          close: () => { const index = channels.findIndex(entry => entry.handle === handle); if (index >= 0) channels.splice(index, 1); }
        };
        channels.push({ owner, name, handle }); return handle;
      }
    };
  }
  return { storage, messages, browser, denyStorage: () => { storageDenied = true; } };
}
