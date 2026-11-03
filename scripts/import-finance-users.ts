// Run only for an explicitly authorized migration. Input contains verifiers: never log it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openDB } from "../server/db";
import { Service } from "../server/service";
import type { User } from "../shared/model";
const input = JSON.parse(readFileSync(0, "utf8")) as {
  id: string;
  username: string;
  password_hash: string;
  disabled: number;
}[];
if (
  !Array.isArray(input) ||
  input.some(
    (u) =>
      !/^scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(u.password_hash) &&
      !/^legacy-sha256:[a-f0-9]{64}$/.test(u.password_hash),
  )
)
  throw Error("Invalid credential format");
const db = openDB(join(process.env.DATA_DIR || "data", "anki.sqlite")),
  svc = new Service(db);
let imported = 0,
  skipped = 0;
db.transaction(() => {
  for (const u of input) {
    if (u.disabled) {
      skipped++;
      continue;
    }
    const found = db.get("SELECT id FROM users WHERE email=?", u.username);
    if (found) {
      skipped++;
      continue;
    }
    const id = randomUUID(),
      user: User = {
        id,
        email: u.username,
        nickname: u.username[0].toUpperCase() + u.username.slice(1),
        avatar: u.username === "bruno" ? "🦊" : "🌱",
        nativeLang: "pt",
        studyLang: "en",
        timezone: "America/Sao_Paulo",
        dailyNew: 20,
        dailyReview: 200,
        theme: "system",
        createdAt: new Date().toISOString(),
      };
    db.run(
      "INSERT INTO users VALUES(?,?,?,?)",
      id,
      user.email,
      u.password_hash,
      JSON.stringify(user),
    );
    svc.ensureGoal(id);
    if (u.username !== "bruno")
      svc.createDeck(id, {
        name: "Meu primeiro baralho",
        language: "en",
        color: "#8058d8",
        icon: "🌱",
      });
    imported++;
  }
});
console.log(
  JSON.stringify({
    imported,
    skipped,
    users: db.all(
      "SELECT email login,json_extract(data,'$.nickname') nickname FROM users",
    ),
  }),
);
db.db.close();
