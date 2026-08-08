import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { get, set, del } from 'idb-keyval';

export const CACHE_BUSTER = 'v1';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds fresh
      gcTime: 7 * 24 * 60 * 60 * 1000, // 7 days cache retention
      retry: 2,
      refetchOnWindowFocus: true,
      networkMode: 'online', // Pause background refetches offline, render persisted data
    },
    mutations: {
      networkMode: 'online',
    },
  },
});

export const idbPersister = createAsyncStoragePersister({
  key: 'clinicmx-query-cache-v1',
  storage: {
    getItem: async (key: string) => {
      const value = await get(key);
      return value ? JSON.stringify(value) : null;
    },
    setItem: async (key: string, value: string) => {
      await set(key, JSON.parse(value));
    },
    removeItem: async (key: string) => {
      await del(key);
    },
  },
  throttleTime: 2000,
});

// Query keys that are safe to persist to IndexedDB offline storage.
// Admin-only data (users list, clinic hours config) is deliberately excluded
// so nothing beyond clinical/billing data a clinician already sees sits in
// device storage.
const PERSISTABLE_QUERY_KEY_PREFIXES = ['patients', 'appointments', 'dashboard'];

// Only ever persist queries that actually finished successfully — this is
// react-query's own default filter (defaultShouldDehydrateQuery), which our
// key-prefix allowlist below must not silently drop. Persisting a
// still-pending or errored query writes a dead entry to IndexedDB that comes
// back "paused" forever on the next restore, since there is no live fetch
// left to resolve it.
export function shouldPersistQuery(query: { queryKey: readonly unknown[]; state: { status: string } }): boolean {
  if (query.state.status !== 'success') return false;
  const root = query.queryKey[0];
  return typeof root === 'string' && PERSISTABLE_QUERY_KEY_PREFIXES.includes(root);
}
