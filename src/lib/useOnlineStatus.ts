import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { CONNECTIVITY_CHANGED_EVENT, isRecentlyObservedOffline } from './connectivityStatus';

// onlineManager only reacts to the browser's online/offline DOM events,
// which never fire on a degraded-but-interface-up connection (weak mobile
// signal, packet loss, timeouts) — the network stays nominally "up" while
// real requests keep failing. Combining it with isRecentlyObservedOffline()
// (fed by every isConnectivityError() call across the app) makes this
// signal accurate on that class of network too — see connectivityStatus.ts.
function subscribe(callback: () => void) {
  const unsubscribeOnlineManager = onlineManager.subscribe(callback);
  window.addEventListener(CONNECTIVITY_CHANGED_EVENT, callback);
  return () => {
    unsubscribeOnlineManager();
    window.removeEventListener(CONNECTIVITY_CHANGED_EVENT, callback);
  };
}

function getSnapshot() {
  return onlineManager.isOnline() && !isRecentlyObservedOffline();
}

export function useOnlineStatus() {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot);
  return isOnline;
}
