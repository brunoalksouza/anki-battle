import { DefaultScheduler, type Grade } from "ts-fsrs";
import type { Schedule } from "./model";
// One pinned model and configuration on both sides of the offline boundary.
export const scheduler = await DefaultScheduler({
  version: "FSRS-7",
  desiredRetention: 0.9,
  enableFuzz: false,
});
export const newSchedule = (id: string, now: Date) =>
  JSON.parse(
    JSON.stringify(scheduler.newCard({ cardId: id, now })),
  ) as Schedule;
function hydrate(s: Schedule) {
  return {
    ...s,
    state: s.state as 0 | 1 | 2 | 3,
    scheduleStatus: s.scheduleStatus as "new" | "learning" | "review",
    dueAt: new Date(s.dueAt),
    lastReviewAt: s.lastReviewAt ? new Date(s.lastReviewAt) : null,
  };
}
export function reviewSchedule(s: Schedule, rating: 1 | 2 | 3 | 4, now: Date) {
  const result = scheduler.review({
    card: hydrate(s),
    grade: rating as Grade,
    now,
  });
  return {
    schedule: JSON.parse(JSON.stringify(result.card)) as Schedule,
    log: JSON.parse(JSON.stringify(result.revlog)),
  };
}
export function previewSchedule(s: Schedule, now: Date) {
  return [1, 2, 3, 4].map(
    (r) => reviewSchedule(s, r as 1 | 2 | 3 | 4, now).schedule.dueAt,
  );
}
