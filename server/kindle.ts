import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Store } from "./db";
import { emptyReading, type ReadingState } from "../shared/reading";

const ENDPOINT = "https://www.amazon.com/kindle/reading/insights/data";
const PERIOD = 15 * 60_000;
const streakSchema = z.object({
  duration: z.number().int().min(0).max(36525),
  start: z.string().nullable().optional(),
  end: z.string().nullable().optional(),
});
const schema = z.object({
  current_daily_streak: streakSchema.nullable(),
  longest_daily_streak: streakSchema.nullable().optional(),
  longest_weekly_streak: streakSchema.nullable().optional(),
  goal_info: z
    .object({
      titles_read: z
        .array(
          z.object({
            asin: z.string(),
            date_read: z.string(),
          }),
        )
        .max(10000)
        .optional(),
    })
    .optional(),
});
function dateOnly(input: string | null | undefined): string {
  const day = input?.match(/^\d{4}-\d{2}-\d{2}(?=T|$)/)?.[0];
  if (
    !day ||
    !Number.isFinite(Date.parse(day)) ||
    new Date(day).toISOString().slice(0, 10) !== day
  )
    throw Error("Invalid Kindle date");
  return day;
}
// Kindle's midnight timestamps name calendar days. Do not shift them into a local time zone.
export function parseKindle(input: unknown, now = new Date()) {
  const data = schema.parse(input);
  const current = data.current_daily_streak;
  const days: string[] = [];
  if (current?.duration) {
    const start = dateOnly(current.start),
      end = dateOnly(current.end);
    const count = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
    if (
      count !== current.duration ||
      end > new Date(+now + 86400000).toISOString().slice(0, 10)
    )
      throw Error("Invalid Kindle streak range");
    for (let i = 0; i < count; i++)
      days.push(
        new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10),
      );
  }
  const titles = new Map<string, Set<string>>();
  for (const item of data.goal_info?.titles_read || []) {
    const year = dateOnly(item.date_read).slice(0, 4);
    if (!titles.has(year)) titles.set(year, new Set());
    titles.get(year)!.add(item.asin);
  }
  return {
    days,
    longestDaily: data.longest_daily_streak?.duration || 0,
    longestWeekly: data.longest_weekly_streak?.duration || 0,
    titlesByYear: Object.fromEntries(
      [...titles].map(([year, ids]) => [year, ids.size]),
    ),
  };
}
export const kindleCookie = z
  .string()
  .trim()
  .min(10)
  .max(16000)
  .refine(
    (s) =>
      /^[\x20-\x7e]+$/.test(s) &&
      /(?:^|;\s*)(?:at-main|x-main)=([^;\s]+)/.test(s),
    "Paste the Cookie request header from your signed-in Amazon session.",
  );
class KindleError extends Error {
  constructor(public reconnect: boolean) {
    super("Kindle sync unavailable");
  }
}
export class KindleReading {
  private inFlight = new Map<string, Promise<void>>();
  private timer?: ReturnType<typeof setInterval>;
  private stopped = false;
  constructor(
    private db: Store,
    private dir: string,
    private now = () => new Date(),
    private fetcher: typeof fetch = fetch,
  ) {}
  state(user: string): ReadingState {
    const row = this.db.get(
      "SELECT status,last_sync,last_attempt,summary FROM kindle_connections WHERE user_id=?",
      user,
    );
    return {
      ...emptyReading(),
      ...(row ? JSON.parse(row.summary) : {}),
      status: row?.status || "disconnected",
      lastSync: row?.last_sync || null,
      lastAttempt: row?.last_attempt || null,
      days: this.db
        .all("SELECT day FROM reading_days WHERE user_id=? ORDER BY day", user)
        .map((r) => r.day),
    };
  }
  private key(create = false) {
    const path = join(this.dir, "kindle-session.key");
    if (create && !existsSync(path))
      writeFileSync(path, randomBytes(32), { mode: 0o600, flag: "wx" });
    const key = readFileSync(path);
    if (key.length !== 32) throw Error("Invalid Kindle session key");
    return key;
  }
  private seal(cookie: string, user: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key(true), iv);
    cipher.setAAD(Buffer.from(user));
    const encrypted = Buffer.concat([
      cipher.update(cookie, "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
      "base64",
    );
  }
  private unseal(value: string, user: string) {
    const bytes = Buffer.from(value, "base64");
    const cipher = createDecipheriv(
      "aes-256-gcm",
      this.key(),
      bytes.subarray(0, 12),
    );
    cipher.setAAD(Buffer.from(user));
    cipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([
      cipher.update(bytes.subarray(28)),
      cipher.final(),
    ]).toString("utf8");
  }
  private async fetch(cookie: string) {
    let response: Response;
    try {
      response = await this.fetcher(ENDPOINT, {
        headers: {
          Cookie: cookie,
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 StudyGrove/1.0",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new KindleError(false);
    }
    // Never forward Amazon cookies to redirects, including a login URL.
    if ([301, 302, 303, 307, 308, 401, 403].includes(response.status))
      throw new KindleError(true);
    if (!response.ok) throw new KindleError(false);
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new KindleError(true);
    const reader = response.body?.getReader();
    if (!reader) throw new KindleError(false);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2 * 1024 * 1024) {
          await reader.cancel();
          throw new KindleError(false);
        }
        chunks.push(value);
      }
      return parseKindle(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
        this.now(),
      );
    } catch {
      throw new KindleError(false);
    }
  }
  private record(user: string, data: ReturnType<typeof parseKindle>) {
    for (const day of data.days)
      this.db.run(
        "INSERT OR IGNORE INTO reading_days(user_id,day) VALUES(?,?)",
        user,
        day,
      );
    const { days, ...summary } = data;
    this.db.run(
      "UPDATE kindle_connections SET summary=?,last_sync=?,last_attempt=?,status='connected',next_attempt=? WHERE user_id=?",
      JSON.stringify(summary),
      this.now().toISOString(),
      this.now().toISOString(),
      +this.now() + PERIOD,
      user,
    );
  }
  async connect(user: string, cookie: string) {
    cookie = kindleCookie.parse(cookie);
    if (this.inFlight.has(user))
      throw Object.assign(
        Error("A Kindle update is already running. Try again shortly."),
        { statusCode: 409 },
      );
    const generation = randomUUID();
    this.db.run(
      "INSERT INTO kindle_connections(user_id,generation,status,summary) VALUES(?,?,'disconnected','{}') ON CONFLICT(user_id) DO UPDATE SET generation=excluded.generation",
      user,
      generation,
    );
    const operation = (async () => {
      let result: ReturnType<typeof parseKindle>;
      try {
        result = await this.fetch(cookie);
      } catch {
        throw Object.assign(
          Error(
            "Could not verify this Amazon session. Open Reading Insights, copy a fresh Cookie header, and try again.",
          ),
          { statusCode: 400 },
        );
      }
      if (
        this.db.get(
          "SELECT generation FROM kindle_connections WHERE user_id=?",
          user,
        )?.generation !== generation
      )
        throw Object.assign(
          Error("The connection was canceled. Connect again when ready."),
          { statusCode: 409 },
        );
      const secret = this.seal(cookie, user);
      this.db.transaction(() => {
        this.db.run(
          "UPDATE kindle_connections SET secret=? WHERE user_id=?",
          secret,
          user,
        );
        this.record(user, result);
      });
    })().finally(() => this.inFlight.delete(user));
    this.inFlight.set(user, operation);
    await operation;
    return this.state(user);
  }
  disconnect(user: string) {
    this.db.run(
      "UPDATE kindle_connections SET secret=NULL,status='disconnected',generation=? WHERE user_id=?",
      randomUUID(),
      user,
    );
    return this.state(user);
  }
  async sync(user: string) {
    if (this.stopped) return;
    if (this.inFlight.has(user)) return this.inFlight.get(user);
    const row = this.db.get(
      "SELECT * FROM kindle_connections WHERE user_id=? AND secret IS NOT NULL",
      user,
    );
    if (!row || row.status === "reconnect") return;
    if (row.last_attempt && +this.now() - Date.parse(row.last_attempt) < 60000)
      return;
    this.db.run(
      "UPDATE kindle_connections SET last_attempt=? WHERE user_id=?",
      this.now().toISOString(),
      user,
    );
    const operation = (async () => {
      try {
        let cookie: string;
        try {
          cookie = this.unseal(row.secret, user);
        } catch {
          throw new KindleError(true);
        }
        const data = await this.fetch(cookie);
        if (
          this.db.get(
            "SELECT generation FROM kindle_connections WHERE user_id=?",
            user,
          )?.generation !== row.generation
        )
          return;
        this.db.transaction(() => this.record(user, data));
      } catch (e) {
        if (
          this.db.get(
            "SELECT generation FROM kindle_connections WHERE user_id=?",
            user,
          )?.generation !== row.generation
        )
          return;
        this.db.run(
          "UPDATE kindle_connections SET status=?,next_attempt=? WHERE user_id=?",
          e instanceof KindleError && e.reconnect ? "reconnect" : "error",
          +this.now() + PERIOD,
          user,
        );
      }
    })().finally(() => this.inFlight.delete(user));
    this.inFlight.set(user, operation);
    return operation;
  }
  async tick() {
    if (this.stopped) return;
    for (const row of this.db.all(
      "SELECT user_id FROM kindle_connections WHERE secret IS NOT NULL AND status IN ('connected','error') AND next_attempt<=?",
      +this.now(),
    )) {
      if (this.stopped) break;
      await this.sync(row.user_id);
    }
  }
  start() {
    this.timer = setInterval(() => void this.tick().catch(() => {}), 60000);
    this.timer.unref();
    void this.tick().catch(() => {});
  }
  async close() {
    this.stopped = true;
    clearInterval(this.timer);
    await Promise.allSettled(this.inFlight.values());
  }
}
