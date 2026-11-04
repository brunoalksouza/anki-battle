import { ArrowRight, Layers3 } from "lucide-react";
import { useApp } from "./context";
import { Button, fmt } from "./ui";
import { dayKey, streak } from "../shared/model";

export default function StudyOverview() {
  const { s, study } = useApp();
  const today = dayKey(new Date(), s.user.timezone);
  const cardsToday = s.days.find((d) => d.day === today);
  const cardStreak = streak(s.days, today);
  const focusSeconds = Math.round((cardsToday?.activeMs || 0) / 1000);
  const focusValue =
    focusSeconds < 60 ? focusSeconds : Math.floor(focusSeconds / 60);
  const focusUnit = focusSeconds < 60 ? "s" : "min";
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
    </section>
  );
}
