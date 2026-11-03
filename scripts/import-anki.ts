import { readFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { openDB } from "../server/db";
import { Service } from "../server/service";
import { newSchedule, reviewSchedule } from "../shared/scheduler";
import { dayKey, weekKey, type Word, type Card } from "../shared/model";
const [source, login] = process.argv.slice(2);
if (!source || !login)
  throw Error("Usage: tsx scripts/import-anki.ts prepared-directory login");
const payload = JSON.parse(readFileSync(join(source, "content.json"), "utf8"));
if (payload.format !== "anki-basic-import-v1")
  throw Error("Invalid input format");
const dataDir = process.env.DATA_DIR || "data",
  db = openDB(join(dataDir, "anki.sqlite")),
  svc = new Service(db);
const row = db.get("SELECT id FROM users WHERE email=?", login);
if (!row) throw Error("Destination account missing");
const user = svc.user(row.id);
const deterministic = (key: string) => {
  const h = createHash("sha256")
    .update(user.id + ":anki:" + key)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const importId = deterministic(payload.sha256);
if (db.get("SELECT id FROM mutations WHERE id=?", importId)) {
  console.log(JSON.stringify({ duplicate: true, source: payload.sourceName }));
  db.db.close();
  process.exit(0);
}
mkdirSync(join(dataDir, "media"), { recursive: true, mode: 0o700 });
mkdirSync(join(dataDir, "imports"), { recursive: true, mode: 0o700 });
const assets: Record<
  string,
  { id: string; filename: string; mime: string; originalName: string }
> = {};
for (const [name, value] of Object.entries(payload.media) as [string, any][]) {
  if (basename(value.filename) !== value.filename)
    throw Error("Invalid media path");
  const id = deterministic("media:" + value.filename),
    ext = extname(value.filename),
    isImage = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"].includes(ext);
  const filename = id + (isImage ? ".webp" : ext);
  if (isImage) {
    await sharp(join(source, "media", value.filename), {
      limitInputPixels: 30000000,
    })
      .rotate()
      .resize({
        width: 1000,
        height: 1000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toFile(join(dataDir, "media", filename));
  } else
    copyFileSync(
      join(source, "media", value.filename),
      join(dataDir, "media", filename),
    );
  assets[name] = {
    id,
    filename,
    mime: isImage
      ? "image/webp"
      : ext === ".mp3"
        ? "audio/mpeg"
        : ext === ".ogg"
          ? "audio/ogg"
          : ext === ".wav"
            ? "audio/wav"
            : "audio/mp4",
    originalName: name,
  };
}
const deckId = deterministic("deck:" + payload.sha256),
  result = {
    importedWords: payload.notes.length,
    importedReviews: 0,
    images: 0,
    audio: 0,
    needsMeaning: payload.notes.filter((n: any) => n.needsMeaning).length,
  };
db.transaction(() => {
  svc.createDeck(user.id, {
    id: deckId,
    name: "English",
    description: "Sua coleção original do Anki · frases, imagens e pronúncia",
    language: "en",
    color: "#388b70",
    icon: "🇬🇧",
    shared: false,
  });
  for (const asset of Object.values(assets))
    db.run(
      "INSERT OR IGNORE INTO assets VALUES(?,?,?)",
      asset.id,
      user.id,
      JSON.stringify(asset),
    );
  for (const n of payload.notes) {
    const wordId = deterministic("note:" + n.sourceId),
      originalCards = payload.cards.filter(
        (c: any) => String(c.nid) === n.sourceId,
      );
    if (originalCards.length !== 1 || originalCards[0].ord !== 0)
      throw Error("Only single Basic cards supported by this importer");
    const c = originalCards[0],
      logs = payload.reviews.filter(
        (r: any) => r.cid === c.id && r.ease >= 1 && r.ease <= 4,
      ),
      createdAt = new Date(Number(n.sourceId)).toISOString(),
      images = n.images.map((name: string) => assets[name]).filter(Boolean),
      audio = n.audio.map((name: string) => assets[name]).filter(Boolean);
    const w = svc.createWord(user.id, {
      id: wordId,
      deckId,
      term: n.term,
      meaning: n.meaning,
      language: "en",
      color: n.color,
      tags: [
        ...n.tags,
        "importado-anki",
        ...(n.needsMeaning ? ["significado-visual"] : []),
      ],
      sentence: n.sentence,
      kind: "basic",
    });
    const word: Word = {
      ...w,
      createdAt,
      imageId: images[0]?.id || null,
      imageCredit: null,
      extraImages: images.slice(1).map((a: any) => a.id),
      audio: audio.map((a: any) => ({ id: a.id, name: a.originalName })),
      source: {
        name: payload.sourceName,
        noteId: n.sourceId,
        needsMeaning: n.needsMeaning,
        originalFront: n.originalFront,
        originalBack: n.originalBack,
      },
    };
    svc.save("words", word);
    result.images += images.length;
    result.audio += audio.length;
    const cardId = wordId + ":forward";
    let schedule = newSchedule(cardId, new Date(createdAt));
    let revision = 0;
    for (const l of logs) {
      const at = new Date(l.id),
        before = schedule;
      try {
        schedule = reviewSchedule(schedule, l.ease, at).schedule;
      } catch {
        throw Error("Invalid source review " + l.id);
      }
      const id = deterministic("review:" + l.id),
        record = {
          id,
          cardId,
          baseRevision: revision++,
          rating: l.ease,
          reviewedAt: at.toISOString(),
          activeMs: Math.max(0, Math.min(l.time, 120000)),
          localDay: dayKey(at, user.timezone),
          timezone: user.timezone,
          status: "imported",
          points: 0,
          before,
          after: schedule,
          source: "English.apkg",
        };
      db.run(
        "INSERT OR IGNORE INTO reviews VALUES(?,?,?,?,?,?,?,?,?,?)",
        id,
        user.id,
        cardId,
        at.toISOString(),
        record.localDay,
        weekKey(at),
        "imported",
        record.activeMs,
        0,
        JSON.stringify(record),
      );
      result.importedReviews++;
    }
    // Preserve Anki's next due date; memory state is reconstructed from the actual review log.
    // Review queue uses days since collection creation; learning queues use Unix seconds.
    const dueAt =
      c.type === 2
        ? new Date((payload.created + c.due * 86400) * 1000)
        : c.type === 1 && c.due > 1000000000
          ? new Date(c.due * 1000)
          : new Date();
    schedule = {
      ...schedule,
      reps: c.reps,
      lapses: c.lapses,
      dueAt: dueAt.toISOString(),
      state: c.type === 2 ? 2 : c.type === 1 ? 1 : 0,
      scheduleStatus:
        c.type === 2 ? "review" : c.type === 1 ? "learning" : "new",
    };
    svc.save("cards", {
      id: cardId,
      wordId,
      direction: "forward",
      schedule,
      revision,
      suspended: c.queue === -1,
    } satisfies Card);
  }
  db.run(
    "INSERT INTO mutations VALUES(?,?,?)",
    importId,
    user.id,
    JSON.stringify(result),
  );
});
copyFileSync(
  join(source, "original.apkg"),
  join(dataDir, "imports", payload.sha256 + ".apkg"),
);
copyFileSync(
  join(source, "content.json"),
  join(dataDir, "imports", payload.sha256 + ".json"),
);
console.log(
  JSON.stringify(
    { ...result, login, deckId, sourceSha256: payload.sha256 },
    null,
    2,
  ),
);
db.db.close();
