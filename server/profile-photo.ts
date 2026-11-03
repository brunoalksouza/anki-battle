import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { Service, fail } from "./service";

export class ProfilePhotos {
  constructor(
    private svc: Service,
    private dataDir: string,
  ) {}

  private removeAsset(userId: string, photoId?: string | null) {
    if (!photoId) return;
    const asset = this.svc.db.get(
      "SELECT data FROM assets WHERE id=? AND user_id=?",
      photoId,
      userId,
    );
    if (!asset || JSON.parse(asset.data).kind !== "avatar") return;
    this.svc.db.run(
      "DELETE FROM assets WHERE id=? AND user_id=?",
      photoId,
      userId,
    );
    try {
      rmSync(join(this.dataDir, "media", photoId + ".webp"), { force: true });
    } catch {
      // The revoked file is inaccessible; cleanup must not undo a successful save.
      console.warn("An old profile photo could not be removed from disk.");
    }
  }

  async save(userId: string, image: string) {
    const match =
      /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
        image,
      );
    if (!match) fail(400, "Choose a JPEG, PNG, or WebP photo.");
    const bytes = Buffer.from(match[1], "base64");
    if (!bytes.length || bytes.length > 1024 * 1024)
      fail(400, "This photo is too large. Choose a smaller image.");
    let photo: Buffer;
    try {
      const image = sharp(bytes, {
        limitInputPixels: 16000000,
        failOn: "warning",
      });
      const meta = await image.metadata();
      if (
        !meta.format ||
        !["jpeg", "png", "webp"].includes(meta.format) ||
        (meta.pages || 1) > 1
      )
        fail(400, "Choose a still JPEG, PNG, or WebP photo.");
      // Auto-orient, crop to match the preview and discard location/EXIF data.
      photo = await image
        .rotate()
        .resize(512, 512, { fit: "cover", position: "centre" })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      fail(
        400,
        "This image could not be opened. Choose a JPEG, PNG, or WebP photo.",
      );
    }
    const photoId = randomUUID(),
      path = join(this.dataDir, "media", photoId + ".webp");
    mkdirSync(join(this.dataDir, "media"), { recursive: true, mode: 0o700 });
    writeFileSync(path, photo!, { mode: 0o600 });
    let previous: string | null | undefined;
    try {
      const user = this.svc.db.transaction(() => {
        const current = this.svc.user(userId);
        previous = current.avatarPhotoId;
        const next = { ...current, avatarPhotoId: photoId };
        this.svc.db.run(
          "INSERT INTO assets VALUES(?,?,?)",
          photoId,
          userId,
          JSON.stringify({
            kind: "avatar",
            filename: photoId + ".webp",
            mime: "image/webp",
          }),
        );
        this.svc.db.run(
          "UPDATE users SET data=? WHERE id=?",
          JSON.stringify(next),
          userId,
        );
        return next;
      });
      this.removeAsset(userId, previous);
      return user;
    } catch (error) {
      // Only remove the new file if the database never committed it.
      if (!this.svc.db.get("SELECT id FROM assets WHERE id=?", photoId))
        rmSync(path, { force: true });
      throw error;
    }
  }

  remove(userId: string) {
    let previous: string | null | undefined;
    const user = this.svc.db.transaction(() => {
      const current = this.svc.user(userId);
      previous = current.avatarPhotoId;
      const next = { ...current, avatarPhotoId: null };
      this.svc.db.run(
        "UPDATE users SET data=? WHERE id=?",
        JSON.stringify(next),
        userId,
      );
      return next;
    });
    this.removeAsset(userId, previous);
    return user;
  }
}
