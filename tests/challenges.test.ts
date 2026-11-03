import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../server/app";
import { hash, Service } from "../server/service";
import { openDB } from "../server/db";
import { type User, type Card } from "../shared/model";

async function fixture(
  t: any,
  initial = "2026-11-03T15:00:00Z",
  timezone = "America/Sao_Paulo",
) {
  const folder = mkdtempSync(join(tmpdir(), "anki-challenges-"));
  let now = new Date(initial);
  const built = await buildApp({
    dbPath: join(folder, "test.sqlite"),
    dataDir: folder,
    origin: "https://challenge.test",
    now: () => new Date(now),
  });
  t.after(async () => {
    await built.app.close();
    rmSync(folder, { recursive: true, force: true });
  });
  const { svc, app } = built;
  const users = ["Alice", "Bob", "Observer"].map((nickname, index) => {
    const user: User = {
      id: randomUUID(),
      email: `${nickname}@challenge.test`,
      nickname,
      avatar: "🌱",
      nativeLang: "en",
      studyLang: "en",
      timezone: index === 1 ? "Asia/Tokyo" : timezone,
      dailyNew: 200,
      dailyReview: 1000,
      theme: "light",
      createdAt: now.toISOString(),
    };
    svc.db.run(
      "INSERT INTO users VALUES(?,?,?,?)",
      user.id,
      user.email,
      "fixture-only",
      JSON.stringify(user),
    );
    const token = randomUUID();
    svc.db.run(
      "INSERT INTO sessions VALUES(?,?,?)",
      hash(token),
      user.id,
      "2099-01-01T00:00:00Z",
    );
    const deck = svc.createDeck(user.id, {
      name: `${nickname}'s private deck`,
      language: "en",
      color: "#7042d6",
      shared: false,
    });
    return { ...user, deck, cookie: `anki_session=${token}` };
  });
  // Use the cookie name configured by the app, not a second test auth path.
  const request = (
    path: string,
    user = users[0],
    method: any = "GET",
    payload?: any,
  ) =>
    app.inject({
      url: "/api" + path,
      method,
      payload,
      headers: {
        origin: "https://challenge.test",
        "x-anki-client": "1",
        cookie: user.cookie,
      },
    });
  const word = (user: (typeof users)[number], term: string, kind = "basic") =>
    svc.createWord(user.id, {
      deckId: user.deck.id,
      term,
      meaning: `Definition of ${term}`,
      language: "en",
      color: "#7042d6",
      kind,
    });
  const review = (
    user: (typeof users)[number],
    wordId: string,
    options: Record<string, any> = {},
  ) => {
    const direction = options.direction || "forward";
    const card = svc.owned<Card>("cards", wordId + ":" + direction, user.id);
    const { direction: _, ...overrides } = options;
    return svc.review(user.id, {
      id: randomUUID(),
      cardId: card.id,
      baseRevision: card.revision,
      rating: 3,
      reviewedAt: now.toISOString(),
      activeMs: 3000,
      ...overrides,
    });
  };
  const start = () => {
    const id = randomUUID();
    svc.inviteChallenge(users[0].id, users[1].id, id);
    svc.respondChallenge(users[1].id, id, true);
    return id;
  };
  return {
    ...built,
    users,
    request,
    word,
    review,
    start,
    folder,
    time: (date: string) => {
      now = new Date(date);
    },
    getTime: () => new Date(now),
    score: (id: string) =>
      svc.challenges(users[0].id).find((c) => c.id === id)!,
  };
}

test("consistency invitations need no shared cards, require consent and isolate participants", async (t) => {
  const f = await fixture(t),
    [a, b, o] = f.users,
    id = randomUUID();
  const created = await f.request("/challenges", a, "POST", {
    id,
    guestId: b.id,
  });
  assert.equal(created.statusCode, 200, created.body);
  assert.equal(
    (await f.request("/challenges", a, "POST", { id, guestId: b.id }))
      .statusCode,
    200,
  );
  assert.equal(
    (
      await f.request("/challenges", a, "POST", {
        id: randomUUID(),
        guestId: a.id,
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await f.request("/challenges", b, "POST", {
        id: randomUUID(),
        guestId: a.id,
      })
    ).statusCode,
    409,
  );
  assert.deepEqual((await f.request("/challenges", o)).json(), []);
  assert.equal(
    (await f.request(`/challenges/${id}/respond`, o, "POST", { accept: true }))
      .statusCode,
    404,
  );
  assert.equal(
    (await f.request(`/challenges/${id}/respond`, a, "POST", { accept: true }))
      .statusCode,
    403,
  );
  assert.equal(
    (await f.request(`/challenges/${id}/cancel`, b, "POST", {})).statusCode,
    403,
  );
  assert.equal(
    (await f.request(`/challenges/${id}/respond`, b, "POST", { accept: true }))
      .statusCode,
    200,
  );
  const first = f.score(id);
  f.time("2026-11-04T15:00:00Z");
  assert.equal(
    (await f.request(`/challenges/${id}/respond`, b, "POST", { accept: true }))
      .statusCode,
    200,
  );
  assert.equal(f.score(id).startDay, first.startDay);
  assert.equal(f.score(id).endDay, "2026-11-09");
  assert.equal(f.svc.db.get("SELECT COUNT(*) n FROM rounds").n, 0);
  assert(f.svc.list<any>("decks", a.id).every((d) => !d.shared));
});

test("different private words count from today, once per word/day across ratings and duplicate cards", async (t) => {
  const f = await fixture(t),
    [a, b] = f.users;
  const advanced = f.word(a, "serendipity", "reverse"),
    simple = f.word(b, "horse"),
    duplicate = f.word(a, " SERENDIPITY ");
  const r = f.review(a, advanced.id, { rating: 1 });
  const id = f.start();
  f.review(a, advanced.id, { direction: "reverse", rating: 4 });
  f.review(a, duplicate.id, { rating: 4 });
  f.svc.review(a.id, r);
  f.review(b, simple.id, { rating: 4 });
  const c = f.score(id);
  assert.equal(c.host.todayWords, 1);
  assert.equal(c.guest.todayWords, 1);
  assert.equal(c.host.studyDays, 1);
  assert.equal(c.leaderId, null);
  assert.equal(c.host.totalWords, 1);
  const body = JSON.stringify((await f.request("/challenges", b)).json());
  for (const privateText of [
    "serendipity",
    "horse",
    "Definition",
    advanced.id,
    simple.id,
    "wordKey",
    "receivedAt",
    a.email,
  ])
    assert(!body.includes(privateText));
  const state = (await f.request("/state", b)).json();
  assert.deepEqual(
    state.words.map((w: any) => w.id),
    [simple.id],
  );
  assert.equal(state.challenges.length, 1);
  assert.equal(
    f.svc.owned<Card>("cards", simple.id + ":forward", b.id).schedule.reps,
    1,
  );
  f.time("2026-11-04T15:00:00Z");
  f.review(a, advanced.id, { rating: 1 });
  assert.equal(f.score(id).host.totalWords, 2);
  assert.equal(f.score(id).host.studyDays, 2);
});

test("due reviews count, while short, early, suspended, conflicting and imported reviews do not", async (t) => {
  const f = await fixture(t),
    [a] = f.users,
    id = f.start();
  const short = f.word(a, "short"),
    early = f.word(a, "early"),
    suspended = f.word(a, "suspended"),
    conflict = f.word(a, "conflict"),
    imported = f.word(a, "imported"),
    valid = f.word(a, "valid");
  f.review(a, short.id, { activeMs: 1999 });
  const e = f.svc.owned<Card>("cards", early.id + ":forward", a.id);
  f.svc.save("cards", {
    ...e,
    schedule: { ...e.schedule, dueAt: "2027-01-01T00:00:00Z" },
  });
  assert.equal(f.review(a, early.id).status, "early");
  const s = f.svc.owned<Card>("cards", suspended.id + ":forward", a.id);
  f.svc.save("cards", { ...s, suspended: true });
  assert.equal(f.review(a, suspended.id).status, "suspended");
  assert.equal(
    f.review(a, conflict.id, { baseRevision: 999 }).status,
    "conflict",
  );
  const i = f.review(a, imported.id);
  f.svc.db.run("UPDATE reviews SET status='imported' WHERE id=?", i.id);
  const v = f.review(a, valid.id, { activeMs: 2000 });
  assert.equal(f.score(id).host.totalWords, 1);
  assert.equal(v.receivedAt, f.getTime().toISOString());
  f.svc.deleteWord(a.id, valid.id);
  assert.equal(
    f.score(id).host.totalWords,
    1,
    "soft deletion keeps historical study credit",
  );
});

test("study days beat volume, results persist and late offline sync cannot rewrite a completed challenge", async (t) => {
  const f = await fixture(t),
    [a, b] = f.users,
    id = f.start();
  const aw = f.word(a, "a"),
    bw = f.word(b, "b");
  f.review(a, aw.id, { rating: 1 });
  for (let n = 0; n < 5; n++) f.review(b, f.word(b, `beginner-${n}`).id);
  f.time("2026-11-04T15:00:00Z");
  f.review(a, aw.id, { rating: 1 });
  assert.equal(f.score(id).leaderId, a.id);
  f.time("2026-11-10T03:00:00Z");
  // Arrives after the shared deadline, before anyone opens the final result.
  f.review(b, bw.id, {
    reviewedAt: "2026-11-09T15:00:00Z",
    receivedAt: "2026-11-09T15:00:00Z",
  });
  const done = f.score(id);
  assert.equal(done.status, "completed");
  assert.equal(done.winnerId, a.id);
  assert.equal(done.host.studyDays, 2);
  assert.equal(done.guest.studyDays, 1);
  assert.equal(done.guest.totalWords, 5);
  const late = f.word(b, "late");
  f.review(b, late.id);
  assert.deepEqual(f.score(id).guest.days, done.guest.days);
  assert.equal(
    f.svc.db.get("SELECT COUNT(*) n FROM points WHERE reason='battle'").n,
    0,
  );
  const reopened = openDB(join(f.folder, "test.sqlite"));
  try {
    assert.equal(
      new Service(reopened, () => f.getTime()).challenges(a.id)[0].winnerId,
      a.id,
    );
  } finally {
    reopened.db.close();
  }
});

test("challenge days use one locked timezone across DST and user timezone changes", async (t) => {
  const f = await fixture(t, "2026-10-31T12:00:00Z", "America/New_York"),
    [a, b] = f.users,
    id = f.start();
  const w = f.word(a, "clock", "reverse");
  f.time("2026-11-01T05:30:00Z");
  f.review(a, w.id);
  f.time("2026-11-01T06:30:00Z");
  f.review(a, w.id, { direction: "reverse" });
  const user = f.svc.user(a.id);
  f.svc.db.run(
    "UPDATE users SET data=? WHERE id=?",
    JSON.stringify({ ...user, timezone: "Pacific/Auckland" }),
    a.id,
  );
  assert.equal(f.score(id).host.totalWords, 1);
  assert.equal(
    f.score(id).host.days.find((d) => d.day === "2026-11-01")!.words,
    1,
  );
  assert.equal(f.score(id).timezone, "America/New_York");
  f.time("2026-11-07T04:59:59Z");
  f.review(b, f.word(b, "last day").id);
  assert.equal(f.score(id).status, "active");
  assert.equal(f.score(id).guest.days[6].day, "2026-11-06");
  assert.equal(f.score(id).guest.days[6].words, 1);
  f.time("2026-11-07T05:00:00Z");
  assert.equal(f.score(id).status, "completed");
  assert.equal(f.score(id).winnerId, null);
});

test("offline reviews synced during the challenge count, immutable word keys survive edits", async (t) => {
  const f = await fixture(t),
    [a] = f.users,
    id = f.start();
  const w = f.word(a, "original", "reverse");
  f.time("2026-11-04T15:00:00Z");
  f.review(a, w.id, { reviewedAt: "2026-11-03T15:00:00Z" });
  f.review(a, w.id, {
    direction: "reverse",
    reviewedAt: "2026-11-03T15:00:00Z",
  });
  f.svc.save("words", { ...w, term: "renamed" });
  f.review(a, f.word(a, "original").id);
  assert.equal(f.score(id).host.days[0].words, 1);
  assert.equal(f.score(id).host.days[1].words, 1);
  assert.equal(f.score(id).host.totalWords, 2);
});

test("declines, cancellation, expiry and tied results preserve study history without rewards", async (t) => {
  const f = await fixture(t),
    [a, b, o] = f.users;
  let id = randomUUID();
  f.svc.inviteChallenge(a.id, b.id, id);
  f.svc.respondChallenge(b.id, id, false);
  f.svc.respondChallenge(b.id, id, false);
  assert.equal(f.score(id).status, "declined");
  id = randomUUID();
  f.svc.inviteChallenge(a.id, b.id, id);
  f.svc.cancelChallenge(a.id, id);
  assert.equal(f.score(id).status, "cancelled");
  id = randomUUID();
  f.svc.inviteChallenge(a.id, b.id, id);
  f.time("2026-11-10T15:00:00Z");
  assert.equal(
    (await f.request(`/challenges/${id}/respond`, b, "POST", { accept: true }))
      .statusCode,
    409,
  );
  assert.equal(f.score(id).status, "expired");
  id = f.start();
  f.review(a, f.word(a, "unchanged").id);
  const before = f.svc.list<Card>("cards", a.id);
  assert.equal(
    (await f.request(`/challenges/${id}/cancel`, o, "POST", {})).statusCode,
    404,
  );
  f.svc.cancelChallenge(b.id, id);
  assert.equal(f.score(id).winnerId, null);
  assert.equal(f.score(id).host.totalWords, 1);
  assert.deepEqual(f.svc.list<Card>("cards", a.id), before);
});

test("equal study days use word totals, and exact ties have no winner", async (t) => {
  const f = await fixture(t),
    [a, b] = f.users,
    id = f.start();
  f.review(a, f.word(a, "one").id);
  f.review(b, f.word(b, "two").id);
  assert.equal(f.score(id).leaderId, null);
  f.review(b, f.word(b, "three").id);
  assert.equal(f.score(id).leaderId, b.id);
  f.time("2026-11-10T03:00:00Z");
  assert.equal(f.score(id).winnerId, b.id);
  const tied = f.start();
  f.time("2026-11-17T03:00:00Z");
  assert.equal(f.score(tied).status, "completed");
  assert.equal(f.score(tied).winnerId, null);
});
