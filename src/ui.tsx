import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, LoaderCircle, ArrowRight, Plus, BookOpen } from "lucide-react";
import { termRanges } from "../shared/text";
import { languages, type Credit, type Word } from "../shared/model";
import { mediaUrl, profilePhotoUrl } from "./offline";
import { useApp } from "./context";
export function Avatar({
  userId,
  photoId,
  emoji,
  className = "avatar",
}: {
  userId: string;
  photoId?: string | null;
  emoji: string;
  className?: string;
}) {
  const { s } = useApp();
  const [photo, setPhoto] = useState({ id: "", url: "" });
  useEffect(() => {
    let disposed = false,
      url = "";
    if (photoId)
      void profilePhotoUrl(s.user.id, userId, photoId).then((next) => {
        url = next;
        if (disposed) {
          if (url.startsWith("blob:")) URL.revokeObjectURL(url);
        } else setPhoto({ id: photoId, url });
      });
    return () => {
      disposed = true;
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, [s.user.id, userId, photoId]);
  const url = photo.id === photoId ? photo.url : "";
  return (
    <span className={className} aria-hidden="true">
      {url ? (
        <img src={url} alt="" onError={() => setPhoto({ id: "", url: "" })} />
      ) : (
        emoji
      )}
    </span>
  );
}
export const langName = (code: string) =>
  languages.find((l) => l.code === code)?.name || code;
export const langFlag = (code: string) =>
  languages.find((l) => l.code === code)?.flag || "🌐";
export const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);
export const shortDate = (s: string) =>
  new Date(s).toLocaleDateString("en-US", { day: "numeric", month: "short" });
export const fullDate = (s: string, tz?: string) =>
  new Date(s).toLocaleString("en-US", {
    timeZone: tz,
    dateStyle: "short",
    timeStyle: "short",
  });
export function interval(date: string) {
  const min = Math.max(1, Math.round((+new Date(date) - Date.now()) / 60000));
  return min < 60
    ? `${min} min`
    : min < 1440
      ? `${Math.round(min / 60)} h`
      : `${Math.round(min / 1440)} d`;
}
export function Button({
  children,
  busy = false,
  variant = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: string;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`button ${variant} ${props.className || ""}`}
    >
      {busy ? <LoaderCircle size={17} className="spin" /> : null}
      {children}
    </button>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    const cancel = (e: Event) => {
      e.preventDefault();
      closeRef.current();
    };
    el.addEventListener("cancel", cancel);
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      el.removeEventListener("cancel", cancel);
      el.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={"modal " + (wide ? "wide" : "")}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-head">
        <h2 id="modal-title">{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close">
          <X size={22} />
        </button>
      </div>
      <div className="modal-content">{children}</div>
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function LanguageSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {languages.map((l) => (
        <option value={l.code} key={l.code}>
          {l.flag} {l.name}
        </option>
      ))}
    </select>
  );
}
export function Empty({
  title,
  description,
  action,
  onAction,
  icon,
}: {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon || <BookOpen size={30} />}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <Button onClick={onAction}>
          <Plus size={18} />
          {action}
        </Button>
      )}
    </div>
  );
}
export function Progress({
  value,
  max,
  color = "var(--accent)",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
    >
      <span
        style={{
          width: `${Math.min(100, max ? (value / max) * 100 : 100)}%`,
          background: color,
        }}
      />
    </div>
  );
}
export function Highlight({
  text,
  word,
  words,
}: {
  text: string;
  word?: Word;
  words?: Word[];
}) {
  const terms = word ? [word] : words || [];
  const matches = terms
    .flatMap((w) =>
      termRanges(text, w.term, w.language).map((r) => ({ ...r, w })),
    )
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  let pos = 0;
  const parts: ReactNode[] = [];
  for (const r of matches) {
    if (r.start < pos) continue;
    parts.push(text.slice(pos, r.start));
    parts.push(
      <mark
        key={r.start}
        style={{
          backgroundColor: r.w.color + "22",
          borderBottomColor: r.w.color,
        }}
      >
        {text.slice(r.start, r.end)}
      </mark>,
    );
    pos = r.end;
  }
  parts.push(text.slice(pos));
  return <>{parts}</>;
}
export function Attribution({ credit }: { credit: Credit | null | undefined }) {
  if (!credit) return null;
  return (
    <p className="attribution">
      <a href={credit.url} target="_blank" rel="noreferrer">
        {credit.source}
      </a>{" "}
      · {credit.author} ·{" "}
      {credit.licenseUrl ? (
        <a href={credit.licenseUrl} target="_blank" rel="noreferrer">
          {credit.license}
        </a>
      ) : (
        credit.license
      )}
      {credit.modified ? " · adapted" : ""}
    </p>
  );
}
export function WordImage({ word, user }: { word: Word; user: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let disposed = false,
      objectUrl = "";
    if (word.imageId)
      void mediaUrl(user, word.imageId).then((u) => {
        objectUrl = u;
        if (!disposed) setUrl(u);
      });
    return () => {
      disposed = true;
      if (objectUrl.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
    };
  }, [word.imageId, user]);
  return word.imageId ? (
    <figure className="word-image">
      {url && (
        <img src={url} alt={`Image chosen for ${word.term}`} loading="lazy" />
      )}
      <Attribution credit={word.imageCredit} />
    </figure>
  ) : null;
}
export function SectionHead({
  title,
  action,
  onAction,
  extra,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {action && (
        <button className="text-button" onClick={onAction}>
          {action}
          <ArrowRight size={15} />
        </button>
      )}
      {extra}
    </div>
  );
}
export function ErrorText({ error }: { error: string }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}

export function WordAudio({ word, user }: { word: Word; user: string }) {
  return (
    <>
      {word.audio?.map((a) => (
        <AudioAsset key={a.id} id={a.id} user={user} />
      ))}
    </>
  );
}
function AudioAsset({ id, user }: { id: string; user: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true,
      u = "";
    void mediaUrl(user, id).then((x) => {
      u = x;
      if (live) setUrl(x);
    });
    return () => {
      live = false;
      if (u.startsWith("blob:")) URL.revokeObjectURL(u);
    };
  }, [id, user]);
  return (
    <div className="word-audio">
      <small>Audio from your original deck</small>
      {url && <audio src={url} controls preload="none" />}
    </div>
  );
}
