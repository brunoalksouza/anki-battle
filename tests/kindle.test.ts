import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDB } from "../server/db";
import { KindleReading, parseKindle } from "../server/kindle";
import { readingStreak } from "../shared/reading";
import { buildApp } from "../server/app";
const sample = {
  current_daily_streak: {
    duration: 2,
    start: "2026-11-03T00:00:00.000Z",
    end: "2026-11-04T00:00:00.000Z",
  },
  longest_daily_streak: {
    duration: 12,
    start: "2024-09-07T00:00:00.000Z",
    end: "2024-09-18T00:00:00.000Z",
  },
  longest_weekly_streak: { duration: 26 },
  goal_info: {
    titles_read: [
      { asin: "book1", date_read: "2026-08-24T11:17:13Z" },
      { asin: "book1", date_read: "2026-08-25T11:17:13Z" },
      { asin: "book2", date_read: "2026-08-26T11:17:13Z" },
    ],
  },
};
const syntheticCookie =
  "session-id=synthetic; at-main=test-session-not-a-real-cookie";
const json = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "grove-kindle-")),
    db = openDB(join(dir, "anki.sqlite"));
  for (const name of ["alice", "bob"])
    db.run(
      "INSERT INTO users VALUES(?,?,?,?)",
      name,
      name + "@test.invalid",
      "unused",
      JSON.stringify({ id: name }),
    );
  let time = new Date("2026-11-04T12:00:00Z"),
    response = () => Promise.resolve(json(sample));
  const requests: { url: string; options: RequestInit | undefined }[] = [];
  const kindle = new KindleReading(db, dir, () => new Date(time), (async (
    url,
    options,
  ) => {
    requests.push({ url: String(url), options });
    return response();
  }) as typeof fetch);
  return {
    dir,
    db,
    kindle,
    requests,
    advance(ms = 16 * 60000) {
      time = new Date(+time + ms);
    },
    reply(fn: () => Promise<Response>) {
      response = fn;
    },
    async close() {
      await kindle.close();
      db.db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
test("Kindle calendar dates stay unchanged; only confirmed current dates are imported", () => {
  const r = parseKindle(sample, new Date("2026-11-04T12:00:00Z"));
  assert.deepEqual(r.days, ["2026-11-03", "2026-11-04"]);
  assert.equal(r.longestDaily, 12);
  assert.equal(r.longestWeekly, 26);
  assert.equal(r.titlesByYear["2026"], 2);
  assert(
    !r.days.includes("2024-09-07"),
    "A record streak does not establish a complete calendar",
  );
  assert.equal(readingStreak(r.days, "2026-11-05"), 2);
  assert.equal(readingStreak(r.days, "2026-11-06"), 0);
  assert.throws(() =>
    parseKindle({
      current_daily_streak: {
        duration: 5,
        start: "2026-11-03",
        end: "2026-11-04",
      },
    }),
  );
  assert.throws(() =>
    parseKindle({
      current_daily_streak: {
        duration: 1,
        start: "2026-02-30",
        end: "2026-02-30",
      },
    }),
  );
  assert.throws(() => parseKindle({ error: "login required" }));
  assert.deepEqual(parseKindle({ current_daily_streak: null }).days, []);
});
test("Kindle connection is encrypted, isolated by account, and idempotent", async () => {
  const f = fixture();
  try {
    await f.kindle.connect("alice", syntheticCookie);
    const stored = f.db.get(
      "SELECT secret FROM kindle_connections WHERE user_id='alice'",
    ).secret;
    assert(!stored.includes("at-main") && !stored.includes("test-session"));
    assert.equal(readFileSync(join(f.dir, "kindle-session.key")).length, 32);
    assert.equal(
      statSync(join(f.dir, "kindle-session.key")).mode & 0o777,
      0o600,
    );
    assert.equal(f.kindle.state("alice").status, "connected");
    assert.deepEqual(f.kindle.state("bob").days, []);
    assert(!JSON.stringify(f.kindle.state("alice")).includes("secret"));
    assert.equal(
      f.requests[0].url,
      "https://www.amazon.com/kindle/reading/insights/data",
    );
    assert.equal(f.requests[0].options?.redirect, "manual");
    await f.kindle.sync("alice");
    assert.equal(f.requests.length, 1, "Manual sync is throttled");
    f.advance();
    await f.kindle.tick();
    assert.equal(f.requests.length, 2);
    assert.equal(f.kindle.state("alice").days.length, 2);
  } finally {
    await f.close();
  }
});
test("Failed and expired sessions preserve confirmed history and last successful sync", async () => {
  const f = fixture();
  try {
    await f.kindle.connect("alice", syntheticCookie);
    const received = f.kindle.state("alice").lastSync;
    f.reply(async () => new Response("Unavailable", { status: 503 }));
    f.advance();
    await f.kindle.tick();
    assert.equal(f.kindle.state("alice").status, "error");
    assert.equal(f.kindle.state("alice").lastSync, received);
    assert.equal(f.kindle.state("alice").days.length, 2);
    f.reply(
      async () =>
        new Response("", {
          status: 302,
          headers: { location: "https://example.invalid/" },
        }),
    );
    f.advance();
    await f.kindle.tick();
    assert.equal(f.kindle.state("alice").status, "reconnect");
    const n = f.requests.length;
    f.advance();
    await f.kindle.tick();
    assert.equal(f.requests.length, n);
    await assert.rejects(
      f.kindle.connect("alice", syntheticCookie),
      /Could not verify/,
    );
    assert.equal(f.kindle.state("alice").days.length, 2);
  } finally {
    await f.close();
  }
});
test("New snapshots merge confirmed dates without erasing older streaks or inventing gaps", async () => {
  const f = fixture();
  try {
    await f.kindle.connect("alice", syntheticCookie);
    f.advance(5 * 86400000);
    f.reply(async () =>
      json({
        ...sample,
        current_daily_streak: {
          duration: 1,
          start: "2026-11-09",
          end: "2026-11-09",
        },
      }),
    );
    await f.kindle.tick();
    assert.deepEqual(f.kindle.state("alice").days, [
      "2026-11-03",
      "2026-11-04",
      "2026-11-09",
    ]);
    f.kindle.disconnect("alice");
    const n = f.requests.length;
    f.advance();
    await f.kindle.tick();
    assert.equal(f.requests.length, n);
    assert.equal(f.kindle.state("alice").status, "disconnected");
    assert.equal(
      f.db.get("SELECT secret FROM kindle_connections WHERE user_id='alice'")
        .secret,
      null,
    );
    assert.equal(f.kindle.state("alice").days.length, 3);
  } finally {
    await f.close();
  }
});
test("Disconnect invalidates a pending update and a pending initial connection", async () => {
  const f = fixture();
  try {
    await f.kindle.connect("alice", syntheticCookie);
    f.advance();
    let resolve!: (r: Response) => void;
    f.reply(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const pending = f.kindle.sync("alice");
    f.kindle.disconnect("alice");
    resolve(json(sample));
    await pending;
    assert.equal(f.kindle.state("alice").status, "disconnected");
    const connecting = f.kindle.connect("bob", syntheticCookie);
    f.kindle.disconnect("bob");
    resolve(json(sample));
    await assert.rejects(connecting, /canceled/);
    assert.equal(f.kindle.state("bob").status, "disconnected");
    assert.equal(f.kindle.state("bob").days.length, 0);
  } finally {
    await f.close();
  }
});
test("Reading API requires the user's session and never exports Amazon credentials", async () => {
  const dir = mkdtempSync(join(tmpdir(), "grove-reading-api-"));
  const { app } = await buildApp({
    dataDir: dir,
    dbPath: join(dir, "anki.sqlite"),
    origin: "https://reading.test",
    now: () => new Date("2026-11-04T12:00:00Z"),
    kindleFetch: (async () => json(sample)) as typeof fetch,
  });
  const request = (
    url: string,
    cookie = "",
    method: any = "GET",
    payload?: any,
  ) =>
    app.inject({
      url: "/api" + url,
      method,
      headers: { cookie, origin: "https://reading.test", "x-anki-client": "1" },
      payload,
    });
  try {
    assert.equal((await request("/reading")).statusCode, 401);
    const register = async (name: string) => {
      const r = await request("/auth/register", "", "POST", {
        email: name + "@reading.test",
        nickname: name,
        password: "synthetic-reading-password",
      });
      assert.equal(r.statusCode, 200);
      return r.headers["set-cookie"]!.toString().split(";")[0];
    };
    const alice = await register("Alice"),
      bob = await register("Bob");
    const connected = await request("/reading/connect", alice, "POST", {
      cookie: syntheticCookie,
      userId: "bob",
    });
    assert.equal(connected.statusCode, 200);
    assert.equal(
      (await request("/state", alice)).json().reading.status,
      "connected",
    );
    assert.equal(
      (await request("/reading", bob)).json().status,
      "disconnected",
    );
    assert(!connected.body.includes(syntheticCookie));
    assert(!connected.body.includes("secret"));
    const rejected = await request("/reading/connect", alice, "POST", {
      cookie: "at-main=bad\r\nX-Header: injected",
    });
    assert.equal(rejected.statusCode, 400);
    const disconnected = await request("/reading/connection", alice, "DELETE");
    assert.equal(disconnected.statusCode, 200);
    assert.equal(disconnected.json().days.length, 2);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
