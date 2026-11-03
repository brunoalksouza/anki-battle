import { test } from "node:test";
import assert from "node:assert/strict";
import { openDB } from "../server/db";
import { migrateEnglishContent } from "../server/english-content";
import { Integrations } from "../server/integrations";
import { Service } from "../server/service";
import type { Word } from "../shared/model";

test("English content migration preserves cards, reviews, media and user definitions, and runs once", () => {
  const db = openDB(":memory:");
  try {
    db.run(
      "INSERT INTO users VALUES(?,?,?,?)",
      "user",
      "test@example.com",
      "unused",
      "{}",
    );
    db.run(
      "INSERT INTO decks(id,user_id,data) VALUES(?,?,?)",
      "deck",
      "user",
      JSON.stringify({
        name: "Meu primeiro baralho",
        description:
          "Sua coleção original do Anki · frases, imagens e pronúncia",
        version: 3,
      }),
    );
    const source = {
      name: "English.apkg",
      noteId: "123",
      needsMeaning: true,
      originalFront: "<b>coffee maker</b>",
      originalBack: '<img src="original.jpg">',
    };
    const imported = {
      id: "word",
      term: "coffee maker",
      meaning: "Significado visual — veja a imagem do verso original.",
      tags: ["importado-anki", "significado-visual", "custom"],
      version: 5,
      source,
      imageId: "image",
      audio: [{ id: "audio", name: "original.mp3" }],
    };
    const custom = {
      ...imported,
      id: "custom",
      meaning: "A machine that makes coffee.",
      source: undefined,
      tags: ["importado-anki"],
    };
    for (const w of [imported, custom])
      db.run(
        "INSERT INTO words(id,user_id,deck_id,data) VALUES(?,?,?,?)",
        w.id,
        "user",
        "deck",
        JSON.stringify(w),
      );
    const schedule = JSON.stringify({
      revision: 8,
      schedule: { dueAt: "2027-02-10T00:00:00Z", reps: 9 },
    });
    db.run(
      "INSERT INTO cards(id,user_id,word_id,data) VALUES(?,?,?,?)",
      "card",
      "user",
      "word",
      schedule,
    );
    db.run(
      "INSERT INTO reviews VALUES(?,?,?,?,?,?,?,?,?,?)",
      "review",
      "user",
      "card",
      "2026-11-03",
      "2026-11-03",
      "2026-11-02",
      "applied",
      3000,
      5,
      '{"rating":3}',
    );
    const originalReview = db.get("SELECT * FROM reviews");
    assert.deepEqual(migrateEnglishContent(db), { words: 1, decks: 1 });
    const next = JSON.parse(
      db.get("SELECT data FROM words WHERE id='word'").data,
    );
    assert.equal(
      next.meaning,
      "Visual meaning — see the image from your original card.",
    );
    assert.deepEqual(next.tags, ["anki-import", "visual-meaning", "custom"]);
    assert.equal(next.version, 6);
    assert.deepEqual(next.source, source);
    assert.equal(next.imageId, imported.imageId);
    assert.deepEqual(next.audio, imported.audio);
    assert.equal(
      db.get("SELECT data FROM words WHERE id='custom'").data,
      JSON.stringify(custom),
    );
    assert.equal(db.get("SELECT data FROM cards").data, schedule);
    assert.deepEqual(db.get("SELECT * FROM reviews"), originalReview);
    assert.equal(
      JSON.parse(db.get("SELECT data FROM decks").data).name,
      "My first deck",
    );
    assert.deepEqual(migrateEnglishContent(db), { words: 0, decks: 0 });
    assert.equal(
      JSON.parse(db.get("SELECT data FROM words WHERE id='word'").data).version,
      6,
    );
  } finally {
    db.db.close();
  }
});

test("Example suggestions use English explanations and cannot reuse Portuguese provider cache", async () => {
  const db = openDB(":memory:");
  const originalFetch = globalThis.fetch;
  const seen: URL[] = [];
  try {
    db.run(
      "INSERT INTO users VALUES(?,?,?,?)",
      "user",
      "test@example.com",
      "unused",
      JSON.stringify({ id: "user", nativeLang: "pt" }),
    );
    db.run(
      "INSERT INTO provider_cache VALUES(?,?,?)",
      "examples:eng:por:horse",
      JSON.stringify([
        { sentence: "The horse is running.", translation: "O cavalo corre." },
      ]),
      "2099-01-01",
    );
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      seen.push(url);
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 1,
              text:
                url.searchParams.get("lang") === "eng"
                  ? "The horse is running."
                  : "El caballo corre.",
              translations: [
                [{ id: 2, text: "O cavalo corre.", lang: "por" }],
                [{ id: 3, text: "The horse is running.", lang: "eng" }],
              ],
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    };
    const integrations = new Integrations(new Service(db), "/unused");
    const english = await integrations.examples("user", {
      term: "horse",
      language: "en",
    } as Word);
    assert.equal(english[0].sentence, "The horse is running.");
    assert.equal(english[0].translation, "");
    assert.equal(english[0].translationCredit, null);
    assert.equal(seen[0].searchParams.has("trans:lang"), false);
    const spanish = await integrations.examples("user", {
      term: "caballo",
      language: "es",
    } as Word);
    assert.equal(spanish[0].translation, "The horse is running.");
    assert.equal(seen[1].searchParams.get("trans:lang"), "eng");
    assert.equal(
      JSON.stringify([english, spanish]).includes("O cavalo"),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
    db.db.close();
  }
});
