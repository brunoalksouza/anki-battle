import type { Store } from "./db";
import type { Deck, Word } from "../shared/model";

// Translate only exact labels created by the original app/importer. Never rewrite
// users' English definitions, media, card schedules, or review history.
export function migrateEnglishContent(db: Store) {
  return db.transaction(() => {
    let words = 0,
      decks = 0;
    for (const row of db.all("SELECT id,data FROM words WHERE deleted=0")) {
      const word: Word = JSON.parse(row.data);
      if (!word.source?.noteId) continue;
      const before = JSON.stringify(word);
      if (
        word.meaning === "Significado visual — veja a imagem do verso original."
      )
        word.meaning =
          "Visual meaning — see the image from your original card.";
      word.tags = word.tags.map((tag) =>
        tag === "importado-anki"
          ? "anki-import"
          : tag === "significado-visual"
            ? "visual-meaning"
            : tag,
      );
      if (JSON.stringify(word) !== before) {
        word.version++;
        db.run(
          "UPDATE words SET data=? WHERE id=?",
          JSON.stringify(word),
          row.id,
        );
        words++;
      }
    }
    for (const row of db.all("SELECT id,data FROM decks WHERE deleted=0")) {
      const deck: Deck = JSON.parse(row.data);
      const before = JSON.stringify(deck);
      if (deck.name === "Meu primeiro baralho") deck.name = "My first deck";
      if (
        deck.description ===
        "Sua coleção original do Anki · frases, imagens e pronúncia"
      )
        deck.description =
          "Your original Anki collection · sentences, images, and pronunciation";
      if (JSON.stringify(deck) !== before) {
        deck.version++;
        db.run(
          "UPDATE decks SET data=? WHERE id=?",
          JSON.stringify(deck),
          row.id,
        );
        decks++;
      }
    }
    return { words, decks };
  });
}
