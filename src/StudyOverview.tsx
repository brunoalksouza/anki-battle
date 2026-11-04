import { ArrowRight, BookOpen, Check, Layers3 } from "lucide-react";
import { useApp } from "./context";
import { Button, fmt } from "./ui";
import { dayKey, streak } from "../shared/model";
import { emptyReading, readingStreak } from "../shared/reading";

export default function StudyOverview() {
  const { s, study, navigate } = useApp();
  const today = dayKey(new Date(), s.user.timezone);
  const cardsToday = s.days.find((d) => d.day === today);
  const cardStreak = streak(s.days, today);
  const focusSeconds = Math.round((cardsToday?.activeMs || 0) / 1000);
  const focusValue =
    focusSeconds < 60 ? focusSeconds : Math.floor(focusSeconds / 60);
  const focusUnit = focusSeconds < 60 ? "s" : "min";
  const reading = s.reading || emptyReading();
  const readToday = reading.days.includes(today);
  const fresh =
    reading.status === "connected" &&
    !!reading.lastSync &&
    dayKey(reading.lastSync, s.user.timezone) === today;
  const bookStreak = readingStreak(
    reading.days,
    fresh || !reading.lastSync
      ? today
      : dayKey(reading.lastSync, s.user.timezone),
  );
  const readingStatus = {
    disconnected: "Automatic updates not connected",
    connected: "Automatic updates on",
    reconnect: "Reconnect Kindle for updates",
    error: "Update delayed · Saved days are safe",
  }[reading.status];
  const received = reading.lastSync
    ? new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        timeZone: s.user.timezone,
      }).format(new Date(reading.lastSync))
    : null;
  return (
    <section className="study-overview" aria-label="Your study overview">
      <article
        className="overview-card overview-cards"
        aria-labelledby="cards-overview-title"
      >
        <div className="overview-card-heading">
          <span className="overview-category">
            <Layers3 size={20} />
            <h2 id="cards-overview-title">Flashcards</h2>
          </span>
        </div>
        <div className="overview-today">
          <strong>{fmt(cardsToday?.reviews || 0)}</strong>
          <span>reviews today</span>
        </div>
        <dl className="overview-metrics">
          <div>
            <dt>Card streak</dt>
            <dd>
              {cardStreak}
              <small> {cardStreak === 1 ? "day" : "days"}</small>
            </dd>
          </div>
          <div>
            <dt>Card study today</dt>
            <dd>
              {focusValue}
              <small> {focusUnit}</small>
            </dd>
          </div>
        </dl>
        <div className="overview-context">
          <strong>{fmt(s.words.length)} words saved</strong>
          <span>Your personal collection</span>
        </div>
        <Button onClick={() => study()}>
          Study cards <ArrowRight size={16} />
        </Button>
      </article>
      <article
        className="overview-card overview-reading"
        aria-labelledby="reading-overview-title"
      >
        <div className="overview-card-heading">
          <span className="overview-category">
            <BookOpen size={20} />
            <h2 id="reading-overview-title">Reading</h2>
          </span>
          {readToday && <Check size={18} className="overview-confirmed" />}
        </div>
        <div className={"overview-today " + (readToday ? "overview-done" : "")}>
          <strong>
            {readToday ? "Done" : reading.lastSync ? "Pending" : "—"}
          </strong>
          <span>
            {readToday ? "today's reading goal" : "reading confirmation today"}
          </span>
        </div>
        <dl className="overview-metrics">
          <div>
            <dt>{fresh ? "Reading streak" : "Last confirmed streak"}</dt>
            <dd>
              {reading.lastSync ? bookStreak : "—"}
              <small> {bookStreak === 1 ? "day" : "days"}</small>
            </dd>
          </div>
          <div>
            <dt>Books marked read · {today.slice(0, 4)}</dt>
            <dd>
              {reading.lastSync
                ? reading.titlesByYear[today.slice(0, 4)] || 0
                : "—"}
              <small> books</small>
            </dd>
          </div>
        </dl>
        <div className="overview-context">
          <strong>{readingStatus}</strong>
          <span>
            {received
              ? `Last received ${received}`
              : "Connect Kindle to see your progress"}
          </span>
        </div>
        <Button variant="secondary" onClick={() => navigate("reading")}>
          Reading metrics <ArrowRight size={16} />
        </Button>
      </article>
    </section>
  );
}
