import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';

function subscribe(callback: () => void) {
  return onlineManager.subscribe(callback);
}

function getSnapshot() {
  return onlineManager.isOnline();
}

export function useOnlineStatus() {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot);
  return isOnline;
}
