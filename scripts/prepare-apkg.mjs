// Source format reference: https://github.com/ankitects/anki/blob/main/proto/anki/import_export.proto
// No Anki source code copied. Numeric ZIP members are decoded, never extracted by user-controlled path.
import { unzipSync } from "fflate";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { zstdDecompressSync } from "node:zlib";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, join, extname } from "node:path";
const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw Error(
    "Usage: node scripts/prepare-apkg.mjs input.apkg output-directory",
  );
const root = resolve(output);
mkdirSync(root, { recursive: true, mode: 0o700 });
mkdirSync(join(root, "media"), { recursive: true, mode: 0o700 });
const bytes = readFileSync(input),
  sha = createHash("sha256").update(bytes).digest("hex");
const zip = unzipSync(bytes);
const decode = (b) =>
  Buffer.from(b).subarray(0, 4).toString("hex") === "28b52ffd"
    ? zstdDecompressSync(b)
    : Buffer.from(b);
const col =
  zip["collection.anki21b"] ||
  zip["collection.anki21"] ||
  zip["collection.anki2"];
if (!col) throw Error("Missing Anki collection");
writeFileSync(join(root, "collection.sqlite"), decode(col), { mode: 0o600 });
function fields(buf) {
  let pos = 0;
  const out = [];
  function num() {
    let n = 0,
      shift = 0;
    while (pos < buf.length) {
      const v = buf[pos++];
      n += (v & 127) * 2 ** shift;
      if (!(v & 128)) return n;
      shift += 7;
      if (shift > 49) throw Error("Oversized protobuf integer");
    }
    throw Error("Truncated protobuf");
  }
  while (pos < buf.length) {
    const tag = num(),
      wire = tag & 7,
      key = tag >> 3;
    if (wire === 2) {
      const size = num();
      out.push([key, buf.subarray(pos, pos + size)]);
      pos += size;
    } else if (wire === 0) out.push([key, num()]);
    else throw Error("Unsupported protobuf wire type");
  }
  return out;
}
const map = decode(zip.media);
let entries;
if (map[0] === 123) {
  entries = Object.entries(JSON.parse(map.toString())).map(([index, name]) => ({
    index,
    name,
  }));
} else
  entries = fields(map)
    .filter(([key]) => key === 1)
    .map(([, buf], index) => {
      const f = fields(buf);
      return {
        index: String(f.find(([k]) => k === 255)?.[1] ?? index),
        name: f.find(([k]) => k === 1)[1].toString(),
        size: f.find(([k]) => k === 2)?.[1],
        sha1: f.find(([k]) => k === 3)?.[1].toString("hex"),
      };
    });
const media = {};
for (const e of entries) {
  const b = decode(zip[e.index]);
  if (e.sha1 && createHash("sha1").update(b).digest("hex") !== e.sha1)
    throw Error("Media hash mismatch");
  const ext = extname(e.name).toLowerCase();
  if (
    ![
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".gif",
      ".svg",
      ".mp3",
      ".ogg",
      ".wav",
      ".m4a",
    ].includes(ext)
  )
    throw Error("Unsupported media " + ext);
  const filename = createHash("sha256").update(b).digest("hex") + ext;
  writeFileSync(join(root, "media", filename), b, { mode: 0o600 });
  media[e.name] = { filename, bytes: b.length };
}
const notes = JSON.parse(
  execFileSync(
    "python3",
    ["scripts/read-anki.py", join(root, "collection.sqlite")],
    { maxBuffer: 20 * 1024 * 1024, encoding: "utf8" },
  ),
);
const result = {
  format: "anki-basic-import-v1",
  sha256: sha,
  sourceName: "English.apkg",
  ...notes,
  media,
};
writeFileSync(join(root, "content.json"), JSON.stringify(result), {
  mode: 0o600,
});
copyFileSync(input, join(root, "original.apkg"));
console.log(
  JSON.stringify(
    {
      notes: notes.notes.length,
      cards: notes.cards.length,
      reviews: notes.reviews.length,
      media: entries.length,
      needsMeaning: notes.notes.filter((n) => n.needsMeaning).length,
      unmarked: notes.notes.filter((n) => n.unmarked).length,
      truncatedTerms: notes.notes.filter((n) => n.truncatedTerm).length,
      sha256: sha,
    },
    null,
    2,
  ),
);
