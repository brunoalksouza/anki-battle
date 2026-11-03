import type { ChallengeScore } from "./model";

export function addCalendarDays(day: string, amount: number) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function challengeLeader(a: ChallengeScore, b: ChallengeScore) {
  const difference = a.studyDays - b.studyDays || a.totalWords - b.totalWords;
  return difference > 0 ? a.userId : difference < 0 ? b.userId : null;
}
