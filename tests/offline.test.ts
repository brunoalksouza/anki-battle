import "fake-indexeddb/auto";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildApp } from "../server/app";
import { type Word, type Card } from "../shared/model";
const eventTarget = new EventTarget();
Object.defineProperty(globalThis, "window", {
  value: eventTarget,
  configurable: true,
});
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => storage.get(k) || null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  },
  configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: { onLine: true },
  configurable: true,
});
const { saveLocal, loadLocal, enqueue, overlay, syncAccount, setActive } =
  await import("../src/offline");
const { app, svc } = await buildApp({
  dbPath: ":memory:",
  origin: "http://test.local",
});
async function register(name: string) {
  const r = await app.inject({
    url: "/api/auth/register",
    method: "POST",
    headers: { "x-anki-client": "1" },
    payload: {
      email: name + "@test.example",
      nickname: name,
      password: "Offline-test-password-123",
    },
  });
  assert.equal(r.statusCode, 200);
  return {
    id: r.json().user.id,
    cookie: r.headers["set-cookie"]!.toString().split(";")[0],
  };
}
const alice = await register("OfflineAlice"),
  bob = await register("OfflineBob");
let cookie = alice.cookie,
  network = true,
  dropReviewAck = false;
let duringMutation: (() => Promise<void>) | undefined;
globalThis.fetch = async (input: any, init: any = {}) => {
  if (!network) throw new TypeError("Offline test transport");
  const r = await app.inject({
    url: String(input),
    method: init.method || "GET",
    headers: { ...init.headers, cookie },
    payload: init.body,
  });
  if (String(input) === "/api/mutations/word" && duringMutation) {
    const run = duringMutation;
    duringMutation = undefined;
    await run();
  }
  if (String(input) === "/api/reviews" && dropReviewAck) {
    dropReviewAck = false;
    throw new TypeError("Lost acknowledgement");
  }
  return new Response(r.body, {
    status: r.statusCode,
    headers: { "Content-Type": "application/json" },
  });
};
after(async () => {
  await app.close();
});
await saveLocal({
  snapshot: svc.snapshot(alice.id),
  pending: [],
  downloaded: [],
  lastSync: new Date().toISOString(),
});
await saveLocal({
  snapshot: svc.snapshot(bob.id),
  pending: [],
  downloaded: [],
  lastSync: new Date().toISOString(),
});
setActive(alice.id);
function word(term: string): Word {
  return {
    id: randomUUID(),
    deckId: svc.list<any>("decks", alice.id)[0].id,
    term,
    meaning: "significado " + term,
    language: "en",
    color: "#8058d8",
    tags: [],
    sentence: "",
    translation: "",
    kind: "basic",
    version: 0,
    createdAt: new Date(Date.now() - 10000).toISOString(),
    sentenceStatus: "pending",
    sentenceCredit: null,
    meaningCredit: null,
    imageId: null,
    imageCredit: null,
  };
}
test("concurrent IndexedDB writes preserve every queued word and keep account data separate", async () => {
  const words = Array.from({ length: 12 }, (_, i) => word("offline-" + i));
  await Promise.all(
    words.map((w) =>
      enqueue(alice.id, { id: randomUUID(), kind: "create", word: w }),
    ),
  );
  const local = (await loadLocal(alice.id))!;
  assert.equal(local.pending.length, 12);
  assert.equal(overlay(local.snapshot, local.pending).words.length, 12);
  assert.equal((await loadLocal(bob.id))!.pending.length, 0);
  network = false;
  await assert.rejects(syncAccount(alice.id), /Offline/);
  assert.equal((await loadLocal(alice.id))!.pending.length, 12);
  network = true;
  await syncAccount(alice.id);
  assert.equal((await loadLocal(alice.id))!.pending.length, 0);
  assert.equal(svc.list("words", alice.id).length, 12);
});
test("offline review survives a lost response and retries without duplicate schedule or points", async () => {
  const c = svc.list<Card>("cards", alice.id)[0],
    r = {
      id: randomUUID(),
      cardId: c.id,
      baseRevision: 0,
      rating: 3 as const,
      reviewedAt: new Date().toISOString(),
      activeMs: 3500,
    };
  network = false;
  await enqueue(alice.id, { id: r.id, kind: "review", review: r });
  let local = (await loadLocal(alice.id))!;
  assert.equal(
    overlay(local.snapshot, local.pending).cards.find((x) => x.id === c.id)!
      .revision,
    1,
  );
  await assert.rejects(syncAccount(alice.id));
  network = true;
  dropReviewAck = true;
  await assert.rejects(syncAccount(alice.id), /Lost acknowledgement/);
  assert.equal((await loadLocal(alice.id))!.pending.length, 1);
  assert.equal(svc.owned<Card>("cards", c.id, alice.id).revision, 1);
  await syncAccount(alice.id);
  assert.equal((await loadLocal(alice.id))!.pending.length, 0);
  assert.equal(svc.owned<Card>("cards", c.id, alice.id).revision, 1);
  assert.equal(
    svc.db.get("SELECT COUNT(*) n FROM reviews WHERE card_id=?", c.id).n,
    1,
  );
  assert.equal(svc.snapshot(alice.id).points, 5);
});
test("a stale content edit is kept as a recoverable draft, not silently overwritten", async () => {
  const w = svc.list<Word>("words", alice.id)[1];
  svc.editWord(alice.id, w.id, {
    ...w,
    meaning: "Editado no outro dispositivo",
  });
  await enqueue(alice.id, {
    id: randomUUID(),
    kind: "edit",
    word: { ...w, meaning: "Meu rascunho offline" },
  });
  await syncAccount(alice.id);
  const local = (await loadLocal(alice.id))!;
  assert.equal(local.pending.length, 1);
  assert.match(local.pending[0].error!, /outro dispositivo/);
  assert.equal(local.pending[0].word!.meaning, "Meu rascunho offline");
  assert.equal(
    local.snapshot.words.find((x) => x.id === w.id)!.meaning,
    "Editado no outro dispositivo",
  );
});
test("a different signed-in account cannot synchronize another account queue", async () => {
  cookie = bob.cookie;
  await assert.rejects(syncAccount(alice.id), /conta original/);
  assert.equal(svc.list("words", bob.id).length, 0);
  assert.equal((await loadLocal(alice.id))!.pending.length, 1);
});

test("sync drains a word added while another request is in flight", async () => {
  cookie = alice.cookie;
  const first = word("in-flight-first"),
    second = word("in-flight-second");
  await enqueue(alice.id, { id: randomUUID(), kind: "create", word: first });
  duringMutation = () =>
    enqueue(alice.id, { id: randomUUID(), kind: "create", word: second }).then(
      () => {},
    );
  await syncAccount(alice.id);
  assert(svc.list<Word>("words", alice.id).some((w) => w.id === second.id));
  assert(
    !(await loadLocal(alice.id))!.pending.some((p) => p.word?.id === second.id),
  );
});
