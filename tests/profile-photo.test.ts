import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { buildApp } from "../server/app";

const folder = mkdtempSync(join(tmpdir(), "anki-photos-"));
const { app, svc } = await buildApp({
  dbPath: join(folder, "test.sqlite"),
  dataDir: folder,
  origin: "https://photo.test",
});
const headers = { origin: "https://photo.test", "x-anki-client": "1" };
const request = (
  path: string,
  cookie = "",
  method: any = "GET",
  payload?: any,
) =>
  app.inject({
    url: "/api" + path,
    method,
    headers: { ...headers, cookie },
    payload,
  });
async function register(nickname: string) {
  const r = await request("/auth/register", "", "POST", {
    nickname,
    email: nickname.toLowerCase() + "@photo.test",
    password: "test-photo-password-1234",
  });
  assert.equal(r.statusCode, 200);
  return {
    ...r.json().user,
    cookie: r.headers["set-cookie"]!.toString().split(";")[0],
  };
}
const alice = await register("Alice"),
  bob = await register("Bob");
const image =
  "data:image/jpeg;base64," +
  (
    await sharp({
      create: { width: 900, height: 600, channels: 3, background: "#75a182" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
  ).toString("base64");
after(async () => {
  await app.close();
  rmSync(folder, { recursive: true, force: true });
});

test("gallery photo is normalized, persisted and shared only with signed-in players", async () => {
  assert.equal(
    (await request("/profile/photo", "", "POST", { image })).statusCode,
    401,
  );
  const saved = await request("/profile/photo", alice.cookie, "POST", {
    image,
  });
  assert.equal(saved.statusCode, 200);
  const photo = saved.json().avatarPhotoId;
  const url = `/avatars/${alice.id}/${photo}`;
  assert.equal(svc.user(alice.id).avatarPhotoId, photo);
  assert.equal(svc.rank().find((u) => u.id === alice.id)!.avatarPhotoId, photo);
  assert.equal(
    (await request("/users?q=Alice", bob.cookie)).json()[0].avatarPhotoId,
    photo,
  );
  assert.equal((await request(url)).statusCode, 401);
  const served = await request(url, bob.cookie);
  assert.equal(served.statusCode, 200);
  assert.equal(served.headers["content-type"], "image/webp");
  assert.equal(served.headers["cache-control"], "no-store");
  const meta = await sharp(served.rawPayload).metadata();
  assert.equal(meta.width, 512);
  assert.equal(meta.height, 512);
  assert.equal(meta.exif, undefined);
  assert.equal(meta.orientation, undefined);
  assert.equal(
    (await request(`/avatars/${bob.id}/${photo}`, bob.cookie)).statusCode,
    404,
  );
  assert.equal((await request(`/media/${photo}`, bob.cookie)).statusCode, 404);
  const stale = await request("/profile", alice.cookie, "PATCH", {
    ...svc.user(alice.id),
    nickname: "Alice updated",
    avatarPhotoId: null,
  });
  assert.equal(stale.statusCode, 200);
  assert.equal(svc.user(alice.id).avatarPhotoId, photo);
});

test("invalid photos preserve the current photo and cannot expose private media", async () => {
  const previous = svc.user(alice.id).avatarPhotoId;
  for (const invalid of [
    "data:image/svg+xml;base64," +
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
      ).toString("base64"),
    "data:image/png;base64," + Buffer.from("not an image").toString("base64"),
    "data:image/jpeg;base64," +
      Buffer.alloc(1024 * 1024 + 1).toString("base64"),
  ]) {
    assert.equal(
      (
        await request("/profile/photo", alice.cookie, "POST", {
          image: invalid,
        })
      ).statusCode,
      400,
    );
    assert.equal(svc.user(alice.id).avatarPhotoId, previous);
  }
  const privateId = randomUUID();
  writeFileSync(
    join(folder, "media", privateId + ".webp"),
    "private card image",
  );
  svc.db.run(
    "INSERT INTO assets VALUES(?,?,?)",
    privateId,
    alice.id,
    JSON.stringify({ filename: privateId + ".webp", mime: "image/webp" }),
  );
  assert.equal(
    (await request(`/avatars/${alice.id}/${privateId}`, bob.cookie)).statusCode,
    404,
  );
  assert.equal(
    (
      await request("/profile", bob.cookie, "PATCH", {
        ...svc.user(bob.id),
        avatarPhotoId: privateId,
      })
    ).statusCode,
    200,
  );
  assert.equal(svc.user(bob.id).avatarPhotoId, undefined);
});

test("replacing and removing a photo revokes old URLs without changing another account", async () => {
  const old = svc.user(alice.id).avatarPhotoId;
  const bobPhoto = (
    await request("/profile/photo", bob.cookie, "POST", { image })
  ).json().avatarPhotoId;
  const next = await request("/profile/photo", alice.cookie, "POST", { image });
  assert.equal(next.statusCode, 200);
  const photo = next.json().avatarPhotoId;
  assert.notEqual(photo, old);
  assert(!existsSync(join(folder, "media", old + ".webp")));
  assert.equal(
    (await request(`/avatars/${alice.id}/${old}`, alice.cookie)).statusCode,
    404,
  );
  const removed = await request("/profile/photo", alice.cookie, "DELETE");
  assert.equal(removed.statusCode, 200);
  assert.equal(removed.json().avatarPhotoId, null);
  assert(!existsSync(join(folder, "media", photo + ".webp")));
  assert.equal(
    (await request(`/avatars/${alice.id}/${photo}`, bob.cookie)).statusCode,
    404,
  );
  assert.equal(svc.user(bob.id).avatarPhotoId, bobPhoto);
  assert.equal(
    (await request(`/avatars/${bob.id}/${bobPhoto}`, alice.cookie)).statusCode,
    200,
  );
  assert.equal(
    svc.db.get("SELECT COUNT(*) n FROM assets WHERE user_id=?", alice.id).n,
    1,
  );
});
