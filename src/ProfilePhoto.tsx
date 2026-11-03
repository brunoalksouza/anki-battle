import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { useApp } from "./context";
import { api, updateLocal } from "./offline";
import { Avatar, Button, ErrorText, Modal } from "./ui";
import type { User } from "../shared/model";

async function preparePhoto(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPEG, PNG, or WebP photo.");
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 10 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context || !side) throw new Error("Unable to prepare this photo.");
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      512,
      512,
    );
    return canvas.toDataURL("image/webp", 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function ProfilePhoto({ onClose }: { onClose: () => void }) {
  const { s, online, refresh, toast } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function choose(file?: File) {
    if (!file) return;
    setBusy("prepare");
    setError("");
    try {
      setPreview(await preparePhoto(file));
      setRemove(false);
    } catch (e) {
      setError(
        (e as Error).name === "EncodingError"
          ? "This image could not be opened. Choose a JPEG, PNG, or WebP photo."
          : (e as Error).message,
      );
    } finally {
      setBusy("");
    }
  }
  async function save() {
    setBusy("save");
    setError("");
    try {
      const user = await api<User>(
        "/profile/photo",
        remove ? "DELETE" : "POST",
        remove ? undefined : { image: preview },
      );
      await updateLocal(s.user.id, (local) => ({
        ...local,
        snapshot: { ...local.snapshot, user },
      }));
      await refresh();
      toast(remove ? "Profile photo removed." : "Profile photo updated.");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <Modal
      title="Change photo"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="photo-editor">
        <div className="photo-preview" aria-label="Profile photo preview">
          {preview && !remove ? (
            <img src={preview} alt="New profile photo preview" />
          ) : (
            <Avatar
              userId={s.user.id}
              photoId={remove ? null : s.user.avatarPhotoId}
              emoji={s.user.avatar}
              className="avatar-content"
            />
          )}
        </div>
        <p>
          {remove
            ? "Your emoji will replace your photo when you save."
            : "Choose a photo you like. This preview shows how it will appear to other players."}
        </p>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Choose a profile photo"
          hidden
          onChange={(e) => {
            void choose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button
          variant="secondary"
          busy={busy === "prepare"}
          disabled={!!busy || !online}
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={18} />
          Choose from gallery
        </Button>
        <small>JPEG, PNG, or WebP · up to 10 MB</small>
        {s.user.avatarPhotoId && !remove && (
          <button
            className="text-button danger-text"
            disabled={!!busy || !online}
            onClick={() => {
              setRemove(true);
              setPreview("");
              setError("");
            }}
          >
            Remove photo
          </button>
        )}
      </div>
      {!online && (
        <p className="muted">Connect to the internet to change your photo.</p>
      )}
      <ErrorText error={error} />
      <div className="modal-actions">
        <Button variant="secondary" disabled={!!busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          busy={busy === "save"}
          disabled={!!busy || !online || (!preview && !remove)}
          onClick={() => void save()}
        >
          {remove ? "Save changes" : "Save photo"}
        </Button>
      </div>
    </Modal>
  );
}
