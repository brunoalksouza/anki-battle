export type ReadingState = {
  status: "disconnected" | "connected" | "reconnect" | "error";
  days: string[];
  lastSync: string | null;
  lastAttempt: string | null;
  longestDaily: number;
  longestWeekly: number;
  titlesByYear: Record<string, number>;
};
export const emptyReading = (): ReadingState => ({
  status: "disconnected",
  days: [],
  lastSync: null,
  lastAttempt: null,
  longestDaily: 0,
  longestWeekly: 0,
  titlesByYear: {},
});
export function readingStreak(days: string[], today: string) {
  const known = new Set(days);
  const d = new Date(today + "T12:00:00Z");
  if (!known.has(today)) d.setUTCDate(d.getUTCDate() - 1);
  let count = 0;
  while (known.has(d.toISOString().slice(0, 10))) {
    count++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return count;
}
