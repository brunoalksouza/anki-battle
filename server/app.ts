import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, createReadStream, statSync, readFileSync } from "node:fs";
import { join, resolve, extname, sep } from "node:path";
import { z } from "zod";
import { openDB } from "./db";
import { migrateEnglishContent } from "./english-content";
import {
  Service,
  passwordHash,
  passwordMatches,
  hash,
  fail,
  wordInput,
  id,
} from "./service";
import { Integrations } from "./integrations";
import { ProfilePhotos } from "./profile-photo";
import { weekKey, type User, type Word, type Card } from "../shared/model";
declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}
export async function buildApp(
  options: {
    dbPath?: string;
    dataDir?: string;
    now?: () => Date;
    logger?: boolean;
    origin?: string;
  } = {},
) {
  const dataDir = resolve(options.dataDir || process.env.DATA_DIR || "data"),
    db = openDB(options.dbPath || join(dataDir, "anki.sqlite"));
  migrateEnglishContent(db);
  const svc = new Service(db, options.now),
    integrations = new Integrations(svc, dataDir),
    photos = new ProfilePhotos(svc, dataDir),
    origin =
      options.origin || process.env.APP_ORIGIN || "http://localhost:5173";
  const app = Fastify({
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: ["127.0.0.1", "::1"],
    logger: options.logger
      ? {
          redact: ["req.headers.cookie", "req.headers.authorization"],
          serializers: {
            req: (r: any) => ({ method: r.method, url: r.url?.split("?")[0] }),
          },
        }
      : false,
  });
  app.decorateRequest("userId", "");
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        mediaSrc: ["'self'", "blob:"],
        imgSrc: [
          "'self'",
          "blob:",
          "data:",
          "https://upload.wikimedia.org",
          "https://thumb.wikimedia.org",
        ],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests:
          process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: 60000,
    keyGenerator: (req) =>
      process.env.NODE_ENV === "production" &&
      typeof req.headers["x-anki-ip"] === "string"
        ? req.headers["x-anki-ip"]
        : req.ip,
  });
  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof z.ZodError)
      return reply.code(400).send({
        error: "Please check the fields you entered.",
        fields: err.issues.map((i) => i.path.join(".")),
      });
    const status = err.statusCode || 500;
    if (status >= 500)
      req.log.error(
        { code: err.code || "internal", message: err.message?.slice(0, 200) },
        "request failed",
      );
    return reply.code(status).send({
      error:
        status >= 500
          ? "Service temporarily unavailable. Your saved data is safe."
          : err.message,
    });
  });
  const publicPaths = new Set([
    "/api/auth/register",
    "/api/auth/login",
    "/api/auth/recover",
    "/api/health",
  ]);
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.headers.origin && req.headers.origin !== origin)
        fail(403, "Unauthorized origin.");
      if (req.headers["x-anki-client"] !== "1") fail(403, "Invalid request.");
    }
    if (publicPaths.has(req.url.split("?")[0])) return;
    const token = req.cookies.anki_session;
    if (!token) fail(401, "Sign in to continue.");
    const session = db.get(
      "SELECT user_id FROM sessions WHERE token=? AND expires>?",
      hash(token),
      svc.now().toISOString(),
    );
    if (!session) fail(401, "Your session expired. Please sign in again.");
    req.userId = session.user_id;
  });
  app.addHook("onClose", async () => {
    db.db.close();
  });
  const setSession = (reply: any, userId: string) => {
    const token = randomBytes(32).toString("base64url");
    db.run("DELETE FROM sessions WHERE expires<=?", svc.now().toISOString());
    db.run(
      "INSERT INTO sessions VALUES(?,?,?)",
      hash(token),
      userId,
      new Date(+svc.now() + 30 * 86400000).toISOString(),
    );
    reply.setCookie("anki_session", token, {
      path: "/",
      httpOnly: true,
      secure: origin.startsWith("https:"),
      sameSite: "strict",
      maxAge: 30 * 86400,
    });
  };
  const authConfig = {
    config: { rateLimit: { max: 12, timeWindow: 15 * 60000 } },
  };
  const accountLimit = (login: string) => {
    const key = hash(login.toLowerCase().trim()),
      now = +svc.now(),
      prior = db.get(
        "SELECT started,count FROM auth_attempts WHERE key=?",
        key,
      );
    if (prior && now - prior.started < 15 * 60000) {
      if (prior.count >= 12)
        fail(
          429,
          "Too many attempts for this account. Try again in 15 minutes.",
        );
      db.run("UPDATE auth_attempts SET count=count+1 WHERE key=?", key);
    } else
      db.run("INSERT OR REPLACE INTO auth_attempts VALUES(?,?,1)", key, now);
    return key;
  };
  const password = z.string().min(10).max(200);
  app.get("/api/health", async () => ({
    ok: !!db.get("SELECT 1 ok"),
    service: "study-grove",
    schema: 1,
  }));
  app.post("/api/auth/register", authConfig, async (req, reply) => {
    const body = z
      .object({
        email: z.email().max(254),
        password,
        nickname: z.string().trim().min(2).max(30),
        nativeLang: z.string().min(2).max(12).default("en"),
        studyLang: z.string().min(2).max(12).default("en"),
        timezone: z.string().max(80).default("America/Sao_Paulo"),
      })
      .parse(req.body);
    try {
      new Intl.DateTimeFormat("en", { timeZone: body.timezone });
    } catch {
      fail(400, "Invalid time zone.");
    }
    if (db.get("SELECT id FROM users WHERE email=?", body.email.toLowerCase()))
      fail(409, "This email is already registered.");
    const userId = randomUUID(),
      p = await passwordHash(body.password),
      codes = Array.from({ length: 6 }, () => randomBytes(10).toString("hex"));
    const user: User = {
      id: userId,
      email: body.email.toLowerCase(),
      nickname: body.nickname,
      avatar: "🌱",
      nativeLang: body.nativeLang,
      studyLang: body.studyLang,
      timezone: body.timezone,
      dailyNew: 20,
      dailyReview: 200,
      theme: "system",
      createdAt: svc.now().toISOString(),
    };
    db.transaction(() => {
      db.run(
        "INSERT INTO users VALUES(?,?,?,?)",
        userId,
        user.email,
        p,
        JSON.stringify(user),
      );
      for (const c of codes)
        db.run("INSERT INTO recovery VALUES(?,?)", hash(c), userId);
      svc.ensureGoal(userId);
      svc.createDeck(userId, {
        name: "My first deck",
        language: user.studyLang,
        color: "#8058d8",
        icon: "🌱",
      });
    });
    setSession(reply, userId);
    svc.access(userId);
    return { user, recoveryCodes: codes };
  });
  // A fixed dummy scrypt hash keeps the no-account path comparable to a wrong password.
  const dummy = await passwordHash(randomBytes(24).toString("hex"));
  app.post("/api/auth/login", authConfig, async (req, reply) => {
    const body = z
      .object({ email: z.string().max(254), password: z.string().max(200) })
      .parse(req.body);
    const attemptKey = accountLimit(body.email);
    const row = db.get(
      "SELECT * FROM users WHERE email=?",
      body.email.toLowerCase().trim(),
    );
    const ok = await passwordMatches(body.password, row?.password || dummy);
    if (!row || !ok) fail(401, "Incorrect username or password.");
    db.run("DELETE FROM auth_attempts WHERE key=?", attemptKey);
    if (!row.password.startsWith("scrypt-v1$"))
      db.run(
        "UPDATE users SET password=? WHERE id=?",
        await passwordHash(body.password),
        row.id,
      );
    setSession(reply, row.id);
    svc.access(row.id);
    return { user: JSON.parse(row.data) };
  });
  app.post("/api/auth/recover", authConfig, async (req, reply) => {
    const body = z
      .object({
        email: z.string().max(254),
        code: z.string().max(100),
        password,
      })
      .parse(req.body);
    const row = db.get(
      "SELECT u.id FROM users u JOIN recovery r ON r.user_id=u.id WHERE u.email=? AND r.hash=?",
      body.email.toLowerCase().trim(),
      hash(body.code.trim().replace(/\s/g, "")),
    );
    if (!row) fail(400, "Invalid email or recovery code.");
    const p = await passwordHash(body.password);
    db.transaction(() => {
      db.run(
        "DELETE FROM recovery WHERE hash=?",
        hash(body.code.trim().replace(/\s/g, "")),
      );
      db.run("UPDATE users SET password=? WHERE id=?", p, row.id);
      db.run("DELETE FROM sessions WHERE user_id=?", row.id);
    });
    setSession(reply, row.id);
    svc.access(row.id);
    return { user: svc.user(row.id) };
  });
  app.post("/api/auth/logout", async (req, reply) => {
    if (req.cookies.anki_session)
      db.run(
        "DELETE FROM sessions WHERE token=?",
        hash(req.cookies.anki_session),
      );
    reply.clearCookie("anki_session", { path: "/" });
    return { ok: true };
  });
  app.post("/api/auth/recovery-codes", authConfig, async (req) => {
    const body = z.object({ password: z.string().max(200) }).parse(req.body);
    if (
      !(await passwordMatches(
        body.password,
        db.get("SELECT password FROM users WHERE id=?", req.userId).password,
      ))
    )
      fail(403, "Incorrect password.");
    const codes = Array.from({ length: 6 }, () =>
      randomBytes(10).toString("hex"),
    );
    db.transaction(() => {
      db.run("DELETE FROM recovery WHERE user_id=?", req.userId);
      for (const c of codes)
        db.run("INSERT INTO recovery VALUES(?,?)", hash(c), req.userId);
    });
    return { recoveryCodes: codes };
  });
  app.get("/api/state", async (req) => svc.snapshot(req.userId));
  app.post("/api/access", async (req) => {
    svc.access(req.userId);
    return { ok: true };
  });
  app.patch("/api/profile", async (req) => {
    const input = z
      .object({
        nickname: z.string().trim().min(2).max(30),
        avatar: z.string().min(1).max(12),
        nativeLang: z.string().min(2).max(12),
        studyLang: z.string().min(2).max(12),
        timezone: z.string().max(80),
        dailyNew: z.number().int().min(0).max(200),
        dailyReview: z.number().int().min(0).max(1000),
        theme: z.enum(["system", "light", "dark"]),
      })
      .parse(req.body);
    try {
      new Intl.DateTimeFormat("en", { timeZone: input.timezone });
    } catch {
      fail(400, "Invalid time zone.");
    }
    const user = { ...svc.user(req.userId), ...input };
    db.run(
      "UPDATE users SET data=? WHERE id=?",
      JSON.stringify(user),
      req.userId,
    );
    return user;
  });
  app.post(
    "/api/profile/photo",
    { config: { rateLimit: { max: 20, timeWindow: 3600000 } } },
    async (req) => {
      const { image } = z
        .object({ image: z.string().max(1400000) })
        .parse(req.body);
      return photos.save(req.userId, image);
    },
  );
  app.delete("/api/profile/photo", async (req) => photos.remove(req.userId));
  app.get<{ Params: { userId: string; photoId: string } }>(
    "/api/avatars/:userId/:photoId",
    async (req, reply) => {
      const owner = id.parse(req.params.userId),
        photoId = id.parse(req.params.photoId);
      const user = db.get("SELECT data FROM users WHERE id=?", owner);
      const asset = db.get(
        "SELECT data FROM assets WHERE id=? AND user_id=?",
        photoId,
        owner,
      );
      if (
        !user ||
        JSON.parse(user.data).avatarPhotoId !== photoId ||
        !asset ||
        JSON.parse(asset.data).kind !== "avatar"
      )
        fail(404, "Profile photo not found.");
      const path = join(dataDir, "media", photoId + ".webp");
      if (!existsSync(path)) fail(404, "Profile photo not found.");
      return reply.type("image/webp").send(createReadStream(path));
    },
  );
  app.post("/api/decks", async (req) => svc.createDeck(req.userId, req.body));
  app.patch<{ Params: { id: string } }>("/api/decks/:id", async (req) =>
    svc.editDeck(req.userId, req.params.id, req.body),
  );
  app.delete<{ Params: { id: string } }>("/api/decks/:id", async (req) => {
    svc.deleteDeck(req.userId, req.params.id);
    return { ok: true };
  });
  app.post("/api/mutations/word", async (req) => {
    const input = z
      .object({ id, mode: z.enum(["create", "edit"]), word: wordInput })
      .parse(req.body);
    const old = db.get("SELECT * FROM mutations WHERE id=?", input.id);
    if (old) {
      if (old.user_id !== req.userId) fail(409, "Identifier unavailable.");
      return JSON.parse(old.response);
    }
    return db.transaction(() => {
      const result =
        input.mode === "create"
          ? svc.createWord(req.userId, input.word)
          : svc.editWord(req.userId, id.parse(input.word.id), input.word);
      db.run(
        "INSERT INTO mutations VALUES(?,?,?)",
        input.id,
        req.userId,
        JSON.stringify(result),
      );
      return result;
    });
  });
  app.post("/api/words", async (req) =>
    db.transaction(() => svc.createWord(req.userId, req.body)),
  );
  app.patch<{ Params: { id: string } }>("/api/words/:id", async (req) =>
    db.transaction(() => svc.editWord(req.userId, req.params.id, req.body)),
  );
  app.delete<{ Params: { id: string } }>("/api/words/:id", async (req) => {
    svc.deleteWord(req.userId, req.params.id);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>(
    "/api/cards/:id/suspend",
    async (req) => {
      const body = z.object({ suspended: z.boolean() }).parse(req.body);
      const card = svc.owned<Card>("cards", req.params.id, req.userId);
      const next = {
        ...card,
        suspended: body.suspended,
        revision: card.revision + 1,
      };
      svc.save("cards", next);
      return next;
    },
  );
  app.get<{ Params: { id: string } }>("/api/cards/:id/history", async (req) => {
    svc.owned("cards", req.params.id, req.userId);
    return db
      .all(
        "SELECT data FROM reviews WHERE card_id=? AND user_id=? ORDER BY reviewed_at DESC",
        req.params.id,
        req.userId,
      )
      .map((r) => JSON.parse(r.data));
  });
  app.post("/api/reviews", async (req) => svc.review(req.userId, req.body));
  app.post("/api/import", async (req) => {
    const input = z
      .object({ id, words: z.array(wordInput).min(1).max(1000) })
      .parse(req.body);
    const prior = db.get("SELECT * FROM mutations WHERE id=?", input.id);
    if (prior) {
      if (prior.user_id !== req.userId) fail(409, "Identifier unavailable.");
      return JSON.parse(prior.response);
    }
    return db.transaction(() => {
      const created = input.words.map((w) =>
        svc.createWord(req.userId, { ...w, id: w.id || randomUUID() }),
      );
      const result = { imported: created.length };
      db.run(
        "INSERT INTO mutations VALUES(?,?,?)",
        input.id,
        req.userId,
        JSON.stringify(result),
      );
      return result;
    });
  });
  app.put("/api/goals", async (req) => {
    const goal = z
      .object({
        reviews: z.number().int().min(1).max(7000),
        days: z.number().int().min(1).max(7),
        words: z.number().int().min(0).max(1000),
      })
      .parse(req.body);
    const data = { ...goal, week: weekKey(svc.now()) };
    db.run(
      "INSERT OR REPLACE INTO goals VALUES(?,?,?)",
      req.userId,
      data.week,
      JSON.stringify(data),
    );
    return data;
  });
  app.get<{ Querystring: { q?: string } }>("/api/users", async (req) => {
    const q = (req.query.q || "").trim();
    if (q.length < 2) return [];
    return db.all(
      "SELECT id,json_extract(data,'$.nickname') nickname,json_extract(data,'$.avatar') avatar,json_extract(data,'$.avatarPhotoId') avatarPhotoId FROM users WHERE id<>? AND (json_extract(data,'$.nickname') LIKE ? ESCAPE '\\' OR id=?) LIMIT 20",
      req.userId,
      "%" + q.replace(/[\\%_]/g, "\\$&") + "%",
      q,
    );
  });
  app.get("/api/shared-decks", async () =>
    db.all(
      "SELECT d.id,json_extract(d.data,'$.name') name,json_extract(d.data,'$.language') language,json_extract(u.data,'$.nickname') owner,(SELECT COUNT(*) FROM words w WHERE w.deck_id=d.id AND w.deleted=0) words FROM decks d JOIN users u ON u.id=d.user_id WHERE d.deleted=0 AND json_extract(d.data,'$.shared')=1 LIMIT 200",
    ),
  );
  app.get("/api/battles", async (req) => svc.battles(req.userId));
  app.get("/api/challenges", async (req) => svc.challenges(req.userId));
  app.post("/api/challenges", async (req) => {
    const body = z.object({ id, guestId: id }).parse(req.body);
    return svc.inviteChallenge(req.userId, body.guestId, body.id);
  });
  app.post<{ Params: { id: string } }>(
    "/api/challenges/:id/respond",
    async (req) => {
      const body = z.object({ accept: z.boolean() }).parse(req.body);
      return svc.respondChallenge(
        req.userId,
        id.parse(req.params.id),
        body.accept,
      );
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/challenges/:id/cancel",
    async (req) => svc.cancelChallenge(req.userId, id.parse(req.params.id)),
  );
  app.post("/api/battles", async (req) => {
    const body = z.object({ id, guestId: id, deckId: id }).parse(req.body);
    return svc.invite(req.userId, body.guestId, body.deckId, body.id);
  });
  app.post<{ Params: { id: string } }>(
    "/api/battles/:id/respond",
    async (req) => {
      const body = z.object({ accept: z.boolean() }).parse(req.body),
        b = svc.battleRow(req.userId, req.params.id);
      if (b.guest_id !== req.userId)
        fail(403, "Only the invited person can accept.");
      if (b.status !== "invited")
        fail(409, "This invitation has already been answered or has expired.");
      db.run(
        "UPDATE battles SET status=? WHERE id=?",
        body.accept ? "active" : "declined",
        b.id,
      );
      return { ok: true };
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/battles/:id/ready",
    async (req) => {
      const b = svc.battleRow(req.userId, req.params.id);
      if (b.status !== "active") fail(409, "Accept the invitation to start.");
      db.run(
        "INSERT OR IGNORE INTO battle_ready VALUES(?,?)",
        b.id,
        req.userId,
      );
      return { ok: true };
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/battles/:id/question",
    async (req) => svc.nextQuestion(req.userId, req.params.id),
  );
  app.post<{ Params: { id: string } }>(
    "/api/battles/:id/answer",
    async (req) => {
      const body = z
        .object({ idx: z.number().int().min(0).max(9), choice: id.nullable() })
        .parse(req.body);
      return svc.answer(req.userId, req.params.id, body.idx, body.choice);
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/battles/:id/abandon",
    async (req) => {
      const b = svc.battleRow(req.userId, req.params.id);
      if (!["active", "invited"].includes(b.status))
        fail(409, "This battle has already ended.");
      db.run(
        "UPDATE battles SET status='abandoned',data=? WHERE id=?",
        JSON.stringify({
          ...b.info,
          winnerId: b.host_id === req.userId ? b.guest_id : b.host_id,
          abandonedBy: req.userId,
        }),
        b.id,
      );
      return { ok: true };
    },
  );
  app.post("/api/groups", async (req) => {
    const body = z
      .object({ name: z.string().trim().min(2).max(50) })
      .parse(req.body);
    if (
      db.get("SELECT COUNT(*) n FROM groups WHERE owner_id=?", req.userId).n >=
      20
    )
      fail(400, "You have reached the limit of 20 groups.");
    const group = {
      id: randomUUID(),
      name: body.name,
      code: randomBytes(8).toString("hex"),
    };
    db.transaction(() => {
      db.run(
        "INSERT INTO groups VALUES(?,?,?,?)",
        group.id,
        group.name,
        group.code,
        req.userId,
      );
      db.run("INSERT INTO members VALUES(?,?)", group.id, req.userId);
    });
    return group;
  });
  app.post("/api/groups/join", async (req) => {
    const body = z.object({ code: z.string().max(100) }).parse(req.body),
      g = db.get("SELECT id FROM groups WHERE code=?", body.code.trim());
    if (!g) fail(404, "Group code not found.");
    db.run("INSERT OR IGNORE INTO members VALUES(?,?)", g.id, req.userId);
    return { ok: true };
  });
  app.get<{ Params: { id: string }; Querystring: { period?: string } }>(
    "/api/groups/:id/ranking",
    async (req) => {
      if (
        !db.get(
          "SELECT user_id FROM members WHERE group_id=? AND user_id=?",
          req.params.id,
          req.userId,
        )
      )
        fail(404, "Group not found.");
      return svc.rank(
        req.query.period === "all" ? undefined : weekKey(svc.now()),
        req.params.id,
      );
    },
  );
  app.get<{ Querystring: { q: string; lang: string } }>(
    "/api/definitions",
    async (req) => {
      const q = z.string().trim().min(1).max(160).parse(req.query.q);
      return integrations.definitions(
        req.userId,
        q,
        z.string().max(12).parse(req.query.lang),
      );
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/words/:id/suggest",
    async (req) => {
      const body = z
        .object({ another: z.boolean().default(false) })
        .parse(req.body || {});
      return integrations.suggest(req.userId, req.params.id, body.another);
    },
  );
  app.get<{ Querystring: { q: string } }>("/api/images", async (req) =>
    integrations.images(
      req.userId,
      z.string().trim().min(1).max(160).parse(req.query.q),
    ),
  );
  app.post<{ Params: { id: string } }>("/api/words/:id/image", async (req) => {
    const body = z
      .object({
        pageId: z.number().int().positive(),
        version: z.number().int(),
      })
      .parse(req.body);
    return integrations.selectImage(
      req.userId,
      req.params.id,
      body.pageId,
      body.version,
    );
  });
  app.delete<{ Params: { id: string } }>(
    "/api/words/:id/image",
    async (req) => {
      const word = svc.owned<Word>("words", req.params.id, req.userId);
      const next = {
        ...word,
        imageId: null,
        imageCredit: null,
        version: word.version + 1,
      };
      svc.save("words", next);
      return next;
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/media/:id",
    { config: { rateLimit: { max: 1500, timeWindow: 60000 } } },
    async (req, reply) => {
      id.parse(req.params.id);
      if (
        !db.get(
          "SELECT id FROM assets WHERE id=? AND user_id=?",
          req.params.id,
          req.userId,
        )
      )
        fail(404, "Image not found.");
      const meta = JSON.parse(
        db.get(
          "SELECT data FROM assets WHERE id=? AND user_id=?",
          req.params.id,
          req.userId,
        ).data,
      );
      const filename = meta.filename || req.params.id + ".webp";
      if (filename.includes("/") || filename.includes(".."))
        fail(400, "Invalid file.");
      const path = join(dataDir, "media", filename);
      if (!existsSync(path)) fail(404, "Media unavailable.");
      return reply.type(meta.mime || "image/webp").send(createReadStream(path));
    },
  );
  const dist = resolve("dist");
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
  };
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith("/api/"))
      return reply.code(404).send({ error: "Route not found." });
    if (req.method !== "GET" && req.method !== "HEAD")
      return reply.code(405).send();
    let pathname: string;
    try {
      pathname = decodeURIComponent(req.url.split("?")[0]);
    } catch {
      return reply.code(400).send();
    }
    let path = resolve(dist, "." + pathname);
    if (!path.startsWith(dist + sep) && path !== dist)
      return reply.code(403).send();
    if (!existsSync(path) || !statSync(path).isFile())
      path = join(dist, "index.html");
    if (!existsSync(path))
      return reply
        .code(404)
        .send({ error: "Frontend not built yet. Run npm run dev." });
    reply.header(
      "Cache-Control",
      pathname.startsWith("/assets/")
        ? "public,max-age=31536000,immutable"
        : "no-cache",
    );
    return reply
      .type(types[extname(path)] || "application/octet-stream")
      .send(createReadStream(path));
  });
  return { app, svc, integrations };
}
