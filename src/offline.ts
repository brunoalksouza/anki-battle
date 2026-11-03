import { openDB } from "idb";
import { newSchedule, reviewSchedule } from "../shared/scheduler";
import {
  dayKey,
  type Snapshot,
  type Word,
  type ReviewAction,
  type Card,
} from "../shared/model";
export type Pending = {
  id: string;
  kind: "create" | "edit" | "review";
  word?: Word;
  review?: ReviewAction;
  error?: string;
};
export type Local = {
  snapshot: Snapshot;
  downloaded: string[];
  pending: Pending[];
  lastSync: string;
};
const dbPromise = openDB("anki-battle-v1", 1, {
  upgrade(db) {
    db.createObjectStore("accounts");
    db.createObjectStore("media");
  },
});
export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch("/api" + path, {
    method,
    headers: {
      "X-Anki-Client": "1",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    signal: AbortSignal.timeout(25000),
  });
  const data = await res.json();
  if (!res.ok)
    throw new APIError(
      res.status,
      data.error || "Could not complete the request.",
    );
  return data;
}
export const activeId = () => localStorage.getItem("anki-active-account");
export const setActive = (id: string) =>
  localStorage.setItem("anki-active-account", id);
export const loadLocal = async (id: string) =>
  (await (await dbPromise).get("accounts", id)) as Local | undefined;
export const saveLocal = async (local: Local) => {
  await (await dbPromise).put("accounts", local, local.snapshot.user.id);
  window.dispatchEvent(new Event("anki-local"));
};
export async function updateLocal(id: string, fn: (local: Local) => Local) {
  const db = await dbPromise,
    tx = db.transaction("accounts", "readwrite"),
    local = (await tx.store.get(id)) as Local | undefined;
  if (!local) throw new Error("Local account unavailable.");
  const next = fn(local);
  await tx.store.put(next, id);
  await tx.done;
  window.dispatchEvent(new Event("anki-local"));
  return next;
}
export async function clearLocal(id: string) {
  const db = await dbPromise;
  await db.delete("accounts", id);
  const keys = await db.getAllKeys("media");
  for (const key of keys)
    if (String(key).startsWith(id + ":")) await db.delete("media", key);
  localStorage.removeItem("anki-active-account");
}
export async function mediaUrl(user: string, id: string) {
  const blob = await (await dbPromise).get("media", `${user}:${id}`);
  return blob ? URL.createObjectURL(blob) : "/api/media/" + id;
}
export async function profilePhotoUrl(
  viewer: string,
  owner: string,
  photo: string,
) {
  const path = `/api/avatars/${owner}/${photo}`;
  const key = `${viewer}:avatar:${owner}:${photo}`;
  try {
    const db = await dbPromise;
    const cached = await db.get("media", key);
    if (cached) return URL.createObjectURL(cached);
    const res = await fetch(path, {
      credentials: "same-origin",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return "";
    const blob = await res.blob();
    try {
      await db.put("media", blob, key);
    } catch {
      /* A full device must not prevent displaying an online photo. */
    }
    return URL.createObjectURL(blob);
  } catch {
    return navigator.onLine ? path : "";
  }
}
export async function downloadDeck(local: Local, deckId: string) {
  const db = await dbPromise;
  const words = local.snapshot.words.filter((w) => w.deckId === deckId);
  for (const w of words) {
    for (const assetId of [
      w.imageId,
      ...(w.extraImages || []),
      ...(w.audio || []).map((a) => a.id),
    ].filter(Boolean)) {
      const res = await fetch("/api/media/" + assetId, {
        credentials: "same-origin",
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok)
        throw new Error(
          "A media file could not be downloaded. Wait a moment and download the deck again.",
        );
      await db.put(
        "media",
        await res.blob(),
        local.snapshot.user.id + ":" + assetId,
      );
    }
  }
  const latest = await updateLocal(local.snapshot.user.id, (l) => ({
    ...l,
    downloaded: [...new Set([...l.downloaded, deckId])],
  }));
  try {
    await navigator.storage.persist();
  } catch {
    /* Browsers may decline persistent storage. */
  }
  return latest;
}
export function overlay(snapshot: Snapshot, pending: Pending[]): Snapshot {
  const s = structuredClone(snapshot);
  for (const p of pending) {
    if (p.word) {
      const word = p.word,
        idx = s.words.findIndex((w) => w.id === word.id);
      if (idx < 0) s.words.push(word);
      else s.words[idx] = word;
      const dirs =
        word.kind === "reverse"
          ? ["forward", "reverse"]
          : word.kind === "cloze"
            ? ["cloze"]
            : ["forward"];
      s.cards = s.cards.filter(
        (c) => c.wordId !== word.id || dirs.includes(c.direction),
      );
      for (const d of dirs) {
        const cardId = word.id + ":" + d;
        if (!s.cards.some((c) => c.id === cardId))
          s.cards.push({
            id: cardId,
            wordId: word.id,
            direction: d as Card["direction"],
            revision: 0,
            suspended: false,
            schedule: newSchedule(cardId, new Date(word.createdAt)),
          });
      }
    }
    if (p.review) {
      const r = p.review,
        c = s.cards.find((c) => c.id === r.cardId);
      if (c && c.revision === r.baseRevision) {
        c.schedule = reviewSchedule(
          c.schedule,
          r.rating,
          new Date(r.reviewedAt),
        ).schedule;
        c.revision++;
      }
      if (!s.reviews.some((x) => x.id === r.id))
        s.reviews.push({
          ...r,
          status: "pending",
          points: 0,
          localDay: dayKey(r.reviewedAt, s.user.timezone),
        });
    }
  }
  return s;
}
const syncing = new Map<string, Promise<Local>>();
export function syncAccount(id: string) {
  const current = syncing.get(id);
  if (current) return current;
  const run = async () => {
    if (!(await loadLocal(id))) throw new Error("Local data not found.");
    // Check identity before sending any private queued action.
    const identity = await api<Snapshot>("/state");
    if (identity.user.id !== id)
      throw new APIError(
        401,
        "Sign in to the original account to sync these reviews.",
      );
    for (;;) {
      const pending = (await loadLocal(id))!.pending.filter((p) => !p.error);
      for (const p of pending) {
        try {
          if (p.kind === "review") await api("/reviews", "POST", p.review);
          else
            await api("/mutations/word", "POST", {
              id: p.id,
              mode: p.kind,
              word: p.word,
            });
          await updateLocal(id, (l) => ({
            ...l,
            pending: l.pending.filter((x) => x.id !== p.id),
          }));
        } catch (e) {
          if (e instanceof APIError && e.status !== 401 && e.status < 500) {
            await updateLocal(id, (l) => ({
              ...l,
              pending: l.pending.map((x) =>
                x.id === p.id ? { ...x, error: e.message } : x,
              ),
            }));
          } else throw e;
        }
      }
      const snapshot = await api<Snapshot>("/state");
      if (snapshot.user.id !== id)
        throw new APIError(401, "The account changed. Please sign in again.");
      const latest = await updateLocal(id, (l) => ({
        ...l,
        snapshot,
        lastSync: new Date().toISOString(),
      }));
      // Include edits added while the previous requests were in flight.
      if (!latest.pending.some((p) => !p.error)) return latest;
    }
  };
  const promise = (
    navigator.locks ? navigator.locks.request("anki-sync-" + id, run) : run()
  ).finally(() => {
    syncing.delete(id);
  });
  syncing.set(id, promise);
  return promise;
}
export async function enqueue(id: string, pending: Pending) {
  return updateLocal(id, (l) => ({ ...l, pending: [...l.pending, pending] }));
}
export function exportFile(
  name: string,
  content: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
