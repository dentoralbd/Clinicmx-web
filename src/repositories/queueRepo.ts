import { getQueueEntries, getQueueSettings, todayQueueDate } from '@/lib/queueApi'

export async function fetchTodayQueue(queueDate: string = todayQueueDate()) {
  return getQueueEntries(queueDate)
}

export async function fetchQueueSettings() {
  return getQueueSettings()
}
