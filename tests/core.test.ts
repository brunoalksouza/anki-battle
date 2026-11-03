import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../server/app";
import { passwordHash, passwordMatches } from "../server/service";
import { newSchedule, reviewSchedule, scheduler } from "../shared/scheduler";
import { termRanges, cloze } from "../shared/text";
import { weekKey, dayKey, type Card, type Word } from "../shared/model";
const folder = mkdtempSync(join(tmpdir(), "anki-tests-"));
let time = new Date("2026-11-03T12:00:00Z");
const { app, svc } = await buildApp({
  dbPath: join(folder, "test.sqlite"),
  dataDir: folder,
  now: () => new Date(time),
  origin: "https://test.anki.local",
});
const headers = { origin: "https://test.anki.local", "x-anki-client": "1" };
async function request(
  path: string,
  method: any = "GET",
  body?: any,
  session = "",
) {
  const r = await app.inject({
    url: "/api" + path,
    method,
    headers: { ...headers, ...(session ? { cookie: session } : {}) },
    payload: body,
  });
  let data;
  try {
    data = r.json();
  } catch {
    data = r.body;
  }
  return {
    status: r.statusCode,
    data,
    cookie: r.headers["set-cookie"]?.toString().split(";")[0],
    headers: r.headers,
  };
}
async function register(name: string) {
  const r = await request("/auth/register", "POST", {
    email: name.toLowerCase().replace(/[^a-z]/g, "") + "@test.example",
    password: "Test-password-very-long-123",
    nickname: name,
  });
  assert.equal(r.status, 200);
  return { user: r.data.user, session: r.cookie!, codes: r.data.recoveryCodes };
}
const alice = await register("Alice (teste)"),
  bob = await register("Bob (teste)"),
  mallory = await register("Mallory (teste)");
after(async () => {
  await app.close();
  rmSync(folder, { recursive: true, force: true });
});
const deck = svc.createDeck(alice.user.id, {
  name: "English",
  language: "en",
  color: "#8058d8",
});
const word = (term = "horse", meaning = "cavalo", kind = "basic") =>
  svc.db.transaction(() =>
    svc.createWord(alice.user.id, {
      term,
      meaning,
      kind,
      deckId: deck.id,
      language: "en",
      color: "#8058d8",
    }),
  );
const review = (c: Card, rating: 1 | 2 | 3 | 4 = 3) => ({
  id: randomUUID(),
  cardId: c.id,
  baseRevision: c.revision,
  rating,
  reviewedAt: time.toISOString(),
  activeMs: 3000,
});
test("FSRS is the pinned upstream model, deterministic on client/server serialization", () => {
  const c = newSchedule("c", time);
  const actual = reviewSchedule(c, 3, time);
  const native = scheduler.review({
    card: scheduler.newCard({ cardId: "c", now: time }),
    grade: 3,
    now: time,
  });
  assert.deepEqual(actual.schedule, JSON.parse(JSON.stringify(native.card)));
  assert(actual.schedule.stability > 0);
  assert.equal(actual.schedule.reps, 1);
  assert(new Date(actual.schedule.dueAt) > time);
  const again = reviewSchedule(c, 1, time);
  assert(new Date(again.schedule.dueAt) < new Date(actual.schedule.dueAt));
  const later = new Date(+time + 6 * 86400000);
  assert.equal(
    reviewSchedule(JSON.parse(JSON.stringify(actual.schedule)), 3, later)
      .schedule.reps,
    2,
  );
});
test("Unicode word/phrase highlighting and cloze never reveal partial words", () => {
  assert.deepEqual(termRanges("horse horses seahorse Horse", "horse"), [
    { start: 0, end: 5 },
    { start: 22, end: 27 },
  ]);
  assert.equal(cloze("I like ice cream.", "ice cream", "en"), "I like ［…］.");
  assert.equal(
    cloze("私は馬が好きです。", "馬", "ja"),
    "私は［…］が好きです。",
  );
  assert.equal(termRanges("馬車", "馬", "ja").length, 0);
  assert.equal(cloze("Different sentence", "horse", "en"), null);
  assert.equal(termRanges("a+b, a+b", "a+b").length, 2);
});
test("sessions, login, recovery and cross-origin protections", async () => {
  const logged = await request("/auth/login", "POST", {
    email: alice.user.email,
    password: "Test-password-very-long-123",
  });
  assert.equal(logged.status, 200);
  assert.match(logged.headers["set-cookie"]!.toString(), /HttpOnly/);
  assert.match(logged.headers["set-cookie"]!.toString(), /Secure/);
  assert.equal((await request("/state")).status, 401);
  const evil = await app.inject({
    url: "/api/decks",
    method: "POST",
    headers: {
      cookie: alice.session,
      "x-anki-client": "1",
      origin: "https://evil.test",
    },
    payload: {},
  });
  assert.equal(evil.statusCode, 403);
  const recovery = await request("/auth/recover", "POST", {
    email: mallory.user.email,
    code: mallory.codes[0],
    password: "New-test-password-123",
  });
  assert.equal(recovery.status, 200);
  assert.equal(
    (await request("/state", "GET", undefined, mallory.session)).status,
    401,
  );
  assert.equal(
    (
      await request("/auth/recover", "POST", {
        email: mallory.user.email,
        code: mallory.codes[0],
        password: "Another-test-123",
      })
    ).status,
    400,
  );
  mallory.session = recovery.cookie!;
  assert(
    await passwordMatches(
      "same-finance-password",
      await passwordHash("same-finance-password"),
    ),
  );
});
test("private decks/cards cannot be read, changed, removed or reviewed by another account", async () => {
  const w = word();
  const c = svc
    .list<Card>("cards", alice.user.id)
    .find((c) => c.wordId === w.id)!;
  assert.equal(
    (await request("/words/" + w.id, "PATCH", w, bob.session)).status,
    404,
  );
  assert.equal(
    (await request("/words/" + w.id, "DELETE", undefined, bob.session)).status,
    404,
  );
  assert.equal(
    (
      await request(
        "/cards/" + c.id + "/history",
        "GET",
        undefined,
        bob.session,
      )
    ).status,
    404,
  );
  assert.equal(
    (await request("/reviews", "POST", review(c), bob.session)).status,
    404,
  );
  const state = (await request("/state", "GET", undefined, bob.session)).data;
  assert.equal(state.words.length, 0);
  assert(!JSON.stringify(state).includes(w.meaning));
  assert.equal(
    (await request("/decks/" + deck.id, "DELETE", undefined, bob.session))
      .status,
    404,
  );
});
test("review replay is idempotent, concurrent schedules conflict, and Easy earns no bonus", async () => {
  const w = word("tree", "árvore", "reverse"),
    c = svc
      .list<Card>("cards", alice.user.id)
      .find((c) => c.wordId === w.id && c.direction === "forward")!;
  const action = review(c, 4);
  const first = await request("/reviews", "POST", action, alice.session);
  assert.equal(first.status, 200);
  assert.equal(first.data.points, 5);
  assert.equal(first.data.status, "applied");
  const retry = await request("/reviews", "POST", action, alice.session);
  assert.equal(retry.data.duplicate, true);
  assert.equal(svc.owned<Card>("cards", c.id, alice.user.id).revision, 1);
  const conflict = svc.review(alice.user.id, { ...action, id: randomUUID() });
  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.points, 0);
  const reverse = svc
    .list<Card>("cards", alice.user.id)
    .find((c) => c.wordId === w.id && c.direction === "reverse")!;
  assert.equal(svc.review(alice.user.id, review(reverse, 1)).points, 0);
  const easy = word("sun", "sol"),
    hard = word("moon", "lua");
  const cs = svc.list<Card>("cards", alice.user.id);
  assert.equal(
    svc.review(
      alice.user.id,
      review(
        cs.find((c) => c.wordId === easy.id)!,
        4,
      ),
    ).points,
    svc.review(
      alice.user.id,
      review(
        cs.find((c) => c.wordId === hard.id)!,
        1,
      ),
    ).points,
  );
});
test("editing content retains scheduling/history and an idempotent offline mutation can be retried", async () => {
  const w = word("book", "livro"),
    c = svc.list<Card>("cards", alice.user.id).find((c) => c.wordId === w.id)!;
  svc.review(alice.user.id, review(c));
  const before = svc.owned<Card>("cards", c.id, alice.user.id),
    mutation = {
      id: randomUUID(),
      mode: "edit",
      word: { ...w, meaning: "a written work", color: "#20866b" },
    };
  const first = await request(
    "/mutations/word",
    "POST",
    mutation,
    alice.session,
  );
  assert.equal(first.status, 200);
  assert.equal(
    (await request("/mutations/word", "POST", mutation, alice.session)).status,
    200,
  );
  assert.deepEqual(svc.owned<Card>("cards", c.id, alice.user.id), before);
  assert.equal(
    (await request("/words/" + w.id, "PATCH", w, alice.session)).status,
    409,
  );
  assert.equal(
    svc.db.get("SELECT COUNT(*) n FROM reviews WHERE card_id=?", c.id).n,
    1,
  );
});
test("offline word then review preserves original dates and does not score closed weeks", async () => {
  const original = new Date(+time - 8 * 86400000),
    w = svc.createWord(alice.user.id, {
      id: randomUUID(),
      term: "yesterday",
      meaning: "ontem",
      deckId: deck.id,
      language: "en",
      color: "#8058d8",
      createdAt: original.toISOString(),
    });
  const c = svc
    .list<Card>("cards", alice.user.id)
    .find((c) => c.wordId === w.id)!;
  const result = svc.review(alice.user.id, {
    ...review(c),
    reviewedAt: new Date(+original + 5000).toISOString(),
  });
  assert.equal(result.status, "applied");
  assert.equal(result.points, 0);
  assert.equal(result.localDay, dayKey(original, alice.user.timezone));
  assert.throws(
    () =>
      svc.review(alice.user.id, {
        ...review(c),
        reviewedAt: new Date(+time + 120000).toISOString(),
      }),
    /Review date/,
  );
  assert.equal(
    (
      await request(
        "/reviews",
        "POST",
        { ...review(c), activeMs: 9999999 },
        alice.session,
      )
    ).status,
    400,
  );
});
test("early reviews, suspended cards and insufficient active time do not mint points", () => {
  const w = word("water", "água"),
    c = svc.list<Card>("cards", alice.user.id).find((c) => c.wordId === w.id)!;
  assert.equal(
    svc.review(alice.user.id, { ...review(c), activeMs: 0 }).points,
    0,
  );
  let updated = svc.owned<Card>("cards", c.id, alice.user.id);
  const early = svc.review(alice.user.id, review(updated));
  assert.equal(early.status, "early");
  assert.equal(early.points, 0);
  svc.save("cards", { ...updated, suspended: true });
  updated = svc.owned("cards", c.id, alice.user.id);
  assert.equal(svc.review(alice.user.id, review(updated)).status, "suspended");
});
test("access is separate from study, timezones and competitive weeks are consistent", () => {
  assert.equal(weekKey("2026-11-02T00:00:00Z"), "2026-11-02");
  assert.equal(weekKey("2026-11-01T23:59:59Z"), "2026-10-26");
  assert.equal(
    dayKey("2026-11-03T01:00:00Z", "America/Sao_Paulo"),
    "2026-11-02",
  );
  const s = svc.snapshot(bob.user.id);
  assert(s.days.some((d) => d.access));
  assert.equal(
    s.days.reduce((n, d) => n + d.reviews, 0),
    0,
  );
  assert.equal(s.points, 0);
});
test("battle invitation requires explicit deck consent and rejects self challenges", () => {
  assert.throws(
    () => svc.invite(alice.user.id, bob.user.id, deck.id, randomUUID()),
    /enable this deck/,
  );
  assert.throws(
    () => svc.invite(alice.user.id, alice.user.id, deck.id, randomUUID()),
    /another person/,
  );
  svc.editDeck(alice.user.id, deck.id, { ...deck, shared: true });
});
test("two real sessions complete battle; answers stay server-side, reconnect does not reset clocks", async () => {
  const b = svc.invite(alice.user.id, bob.user.id, deck.id, randomUUID());
  assert.equal(
    (
      await request(
        "/battles/" + b.id + "/respond",
        "POST",
        { accept: true },
        alice.session,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/battles/" + b.id + "/respond",
        "POST",
        { accept: true },
        bob.session,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        "/battles/" + b.id + "/question",
        "GET",
        undefined,
        mallory.session,
      )
    ).status,
    404,
  );
  const rounds = svc.battleRow(alice.user.id, b.id).info.rounds;
  for (const player of [alice, bob]) {
    assert.equal(
      (
        await request(
          "/battles/" + b.id + "/question",
          "GET",
          undefined,
          player.session,
        )
      ).data.status,
      "preparation",
    );
    await request("/battles/" + b.id + "/ready", "POST", {}, player.session);
    for (let i = 0; i < rounds; i++) {
      const q = (
        await request(
          "/battles/" + b.id + "/question",
          "GET",
          undefined,
          player.session,
        )
      ).data;
      assert.equal(q.idx, i);
      assert(!("answer" in q));
      assert(
        q.options.every(
          (o: any) => Object.keys(o).sort().join(",") === "id,text",
        ),
      );
      assert.equal(
        (
          await request(
            "/battles/" + b.id + "/question",
            "GET",
            undefined,
            player.session,
          )
        ).data.deadline,
        q.deadline,
      );
      time = new Date(+time + (player === alice ? 2000 : 4000));
      const secret = JSON.parse(
        svc.db.get(
          "SELECT data FROM rounds WHERE battle_id=? AND idx=?",
          b.id,
          i,
        ).data,
      ).answer;
      const result = await request(
        "/battles/" + b.id + "/answer",
        "POST",
        { idx: i, choice: secret },
        player.session,
      );
      assert.equal(result.status, 200);
      assert.equal(result.data.correct, true);
      const retry = await request(
        "/battles/" + b.id + "/answer",
        "POST",
        { idx: i, choice: secret },
        player.session,
      );
      assert.equal(retry.data.duplicate, true);
    }
  }
  const result = svc.battles(alice.user.id).find((x) => x.id === b.id)!;
  assert.equal(result.status, "completed");
  assert.equal(result.winnerId, alice.user.id);
  assert.equal(result.hostCorrect, rounds);
  assert.equal(
    svc.db.get(
      "SELECT COUNT(*) n FROM points WHERE user_id=? AND reason='battle'",
      alice.user.id,
    ).n,
    1,
  );
  assert.equal(
    svc.db.get(
      "SELECT SUM(amount) n FROM points WHERE user_id=? AND reason='battle'",
      bob.user.id,
    ).n,
    10,
  );
});
test("battle expiration and abandonment produce no rewards", async () => {
  const b = svc.invite(alice.user.id, bob.user.id, deck.id, randomUUID());
  await request(
    "/battles/" + b.id + "/respond",
    "POST",
    { accept: true },
    bob.session,
  );
  await request("/battles/" + b.id + "/ready", "POST", {}, alice.session);
  const q = (
    await request(
      "/battles/" + b.id + "/question",
      "GET",
      undefined,
      alice.session,
    )
  ).data;
  time = new Date(+time + 61000);
  const secret = JSON.parse(
    svc.db.get("SELECT data FROM rounds WHERE battle_id=? AND idx=0", b.id)
      .data,
  ).answer;
  const a = await request(
    "/battles/" + b.id + "/answer",
    "POST",
    { idx: q.idx, choice: secret },
    alice.session,
  );
  assert.equal(a.data.correct, false);
  assert.equal(a.data.expired, true);
  await request("/battles/" + b.id + "/abandon", "POST", {}, bob.session);
  assert.equal(
    svc.battles(alice.user.id).find((x) => x.id === b.id)!.status,
    "abandoned",
  );
  const expired = svc.invite(alice.user.id, bob.user.id, deck.id, randomUUID());
  time = new Date(+time + 49 * 3600000);
  assert.equal(
    svc.battles(alice.user.id).find((x) => x.id === expired.id)!.status,
    "expired",
  );
});
test("group ranking is accessible only after joining", async () => {
  const g = await request(
    "/groups",
    "POST",
    { name: "Amigos de estudo" },
    alice.session,
  );
  assert.equal(g.status, 200);
  assert.equal(
    (
      await request(
        "/groups/" + g.data.id + "/ranking",
        "GET",
        undefined,
        bob.session,
      )
    ).status,
    404,
  );
  await request("/groups/join", "POST", { code: g.data.code }, bob.session);
  const r = await request(
    "/groups/" + g.data.id + "/ranking",
    "GET",
    undefined,
    bob.session,
  );
  assert.equal(r.status, 200);
  assert.equal(r.data.length, 2);
});
test("SQLite persists users and FSRS state on a new connection", async () => {
  const { openDB } = await import("../server/db");
  const other = openDB(join(folder, "test.sqlite"));
  assert.equal(other.get("SELECT COUNT(*) n FROM users").n, 3);
  assert(other.get("SELECT COUNT(*) n FROM reviews").n > 0);
  other.db.close();
});

test("editing an imported visual meaning preserves media and history and enables textual exercises", () => {
  const w = word(
    "saddle",
    "Significado visual — veja a imagem do verso original.",
  );
  const c = svc
    .list<Card>("cards", alice.user.id)
    .find((c) => c.wordId === w.id)!;
  const imageId = randomUUID(),
    audioId = randomUUID();
  svc.save("words", {
    ...w,
    imageId,
    audio: [{ id: audioId, name: "saddle.mp3" }],
    tags: ["significado-visual"],
    source: {
      name: "test.apkg",
      noteId: "123",
      needsMeaning: true,
      originalFront: "<b>saddle</b>",
      originalBack: "<img>",
    },
  });
  const updated = svc.editWord(alice.user.id, w.id, {
    ...w,
    meaning: "a seat on a horse",
    tags: ["significado-visual"],
  });
  assert.equal(updated.source!.needsMeaning, false);
  assert(!updated.tags.includes("significado-visual"));
  assert.equal(updated.imageId, imageId);
  assert.equal(updated.audio![0].id, audioId);
  assert.deepEqual(svc.owned<Card>("cards", c.id, alice.user.id), c);
});

test("an owned media download batch exceeds 300 assets without exposing another user media", async () => {
  mkdirSync(join(folder, "media"), { recursive: true });
  const asset = randomUUID();
  copyFileSync("public/icon-192.png", join(folder, "media", asset + ".png"));
  svc.db.run(
    "INSERT INTO assets VALUES(?,?,?)",
    asset,
    alice.user.id,
    JSON.stringify({ filename: asset + ".png", mime: "image/png" }),
  );
  assert.equal(
    (await request("/media/" + asset, "GET", undefined, bob.session)).status,
    404,
  );
  for (let n = 0; n < 305; n++) {
    const r = await request("/media/" + asset, "GET", undefined, alice.session);
    assert.equal(r.status, 200);
    assert.equal(r.headers["content-type"], "image/png");
  }
  assert.equal(
    (await request("/state", "GET", undefined, alice.session)).status,
    200,
  );
});
