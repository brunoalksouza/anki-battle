import { DatabaseSync, backup } from "node:sqlite";
import {
  mkdirSync,
  chmodSync,
  readdirSync,
  statSync,
  unlinkSync,
  copyFileSync,
  existsSync,
  cpSync,
  renameSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
const dataDir = process.env.DATA_DIR || "data",
  target = process.argv[2] || join(dataDir, "backups"),
  stamp = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync(target, { recursive: true, mode: 0o700 });
const temporary = join(target, ".pending-" + stamp),
  dest = join(target, stamp);
mkdirSync(temporary, { mode: 0o700 });
try {
  const source = new DatabaseSync(join(dataDir, "anki.sqlite"), {
    readOnly: true,
  });
  await backup(source, join(temporary, "anki.sqlite"));
  source.close();
  const check = new DatabaseSync(join(temporary, "anki.sqlite"), {
    readOnly: true,
  });
  if (check.prepare("PRAGMA integrity_check").get()!.integrity_check !== "ok")
    throw Error("Backup integrity failed");
  const counts = {
    users: check.prepare("SELECT COUNT(*) n FROM users").get()!.n,
    words: check.prepare("SELECT COUNT(*) n FROM words").get()!.n,
    reviews: check.prepare("SELECT COUNT(*) n FROM reviews").get()!.n,
  };
  check.close();
  chmodSync(join(temporary, "anki.sqlite"), 0o600);
  for (const folder of ["media", "imports"])
    if (existsSync(join(dataDir, folder)))
      cpSync(join(dataDir, folder), join(temporary, folder), {
        recursive: true,
      });
  renameSync(temporary, dest);
  for (const name of readdirSync(target)) {
    if (
      /^\d{4}-/.test(name) &&
      Date.now() - statSync(join(target, name)).mtimeMs > 14 * 86400000
    )
      rmSync(join(target, name), { recursive: true });
  }
  console.log(JSON.stringify({ backup: dest, integrity: "ok", ...counts }));
} catch (e) {
  rmSync(temporary, { recursive: true, force: true });
  throw e;
}
