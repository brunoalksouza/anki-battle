import type { Day } from "./model";
export type ActivityKind = "study" | "access";
const DAY_MS = 86400000;
const epoch = (day: string) => Date.parse(day + "T00:00:00Z");
export const shiftDay = (day: string, amount: number) =>
  new Date(epoch(day) + amount * DAY_MS).toISOString().slice(0, 10);
export const activityCount = (day: Day | undefined, kind: ActivityKind) =>
  kind === "study" ? day?.reviews || 0 : day?.access ? 1 : 0;
export const activityLevel = (count: number, kind: ActivityKind) =>
  count === 0
    ? 0
    : kind === "access"
      ? 3
      : count <= 5
        ? 1
        : count <= 15
          ? 2
          : count <= 30
            ? 3
            : 4;

export function annualActivity(
  days: Day[],
  year: number,
  today: string,
  kind: ActivityKind = "study",
) {
  const first = `${year}-01-01`,
    last = `${year}-12-31`;
  const leading = (new Date(epoch(first)).getUTCDay() + 6) % 7;
  const start = shiftDay(first, -leading);
  const yearDays = Math.round((epoch(last) - epoch(first)) / DAY_MS) + 1;
  const columns = Math.ceil((leading + yearDays) / 7);
  const byDay = new Map(days.map((day) => [day.day, day]));
  const cells = Array.from({ length: columns * 7 }, (_, i) => {
    const day = shiftDay(start, i),
      inYear = day >= first && day <= last,
      future = day > today;
    const count = inYear && !future ? activityCount(byDay.get(day), kind) : 0;
    return {
      day,
      inYear,
      future,
      count,
      level: activityLevel(count, kind),
      activeMs: byDay.get(day)?.activeMs || 0,
    };
  });
  const elapsedDays = Math.max(
    0,
    Math.min(yearDays, Math.round((epoch(today) - epoch(first)) / DAY_MS) + 1),
  );
  let total = 0,
    activeDays = 0,
    longest = 0,
    run = 0;
  for (const cell of cells.filter((cell) => cell.inYear && !cell.future)) {
    total += cell.count;
    if (cell.count > 0) {
      activeDays++;
      run++;
      longest = Math.max(longest, run);
    } else run = 0;
  }
  let cursor = activityCount(byDay.get(today), kind)
      ? today
      : shiftDay(today, -1),
    current = 0;
  while (activityCount(byDay.get(cursor), kind) > 0) {
    current++;
    cursor = shiftDay(cursor, -1);
  }
  const months = Array.from({ length: 12 }, (_, month) => {
    const day = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    return {
      month,
      column: Math.floor((epoch(day) - epoch(start)) / DAY_MS / 7),
    };
  });
  return {
    cells,
    columns,
    months,
    total,
    activeDays,
    elapsedDays,
    average: elapsedDays ? total / elapsedDays : 0,
    percent: elapsedDays ? (activeDays / elapsedDays) * 100 : 0,
    longest,
    current,
  };
}
