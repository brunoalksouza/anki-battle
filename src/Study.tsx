import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Download,
  Eye,
  Plus,
  Settings2,
  BookOpen,
  Pause,
  CloudOff,
} from "lucide-react";
import { useApp } from "./context";
import {
  Button,
  Empty,
  Progress,
  Highlight,
  WordImage,
  WordAudio,
  Attribution,
  interval,
  langName,
} from "./ui";
import { dayKey, type Card } from "../shared/model";
import { previewSchedule } from "../shared/scheduler";
import { cloze } from "../shared/text";
import { downloadDeck, api } from "./offline";
export function availableCards(
  s: ReturnType<typeof useApp>["s"],
  downloaded: string[],
  online: boolean,
  deckId?: string,
) {
  const today = dayKey(new Date(), s.user.timezone),
    reviews = s.reviews.filter(
      (r) => r.localDay === today && ["applied", "pending"].includes(r.status),
    );
  let newLeft = Math.max(
      0,
      s.user.dailyNew -
        reviews.filter(
          (r) => r.before?.reps === 0 || (!r.before && r.baseRevision === 0),
        ).length,
    ),
    oldLeft = Math.max(
      0,
      s.user.dailyReview -
        reviews.filter((r) => r.before?.reps !== 0 && r.baseRevision > 0)
          .length,
    );
  return s.cards
    .filter((c) => !c.suspended && +new Date(c.schedule.dueAt) <= Date.now())
    .filter((c) => {
      const w = s.words.find((w) => w.id === c.wordId);
      return (
        w &&
        (!deckId || w.deckId === deckId) &&
        (online || downloaded.includes(w.deckId)) &&
        (c.direction !== "cloze" || !!cloze(w.sentence, w.term, w.language))
      );
    })
    .sort((a, b) => +new Date(a.schedule.dueAt) - +new Date(b.schedule.dueAt))
    .filter((c) => (c.schedule.reps === 0 ? newLeft-- > 0 : oldLeft-- > 0));
}
export default function Study({ initialDeck }: { initialDeck?: string }) {
  const { s, local, online, openWord, openDeck, review, refresh, toast } =
      useApp(),
    [deck, setDeck] = useState(initialDeck || ""),
    [deckQuery, setDeckQuery] = useState(""),
    [session, setSession] = useState<string[] | null>(null),
    [revealed, setRevealed] = useState(false),
    [done, setDone] = useState(0),
    [saving, setSaving] = useState(false),
    [downloading, setDownloading] = useState("");
  const active = useRef(0),
    lastInteraction = useRef(Date.now()),
    tick = useRef(Date.now()),
    reviewFrame = useRef<HTMLDivElement>(null),
    reviewContent = useRef<HTMLDivElement>(null);
  const current = session?.[0],
    card = s.cards.find((c) => c.id === current),
    word = s.words.find((w) => w.id === card?.wordId);
  const eligible = availableCards(
    s,
    local.downloaded,
    online,
    deck || undefined,
  );
  useEffect(() => {
    if (initialDeck) setDeck(initialDeck);
  }, [initialDeck]);
  useEffect(() => {
    active.current = 0;
    tick.current = Date.now();
    lastInteraction.current = Date.now();
    setRevealed(false);
  }, [current]);
  useLayoutEffect(() => {
    const frame = reviewFrame.current,
      content = reviewContent.current;
    if (!frame || !content) return;
    const viewport = content.parentElement!;
    // Keep text readable while giving longer cards progressively tighter spacing.
    // Refit after media loads, browser chrome resizes, rotation or text expansion.
    const fit = () => {
      for (const density of ["comfortable", "compact", "dense"]) {
        frame.dataset.density = density;
        if (content.scrollHeight <= viewport.clientHeight + 1) break;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    observer.observe(content);
    return () => observer.disconnect();
  }, [current, revealed]);
  useEffect(() => {
    const touch = () => {
      lastInteraction.current = Date.now();
    };
    const timer = setInterval(() => {
      const now = Date.now();
      if (
        document.visibilityState === "visible" &&
        now - lastInteraction.current < 30000 &&
        current
      )
        active.current += Math.min(1100, now - tick.current);
      tick.current = now;
    }, 1000);
    for (const e of ["pointerdown", "keydown", "touchstart"])
      window.addEventListener(e, touch, { passive: true });
    return () => {
      clearInterval(timer);
      for (const e of ["pointerdown", "keydown", "touchstart"])
        window.removeEventListener(e, touch);
    };
  }, [current]);
  async function rate(rating: 1 | 2 | 3 | 4) {
    if (!card || saving) return;
    setSaving(true);
    try {
      await review({
        id: crypto.randomUUID(),
        cardId: card.id,
        baseRevision: card.revision,
        rating,
        reviewedAt: new Date().toISOString(),
        activeMs: Math.min(120000, Math.round(active.current)),
      });
      setSession((q) => q!.slice(1));
      setDone((n) => n + 1);
      setRevealed(false);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function download(id: string) {
    setDownloading(id);
    try {
      await downloadDeck(local, id);
      await refresh();
      toast("Deck and media are available offline on this device.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setDownloading("");
    }
  }
  if (session) {
    if (!card || !word)
      return (
        <div className="session-finish">
          <div className="finish-icon">
            <Check size={45} />
          </div>
          <span className="eyebrow">ONE MORE STEP FORWARD</span>
          <h1>Your future self thanks you.</h1>
          <p>
            {done} {done === 1 ? "card reviewed" : "cards reviewed"}. Your next
            review of each word is already scheduled.
          </p>
          <div className="finish-note">
            {local.pending.length
              ? `${local.pending.length} changes saved on this device, waiting to sync.`
              : "Your progress is saved and synced."}
          </div>
          <Button
            onClick={() => {
              setSession(null);
              setDone(0);
            }}
          >
            Back to decks
            <ArrowRight size={18} />
          </Button>
        </div>
      );
    const previews = previewSchedule(card.schedule, new Date()),
      prompt =
        card.direction === "reverse"
          ? word.meaning
          : card.direction === "cloze"
            ? cloze(word.sentence, word.term, word.language)
            : word.term;
    return (
      <section className="review-page focus-review" aria-label="Study session">
        <div className="review-top">
          <button className="text-button" onClick={() => setSession(null)}>
            <ChevronLeft size={18} />
            End session
          </button>
          <span>
            {done + 1} of {done + session.length}
            {!online && (
              <span className="review-offline">
                <CloudOff size={14} /> Offline
              </span>
            )}
          </span>
        </div>
        <Progress value={done} max={done + session.length} />
        <div className="review-caption">
          <span>{s.decks.find((d) => d.id === word.deckId)?.name}</span>
          <span>
            {card.schedule.reps === 0
              ? "New"
              : card.schedule.state === 2
                ? "Review"
                : "Learning"}
          </span>
        </div>
        <div className="review-card" ref={reviewFrame}>
          <div className="review-content-viewport" key={current}>
            <div className="review-content" ref={reviewContent}>
              <span className="eyebrow">
                {card.direction === "cloze"
                  ? "FILL IN THE BLANK"
                  : card.direction === "reverse"
                    ? "HOW DO YOU SAY IT?"
                    : "WHAT DOES IT MEAN?"}
              </span>
              <h1 dir="auto">{prompt}</h1>
              {!revealed ? (
                <>
                  <p className="review-hint">Give your memory a moment.</p>
                </>
              ) : (
                <div className="answer">
                  <div className="answer-rule" />
                  {!(
                    card.direction === "forward" &&
                    word.source?.needsMeaning &&
                    word.imageId
                  ) && (
                    <h2 dir="auto">
                      {card.direction === "forward" ? word.meaning : word.term}
                    </h2>
                  )}
                  {word.sentence && (
                    <blockquote dir="auto">
                      <Highlight text={word.sentence} word={word} />
                    </blockquote>
                  )}
                  {word.translation && (
                    <details>
                      <summary>Show English explanation</summary>
                      <p>{word.translation}</p>
                    </details>
                  )}
                  <Attribution credit={word.sentenceCredit} />
                  <Attribution credit={word.translationCredit} />
                  <div className="review-images">
                    <WordImage word={word} user={s.user.id} />
                    {word.extraImages?.map((imageId) => (
                      <WordImage
                        key={imageId}
                        word={{ ...word, imageId, imageCredit: null }}
                        user={s.user.id}
                      />
                    ))}
                  </div>
                  <WordAudio word={word} user={s.user.id} compact />
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="review-actions">
          {revealed ? (
            <>
              <p className="rating-question">How well did you remember?</p>
              <div className="rating-buttons">
                {["Again", "Hard", "Good", "Easy"].map((label, i) => (
                  <button
                    disabled={saving}
                    key={label}
                    className={"rating r" + i}
                    onClick={() => rate((i + 1) as 1 | 2 | 3 | 4)}
                  >
                    <strong>{label}</strong>
                    <small>{interval(previews[i])}</small>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="rating-question">Ready to check?</p>
              <Button
                onClick={() => setRevealed(true)}
                className="reveal-answer"
              >
                <Eye size={18} />
                Show answer
              </Button>
            </>
          )}
        </div>
      </section>
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ROOM TO FOCUS</span>
          <h1>Your next discovery.</h1>
          <p>Pick a deck. Take it one card at a time.</p>
        </div>
        <Button onClick={() => openDeck()}>
          <Plus size={18} />
          New deck
        </Button>
      </div>
      <div className="study-toolbar">
        <label>
          Study
          <select value={deck} onChange={(e) => setDeck(e.target.value)}>
            <option value="">All decks</option>
            {s.decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <div>
          <strong>{eligible.length}</strong> cards available now
        </div>
        <Button
          disabled={!eligible.length}
          onClick={() => {
            setSession(eligible.map((c) => c.id));
            setDone(0);
          }}
        >
          Start session
          <ArrowRight size={18} />
        </Button>
      </div>
      {!online && (
        <div className="notice">
          <CloudOff size={18} />
          You can review downloaded decks. Your answers will sync when you
          reconnect.
        </div>
      )}
      <label className="deck-search">
        Search decks
        <input
          type="search"
          value={deckQuery}
          onChange={(e) => setDeckQuery(e.target.value)}
          placeholder="Deck name or description"
        />
      </label>
      <div className="deck-grid">
        {s.decks
          .filter(
            (d) =>
              (!deck || d.id === deck) &&
              (d.name + " " + d.description)
                .toLocaleLowerCase()
                .includes(deckQuery.toLocaleLowerCase()),
          )
          .map((d) => {
            const words = s.words.filter((w) => w.deckId === d.id),
              cards = s.cards.filter((c) =>
                words.some((w) => w.id === c.wordId),
              ),
              counts = [
                cards.filter((c) => !c.suspended && c.schedule.reps === 0)
                  .length,
                cards.filter(
                  (c) => !c.suspended && [1, 3].includes(c.schedule.state),
                ).length,
                cards.filter(
                  (c) =>
                    !c.suspended &&
                    c.schedule.state === 2 &&
                    +new Date(c.schedule.dueAt) <= Date.now(),
                ).length,
              ];
            return (
              <article className="panel deck-card" key={d.id}>
                <div className="deck-card-top">
                  <span
                    className="deck-icon"
                    style={{ background: d.color + "15" }}
                  >
                    {d.icon}
                  </span>
                  <button
                    className="icon-button"
                    aria-label={"Edit " + d.name}
                    onClick={() => openDeck(d.id)}
                  >
                    <Settings2 size={18} />
                  </button>
                </div>
                <h2>{d.name}</h2>
                <p>
                  {d.description ||
                    `${langName(d.language)} · ${words.length} ${words.length === 1 ? "word" : "words"} to explore`}
                </p>
                <div className="deck-counts">
                  {["New", "Learning", "Due for review"].map((label, i) => (
                    <div key={label}>
                      <strong>{counts[i]}</strong>
                      <small>{label}</small>
                    </div>
                  ))}
                </div>
                <Progress
                  value={cards.filter((c) => c.schedule.reps > 0).length}
                  max={cards.length || 1}
                  color={d.color}
                />
                <div className="deck-actions">
                  <Button
                    variant="secondary"
                    disabled={
                      !availableCards(s, local.downloaded, online, d.id).length
                    }
                    onClick={() => {
                      setDeck(d.id);
                      setSession(
                        availableCards(s, local.downloaded, online, d.id).map(
                          (c) => c.id,
                        ),
                      );
                      setDone(0);
                    }}
                  >
                    Study
                    <ArrowRight size={16} />
                  </Button>
                  <button
                    disabled={!online || !!downloading}
                    className="text-button"
                    onClick={() => download(d.id)}
                  >
                    {downloading === d.id ? (
                      "Downloading…"
                    ) : local.downloaded.includes(d.id) ? (
                      <>
                        <Check size={16} />
                        Refresh download
                      </>
                    ) : (
                      <>
                        <Download size={16} />
                        Download
                      </>
                    )}
                  </button>
                </div>
                {d.shared && (
                  <small className="shared-label">Available for battles</small>
                )}
              </article>
            );
          })}
      </div>
      {!s.words.length && (
        <Empty
          title="Every journey starts with a word."
          description="Add an expression, choose a color, and bring your first card to life."
          action="Add word"
          onAction={() => openWord()}
        />
      )}
      <p className="footnote">
        Daily limit: {s.user.dailyNew} new cards and {s.user.dailyReview}{" "}
        reviews. Adjust these in Profile. Cloze cards need a sentence containing
        the expression.
      </p>
    </>
  );
}
