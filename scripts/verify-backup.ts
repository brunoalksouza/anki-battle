// Restore to a disposable directory; never modify the source or production database.
import {
  mkdtempSync,
  cpSync,
  rmSync,
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import sharp from "sharp";
import { openDB } from "../server/db";
import { Service } from "../server/service";
import type { Word } from "../shared/model";
const source = process.argv[2];
if (!source || !existsSync(join(source, "anki.sqlite")))
  throw Error("Usage: tsx scripts/verify-backup.ts backup-directory");
const target = mkdtempSync(join(tmpdir(), "anki-restore-"));
let db: ReturnType<typeof openDB> | undefined;
try {
  cpSync(resolve(source), target, { recursive: true });
  db = openDB(join(target, "anki.sqlite"));
  const svc = new Service(db);
  assert.equal(db.get("PRAGMA integrity_check").integrity_check, "ok");
  assert.equal(db.all("PRAGMA foreign_key_check").length, 0);
  let words = 0,
    reviews = 0,
    media = 0;
  for (const u of db.all("SELECT id FROM users")) {
    const snapshot = svc.snapshot(u.id);
    words += snapshot.words.length;
    reviews += snapshot.reviews.length;
    for (const w of snapshot.words) {
      for (const id of [
        w.imageId,
        ...(w.extraImages || []),
        ...(w.audio || []).map((a) => a.id),
      ].filter(Boolean)) {
        const row = db.get(
          "SELECT data FROM assets WHERE id=? AND user_id=?",
          id,
          u.id,
        );
        assert(row, "Missing owned media metadata");
        const meta = JSON.parse(row.data),
          file = join(target, "media", meta.filename || id + ".webp");
        assert(existsSync(file), "Missing media file");
        if (file.endsWith(".webp")) {
          const image = await sharp(file).metadata();
          assert(image.width && image.height);
        }
        media++;
      }
    }
  }
  let archives = 0;
  if (existsSync(join(target, "imports")))
    for (const file of readdirSync(join(target, "imports")).filter((n) =>
      n.endsWith(".apkg"),
    )) {
      assert.equal(
        createHash("sha256")
          .update(readFileSync(join(target, "imports", file)))
          .digest("hex"),
        file.replace(".apkg", ""),
      );
      archives++;
    }
  console.log(
    JSON.stringify({
      restored: true,
      integrity: "ok",
      foreignKeys: "ok",
      users: db.get("SELECT count(*) n FROM users").n,
      words,
      reviews,
      media,
      archives,
    }),
  );
} finally {
  db?.db.close();
  rmSync(target, { recursive: true, force: true });
}
