export const qk = {
  dashboard: ['dashboard'] as const,
  patients: {
    all: ['patients'] as const,
    list: ['patients', 'list'] as const,
    bundle: (id: string) => ['patients', 'bundle', id] as const,
  },
  appointments: {
    all: ['appointments'] as const,
    day: (isoDate: string) => ['appointments', 'day', isoDate] as const,
    week: (isoStartDate: string) => ['appointments', 'week', isoStartDate] as const,
  },
}
