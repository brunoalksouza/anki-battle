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
        "anki-battle-palavras.json",
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
        "anki-battle-palavras.csv",
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
          "Importe arquivos de até 2 MB, com no máximo 1.000 palavras.",
        );
      const text = await file.text();
      let data: any[];
      if (file.name.toLowerCase().endsWith(".csv")) {
        const result = Papa.parse(text, { header: true, skipEmptyLines: true });
        if (result.errors.length)
          throw new Error("CSV inválido: " + result.errors[0].message);
        data = result.data as any[];
      } else {
        const parsed = JSON.parse(text);
        data = Array.isArray(parsed) ? parsed : parsed.words;
      }
      if (!Array.isArray(data))
        throw new Error("O JSON precisa conter uma lista words.");
      const target = deck || s.decks[0]?.id;
      if (!target) throw new Error("Crie um baralho antes de importar.");
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
        `${r.imported} palavras importadas para ${s.decks.find((d) => d.id === target)?.name}.`,
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
          <span className="eyebrow">SEU VOCABULÁRIO, GANHANDO VIDA</span>
          <h1>Um mundo de palavras.</h1>
          <p>
            {s.words.length} palavras e expressões. Cada uma, uma nova conexão.
          </p>
        </div>
        <Button onClick={() => openWord()}>
          <Plus size={18} />
          Nova palavra
        </Button>
      </div>
      <div className="word-toolbar">
        <div className="search-input">
          <Search size={19} />
          <input
            aria-label="Pesquisar palavras"
            placeholder="Buscar palavra, significado ou tag…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Filtrar baralho"
          value={deck}
          onChange={(e) => setDeck(e.target.value)}
        >
          <option value="">Todos os baralhos</option>
          {s.decks.map((d) => (
            <option value={d.id} key={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar estado"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Todos os estados</option>
          <option value="due">Para revisar</option>
          <option value="pending">Frase pendente</option>
          <option value="suspended">Suspensos</option>
        </select>
      </div>
      <div className="words-summary">
        <span>
          {list.length} {list.length === 1 ? "palavra" : "palavras"}
        </span>
        <div>
          <label
            className={"text-button file-button " + (!online ? "disabled" : "")}
          >
            <Upload size={15} />
            {importing ? "Importando…" : "Importar"}
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
                  ? "Frase pendente"
                  : w.kind === "reverse"
                    ? "Frente + inverso"
                    : w.kind === "cloze"
                      ? "Completar lacuna"
                      : "Frente e verso"}
              </small>
            </div>
            <ArrowUpRight size={18} className="muted" />
          </button>
        ))}
      </div>
      {!list.length && (
        <Empty
          title={
            query ? "Nenhuma palavra encontrada." : "Sua coleção começa aqui."
          }
          description={
            query
              ? "Tente outro termo ou ajuste os filtros."
              : "Palavras, expressões e ideias que você quer guardar."
          }
          action={!query ? "Adicionar palavra" : undefined}
          onAction={() => openWord()}
        />
      )}
      <p className="footnote">
        Importação CSV/JSON: term, meaning, language, color, tags, sentence,
        translation, kind. Os arquivos entram no baralho selecionado (ou no
        primeiro). A exportação de conteúdo não inclui mídia nem agendamento.
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
    <Modal
      title={existing ? "Editar palavra" : "Uma nova palavra"}
      onClose={onClose}
    >
      <form onSubmit={save}>
        <div className="form-grid">
          <Field label="Palavra ou expressão">
            <input
              autoFocus
              required
              value={word.term}
              maxLength={160}
              onChange={(e) => update({ term: e.target.value })}
              placeholder="Ex.: horse"
              dir="auto"
            />
          </Field>
          <Field label="Idioma estudado">
            <LanguageSelect
              value={word.language}
              onChange={(language) => update({ language })}
            />
          </Field>
        </div>
        <Field label="Significado ou tradução">
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
            placeholder="O sentido que você quer aprender"
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
          Sugerir significado
        </Button>
        {definitions.length > 0 && (
          <div className="definition-options">
            <small>Escolha o sentido que você quer estudar:</small>
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
          <Field label="Baralho">
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
          <Field label="Tipo de card">
            <select
              value={word.kind}
              onChange={(e) => update({ kind: e.target.value as Word["kind"] })}
            >
              <option value="basic">Frente e verso</option>
              <option value="reverse">Frente e verso + inverso</option>
              <option value="cloze">Completar lacuna</option>
            </select>
          </Field>
        </div>
        <Field
          label="Cor de destaque"
          hint="A palavra também recebe sublinhado. A cor é compartilhada por ocorrências da mesma expressão."
        >
          <div className="color-options">
            {colors.map((c) => (
              <button
                type="button"
                aria-label={"Cor " + c}
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
              aria-label="Cor personalizada"
              type="color"
              value={word.color}
              onChange={(e) => update({ color: e.target.value })}
            />
          </div>
        </Field>
        <Field label="Tags" hint="Separe por vírgula. Ex.: viagem, objetos">
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
          <summary>Frase e tradução</summary>
          <Field label="Frase de exemplo">
            <textarea
              value={word.sentence}
              onChange={(e) => update({ sentence: e.target.value })}
              maxLength={2000}
              rows={3}
            />
          </Field>
          <Field label="Tradução da frase">
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
            ? "Ao salvar sem frase, vamos buscar um exemplo real gratuito. Confira o sentido antes de estudar."
            : "Sem conexão: a palavra ficará salva neste aparelho e a frase pendente."}
        </div>
        <ErrorText error={error} />
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" busy={busy} disabled={!word.deckId}>
            Salvar palavra
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
      toast("Baralho salvo.");
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
      toast("Baralho e cards removidos. O histórico permanece guardado.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={existing ? "Seu baralho" : "Criar baralho"} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Nome">
          <input
            autoFocus
            required
            maxLength={80}
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="Ex.: Inglês para a vida"
          />
        </Field>
        <Field label="Descrição">
          <textarea
            maxLength={500}
            value={form.description}
            onChange={(e) => update({ description: e.target.value })}
            rows={2}
          />
        </Field>
        <div className="form-grid">
          <Field label="Idioma">
            <LanguageSelect
              value={form.language}
              onChange={(language) => update({ language })}
            />
          </Field>
          <Field label="Ícone">
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
        <Field label="Cor">
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
            Autorizar este baralho para batalhas
            <small>
              Suas palavras e significados poderão compor perguntas para outras
              pessoas. Seu histórico continua privado.
            </small>
          </span>
        </label>
        <ErrorText error={error} />
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button busy={busy} disabled={!online} type="submit">
            Salvar baralho
          </Button>
        </div>
      </form>
      {existing && (
        <div className="danger-zone">
          {confirmDelete ? (
            <>
              <p>Remover “{existing.name}” e todos os seus cards?</p>
              <Button variant="danger" busy={busy} onClick={remove}>
                Confirmar exclusão
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Manter baralho
              </Button>
            </>
          ) : (
            <button
              className="text-button danger-text"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={15} />
              Excluir baralho
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
          Editar
        </button>
      </div>
      <h3 className="word-meaning">{word.meaning}</h3>
      <Attribution credit={word.meaningCredit} />
      {word.sentence ? (
        <div className="sentence-box">
          <span className="eyebrow">EM CONTEXTO</span>
          <blockquote dir="auto">
            <Highlight text={word.sentence} word={word} />
          </blockquote>
          {word.translation && (
            <details>
              <summary>Ver tradução</summary>
              <p>{word.translation}</p>
            </details>
          )}
          <Attribution credit={word.sentenceCredit} />
          <Attribution credit={word.translationCredit} />
          {word.sentenceStatus === "ready" && (
            <small>
              Exemplo de uma fonte pública. Confira o sentido da expressão.
            </small>
          )}
        </div>
      ) : (
        <div className="notice">
          Frase pendente. A palavra já está salva. Busque um exemplo ou escreva
          sua frase em Editar.
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
          {word.sentence ? "Buscar outra frase" : "Buscar frase"}
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
          {word.imageId ? "Substituir imagem" : "Buscar imagem"}
        </Button>
        <button className="text-button" onClick={() => setHistory(!history)}>
          <History size={16} />
          Histórico
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
          Remover imagem
        </button>
      )}
      {images !== null && (
        <section className="image-picker">
          <div className="section-head">
            <h3>Uma imagem para lembrar</h3>
            <button className="text-button" onClick={() => setImages(null)}>
              Fechar busca
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
              aria-label="Termo da busca de imagens"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              required
            />
            <Button type="submit" busy={busy === "search"}>
              <Search size={18} />
              Buscar
            </Button>
          </form>
          <p className="footnote">
            Resultados do Wikimedia Commons. A imagem só será associada depois
            da sua confirmação.
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
                Usar esta imagem
              </Button>
            </div>
          )}
        </section>
      )}
      {history && (
        <section className="history">
          <h3>Uma memória em construção</h3>
          {cards.map((c) => (
            <div className="history-card" key={c.id}>
              <div>
                <strong>
                  {c.direction === "reverse"
                    ? "Card inverso"
                    : c.direction === "cloze"
                      ? "Lacuna"
                      : "Frente e verso"}
                </strong>
                <small>
                  Próxima revisão: {fullDate(c.schedule.dueAt, s.user.timezone)}
                </small>
                <small>
                  {c.schedule.reps} revisões ·{" "}
                  {c.suspended ? "Suspenso" : "Ativo"}
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
                {c.suspended ? "Retomar" : "Suspender"}
              </Button>
            </div>
          ))}
          {!records.length ? (
            <p>Ainda sem revisões.</p>
          ) : (
            records.map((r) => (
              <div className="history-row" key={r.id}>
                <span>{fullDate(r.reviewedAt, s.user.timezone)}</span>
                <strong>
                  {["Errei", "Difícil", "Bom", "Fácil"][r.rating - 1]}
                </strong>
                <small>
                  {r.status === "applied"
                    ? "Salva"
                    : r.status === "pending"
                      ? "Pendente"
                      : r.status === "imported"
                        ? "Importada"
                        : r.status === "conflict"
                          ? "Conflito preservado"
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
            <p>Remover esta palavra e os cards associados?</p>
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
              Confirmar exclusão
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
          </>
        ) : (
          <button
            className="text-button danger-text"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={14} />
            Excluir palavra
          </button>
        )}
      </div>
    </Modal>
  );
}
