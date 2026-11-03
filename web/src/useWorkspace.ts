import { useEffect, useRef, useState } from 'react';
import { isAborted, read } from './api';
import type { Incident, Overview, Page, Responder, Service } from './types';

interface Meta { userId: string; services: Service[]; overview: Overview; responders: Responder[] }
interface Queue { userId: string; key: string; incidents: Page<Incident> }

/** Filters invalidate only the queue; reference data belongs to the session.
 * Aborting superseded work saves bandwidth and keeps older responses out of view. */
export function useWorkspace(userId: string | undefined, filtersKey: string, revision: number) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);
  const [metaError, setMetaError] = useState('');
  const [queueError, setQueueError] = useState('');
  const respondersCache = useRef<{ userId: string; people: Responder[]; at: number } | null>(null);
  const lastSearch = useRef('');

  useEffect(() => {
    if (!userId) { respondersCache.current = null; return; }
    const controller = new AbortController();
    const { signal } = controller;
    const cache = respondersCache.current;
    const cached = cache?.userId === userId && Date.now() - cache.at < 300_000;
    const people = cached
      ? Promise.resolve(cache.people) : read<Responder[]>('/responders', signal);
    Promise.all([read<Service[]>('/services', signal), read<Overview>('/overview', signal), people])
      .then(([services, overview, responders]) => {
        if (signal.aborted) return;
        respondersCache.current = { userId, people: responders, at: cached ? cache.at : Date.now() };
        setMeta({ userId, services, overview, responders }); setMetaError('');
      }).catch(error => { if (!isAborted(error)) setMetaError(error.message); });
    return () => controller.abort();
  }, [userId, revision]);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    const { signal } = controller;
    const filters = JSON.parse(filtersKey);
    const searching = lastSearch.current !== filters.q;
    lastSearch.current = filters.q;
    const query = new URLSearchParams(Object.entries({ ...filters, pageSize: '10' })
      .filter(([, value]) => value !== '').map(([key, value]) => [key, String(value)]));
    setQueueLoading(true);
    const timer = window.setTimeout(() => {
      read<Page<Incident>>(`/incidents?${query}`, signal).then(incidents => {
        if (!signal.aborted) { setQueue({ userId, key: filtersKey, incidents }); setQueueError(''); }
      }).catch(error => { if (!isAborted(error)) setQueueError(error.message); })
        .finally(() => { if (!signal.aborted) setQueueLoading(false); });
    }, searching ? 180 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [userId, filtersKey, revision]);

  const owned = !!userId && meta?.userId === userId && queue?.userId === userId;
  return {
    data: owned ? { services: meta.services, overview: meta.overview, responders: meta.responders, incidents: queue.incidents } : null,
    loading: queueLoading || !owned,
    error: metaError || queueError,
  };
}
