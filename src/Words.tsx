import { useState, type FormEvent } from "react";
import {
  Plus,
  Search,
  SlidersHorizontal,
  ArrowUpRight,
  Upload,
  Download,
  ImagePlus,
  RefreshCw,
  Trash2,
  Edit3,
  History,
  Pause,
  Play,
  Check,
  ChevronLeft,
} from "lucide-react";
import Papa from "papaparse";
import { useApp } from "./context";
import {
  Button,
  Modal,
  Field,
  LanguageSelect,
  Empty,
  Highlight,
  Attribution,
  WordImage,
  WordAudio,
  ErrorText,
  langName,
  langFlag,
  fullDate,
} from "./ui";
import { colors, type Word, type Deck, type Credit } from "../shared/model";
import { api, exportFile } from "./offline";
export default function Words() {
  const { s, openWord, detail, online, refresh, toast } = useApp(),
    [query, setQuery] = useState(""),
    [deck, setDeck] = useState(""),
    [filter, setFilter] = useState("all"),
    [importing, setImporting] = useState(false);
  const list = s.words
    .filter(
      (w) =>
        (!deck || w.deckId === deck) &&
        `${w.term} ${w.meaning} ${w.tags.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .filter((w) => {
      const cs = s.cards.filter((c) => c.wordId === w.id);
      return (
        filter === "all" ||
        (filter === "pending" && w.sentenceStatus === "pending") ||
        (filter === "suspended" && cs.some((c) => c.suspended)) ||
        (filter === "due" &&
          cs.some(
            (c) => !c.suspended && +new Date(c.schedule.dueAt) <= Date.now(),
          ))
      );
    });
  function exportWords(format: "json" | "csv") {
    const words = list.map(({ id, version, imageId, ...w }) => w);
    if (format === "json")
      exportFile(
        "anki-battle-words.json",
        JSON.stringify(
          {
            format: "anki-battle-content-v1",
            exportedAt: new Date().toISOString(),
            words,
          },
          null,
          2,
        ),
      );
    else
      exportFile(
        "anki-battle-words.csv",
        Papa.unparse(
          words.map((w) => ({
            term: w.term,
            meaning: w.meaning,
            language: w.language,
            color: w.color,
            tags: w.tags.join(";"),
            sentence: w.sentence,
            translation: w.translation,
            kind: w.kind,
          })),
          { escapeFormulae: true },
        ),
        "text/csv;charset=utf-8",
      );
  }
  async function importFile(file: File) {
    setImporting(true);
    try {
      if (file.size > 2000000)
        throw new Error(
          "Import files up to 2 MB with no more than 1,000 words.",
        );
      const text = await file.text();
      let data: any[];
      if (file.name.toLowerCase().endsWith(".csv")) {
        const result = Papa.parse(text, { header: true, skipEmptyLines: true });
        if (result.errors.length)
          throw new Error("Invalid CSV: " + result.errors[0].message);
        data = result.data as any[];
      } else {
        const parsed = JSON.parse(text);
        data = Array.isArray(parsed) ? parsed : parsed.words;
      }
      if (!Array.isArray(data))
        throw new Error("The JSON must contain a words array.");
      const target = deck || s.decks[0]?.id;
      if (!target) throw new Error("Create a deck before importing.");
      const words = data.map((w) => ({
        ...w,
        id: crypto.randomUUID(),
        createdAt: undefined,
        deckId: target,
        language: w.language || s.user.studyLang,
        color: w.color || colors[0],
        tags: Array.isArray(w.tags)
          ? w.tags
          : String(w.tags || "")
              .split(";")
              .filter(Boolean),
        sentence: w.sentence || "",
        translation: w.translation || "",
        kind: w.kind || "basic",
      }));
      const r = await api("/import", "POST", {
        id: crypto.randomUUID(),
        words,
      });
      await refresh();
      toast(
        `${r.imported} words imported into ${s.decks.find((d) => d.id === target)?.name}.`,
      );
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setImporting(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR VOCABULARY, BROUGHT TO LIFE</span>
          <h1>A world of words.</h1>
          <p>
            {s.words.length} words and expressions. Each one, a new connection.
          </p>
        </div>
        <Button onClick={() => openWord()}>
          <Plus size={18} />
          New word
        </Button>
      </div>
      <div className="word-toolbar">
        <div className="search-input">
          <Search size={19} />
          <input
            aria-label="Search words"
            placeholder="Search word, meaning, or tag…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter by deck"
          value={deck}
          onChange={(e) => setDeck(e.target.value)}
        >
          <option value="">All decks</option>
          {s.decks.map((d) => (
            <option value={d.id} key={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="due">Due for review</option>
          <option value="pending">Example pending</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>
      <div className="words-summary">
        <span>
          {list.length} {list.length === 1 ? "word" : "words"}
        </span>
        <div>
          <label
            className={"text-button file-button " + (!online ? "disabled" : "")}
          >
            <Upload size={15} />
            {importing ? "Importing…" : "Import"}
            <input
              type="file"
              accept=".json,.csv"
              disabled={!online || importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = "";
              }}
            />
          </label>
          <button className="text-button" onClick={() => exportWords("json")}>
            <Download size={15} />
            JSON
          </button>
          <button className="text-button" onClick={() => exportWords("csv")}>
            CSV
          </button>
        </div>
      </div>
      <div className="word-list">
        {list.map((w) => (
          <button className="word-row" key={w.id} onClick={() => detail(w.id)}>
            <span
              className="word-initial"
              style={{
                background: w.color + "16",
                borderColor: w.color + "55",
              }}
            >
              {w.term.slice(0, 1).toUpperCase()}
            </span>
            <div className="word-text">
              <div>
                <h3>{w.term}</h3>
                <span>{langFlag(w.language)}</span>
              </div>
              <p>{w.meaning}</p>
              {w.tags.length > 0 && (
                <div className="tags">
                  {w.tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="word-meta">
              <span>{s.decks.find((d) => d.id === w.deckId)?.name}</span>
              <small>
                {w.sentenceStatus === "pending"
                  ? "Example pending"
                  : w.kind === "reverse"
                    ? "Basic + reverse"
                    : w.kind === "cloze"
                      ? "Cloze deletion"
                      : "Basic"}
              </small>
            </div>
            <ArrowUpRight size={18} className="muted" />
          </button>
        ))}
      </div>
      {!list.length && (
        <Empty
          title={query ? "No words found." : "Your collection starts here."}
          description={
            query
              ? "Try another search or adjust the filters."
              : "Words, expressions, and ideas worth remembering."
          }
          action={!query ? "Add word" : undefined}
          onAction={() => openWord()}
        />
      )}
      <p className="footnote">
        CSV/JSON import: term, meaning, language, color, tags, sentence,
        translation, kind. Files go into the selected deck, or the first deck.
        Content exports exclude media and review schedules.
      </p>
    </>
  );
}
export function WordEditor({
  wordId,
  onClose,
  onDone,
}: {
  wordId?: string;
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const { s, saveWord, online } = useApp(),
    existing = s.words.find((w) => w.id === wordId);
  const [word, setWord] = useState<Word>(
    existing || {
      id: crypto.randomUUID(),
      deckId: s.decks[0]?.id || "",
      term: "",
      meaning: "",
      language: s.user.studyLang,
      color: colors[0],
      tags: [],
      sentence: "",
      translation: "",
      kind: "basic",
      version: 0,
      createdAt: new Date().toISOString(),
      sentenceStatus: "pending",
      sentenceCredit: null,
      meaningCredit: null,
      imageId: null,
      imageCredit: null,
    },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [definitions, setDefinitions] = useState<any[]>([]),
    [looking, setLooking] = useState(false);
  const update = (p: Partial<Word>) => setWord((w) => ({ ...w, ...p }));
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await saveWord(word, !!existing);
      onDone(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function suggest() {
    setLooking(true);
    setError("");
    try {
      const r = await api(
        "/definitions?q=" +
          encodeURIComponent(word.term) +
          "&lang=" +
          word.language,
      );
      setDefinitions(r.definitions);
      if (r.notice) setError(r.notice);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLooking(false);
    }
  }
  return (
    <Modal title={existing ? "Edit word" : "A new word"} onClose={onClose}>
      <form onSubmit={save}>
        <div className="form-grid">
          <Field label="Word or expression">
            <input
              autoFocus
              required
              value={word.term}
              maxLength={160}
              onChange={(e) => update({ term: e.target.value })}
              placeholder="e.g. horse"
              dir="auto"
            />
          </Field>
          <Field label="Study language">
            <LanguageSelect
              value={word.language}
              onChange={(language) => update({ language })}
            />
          </Field>
        </div>
        <Field label="Meaning in English">
          <textarea
            required
            maxLength={1000}
            rows={2}
            value={word.meaning}
            onChange={(e) =>
              update({
                meaning: e.target.value,
                meaningCredit: word.meaningCredit
                  ? { ...word.meaningCredit, modified: true }
                  : null,
              })
            }
            placeholder="The meaning you want to learn, in English"
            dir="auto"
          />
        </Field>
        <Button
          type="button"
          variant="small secondary"
          busy={looking}
          disabled={!online || !word.term.trim()}
          onClick={suggest}
        >
          <Search size={15} />
          Suggest meaning
        </Button>
        {definitions.length > 0 && (
          <div className="definition-options">
            <small>Choose the meaning you want to study:</small>
            {definitions.map((d, i) => (
              <button
                type="button"
                key={i}
                onClick={() => {
                  update({
                    meaning: d.meaning,
                    meaningCredit: d.credit,
                    ...(d.example
                      ? { sentence: d.example, sentenceCredit: d.credit }
                      : {}),
                  });
                  setDefinitions([]);
                }}
              >
                <span>{d.part}</span>
                {d.meaning}
              </button>
            ))}
          </div>
        )}
        <div className="form-grid spaced">
          <Field label="Deck">
            <select
              required
              value={word.deckId}
              onChange={(e) => update({ deckId: e.target.value })}
            >
              {s.decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Card type">
            <select
              value={word.kind}
              onChange={(e) => update({ kind: e.target.value as Word["kind"] })}
            >
              <option value="basic">Basic</option>
              <option value="reverse">Basic + reverse</option>
              <option value="cloze">Cloze deletion</option>
            </select>
          </Field>
        </div>
        <Field
          label="Highlight color"
          hint="The word is also underlined. The same expression uses the same color."
        >
          <div className="color-options">
            {colors.map((c) => (
              <button
                type="button"
                aria-label={"Color " + c}
                aria-pressed={word.color === c}
                className={word.color === c ? "selected" : ""}
                key={c}
                style={{ background: c }}
                onClick={() => update({ color: c })}
              >
                {word.color === c && <Check size={16} />}
              </button>
            ))}
            <input
              aria-label="Custom color"
              type="color"
              value={word.color}
              onChange={(e) => update({ color: e.target.value })}
            />
          </div>
        </Field>
        <Field label="Tags" hint="Separate with commas, e.g. travel, objects">
          <input
            value={word.tags.join(", ")}
            onChange={(e) =>
              update({ tags: e.target.value.split(",").map((t) => t.trim()) })
            }
          />
        </Field>
        <details
          className="form-details"
          open={!!existing || word.kind === "cloze"}
        >
          <summary>Example and English explanation</summary>
          <Field label="Example sentence">
            <textarea
              value={word.sentence}
              onChange={(e) => update({ sentence: e.target.value })}
              maxLength={2000}
              rows={3}
            />
          </Field>
          <Field label="English explanation">
            <textarea
              value={word.translation}
              onChange={(e) => update({ translation: e.target.value })}
              maxLength={2000}
              rows={2}
            />
          </Field>
        </details>
        <div className="notice small">
          {online
            ? "Save without a sentence to find a free example. Check the meaning before studying."
            : "Offline: the word will be saved on this device; the example will stay pending."}
        </div>
        <ErrorText error={error} />
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy} disabled={!word.deckId}>
            Save word
            <Check size={16} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function DeckEditor({
  deckId,
  onClose,
}: {
  deckId?: string;
  onClose: () => void;
}) {
  const { s, online, refresh, toast } = useApp(),
    existing = s.decks.find((d) => d.id === deckId);
  const [form, setForm] = useState(
      existing || {
        id: crypto.randomUUID(),
        name: "",
        description: "",
        language: s.user.studyLang,
        color: colors[0],
        icon: "📘",
        shared: false,
        version: 0,
      },
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmDelete, setConfirmDelete] = useState(false);
  const update = (p: any) => setForm((f) => ({ ...f, ...p }));
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(
        existing ? "/decks/" + existing.id : "/decks",
        existing ? "PATCH" : "POST",
        form,
      );
      await refresh();
      onClose();
      toast("Deck saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api("/decks/" + deckId, "DELETE");
      await refresh();
      onClose();
      toast("Deck and cards removed. Your review history is kept.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={existing ? "Your deck" : "Create deck"} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Name">
          <input
            autoFocus
            required
            maxLength={80}
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="e.g. Everyday English"
          />
        </Field>
        <Field label="Description">
          <textarea
            maxLength={500}
            value={form.description}
            onChange={(e) => update({ description: e.target.value })}
            rows={2}
          />
        </Field>
        <div className="form-grid">
          <Field label="Language">
            <LanguageSelect
              value={form.language}
              onChange={(language) => update({ language })}
            />
          </Field>
          <Field label="Icon">
            <select
              value={form.icon}
              onChange={(e) => update({ icon: e.target.value })}
            >
              {["📘", "🌱", "🌍", "✈️", "☕", "💼", "🎧", "🧠", "🇬🇧", "🇯🇵"].map(
                (i) => (
                  <option key={i}>{i}</option>
                ),
              )}
            </select>
          </Field>
        </div>
        <Field label="Color">
          <input
            type="color"
            value={form.color}
            onChange={(e) => update({ color: e.target.value })}
          />
        </Field>
        <label className="check-field">
          <input
            type="checkbox"
            checked={form.shared}
            onChange={(e) => update({ shared: e.target.checked })}
          />
          <span>
            Allow this deck in battles
            <small>
              Your words and meanings may be used in questions for other
              players. Your review history stays private.
            </small>
          </span>
        </label>
        <ErrorText error={error} />
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy} disabled={!online} type="submit">
            Save deck
          </Button>
        </div>
      </form>
      {existing && (
        <div className="danger-zone">
          {confirmDelete ? (
            <>
              <p>Remove “{existing.name}” and all its cards?</p>
              <Button variant="danger" busy={busy} onClick={remove}>
                Confirm delete
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Keep deck
              </Button>
            </>
          ) : (
            <button
              className="text-button danger-text"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={15} />
              Delete deck
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
export function WordDetail({
  id,
  onClose,
  onEdit,
}: {
  id: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { s, online, refresh, toast } = useApp(),
    word = s.words.find((w) => w.id === id),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [images, setImages] = useState<any[] | null>(null),
    [selected, setSelected] = useState<any>(null),
    [query, setQuery] = useState(word?.term || ""),
    [history, setHistory] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  if (!word) return null;
  const cards = s.cards.filter((c) => c.wordId === id),
    records = s.reviews
      .filter((r) => cards.some((c) => c.id === r.cardId))
      .reverse();
  async function action(name: string, fn: () => Promise<any>) {
    setBusy(name);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <Modal title={word.term} onClose={onClose} wide={images !== null}>
      <div className="word-detail-meta">
        <span>
          {langFlag(word.language)} {langName(word.language)}
        </span>
        <span>{s.decks.find((d) => d.id === word.deckId)?.name}</span>
        <button className="text-button" onClick={onEdit}>
          <Edit3 size={15} />
          Edit
        </button>
      </div>
      <h3 className="word-meaning">{word.meaning}</h3>
      <Attribution credit={word.meaningCredit} />
      {word.sentence ? (
        <div className="sentence-box">
          <span className="eyebrow">IN CONTEXT</span>
          <blockquote dir="auto">
            <Highlight text={word.sentence} word={word} />
          </blockquote>
          {word.translation && (
            <details>
              <summary>Show English explanation</summary>
              <p>{word.translation}</p>
            </details>
          )}
          <Attribution credit={word.sentenceCredit} />
          <Attribution credit={word.translationCredit} />
          {word.sentenceStatus === "ready" && (
            <small>
              Example from a public source. Check that it uses the meaning you
              want.
            </small>
          )}
        </div>
      ) : (
        <div className="notice">
          Example pending. Your word is saved. Find an example or write your own
          in Edit.
        </div>
      )}
      <div className="detail-actions">
        <Button
          variant="secondary small"
          disabled={!online || !!busy}
          busy={busy === "sentence"}
          onClick={() =>
            action("sentence", async () => {
              const r = await api("/words/" + id + "/suggest", "POST", {
                another: !!word.sentence,
              });
              if (r.notice) toast(r.notice);
            })
          }
        >
          <RefreshCw size={16} />
          {word.sentence ? "Find another example" : "Find example"}
        </Button>
        <Button
          variant="secondary small"
          disabled={!online || !!busy}
          onClick={() => {
            setImages([]);
            setSelected(null);
          }}
        >
          <ImagePlus size={16} />
          {word.imageId ? "Replace image" : "Find image"}
        </Button>
        <button className="text-button" onClick={() => setHistory(!history)}>
          <History size={16} />
          History
        </button>
      </div>
      <WordImage word={word} user={s.user.id} />
      {word.extraImages?.map((imageId) => (
        <WordImage
          key={imageId}
          word={{ ...word, imageId, imageCredit: null }}
          user={s.user.id}
        />
      ))}
      <WordAudio word={word} user={s.user.id} />
      {word.imageId && (
        <button
          className="text-button danger-text"
          disabled={!online || !!busy}
          onClick={() =>
            action("image", () => api("/words/" + id + "/image", "DELETE"))
          }
        >
          <Trash2 size={14} />
          Remove image
        </button>
      )}
      {images !== null && (
        <section className="image-picker">
          <div className="section-head">
            <h3>An image to remember</h3>
            <button className="text-button" onClick={() => setImages(null)}>
              Close search
            </button>
          </div>
          <form
            className="image-search"
            onSubmit={(e) => {
              e.preventDefault();
              void action("search", async () => {
                setImages(await api("/images?q=" + encodeURIComponent(query)));
                setSelected(null);
              });
            }}
          >
            <input
              aria-label="Image search term"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              required
            />
            <Button type="submit" busy={busy === "search"}>
              <Search size={18} />
              Search
            </Button>
          </form>
          <p className="footnote">
            Results from Wikimedia Commons. Choose and confirm an image to add
            it.
          </p>
          <div className="image-grid">
            {images.map((img) => (
              <button
                key={img.pageId}
                className={selected?.pageId === img.pageId ? "selected" : ""}
                onClick={() => setSelected(img)}
              >
                <img src={img.url} alt={img.title} loading="lazy" />
                <small>{img.title}</small>
              </button>
            ))}
          </div>
          {selected && (
            <div className="image-selection">
              <img src={selected.url} alt={selected.title} />
              <Attribution credit={selected.credit} />
              <Button
                busy={busy === "select"}
                onClick={() =>
                  action("select", async () => {
                    await api("/words/" + id + "/image", "POST", {
                      pageId: selected.pageId,
                      version: word.version,
                    });
                    setImages(null);
                    setSelected(null);
                  })
                }
              >
                <Check size={17} />
                Use this image
              </Button>
            </div>
          )}
        </section>
      )}
      {history && (
        <section className="history">
          <h3>Building a memory</h3>
          {cards.map((c) => (
            <div className="history-card" key={c.id}>
              <div>
                <strong>
                  {c.direction === "reverse"
                    ? "Reverse card"
                    : c.direction === "cloze"
                      ? "Cloze"
                      : "Basic"}
                </strong>
                <small>
                  Next review: {fullDate(c.schedule.dueAt, s.user.timezone)}
                </small>
                <small>
                  {c.schedule.reps} reviews ·{" "}
                  {c.suspended ? "Suspended" : "Active"}
                </small>
              </div>
              <Button
                variant="secondary small"
                disabled={!online || !!busy}
                onClick={() =>
                  action("suspend", () =>
                    api("/cards/" + c.id + "/suspend", "POST", {
                      suspended: !c.suspended,
                    }),
                  )
                }
              >
                {c.suspended ? <Play size={15} /> : <Pause size={15} />}{" "}
                {c.suspended ? "Resume" : "Suspend"}
              </Button>
            </div>
          ))}
          {!records.length ? (
            <p>No reviews yet.</p>
          ) : (
            records.map((r) => (
              <div className="history-row" key={r.id}>
                <span>{fullDate(r.reviewedAt, s.user.timezone)}</span>
                <strong>
                  {["Again", "Hard", "Good", "Easy"][r.rating - 1]}
                </strong>
                <small>
                  {r.status === "applied"
                    ? "Saved"
                    : r.status === "pending"
                      ? "Pending"
                      : r.status === "imported"
                        ? "Imported"
                        : r.status === "conflict"
                          ? "Conflict saved"
                          : r.status}
                </small>
              </div>
            ))
          )}
        </section>
      )}
      <ErrorText error={error} />
      <div className="danger-zone">
        {confirmDelete ? (
          <>
            <p>Remove this word and its cards?</p>
            <Button
              variant="danger"
              disabled={!online}
              busy={busy === "delete"}
              onClick={() =>
                action("delete", async () => {
                  await api("/words/" + id, "DELETE");
                  onClose();
                })
              }
            >
              Confirm delete
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <button
            className="text-button danger-text"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={14} />
            Delete word
          </button>
        )}
      </div>
    </Modal>
  );
}
