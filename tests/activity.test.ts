import { test } from "node:test";
import assert from "node:assert/strict";
import { annualActivity, activityLevel } from "../shared/activity";
import { dayKey, type Day } from "../shared/model";
const day = (date: string, reviews = 1, access = false): Day => ({
  day: date,
  reviews,
  access,
  activeMs: reviews * 2000,
  words: 0,
  selfRatings: [0, 0, reviews, 0],
  objectiveCorrect: 0,
  objectiveTotal: 0,
});
test("annual grid aligns Mondays, preserves leap day and handles 54-week years", () => {
  for (const year of [2024, 2026, 2012]) {
    const result = annualActivity([], year, `${year}-12-31`);
    assert.equal(new Date(result.cells[0].day + "T12:00:00Z").getUTCDay(), 1);
    assert.equal(result.cells.length % 7, 0);
    assert.equal(
      result.cells.filter((c) => c.inYear).length,
      year === 2026 ? 365 : 366,
    );
    assert.equal(
      result.cells.filter((c) => c.inYear && c.day.endsWith("02-29")).length,
      year === 2026 ? 0 : 1,
    );
  }
  assert.equal(annualActivity([], 2012, "2012-12-31").columns, 54);
});
test("averages and percentages include elapsed zero days, never future activity", () => {
  const result = annualActivity(
    [day("2026-01-01", 4), day("2026-01-03", 8), day("2026-01-05", 100)],
    2026,
    "2026-01-04",
  );
  assert.equal(result.elapsedDays, 4);
  assert.equal(result.total, 12);
  assert.equal(result.average, 3);
  assert.equal(result.percent, 50);
  assert.equal(result.longest, 1);
  assert.equal(result.current, 1);
  assert.equal(result.cells.find((c) => c.day === "2026-01-05")!.level, 0);
});
test("current streak crosses New Year while longest streak is limited to selected year", () => {
  const days = [
    day("2025-12-30"),
    day("2025-12-31"),
    day("2026-01-01"),
    day("2026-01-02"),
  ];
  const current = annualActivity(days, 2026, "2026-01-03");
  assert.equal(current.current, 4);
  assert.equal(current.longest, 2);
  const past = annualActivity(days, 2025, "2026-01-03");
  assert.equal(past.elapsedDays, 365);
  assert.equal(past.current, 4);
  assert.equal(past.longest, 2);
  assert.equal(annualActivity(days, 2026, "2026-01-04").current, 0);
});
test("access days remain distinct from study, with finite empty and future statistics", () => {
  const days = [day("2026-01-01", 0, true), day("2026-01-02", 8, false)];
  assert.equal(annualActivity(days, 2026, "2026-01-02", "access").current, 1);
  assert.equal(annualActivity(days, 2026, "2026-01-02", "study").total, 8);
  for (const year of [2025, 2027]) {
    const r = annualActivity([], year, "2026-01-02");
    assert.equal(r.average, 0);
    assert.equal(r.percent, 0);
    assert.equal(r.longest, 0);
  }
  assert.deepEqual(
    [0, 1, 5, 6, 15, 16, 30, 31].map((n) => activityLevel(n, "study")),
    [0, 1, 1, 2, 2, 3, 3, 4],
  );
});
test("profile timezone determines today at a UTC year boundary", () => {
  const today = dayKey("2027-01-01T01:00:00Z", "America/Sao_Paulo");
  assert.equal(today, "2026-12-31");
  const data = annualActivity(
    [day(today, 3)],
    Number(today.slice(0, 4)),
    today,
  );
  assert.equal(data.elapsedDays, 365);
  assert.equal(data.current, 1);
});
