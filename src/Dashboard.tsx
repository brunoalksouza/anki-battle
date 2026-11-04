import { ArrowUpRight, ArrowRight, Plus, Swords, Target } from "lucide-react";
import StudyOverview from "./StudyOverview";
import ActivityCalendar from "./ActivityCalendar";
import { useApp } from "./context";
import { Button, Progress, SectionHead, fmt, langName } from "./ui";
import { weekKey } from "../shared/model";
export default function Dashboard() {
  const { s, study, openWord, openDeck, navigate, online } = useApp(),
    week = weekKey(),
    goal = s.goals.find((g) => g.week === week) || {
      reviews: 100,
      days: 5,
      words: 20,
    };
  const weeklyReviews = s.reviews.filter(
      (r) =>
        ["applied", "imported", "pending"].includes(r.status) &&
        weekKey(r.reviewedAt) === week,
    ),
    weeklyDays = new Set(weeklyReviews.map((r) => r.localDay)).size,
    weeklyWords = s.words.filter((w) => weekKey(w.createdAt) === week).length;
  const invites = [
    ...s.battles.filter(
      (b) => b.status === "invited" && b.guestId === s.user.id,
    ),
    ...(s.challenges || []).filter(
      (c) => c.status === "invited" && c.guest.userId === s.user.id,
    ),
  ];
  return (
    <>
      <div className="page-heading overview-heading">
        <div>
          <span className="eyebrow">YOUR LEARNING SPACE</span>
          <h1>Your study overview</h1>
          <p>Flashcards and reading, together.</p>
        </div>
        <button
          className="icon-button"
          aria-label="Add a new word"
          title="Add a new word"
          onClick={() => openWord()}
        >
          <Plus size={20} />
        </button>
      </div>
      <StudyOverview />
      <ActivityCalendar />
      <div className="dashboard-bottom">
        <section>
          <SectionHead
            title="Your decks"
            action="View all"
            onAction={() => navigate("study")}
          />
          <div className="deck-list">
            {s.decks.slice(0, 3).map((deck) => {
              const words = s.words.filter((w) => w.deckId === deck.id),
                cards = s.cards.filter((c) =>
                  words.some((w) => w.id === c.wordId),
                ),
                n = cards.filter(
                  (c) =>
                    !c.suspended && +new Date(c.schedule.dueAt) <= Date.now(),
                ).length,
                learned = cards.filter((c) => c.schedule.reps > 0).length;
              return (
                <button
                  className="deck-row"
                  key={deck.id}
                  onClick={() => study(deck.id)}
                >
                  <span
                    className="deck-icon"
                    style={{ background: deck.color + "14" }}
                  >
                    {deck.icon}
                  </span>
                  <div>
                    <h3>{deck.name}</h3>
                    <p>
                      {langName(deck.language)} <span>·</span> {words.length}{" "}
                      {words.length === 1 ? "word" : "words"}
                    </p>
                    <Progress
                      value={learned}
                      max={cards.length || 1}
                      color={deck.color}
                    />
                  </div>
                  <span className={"deck-due " + (!n ? "caught-up" : "")}>
                    {n ? `${n} due` : "Up to date"}
                    <ArrowUpRight size={16} />
                  </span>
                </button>
              );
            })}
            <button className="add-deck" onClick={() => openDeck()}>
              <Plus size={18} />
              Create a deck
            </button>
          </div>
        </section>
        <aside>
          <section className="panel goals-panel">
            <SectionHead
              title="This week's progress"
              extra={<Target size={20} className="muted" />}
            />
            <p className="section-sub">Small goals. Big achievements.</p>
            {[
              {
                label: "Reviews",
                n: weeklyReviews.length,
                max: goal.reviews,
                color: "var(--accent)",
              },
              {
                label: "Study days",
                n: weeklyDays,
                max: goal.days,
                color: "var(--green)",
              },
              {
                label: "New words",
                n: weeklyWords,
                max: goal.words,
                color: "var(--blue)",
              },
            ].map((g) => (
              <div className="goal-row" key={g.label}>
                <div>
                  <span>{g.label}</span>
                  <strong>
                    {g.n}
                    <small> / {g.max}</small>
                  </strong>
                </div>
                <Progress value={g.n} max={g.max} color={g.color} />
              </div>
            ))}
            <button className="text-button" onClick={() => navigate("profile")}>
              Adjust my goals
              <ArrowRight size={14} />
            </button>
          </section>
          <section className="battle-teaser">
            <span className="teaser-icon">
              <Swords size={22} />
            </span>
            <h3>Build a streak together.</h3>
            <p>
              {invites.length
                ? `${invites.length} invitation${invites.length > 1 ? "s" : ""} waiting for you.`
                : "Your own cards. A shared challenge. Compare study days and words reviewed."}
            </p>
            <Button
              variant="secondary full"
              onClick={() => navigate("battles")}
            >
              {invites.length ? "View my challenges" : "Explore challenges"}
              <ArrowRight size={16} />
            </Button>
            {!online && <small>Battles need an internet connection.</small>}
          </section>
        </aside>
      </div>
    </>
  );
}
