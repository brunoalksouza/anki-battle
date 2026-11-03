import {
  randomBytes,
  randomUUID,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
  randomInt,
} from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import type { Store } from "./db";
import {
  dayKey,
  weekKey,
  normalizeAnswer,
  type User,
  type Word,
  type Card,
  type Deck,
  type ReviewAction,
  type Snapshot,
  type Day,
  type Battle,
} from "../shared/model";
import { newSchedule, reviewSchedule } from "../shared/scheduler";
import { cloze } from "../shared/text";
const scrypt = promisify(scryptCb);
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
let activeHashes = 0;
async function derive(password: string, salt: string) {
  if (activeHashes >= 2)
    fail(429, "Too many attempts. Please wait a few seconds.");
  activeHashes++;
  try {
    return await new Promise<Buffer>((resolve, reject) =>
      scryptCb(
        password,
        salt,
        32,
        { N: 65536, r: 8, p: 2, maxmem: 96 * 1024 * 1024 },
        (e, k) => (e ? reject(e) : resolve(k)),
      ),
    );
  } finally {
    activeHashes--;
  }
}
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return (
    "scrypt-v1$" + salt + "$" + (await derive(password, salt)).toString("hex")
  );
}
export async function passwordMatches(password: string, stored: string) {
  const match = /^scrypt-v1\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(stored);
  if (match)
    return timingSafeEqual(
      await derive(password, match[1]),
      Buffer.from(match[2], "hex"),
    );
  if (stored.startsWith("legacy-sha256:")) {
    const h = stored.slice(14);
    return (
      /^[a-f0-9]{64}$/.test(h) &&
      password.length === 32 &&
      timingSafeEqual(
        createHash("sha256").update(password).digest(),
        Buffer.from(h, "hex"),
      )
    );
  }
  const [salt, h] = stored.split(":");
  if (!salt || !h) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return (
    actual.length === Buffer.from(h, "hex").length &&
    timingSafeEqual(actual, Buffer.from(h, "hex"))
  );
}
export function fail(statusCode: number, message: string): never {
  throw Object.assign(new Error(message), { statusCode });
}
export const id = z.string().uuid();
const language = z.string().regex(/^[a-z]{2,3}(-[a-zA-Z]{2,8})?$/);
export const deckInput = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(""),
  language,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().max(8).default("📘"),
  shared: z.boolean().default(false),
  version: z.number().int().optional(),
});
const creditInput = z.object({
  source: z.string().max(100),
  url: z.url().refine((u) => u.startsWith("https://")),
  author: z.string().max(1000),
  license: z.string().max(100),
  licenseUrl: z.url().optional(),
  modified: z.boolean().optional(),
});
export const wordInput = z.object({
  id: id.optional(),
  deckId: id,
  term: z.string().trim().min(1).max(160),
  meaning: z.string().trim().min(1).max(1000),
  language,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  sentence: z.string().max(2000).default(""),
  translation: z.string().max(2000).default(""),
  kind: z.enum(["basic", "reverse", "cloze"]).default("basic"),
  version: z.number().int().optional(),
  createdAt: z.iso.datetime().optional(),
  sentenceCredit: creditInput.nullable().optional(),
  translationCredit: creditInput.nullable().optional(),
  meaningCredit: creditInput.nullable().optional(),
});
export const reviewInput = z.object({
  id,
  cardId: z.string().min(1).max(100),
  baseRevision: z.number().int().min(0),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  reviewedAt: z.iso.datetime(),
  activeMs: z.number().int().min(0).max(120000),
});
export class Service {
  constructor(
    public db: Store,
    public now: () => Date = () => new Date(),
  ) {}
  user(id: string): User {
    const r = this.db.get("SELECT data FROM users WHERE id=?", id);
    if (!r) fail(401, "Sign in again to continue.");
    return JSON.parse(r.data);
  }
  owned<T>(table: "decks" | "words" | "cards", id: string, user: string): T {
    const r = this.db.get(
      `SELECT data FROM ${table} WHERE id=? AND user_id=? AND deleted=0`,
      id,
      user,
    );
    if (!r) fail(404, "Content not found.");
    return JSON.parse(r.data);
  }
  list<T>(table: "decks" | "words" | "cards", user: string): T[] {
    return this.db
      .all(`SELECT data FROM ${table} WHERE user_id=? AND deleted=0`, user)
      .map((r) => JSON.parse(r.data));
  }
  save(table: "decks" | "words" | "cards", value: any) {
    this.db.run(
      `UPDATE ${table} SET data=? WHERE id=?`,
      JSON.stringify(value),
      value.id,
    );
  }
  ensureGoal(user: string) {
    const week = weekKey(this.now());
    if (
      !this.db.get(
        "SELECT week FROM goals WHERE user_id=? AND week=?",
        user,
        week,
      )
    ) {
      const prev = this.db.get(
        "SELECT data FROM goals WHERE user_id=? ORDER BY week DESC LIMIT 1",
        user,
      );
      const data = {
        ...(prev
          ? JSON.parse(prev.data)
          : { reviews: 100, days: 5, words: 20 }),
        week,
      };
      this.db.run(
        "INSERT INTO goals VALUES(?,?,?)",
        user,
        week,
        JSON.stringify(data),
      );
    }
  }
  access(user: string) {
    const u = this.user(user);
    this.db.run(
      "INSERT OR IGNORE INTO access VALUES(?,?)",
      user,
      dayKey(this.now(), u.timezone),
    );
    this.ensureGoal(user);
  }
  createDeck(user: string, input: unknown) {
    const d = deckInput.parse(input);
    const existing =
      d.id && this.db.get("SELECT * FROM decks WHERE id=?", d.id);
    if (existing) {
      if (existing.user_id !== user) fail(409, "Identifier unavailable.");
      return JSON.parse(existing.data);
    }
    if (this.list("decks", user).length >= 100)
      fail(400, "You have reached the limit of 100 decks.");
    const deck: Deck = {
      ...d,
      id: d.id || randomUUID(),
      version: 0,
      createdAt: this.now().toISOString(),
    };
    this.db.run(
      "INSERT INTO decks(id,user_id,data) VALUES(?,?,?)",
      deck.id,
      user,
      JSON.stringify(deck),
    );
    return deck;
  }
  editDeck(user: string, deckId: string, input: unknown) {
    const d = deckInput.parse(input),
      prev = this.owned<Deck>("decks", deckId, user);
    if (d.version !== prev.version)
      fail(409, "This deck changed on another device. Refresh before saving.");
    const next = { ...prev, ...d, id: deckId, version: prev.version + 1 };
    this.save("decks", next);
    return next;
  }
  deleteDeck(user: string, deckId: string) {
    this.owned("decks", deckId, user);
    this.db.transaction(() => {
      this.db.run(
        "UPDATE cards SET deleted=1 WHERE word_id IN(SELECT id FROM words WHERE deck_id=?) AND user_id=?",
        deckId,
        user,
      );
      this.db.run(
        "UPDATE words SET deleted=1 WHERE deck_id=? AND user_id=?",
        deckId,
        user,
      );
      this.db.run(
        "UPDATE decks SET deleted=1 WHERE id=? AND user_id=?",
        deckId,
        user,
      );
    });
  }
  wordCards(user: string, word: Word) {
    const dirs =
      word.kind === "reverse"
        ? ["forward", "reverse"]
        : word.kind === "cloze"
          ? ["cloze"]
          : ["forward"];
    const all = this.db.all(
      "SELECT * FROM cards WHERE word_id=? AND user_id=?",
      word.id,
      user,
    );
    for (const row of all) {
      const card: Card = JSON.parse(row.data);
      this.db.run(
        "UPDATE cards SET deleted=? WHERE id=?",
        dirs.includes(card.direction) ? 0 : 1,
        card.id,
      );
    }
    for (const direction of dirs) {
      const cardId = word.id + ":" + direction;
      if (!this.db.get("SELECT id FROM cards WHERE id=?", cardId)) {
        const card = {
          id: cardId,
          wordId: word.id,
          direction,
          schedule: newSchedule(cardId, new Date(word.createdAt)),
          revision: 0,
          suspended: false,
        };
        this.db.run(
          "INSERT INTO cards(id,user_id,word_id,data) VALUES(?,?,?,?)",
          cardId,
          user,
          word.id,
          JSON.stringify(card),
        );
      }
    }
  }
  createWord(user: string, input: unknown) {
    const w = wordInput.parse(input);
    this.owned("decks", w.deckId, user);
    const old = w.id && this.db.get("SELECT * FROM words WHERE id=?", w.id);
    if (old) {
      if (old.user_id !== user) fail(409, "Identifier unavailable.");
      if (old.deleted) fail(409, "This word was removed.");
      return JSON.parse(old.data) as Word;
    }
    if (this.list("words", user).length >= 20000)
      fail(400, "The limit of 20,000 words per account has been reached.");
    const matching = this.list<Word>("words", user).find(
      (x) =>
        x.language === w.language &&
        normalizeAnswer(x.term) === normalizeAnswer(w.term),
    );
    if (
      w.createdAt &&
      (+new Date(w.createdAt) > +this.now() + 60000 ||
        +new Date(w.createdAt) < +this.now() - 90 * 86400000)
    )
      fail(400, "Word date is outside the allowed range.");
    const word: Word = {
      ...w,
      color: matching?.color || w.color,
      id: w.id || randomUUID(),
      version: 0,
      createdAt: w.createdAt || this.now().toISOString(),
      sentenceStatus: w.sentence ? "manual" : "pending",
      sentenceCredit: w.sentenceCredit || null,
      meaningCredit: w.meaningCredit || null,
      imageId: null,
      imageCredit: null,
    };
    this.db.run(
      "INSERT INTO words(id,user_id,deck_id,data) VALUES(?,?,?,?)",
      word.id,
      user,
      word.deckId,
      JSON.stringify(word),
    );
    this.wordCards(user, word);
    return word;
  }
  editWord(user: string, wordId: string, input: unknown) {
    const w = wordInput.parse(input),
      prev = this.owned<Word>("words", wordId, user);
    this.owned("decks", w.deckId, user);
    if (w.version !== prev.version)
      fail(
        409,
        "This word changed on another device. Your draft is saved; compare the versions before replacing it.",
      );
    const changed =
      prev.term !== w.term ||
      prev.meaning !== w.meaning ||
      prev.language !== w.language;
    const next: Word = {
      ...prev,
      ...w,
      createdAt: prev.createdAt,
      id: wordId,
      version: prev.version + 1,
      sentenceStatus: w.sentence ? "manual" : "pending",
      sentenceCredit:
        w.sentenceCredit === undefined
          ? w.sentence === prev.sentence
            ? prev.sentenceCredit
            : prev.sentenceCredit
              ? { ...prev.sentenceCredit, modified: true }
              : null
          : w.sentenceCredit,
    };
    if (prev.translationCredit && w.translation !== prev.translation)
      next.translationCredit = { ...prev.translationCredit, modified: true };
    if (prev.source?.needsMeaning && w.meaning !== prev.meaning) {
      next.source = { ...prev.source, needsMeaning: false };
      next.tags = next.tags.filter((t) => t !== "significado-visual");
    }
    if (changed && w.sentence === prev.sentence) {
      next.sentenceStatus = "pending";
      next.sentence = "";
      next.translation = "";
      next.sentenceCredit = null;
      next.translationCredit = null;
    }
    this.save("words", next);
    this.db.run("UPDATE words SET deck_id=? WHERE id=?", next.deckId, next.id);
    this.wordCards(user, next);
    for (const other of this.list<Word>("words", user)) {
      if (
        other.id !== next.id &&
        other.language === next.language &&
        normalizeAnswer(other.term) === normalizeAnswer(next.term) &&
        other.color !== next.color
      ) {
        this.save("words", {
          ...other,
          color: next.color,
          version: other.version + 1,
        });
      }
    }
    return next;
  }
  deleteWord(user: string, wordId: string) {
    this.owned("words", wordId, user);
    this.db.transaction(() => {
      this.db.run("UPDATE words SET deleted=1 WHERE id=?", wordId);
      this.db.run("UPDATE cards SET deleted=1 WHERE word_id=?", wordId);
    });
  }
  review(user: string, input: unknown) {
    const action = reviewInput.parse(input);
    return this.db.transaction(() => {
      const existing = this.db.get(
        "SELECT user_id,data FROM reviews WHERE id=?",
        action.id,
      );
      if (existing) {
        if (existing.user_id !== user) fail(409, "Identifier unavailable.");
        return { ...JSON.parse(existing.data), duplicate: true };
      }
      const card = this.owned<Card>("cards", action.cardId, user),
        u = this.user(user),
        now = this.now(),
        at = new Date(action.reviewedAt);
      if (
        at.getTime() > now.getTime() + 60000 ||
        at.getTime() < now.getTime() - 90 * 86400000
      )
        fail(400, "Review date is outside the allowed range (90 days).");
      const date = at > now ? now : at,
        day = dayKey(date, u.timezone),
        utcDay = dayKey(date),
        week = weekKey(date);
      const stale = action.baseRevision !== card.revision;
      const due =
        new Date(card.schedule.dueAt).getTime() <= date.getTime() + 1000;
      const chronological =
        !card.schedule.lastReviewAt ||
        new Date(card.schedule.lastReviewAt) <= date;
      const status = stale
        ? "conflict"
        : card.suspended
          ? "suspended"
          : !chronological
            ? "conflict"
            : !due
              ? "early"
              : "applied";
      let points = 0;
      let next = card.schedule;
      if (status === "applied") {
        const newToday = this.db.get(
          `SELECT COUNT(*) n FROM reviews WHERE user_id=? AND local_day=? AND status='applied' AND json_extract(data,'$.before.reps')=0`,
          user,
          day,
        ).n;
        const reviewToday = this.db.get(
          `SELECT COUNT(*) n FROM reviews WHERE user_id=? AND local_day=? AND status='applied' AND json_extract(data,'$.before.reps')>0`,
          user,
          day,
        ).n;
        if (
          (card.schedule.reps === 0 && newToday >= u.dailyNew) ||
          (card.schedule.reps > 0 && reviewToday >= u.dailyReview)
        )
          fail(
            409,
            "Daily limit reached. The review is saved on this device; increase your limit in Profile to sync it.",
          );
        const result = reviewSchedule(card.schedule, action.rating, date);
        next = result.schedule;
        this.save("cards", {
          ...card,
          schedule: next,
          revision: card.revision + 1,
        });
        // Same reward for every rating. One reward per word/day, max 100/day;
        // historical offline reviews cannot alter a closed competitive week.
        const pointId = `review:${user}:${card.wordId}:${utcDay}`;
        const count = this.db.get(
          "SELECT COUNT(*) n FROM points WHERE user_id=? AND day=? AND reason='review'",
          user,
          utcDay,
        ).n;
        if (
          action.activeMs >= 2000 &&
          count < 100 &&
          week === weekKey(now) &&
          !this.db.get("SELECT id FROM points WHERE id=?", pointId)
        ) {
          points = 5;
          this.db.run(
            "INSERT INTO points VALUES(?,?,?,?,?,?)",
            pointId,
            user,
            week,
            utcDay,
            points,
            "review",
          );
        }
      }
      const record = {
        ...action,
        reviewedAt: date.toISOString(),
        localDay: day,
        timezone: u.timezone,
        status,
        points,
        before: card.schedule,
        after: next,
      };
      this.db.run(
        "INSERT INTO reviews VALUES(?,?,?,?,?,?,?,?,?,?)",
        action.id,
        user,
        card.id,
        date.toISOString(),
        day,
        week,
        status,
        status === "applied" ? action.activeMs : 0,
        points,
        JSON.stringify(record),
      );
      return record;
    });
  }
  rank(week?: string, group?: string) {
    let sql = `SELECT u.id,json_extract(u.data,'$.nickname') nickname,json_extract(u.data,'$.avatar') avatar,COALESCE(SUM(p.amount),0) points FROM users u LEFT JOIN points p ON p.user_id=u.id`;
    const args: string[] = [];
    if (week) {
      sql += " AND p.week=?";
      args.push(week);
    }
    if (group) {
      sql += " WHERE u.id IN (SELECT user_id FROM members WHERE group_id=?)";
      args.push(group);
    }
    sql += " GROUP BY u.id ORDER BY points DESC,nickname COLLATE NOCASE,u.id";
    return this.db.all(sql, ...args).map((r, i) => ({ ...r, rank: i + 1 }));
  }
  snapshot(user: string): Snapshot {
    this.ensureGoal(user);
    const u = this.user(user),
      words = this.list<Word>("words", user),
      reviews = this.db
        .all(
          "SELECT data FROM reviews WHERE user_id=? ORDER BY reviewed_at",
          user,
        )
        .map((r) => JSON.parse(r.data));
    const byDay = new Map<string, Day>();
    const get = (day: string) => {
      if (!byDay.has(day))
        byDay.set(day, {
          day,
          reviews: 0,
          activeMs: 0,
          words: 0,
          access: false,
          selfRatings: [0, 0, 0, 0],
          objectiveCorrect: 0,
          objectiveTotal: 0,
        });
      return byDay.get(day)!;
    };
    for (const r of reviews) {
      if (["applied", "imported"].includes(r.status)) {
        const d = get(r.localDay);
        d.reviews++;
        d.activeMs += r.activeMs;
        d.selfRatings[r.rating - 1]++;
      }
    }
    // Count creation events even after a word is deleted; these are historical metrics.
    for (const r of this.db.all(
      "SELECT data FROM words WHERE user_id=?",
      user,
    )) {
      const w = JSON.parse(r.data);
      get(dayKey(w.createdAt, u.timezone)).words++;
    }
    for (const a of this.db.all("SELECT day FROM access WHERE user_id=?", user))
      get(a.day).access = true;
    for (const a of this.db.all(
      "SELECT answered_at,correct FROM answers WHERE user_id=? AND answered_at IS NOT NULL",
      user,
    )) {
      const d = get(dayKey(a.answered_at, u.timezone));
      d.objectiveTotal++;
      d.objectiveCorrect += a.correct;
    }
    const all = this.rank(),
      weekly = this.rank(weekKey(this.now()));
    return {
      user: u,
      decks: this.list("decks", user),
      words,
      cards: this.list("cards", user),
      reviews,
      days: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
      goals: this.db
        .all("SELECT data FROM goals WHERE user_id=? ORDER BY week", user)
        .map((r) => JSON.parse(r.data)),
      rankings: { all, weekly },
      battles: this.battles(user),
      groups: this.db
        .all(
          "SELECT g.*, (SELECT COUNT(*) FROM members m WHERE m.group_id=g.id) members FROM groups g JOIN members m ON m.group_id=g.id WHERE m.user_id=?",
          user,
        )
        .map(({ owner_id, ...g }) => g),
      now: this.now().toISOString(),
      integrations: {
        sentences: "Tatoeba + Free Dictionary (free)",
        images: "Wikimedia Commons",
      },
      points: all.find((r) => r.id === user)?.points || 0,
    };
  }
  battleRow(user: string, battleId: string) {
    const b = this.db.get(
      "SELECT * FROM battles WHERE id=? AND (host_id=? OR guest_id=?)",
      battleId,
      user,
      user,
    );
    if (!b) fail(404, "Battle not found.");
    const data = JSON.parse(b.data);
    if (
      ["invited", "active"].includes(b.status) &&
      new Date(data.expiresAt) <= this.now()
    ) {
      b.status = "expired";
      this.db.run("UPDATE battles SET status='expired' WHERE id=?", battleId);
    }
    return { ...b, info: data };
  }
  battles(user: string): Battle[] {
    return this.db
      .all(
        "SELECT id FROM battles WHERE host_id=? OR guest_id=? ORDER BY rowid DESC LIMIT 100",
        user,
        user,
      )
      .map(({ id }) => {
        const b = this.battleRow(user, id),
          h = this.user(b.host_id),
          g = this.user(b.guest_id);
        const stat = (u: string) =>
          this.db.get(
            "SELECT COUNT(answered_at) answered,COALESCE(SUM(correct),0) correct,COALESCE(SUM(CASE WHEN correct=1 THEN elapsed ELSE 0 END),0) elapsed FROM answers WHERE battle_id=? AND user_id=?",
            id,
            u,
          );
        const hs = stat(h.id),
          gs = stat(g.id);
        return {
          ...b.info,
          id,
          status: b.status,
          hostId: h.id,
          guestId: g.id,
          hostName: h.nickname,
          guestName: g.nickname,
          hostAvatar: h.avatar,
          guestAvatar: g.avatar,
          hostCorrect: hs.correct,
          guestCorrect: gs.correct,
          hostTime: hs.elapsed,
          guestTime: gs.elapsed,
          myAnswered: user === h.id ? hs.answered : gs.answered,
        };
      });
  }
  invite(user: string, guest: string, deckId: string, invitationId: string) {
    if (guest === user) fail(400, "Choose another person to challenge.");
    this.user(guest);
    const existing = this.db.get(
      "SELECT * FROM battles WHERE id=?",
      invitationId,
    );
    if (existing) {
      if (existing.host_id !== user) fail(409, "Identifier unavailable.");
      return { id: invitationId };
    }
    if (
      this.db.get(
        "SELECT COUNT(*) n FROM battles WHERE host_id=? AND status IN ('invited','active')",
        user,
      ).n >= 10
    )
      fail(429, "You already have 10 open challenges.");
    const row = this.db.get(
      "SELECT data FROM decks WHERE id=? AND deleted=0",
      deckId,
    );
    if (!row) fail(404, "Deck not found.");
    const deck: Deck = JSON.parse(row.data);
    if (!deck.shared) fail(403, "The owner must enable this deck for battles.");
    const words: Word[] = this.db
      .all("SELECT data FROM words WHERE deck_id=? AND deleted=0", deckId)
      .map((r) => JSON.parse(r.data));
    const terms = new Set<string>(),
      meanings = new Set<string>();
    const pool = words
      .filter((w) => !w.source?.needsMeaning)
      .filter((w) => {
        const t = normalizeAnswer(w.term),
          m = normalizeAnswer(w.meaning);
        if (terms.has(t) || meanings.has(m)) return false;
        terms.add(t);
        meanings.add(m);
        return true;
      });
    if (pool.length < 4)
      fail(400, "The deck needs at least 4 distinct words and meanings.");
    const shuffle = <T>(a: T[]) => {
      const b = [...a];
      for (let i = b.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [b[i], b[j]] = [b[j], b[i]];
      }
      return b;
    };
    const chosen = shuffle(pool).slice(0, 10),
      now = this.now(),
      info = {
        createdAt: now.toISOString(),
        expiresAt: new Date(+now + 48 * 3600000).toISOString(),
        deckName: deck.name,
        deckId,
        rounds: chosen.length,
        winnerId: null,
      };
    this.db.transaction(() => {
      this.db.run(
        "INSERT INTO battles VALUES(?,?,?,?,?)",
        invitationId,
        user,
        guest,
        "invited",
        JSON.stringify(info),
      );
      chosen.forEach((w, i) => {
        const options = shuffle([
          w,
          ...shuffle(pool.filter((p) => p.id !== w.id)).slice(0, 3),
        ]).map((x) => ({
          id: randomUUID(),
          text: x.meaning,
          correct: x.id === w.id,
        }));
        const round = {
          prompt: w.term,
          language: w.language,
          options: options.map(({ id, text }) => ({ id, text })),
          answer: options.find((x) => x.correct)!.id,
        };
        this.db.run(
          "INSERT INTO rounds VALUES(?,?,?)",
          invitationId,
          i,
          JSON.stringify(round),
        );
      });
    });
    return { id: invitationId };
  }
  nextQuestion(user: string, battleId: string) {
    const b = this.battleRow(user, battleId);
    if (b.status !== "active") return { status: b.status };
    const ready = this.db.get(
      "SELECT user_id FROM battle_ready WHERE battle_id=? AND user_id=?",
      battleId,
      user,
    );
    if (!ready)
      return {
        status: "preparation",
        deckName: b.info.deckName,
        rounds: b.info.rounds,
      };
    const idx = this.db.get(
      "SELECT COUNT(*) n FROM answers WHERE battle_id=? AND user_id=? AND answered_at IS NOT NULL",
      battleId,
      user,
    ).n;
    if (idx >= b.info.rounds) return { status: "waiting" };
    const round = JSON.parse(
      this.db.get(
        "SELECT data FROM rounds WHERE battle_id=? AND idx=?",
        battleId,
        idx,
      ).data,
    );
    this.db.run(
      "INSERT OR IGNORE INTO answers(battle_id,user_id,idx,served_at) VALUES(?,?,?,?)",
      battleId,
      user,
      idx,
      this.now().toISOString(),
    );
    const answer = this.db.get(
      "SELECT served_at FROM answers WHERE battle_id=? AND user_id=? AND idx=?",
      battleId,
      user,
      idx,
    );
    return {
      status: "question",
      idx,
      total: b.info.rounds,
      prompt: round.prompt,
      language: round.language,
      options: round.options,
      deadline: new Date(+new Date(answer.served_at) + 60000).toISOString(),
      serverTime: this.now().toISOString(),
    };
  }
  answer(user: string, battleId: string, idx: number, choice: string | null) {
    return this.db.transaction(() => {
      const b = this.battleRow(user, battleId),
        a = this.db.get(
          "SELECT * FROM answers WHERE battle_id=? AND user_id=? AND idx=?",
          battleId,
          user,
          idx,
        );
      if (!a) fail(409, "Open this round before answering.");
      const round = JSON.parse(
        this.db.get(
          "SELECT data FROM rounds WHERE battle_id=? AND idx=?",
          battleId,
          idx,
        ).data,
      );
      if (a.answered_at)
        return { correct: !!a.correct, answer: round.answer, duplicate: true };
      if (b.status !== "active") fail(409, "This battle has already ended.");
      if (choice !== null && !round.options.some((o: any) => o.id === choice))
        fail(400, "Invalid answer option.");
      const elapsed = Math.max(0, +this.now() - +new Date(a.served_at)),
        correct = elapsed <= 60000 && choice === round.answer;
      this.db.run(
        "UPDATE answers SET answered_at=?,correct=?,elapsed=?,choice=? WHERE battle_id=? AND user_id=? AND idx=?",
        this.now().toISOString(),
        correct ? 1 : 0,
        Math.min(60000, elapsed),
        choice,
        battleId,
        user,
        idx,
      );
      const answered = this.db.get(
        "SELECT COUNT(*) n FROM answers WHERE battle_id=? AND answered_at IS NOT NULL",
        battleId,
      ).n;
      if (answered === b.info.rounds * 2) {
        const results = this.db.all(
          "SELECT user_id,SUM(correct) correct,SUM(CASE WHEN correct=1 THEN elapsed ELSE 0 END) time FROM answers WHERE battle_id=? GROUP BY user_id ORDER BY correct DESC,time ASC",
          battleId,
        );
        const tie =
          results[0].correct === results[1].correct &&
          Math.floor(results[0].time / 1000) ===
            Math.floor(results[1].time / 1000);
        const winner = tie ? null : results[0].user_id;
        this.db.run(
          "UPDATE battles SET status='completed',data=? WHERE id=?",
          JSON.stringify({
            ...b.info,
            winnerId: winner,
            completedAt: this.now().toISOString(),
          }),
          battleId,
        );
        const week = weekKey(this.now()),
          day = dayKey(this.now());
        for (const result of results) {
          const opponent =
            result.user_id === b.host_id ? b.guest_id : b.host_id;
          const key = `battle:${result.user_id}:${opponent}:${week}`;
          const daily = this.db.get(
            "SELECT COUNT(*) n FROM points WHERE user_id=? AND day=? AND reason='battle'",
            result.user_id,
            day,
          ).n;
          if (result.correct > 0 && daily < 3)
            this.db.run(
              "INSERT OR IGNORE INTO points VALUES(?,?,?,?,?,?)",
              key,
              result.user_id,
              week,
              day,
              result.user_id === winner ? 20 : 10,
              "battle",
            );
        }
      }
      return { correct, answer: round.answer, expired: elapsed > 60000 };
    });
  }
}
