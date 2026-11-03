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
          <span className="eyebrow">SEU ESPAÇO DE APRENDIZADO</span>
          <h1>
            Olá, {s.user.nickname.split(" ")[0]}
            <span className="wave">✳</span>
          </h1>
          <p>Um pequeno passo hoje. Um mundo de possibilidades amanhã.</p>
        </div>
        <Button variant="secondary" onClick={() => openWord()}>
          <Plus size={18} />
          Nova palavra
        </Button>
      </div>
      <div className="dashboard-top">
        <section className="study-hero">
          <div className="hero-content">
            <span className="hero-label">
              <span className="status-dot" /> SEU MOMENTO DE FOCO
            </span>
            <h2>
              Um pouco hoje.
              <br />
              Muito mais amanhã.
            </h2>
            <p>
              {due.length ? (
                <>
                  Você tem <strong>{fmt(due.length)} cards</strong> esperando
                  por você.
                  <br />
                  Vamos dar mais um passo?
                </>
              ) : (
                <>
                  Seu próximo aprendizado começa com uma palavra.
                  <br />
                  Qual vai ser a de hoje?
                </>
              )}
            </p>
            <Button onClick={() => (due.length ? study() : openWord())}>
              {due.length ? "Começar a estudar" : "Adicionar uma palavra"}
              <ArrowRight size={18} />
            </Button>
            <small>
              <Clock3 size={13} />
              {due.length
                ? `Cerca de ${Math.max(1, Math.ceil(Math.min(due.length, 20) * 0.3))} minutos para uma sessão`
                : "Aprenda no seu ritmo, sem pressa"}
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
              <small>Uma palavra. Novas conexões.</small>
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
              <span> {daysStreak === 1 ? "dia" : "dias"}</span>
            </strong>
            <h3>de constância</h3>
          </div>
          <p>
            {daysStreak
              ? "Seu esforço está virando hábito. Continue assim."
              : "Seu primeiro dia de estudo pode ser hoje."}
          </p>
          <div className="week-dots">
            {Array.from({ length: 7 }, (_, i) => {
              const date = new Date(week + "T12:00:00Z");
              date.setUTCDate(date.getUTCDate() + i);
              const key = date.toISOString().slice(0, 10),
                done = s.days.some((d) => d.day === key && d.reviews > 0);
              return (
                <div key={key} className={key === today ? "today" : ""}>
                  <small>{["S", "T", "Q", "Q", "S", "S", "D"][i]}</small>
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
            <small>palavras no seu mundo</small>
          </span>
        </div>
        <div>
          <span className="stat-icon green">
            <Check size={20} />
          </span>
          <span>
            <strong>{todayStats?.reviews || 0}</strong>
            <small>revisões hoje</small>
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
            <small>de foco hoje</small>
          </span>
        </div>
        <div>
          <span className="stat-icon peach">
            <Trophy size={20} />
          </span>
          <span>
            <strong>{rank?.points ? `#${rank.rank}` : "—"}</strong>
            <small>no ranking semanal</small>
          </span>
        </div>
      </div>
      <ActivityCalendar />
      <div className="dashboard-bottom">
        <section>
          <SectionHead
            title="Seus baralhos"
            action="Ver todos"
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
                      palavras
                    </p>
                    <Progress
                      value={learned}
                      max={cards.length || 1}
                      color={deck.color}
                    />
                  </div>
                  <span className={"deck-due " + (!n ? "caught-up" : "")}>
                    {n ? `${n} para estudar` : "Em dia"}
                    <ArrowUpRight size={16} />
                  </span>
                </button>
              );
            })}
            <button className="add-deck" onClick={() => openDeck()}>
              <Plus size={18} />
              Criar novo baralho
            </button>
          </div>
        </section>
        <aside>
          <section className="panel goals-panel">
            <SectionHead
              title="Uma semana de evolução"
              extra={<Target size={20} className="muted" />}
            />
            <p className="section-sub">Pequenas metas. Grandes conquistas.</p>
            {[
              {
                label: "Revisões",
                n: weeklyReviews.length,
                max: goal.reviews,
                color: "var(--accent)",
              },
              {
                label: "Dias de estudo",
                n: weeklyDays,
                max: goal.days,
                color: "var(--green)",
              },
              {
                label: "Novas palavras",
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
              Ajustar minhas metas
              <ArrowRight size={14} />
            </button>
          </section>
          <section className="battle-teaser">
            <span className="teaser-icon">
              <Swords size={22} />
            </span>
            <h3>Aprender junto vai mais longe.</h3>
            <p>
              {invites.length
                ? `${invites.length} convite${invites.length > 1 ? "s" : ""} esperando por você.`
                : "Desafie alguém e coloque seu conhecimento em jogo."}
            </p>
            <Button
              variant="secondary full"
              onClick={() => navigate("battles")}
            >
              {invites.length ? "Ver meus desafios" : "Explorar batalhas"}
              <ArrowRight size={16} />
            </Button>
            {!online && <small>As batalhas precisam de conexão.</small>}
          </section>
        </aside>
      </div>
    </>
  );
}
