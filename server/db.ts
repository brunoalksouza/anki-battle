import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
export function openDB(path: string) {
  if (path !== ":memory:")
    mkdirSync(resolve(path, ".."), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ":memory:") chmodSync(path, 0o600);
  db.exec(`
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password TEXT NOT NULL,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS recovery(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS decks(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS words(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),deck_id TEXT NOT NULL REFERENCES decks(id),data TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS cards(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),word_id TEXT NOT NULL REFERENCES words(id),data TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),card_id TEXT NOT NULL REFERENCES cards(id),reviewed_at TEXT NOT NULL,local_day TEXT NOT NULL,week TEXT NOT NULL,status TEXT NOT NULL,active_ms INTEGER NOT NULL,points INTEGER NOT NULL,data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS reviews_user_date ON reviews(user_id,reviewed_at);
CREATE TABLE IF NOT EXISTS points(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),week TEXT NOT NULL,day TEXT NOT NULL,amount INTEGER NOT NULL,reason TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS points_user ON points(user_id,week);
CREATE TABLE IF NOT EXISTS access(user_id TEXT NOT NULL REFERENCES users(id),day TEXT NOT NULL,PRIMARY KEY(user_id,day));
CREATE TABLE IF NOT EXISTS goals(user_id TEXT NOT NULL REFERENCES users(id),week TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(user_id,week));
CREATE TABLE IF NOT EXISTS mutations(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),response TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS battles(id TEXT PRIMARY KEY,host_id TEXT NOT NULL REFERENCES users(id),guest_id TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rounds(battle_id TEXT NOT NULL REFERENCES battles(id),idx INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(battle_id,idx));
CREATE TABLE IF NOT EXISTS answers(battle_id TEXT NOT NULL REFERENCES battles(id),user_id TEXT NOT NULL REFERENCES users(id),idx INTEGER NOT NULL,served_at TEXT NOT NULL,answered_at TEXT,correct INTEGER NOT NULL DEFAULT 0,elapsed INTEGER NOT NULL DEFAULT 0,choice TEXT,PRIMARY KEY(battle_id,user_id,idx));
CREATE TABLE IF NOT EXISTS battle_ready(battle_id TEXT NOT NULL REFERENCES battles(id),user_id TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(battle_id,user_id));
CREATE TABLE IF NOT EXISTS groups(id TEXT PRIMARY KEY,name TEXT NOT NULL,code TEXT NOT NULL UNIQUE,owner_id TEXT NOT NULL REFERENCES users(id));
CREATE TABLE IF NOT EXISTS members(group_id TEXT NOT NULL REFERENCES groups(id),user_id TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(group_id,user_id));
CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS usage(user_id TEXT NOT NULL REFERENCES users(id),day TEXT NOT NULL,kind TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(user_id,day,kind));
CREATE TABLE IF NOT EXISTS provider_cache(key TEXT PRIMARY KEY,data TEXT NOT NULL,expires TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS auth_attempts(key TEXT PRIMARY KEY,started INTEGER NOT NULL,count INTEGER NOT NULL);
PRAGMA user_version=1;
`);
  return new Store(db);
}
export class Store {
  constructor(public db: DatabaseSync) {}
  get(sql: string, ...args: any[]): any {
    return this.db.prepare(sql).get(...args);
  }
  all(sql: string, ...args: any[]): any[] {
    return this.db.prepare(sql).all(...args);
  }
  run(sql: string, ...args: any[]) {
    return this.db.prepare(sql).run(...args);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const r = fn();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}
