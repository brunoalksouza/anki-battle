import { test } from "node:test";
import assert from "node:assert/strict";
import { openDB } from "../server/db";
import { Service } from "../server/service";
import { Integrations } from "../server/integrations";
import {
  learnStyle,
  rankDefinitions,
  rankExamples,
  parseSimpleDictionary,
  cardDefinition,
  exampleQuality,
  sameSense,
} from "../server/suggestion-style";
import type { Word, Credit } from "../shared/model";
import type { DefinitionSuggestion } from "../shared/suggestions";

const credit: Credit = {
  source: "Test dictionary",
  url: "https://example.org/entry",
  author: "Test author",
  license: "CC0",
};
function word(p: Partial<Word> = {}): Word {
  return {
    id: "word",
    deckId: "deck",
    term: "bank",
    meaning: "A place where people keep their money.",
    sentence: "",
    language: "en",
    translation: "",
    color: "#123456",
    tags: [],
    kind: "basic",
    version: 1,
    createdAt: "2026-11-01T00:00:00Z",
    sentenceStatus: "pending",
    sentenceCredit: null,
    meaningCredit: null,
    imageId: null,
    imageCredit: null,
    ...p,
  };
}
function definition(
  meaning: string,
  examples: string[] = [],
  part = "noun",
): DefinitionSuggestion {
  return { meaning, examples, example: "", part, credit };
}
function fixture() {
  const db = openDB(":memory:");
  const svc = new Service(db);
  for (const u of ["alice", "bob"]) {
    db.run(
      "INSERT INTO users VALUES(?,?,?,?)",
      u,
      u + "@example.test",
      "unused",
      JSON.stringify({ id: u, nativeLang: "pt" }),
    );
    db.run(
      "INSERT INTO decks(id,user_id,data) VALUES(?,?,?)",
      u + "-deck",
      u,
      "{}",
    );
  }
  const add = (w: Word, user = "alice", deleted = 0) =>
    db.run(
      "INSERT INTO words(id,user_id,deck_id,data,deleted) VALUES(?,?,?,?,?)",
      w.id,
      user,
      user + "-deck",
      JSON.stringify(w),
      deleted,
    );
  const cache = (term: string, definitions: DefinitionSuggestion[]) => {
    for (const [key, value] of [
      ["dictionary:english-v2:", definitions],
      ["simple-dictionary:v1:", []],
    ] as const)
      db.run(
        "INSERT OR REPLACE INTO provider_cache VALUES(?,?,?)",
        key + term,
        JSON.stringify(value),
        "2099-01-01",
      );
  };
  return { db, svc, add, cache, integration: new Integrations(svc, "/unused") };
}

test("Style uses all English cards, excludes visual meanings and fragments, and resists length outliers", () => {
  const cards = Array.from({ length: 10 }, (_, i) =>
    word({
      id: String(i),
      sentence: "She put the bottle on the table.",
      meaning: "A container used to hold drinking water.",
    }),
  );
  const style = learnStyle([
    ...cards,
    word({
      meaning: "Visual meaning — see the image from your original card.",
      sentence: "horse",
    }),
    word({ language: "es", sentence: "El caballo corre." }),
    word({ sentence: "Long ".repeat(100), meaning: "Long ".repeat(100) }),
  ]).style;
  assert.equal(style.cards, 12);
  assert.equal(style.definitions, 10);
  assert.deepEqual(style.sentenceWords, [7, 7]);
  assert.deepEqual(style.meaningWords, [7, 7]);
  assert.equal(style.personalized, true);
  assert.deepEqual(learnStyle([]).style.sentenceWords, [6, 10]);
});

test("Dictionary parsing keeps senses and examples paired; unknown markup never loses a qualifier", () => {
  const parsed = parseSimpleDictionary(
    `== Noun ==
# {{countable}} A '''box''' is a [[container]] with a [[lid]].
#: ''I put the keys in the '''box'''.''
# {{unknown|not}} This meaning must be skipped.
#: ''This box belongs to another dictionary meaning.''
# The area around a [[seat|chair]].
## A nested sense.
#: ''Do not attach this box example to its parent.''
=== Related words ===
# Not a definition.
== Verb ==
# {{transitive}} To put something inside a box.`,
    "box",
    123,
  );
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].meaning, "A box is a container with a lid.");
  assert.deepEqual(parsed[0].examples, ["I put the keys in the box."]);
  assert.deepEqual(parsed[1].examples, []);
  assert.equal(parsed[2].part, "verb");
  assert.match(parsed[0].credit.url, /oldid=123/);
  assert.equal(parsed[0].credit.license, "CC BY-SA 4.0");
});

test("Definition cleanup follows noun, verb and adjective patterns without truncating important details", () => {
  assert.equal(
    cardDefinition("A box is a container with a lid.", "box", "noun"),
    "A container with a lid.",
  );
  assert.equal(
    cardDefinition("If you retain something, you keep it.", "retain", "verb"),
    "To keep something.",
  );
  assert.equal(
    cardDefinition(
      "A resilient person is someone who is able to recover quickly.",
      "resilient",
      "adjective",
    ),
    "Able to recover quickly.",
  );
  const negation = "If you forget something, you do not remember it.";
  assert.equal(cardDefinition(negation, "forget", "verb"), negation);
  const long =
    "A box is a container with a lid. It can be made of wood or metal.";
  assert.equal(
    cardDefinition(long, "box", "noun"),
    "A container with a lid. It can be made of wood or metal.",
  );
  assert.equal(
    sameSense(
      "To increase the amount of something",
      "To decrease the amount of something",
      "adjust",
    ),
    false,
  );
});

test("Ranking prefers a complete short example for the chosen sense, rejects fragments and substring matches", () => {
  const w = word();
  const examples = [
    {
      sentence: "I sat on the bank beside the river.",
      meaning: "The land beside a river.",
    },
    { sentence: "She put her money in the bank.", meaning: w.meaning },
    { sentence: "He went to the bank yesterday." },
    { sentence: "The river bank." },
    { sentence: "I love this banking application very much." },
    { sentence: "He went from bank to bank." },
  ].map((e) => ({ ...e, translation: "", credit, translationCredit: null }));
  const ranked = rankExamples(examples, w, learnStyle([]));
  assert.deepEqual(
    ranked.map((e) => e.sentence),
    ["She put her money in the bank.", "He went to the bank yesterday."],
  );
  assert.equal(
    exampleQuality("We need to wrap up the meeting.", "wrap up"),
    true,
  );
  assert.equal(
    exampleQuality("He brought it home this morning.", "brought"),
    true,
  );
  assert.equal(
    exampleQuality("She has three bottles in her bag.", "bottle"),
    false,
  );
  const defs = rankDefinitions(
    [
      definition("Past tense of bank."),
      definition(w.meaning, ["Bank!", "She put her money in the bank."]),
    ],
    "bank",
    learnStyle([]),
  );
  assert.equal(defs.length, 1);
  assert.equal(defs[0].example, "She put her money in the bank.");
});

test("Personalization is recomputed per account and cannot leak through the shared provider cache", async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 6; i++)
      f.add(
        word({
          id: "alice-" + i,
          sentence: "He works at the bank.",
          meaning: "A place to keep money.",
        }),
      );
    for (let i = 0; i < 6; i++)
      f.add(
        word({
          id: "bob-" + i,
          sentence:
            "The new bank near the station closes early every weekday afternoon.",
          meaning:
            "A financial institution that provides various services and loans for its customers.",
        }),
        "bob",
      );
    f.add(word({ id: "deleted", sentence: "Long ".repeat(20) }), "alice", 1);
    f.cache("bank", [
      definition(word().meaning, [
        "He works at the bank.",
        "The new bank near the station closes early every weekday afternoon.",
      ]),
    ]);
    const before = f.db.all("SELECT * FROM words");
    const alice = await f.integration.definitions("alice", "bank", "en");
    const bob = await f.integration.definitions("bob", "bank", "en");
    assert.equal(alice.style.cards, 6);
    assert.deepEqual(alice.style.sentenceWords, [5, 5]);
    assert.equal(alice.definitions[0].example, "He works at the bank.");
    assert.equal(
      bob.definitions[0].example,
      "The new bank near the station closes early every weekday afternoon.",
    );
    assert.deepEqual(f.db.all("SELECT * FROM words"), before);
  } finally {
    f.db.db.close();
  }
});

test("Another example cycles the full pool, preserves media and schedules, and never rewrites other words", async () => {
  const f = fixture();
  try {
    const w = word({
      imageId: "photo",
      audio: [{ id: "audio", name: "original.mp3" }],
    });
    f.add(w);
    f.add(word({ id: "other" }));
    f.db.run(
      "INSERT INTO cards(id,user_id,word_id,data) VALUES(?,?,?,?)",
      "card",
      "alice",
      "word",
      '{"revision":12,"schedule":{"reps":20}}',
    );
    const cards = f.db.all("SELECT * FROM cards"),
      other = f.svc.owned("words", "other", "alice");
    const sentences = [
      "She put her money in the bank.",
      "The bank will keep your money safe.",
      "I put my money in the bank.",
    ];
    f.cache("bank", [definition(w.meaning, sentences)]);
    f.integration.examples = async () => [];
    const result = await f.integration.suggest("alice", "word");
    assert.equal(result.word.sentence, sentences[0]);
    for (const expected of [sentences[1], sentences[2], sentences[0]]) {
      const next = await f.integration.suggest("alice", "word", true);
      assert.equal(next.word.sentence, expected);
    }
    assert.deepEqual(
      f.svc.owned<Word>("words", "word", "alice").audio,
      w.audio,
    );
    assert.equal(f.svc.owned<Word>("words", "word", "alice").imageId, "photo");
    assert.deepEqual(f.db.all("SELECT * FROM cards"), cards);
    assert.deepEqual(f.svc.owned("words", "other", "alice"), other);
    await assert.rejects(
      f.integration.suggest("bob", "word", true),
      /Content not found/,
    );
  } finally {
    f.db.db.close();
  }
});

test("No suitable result and a single repeated result leave the saved card unchanged", async () => {
  const f = fixture();
  try {
    const w = word({ sentence: "She put her money in the bank." });
    f.add(w);
    f.cache("bank", [definition(w.meaning, [w.sentence])]);
    f.integration.examples = async () => [];
    const before = f.db.get("SELECT data FROM words").data;
    assert.match(
      (await f.integration.suggest("alice", "word", true)).notice,
      /No different/,
    );
    f.cache("bank", []);
    assert.match(
      (await f.integration.suggest("alice", "word", true)).notice,
      /No suitable/,
    );
    assert.equal(f.db.get("SELECT data FROM words").data, before);
  } finally {
    f.db.db.close();
  }
});

test("In-flight suggestions cannot overwrite an edit made while providers are loading", async () => {
  const f = fixture();
  try {
    f.add(word());
    f.cache("bank", [
      definition(word().meaning, ["She put her money in the bank."]),
    ]);
    f.integration.examples = async () => {
      f.svc.save("words", word({ version: 2, sentence: "My own example." }));
      return [];
    };
    await assert.rejects(
      f.integration.suggest("alice", "word"),
      /word changed/,
    );
    assert.equal(
      f.svc.owned<Word>("words", "word", "alice").sentence,
      "My own example.",
    );
  } finally {
    f.db.db.close();
  }
});

test("Free providers fall back independently, retain attribution and send only the lookup term", async () => {
  const f = fixture(),
    original = globalThis.fetch,
    urls: string[] = [];
  try {
    globalThis.fetch = async (input) => {
      urls.push(String(input));
      if (String(input).includes("dictionaryapi.dev"))
        throw new Error("Offline source");
      return new Response(
        JSON.stringify({
          parse: {
            title: "retain",
            revid: 42,
            wikitext: {
              "*": "== Verb ==\n# If you '''retain''' something, you [[keep]] it.\n#: ''We hope to '''retain''' our best workers.''",
            },
          },
        }),
      );
    };
    f.add(
      word({
        id: "private",
        term: "PrivateSecret",
        sentence: "Never send my private study sentence anywhere.",
      }),
    );
    const result = await f.integration.definitions("alice", "to retain", "en");
    assert.equal(result.definitions[0].meaning, "To keep something.");
    assert.equal(result.definitions[0].credit.modified, true);
    assert.equal(result.definitions[0].exampleCredit?.modified, undefined);
    assert.equal(
      result.definitions[0].example,
      "We hope to retain our best workers.",
    );
    assert.match(result.notice, /One source/);
    assert.equal(urls.length, 2);
    assert.equal(
      urls.some((url) => /PrivateSecret|private.study/.test(url)),
      false,
    );
    globalThis.fetch = async () => {
      throw new Error("Both unavailable");
    };
    const empty = await f.integration.definitions("alice", "unlisted", "en");
    assert.equal(empty.definitions.length, 0);
    assert.match(empty.notice, /unavailable/);
  } finally {
    globalThis.fetch = original;
    f.db.db.close();
  }
});

test("A dictionary example survives sentence-source failure and language-specific punctuation still works", async () => {
  const f = fixture();
  try {
    f.add(word());
    f.cache("bank", [
      definition(word().meaning, ["She put her money in the bank."]),
    ]);
    f.integration.examples = async () => {
      throw new Error("Tatoeba unavailable");
    };
    const r = await f.integration.suggest("alice", "word");
    assert.equal(r.word.sentenceCredit?.source, credit.source);
    assert.equal(r.word.translation, "");
    assert.equal(exampleQuality("猫が好きです。", "猫", "ja"), true);
    assert.equal(exampleQuality("El caballo corre.", "caballo", "es"), true);
    f.integration.examples = async () => {
      throw Object.assign(new Error("Daily limit"), { statusCode: 429 });
    };
    await assert.rejects(
      f.integration.suggest("alice", "word", true),
      /Daily limit/,
    );
  } finally {
    f.db.db.close();
  }
});
