import {
  ArrowUpRight,
  ArrowRight,
  Flame,
  Clock3,
  Check,
  Plus,
  Swords,
  BookOpen,
  Target,
  Trophy,
} from "lucide-react";
import ActivityCalendar from "./ActivityCalendar";
import { useApp } from "./context";
import {
  Button,
  Progress,
  SectionHead,
  Empty,
  fmt,
  langName,
  langFlag,
} from "./ui";
import { dayKey, weekKey, streak } from "../shared/model";
export default function Dashboard() {
  const { s, study, openWord, openDeck, navigate, online } = useApp(),
    today = dayKey(new Date(), s.user.timezone),
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
  const due = s.cards.filter(
      (c) => !c.suspended && +new Date(c.schedule.dueAt) <= Date.now(),
    ),
    rank = s.rankings.weekly.find((r) => r.id === s.user.id),
    todayStats = s.days.find((d) => d.day === today);
  const daysStreak = streak(s.days, today),
    invites = s.battles.filter(
      (b) => b.status === "invited" && b.guestId === s.user.id,
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR LEARNING SPACE</span>
          <h1>
            Hi, {s.user.nickname.split(" ")[0]}
            <span className="wave">✳</span>
          </h1>
          <p>A small step today. A world of possibilities tomorrow.</p>
        </div>
        <Button variant="secondary" onClick={() => openWord()}>
          <Plus size={18} />
          New word
        </Button>
      </div>
      <div className="dashboard-top">
        <section className="study-hero">
          <div className="hero-content">
            <span className="hero-label">
              <span className="status-dot" /> YOUR MOMENT TO FOCUS
            </span>
            <h2>
              A little today.
              <br />
              More tomorrow.
            </h2>
            <p>
              {due.length ? (
                <>
                  You have <strong>{fmt(due.length)} cards</strong> waiting for
                  you.
                  <br />
                  Ready for one more step?
                </>
              ) : (
                <>
                  Your next discovery starts with a word.
                  <br />
                  What will you learn today?
                </>
              )}
            </p>
            <Button onClick={() => (due.length ? study() : openWord())}>
              {due.length ? "Start studying" : "Add a word"}
              <ArrowRight size={18} />
            </Button>
            <small>
              <Clock3 size={13} />
              {due.length
                ? `About ${Math.max(1, Math.ceil(Math.min(due.length, 20) * 0.3))} minutes per session`
                : "Learn at your own pace"}
            </small>
          </div>
          <div className="hero-deck" aria-hidden="true">
            <div className="hero-card-back" />
            <div className="hero-card">
              <span>
                {langFlag(s.user.studyLang)} {langName(s.user.studyLang)}
              </span>
              <strong>{s.user.studyLang === "ja" ? "学ぶ" : "Aa"}</strong>
              <div />
              <small>One word. New connections.</small>
              <i>✦</i>
            </div>
          </div>
        </section>
        <section className="streak-card">
          <div className="flame-circle">
            <Flame size={29} />
          </div>
          <div>
            <strong>
              {daysStreak}
              <span> {daysStreak === 1 ? "day" : "days"}</span>
            </strong>
            <h3>learning streak</h3>
          </div>
          <p>
            {daysStreak
              ? "Your effort is becoming a habit. Keep going."
              : "Today can be your first day of learning."}
          </p>
          <div className="week-dots">
            {Array.from({ length: 7 }, (_, i) => {
              const date = new Date(week + "T12:00:00Z");
              date.setUTCDate(date.getUTCDate() + i);
              const key = date.toISOString().slice(0, 10),
                done = s.days.some((d) => d.day === key && d.reviews > 0);
              return (
                <div key={key} className={key === today ? "today" : ""}>
                  <small>{["M", "T", "W", "T", "F", "S", "S"][i]}</small>
                  <span className={done ? "done" : ""}>
                    {done ? <Check size={14} /> : date.getUTCDate()}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
      <div className="quick-stats">
        <div>
          <span className="stat-icon lavender">
            <BookOpen size={20} />
          </span>
          <span>
            <strong>{fmt(s.words.length)}</strong>
            <small>words in your world</small>
          </span>
        </div>
        <div>
          <span className="stat-icon green">
            <Check size={20} />
          </span>
          <span>
            <strong>{todayStats?.reviews || 0}</strong>
            <small>reviews today</small>
          </span>
        </div>
        <div>
          <span className="stat-icon blue">
            <Clock3 size={20} />
          </span>
          <span>
            <strong>
              {Math.floor((todayStats?.activeMs || 0) / 60000)}
              <em> min</em>
            </strong>
            <small>focused today</small>
          </span>
        </div>
        <div>
          <span className="stat-icon peach">
            <Trophy size={20} />
          </span>
          <span>
            <strong>{rank?.points ? `#${rank.rank}` : "—"}</strong>
            <small>weekly rank</small>
          </span>
        </div>
      </div>
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
            <h3>Go further together.</h3>
            <p>
              {invites.length
                ? `${invites.length} invitation${invites.length > 1 ? "s" : ""} waiting for you.`
                : "Challenge a friend and put your knowledge to the test."}
            </p>
            <Button
              variant="secondary full"
              onClick={() => navigate("battles")}
            >
              {invites.length ? "View my challenges" : "Explore battles"}
              <ArrowRight size={16} />
            </Button>
            {!online && <small>Battles need an internet connection.</small>}
          </section>
        </aside>
      </div>
    </>
  );
}
