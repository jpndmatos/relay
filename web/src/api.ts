import type { Session } from './types';
declare const __DEMO__: boolean;
export const isLocalDemo = __DEMO__;
let token = '';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function request<T>(path: string, method = 'GET', body?: unknown, key?: string, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  if (__DEMO__) {
    const { demoRequest } = await import('./demo');
    signal?.throwIfAborted();
    const result = await demoRequest<T>(path, method, body, key);
    signal?.throwIfAborted();
    return result;
  }
  let response: Response;
  try { response = await fetch(`/api${path}`, {
    method, credentials: 'same-origin', signal,
    headers: { 'Content-Type': 'application/json', ...(method !== 'GET' ? { 'X-CSRF-TOKEN': token } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }); } catch (error) {
    if (isAborted(error)) throw error;
    throw new ApiError(0, 'Unable to reach Relay. Check your connection and try again.');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const fields = error.errors ? Object.values(error.errors as Record<string, string[]>).flat().join(' ') : '';
    if (response.status === 401 && path !== '/session/login') window.dispatchEvent(new Event('relay:expired'));
    throw new ApiError(response.status, fields || error.detail || error.title || `Request failed (${response.status}). Try again.`);
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (path === '/session') token = (data as Session).csrfToken;
  return data as T;
}

export const read = <T,>(path: string, signal?: AbortSignal) => request<T>(path, 'GET', undefined, undefined, signal);
export const isAborted = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

export async function subscribe(onChange: () => void, onState: (state: string) => void) {
  if (__DEMO__) {
    const listener = (e: StorageEvent) => { if (e.key === 'relay.workspace.v1') onChange(); };
    window.addEventListener('storage', listener);
    onState('Local workspace');
    return () => window.removeEventListener('storage', listener);
  }
  const { HubConnectionBuilder, LogLevel } = await import('@microsoft/signalr');
  const connection = new HubConnectionBuilder().withUrl('/hubs/incidents')
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000]).configureLogging(LogLevel.Error).build();
  connection.on('incidentsChanged', onChange);
  connection.onreconnecting(() => onState('Reconnecting'));
  connection.onreconnected(() => { onState('Live updates'); onChange(); });
  connection.onclose(() => onState('Updates paused'));
  try { await connection.start(); onState('Live updates'); }
  catch { onState('Updates paused'); }
  return () => { void connection.stop(); };
}
