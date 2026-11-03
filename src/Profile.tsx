import { useState, type FormEvent } from "react";
import {
  Target,
  ShieldCheck,
  Download,
  LogOut,
  Smartphone,
  Check,
  Sun,
  Moon,
  Monitor,
  BarChart3,
  ChevronDown,
} from "lucide-react";
import { useApp } from "./context";
import {
  Button,
  Field,
  LanguageSelect,
  SectionHead,
  ErrorText,
  Progress,
  Modal,
  fmt,
} from "./ui";
import { weekKey, level } from "../shared/model";
import { api, exportFile } from "./offline";
export default function Profile({
  onLogout,
  onInstall,
}: {
  onLogout: () => void;
  onInstall: () => void;
}) {
  const { s, online, refresh, toast, local } = useApp(),
    [profile, setProfile] = useState(s.user),
    [goal, setGoal] = useState(
      s.goals.find((g) => g.week === weekKey()) || {
        reviews: 100,
        days: 5,
        words: 20,
      },
    ),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [recovery, setRecovery] = useState(false),
    [codes, setCodes] = useState<string[]>([]);
  const currentLevel = level(s.points),
    objective = s.days.reduce(
      (a, d) => ({
        correct: a.correct + d.objectiveCorrect,
        total: a.total + d.objectiveTotal,
      }),
      { correct: 0, total: 0 },
    ),
    ratings = s.days.reduce(
      (a, d) => a.map((n, i) => n + d.selfRatings[i]),
      [0, 0, 0, 0],
    );
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy("profile");
    setError("");
    try {
      await api("/profile", "PATCH", profile);
      await refresh();
      toast("Seu perfil foi atualizado.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ESSA JORNADA É SUA</span>
          <h1>Seu ritmo. Seu caminho.</h1>
          <p>Um espaço para acompanhar, ajustar e continuar.</p>
        </div>
        <Button variant="secondary" onClick={onInstall}>
          <Smartphone size={18} />
          Instalar aplicativo
        </Button>
      </div>
      <div className="profile-hero panel">
        <span className="profile-avatar">{s.user.avatar}</span>
        <div>
          <h2>{s.user.nickname}</h2>
          <p>
            Nível {currentLevel} · {fmt(s.points)} pontos de aprendizado
          </p>
          <Progress
            value={s.points - (currentLevel - 1) ** 2 * 100}
            max={currentLevel ** 2 * 100 - (currentLevel - 1) ** 2 * 100}
          />
        </div>
        <span className="level-badge">
          {currentLevel}
          <small>NÍVEL</small>
        </span>
      </div>
      <div className="profile-grid">
        <section className="panel">
          <SectionHead title="Do seu jeito" />
          <form onSubmit={save}>
            <div className="form-grid">
              <Field label="Apelido">
                <input
                  required
                  minLength={2}
                  maxLength={30}
                  value={profile.nickname}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, nickname: e.target.value }))
                  }
                />
              </Field>
              <Field label="Avatar">
                <select
                  value={profile.avatar}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, avatar: e.target.value }))
                  }
                >
                  {[
                    "🌱",
                    "🦊",
                    "🐼",
                    "🐨",
                    "🦉",
                    "🐱",
                    "🐶",
                    "🐴",
                    "🌻",
                    "🚀",
                    "🧠",
                    "🎯",
                  ].map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="form-grid">
              <Field label="Meu idioma">
                <LanguageSelect
                  value={profile.nativeLang}
                  onChange={(nativeLang) =>
                    setProfile((p) => ({ ...p, nativeLang }))
                  }
                />
              </Field>
              <Field label="Idioma principal de estudo">
                <LanguageSelect
                  value={profile.studyLang}
                  onChange={(studyLang) =>
                    setProfile((p) => ({ ...p, studyLang }))
                  }
                />
              </Field>
            </div>
            <Field label="Fuso horário">
              <input
                required
                value={profile.timezone}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, timezone: e.target.value }))
                }
                list="timezones"
              />
              <datalist id="timezones">
                {[
                  "America/Sao_Paulo",
                  "America/Manaus",
                  "America/New_York",
                  "Europe/Lisbon",
                  "Europe/London",
                  "Asia/Tokyo",
                  "UTC",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </datalist>
            </Field>
            <div className="form-grid">
              <Field label="Novos cards por dia">
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={profile.dailyNew}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      dailyNew: Number(e.target.value),
                    }))
                  }
                />
              </Field>
              <Field label="Revisões por dia">
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={profile.dailyReview}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      dailyReview: Number(e.target.value),
                    }))
                  }
                />
              </Field>
            </div>
            <Field label="Aparência">
              <select
                value={profile.theme}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    theme: e.target.value as typeof p.theme,
                  }))
                }
              >
                <option value="system">Acompanhar o dispositivo</option>
                <option value="light">Claro</option>
                <option value="dark">Escuro</option>
              </select>
            </Field>
            <ErrorText error={error} />
            <Button type="submit" busy={busy === "profile"} disabled={!online}>
              Salvar preferências
              <Check size={16} />
            </Button>
          </form>
        </section>
        <div>
          <section className="panel">
            <SectionHead
              title="Metas desta semana"
              extra={<Target size={20} />}
            />
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy("goals");
                try {
                  await api("/goals", "PUT", goal);
                  await refresh();
                  toast("Metas atualizadas.");
                } catch (e) {
                  toast((e as Error).message);
                } finally {
                  setBusy("");
                }
              }}
            >
              <div className="form-grid">
                <Field label="Revisões">
                  <input
                    type="number"
                    min={1}
                    max={7000}
                    required
                    value={goal.reviews}
                    onChange={(e) =>
                      setGoal((g) => ({
                        ...g,
                        reviews: Number(e.target.value),
                      }))
                    }
                  />
                </Field>
                <Field label="Dias de estudo">
                  <input
                    type="number"
                    min={1}
                    max={7}
                    required
                    value={goal.days}
                    onChange={(e) =>
                      setGoal((g) => ({ ...g, days: Number(e.target.value) }))
                    }
                  />
                </Field>
              </div>
              <Field label="Novas palavras">
                <input
                  type="number"
                  min={0}
                  max={1000}
                  required
                  value={goal.words}
                  onChange={(e) =>
                    setGoal((g) => ({ ...g, words: Number(e.target.value) }))
                  }
                />
              </Field>
              <Button
                variant="secondary"
                type="submit"
                busy={busy === "goals"}
                disabled={!online}
              >
                Salvar metas
              </Button>
            </form>
            <details className="form-details">
              <summary>Semanas anteriores</summary>
              {s.goals
                .filter((g) => g.week !== weekKey())
                .reverse()
                .map((g) => {
                  const rs = s.reviews.filter(
                    (r) =>
                      ["applied", "imported"].includes(r.status) &&
                      weekKey(r.reviewedAt) === g.week,
                  );
                  return (
                    <div className="history-row" key={g.week}>
                      <strong>{g.week}</strong>
                      <span>
                        {rs.length}/{g.reviews} revisões
                      </span>
                      <span>
                        {new Set(rs.map((r) => r.localDay)).size}/{g.days} dias
                      </span>
                    </div>
                  );
                })}
              {s.goals.length < 2 && (
                <p>O histórico aparecerá ao concluir sua primeira semana.</p>
              )}
            </details>
          </section>
          <section className="panel spaced">
            <SectionHead title="Sua conta" extra={<ShieldCheck size={20} />} />
            <p className="muted">Acesso: {s.user.email}</p>
            <button
              className="settings-row"
              disabled={!online}
              onClick={() => setRecovery(true)}
            >
              <ShieldCheck size={18} />
              Gerar códigos de recuperação
              <ChevronDown size={16} />
            </button>
            <button
              className="settings-row"
              onClick={() =>
                exportFile(
                  "anki-battle-meus-dados.json",
                  JSON.stringify(
                    {
                      exportedAt: new Date().toISOString(),
                      user: s.user,
                      decks: s.decks,
                      words: s.words,
                      cards: s.cards,
                      reviews: s.reviews,
                      goals: s.goals,
                      days: s.days,
                      pending: local.pending,
                    },
                    null,
                    2,
                  ),
                )
              }
            >
              <Download size={18} />
              Exportar meus dados
            </button>
            <button className="settings-row danger-text" onClick={onLogout}>
              <LogOut size={18} />
              Sair da conta
            </button>
          </section>
        </div>
      </div>
      <section className="panel spaced">
        <SectionHead
          title="Duas formas de medir, sem confundir"
          extra={<BarChart3 size={21} />}
        />
        <div className="metric-comparison">
          <div>
            <h3>Como você sentiu a lembrança</h3>
            <p>Autoavaliação dos flashcards</p>
            <div className="rating-stats">
              {["Errei", "Difícil", "Bom", "Fácil"].map((label, i) => (
                <div key={label}>
                  <strong>{ratings[i]}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3>Respostas verificadas</h3>
            <p>Questões corrigidas pelo servidor nas batalhas</p>
            <strong className="objective-score">
              {objective.total
                ? Math.round((objective.correct / objective.total) * 100) + "%"
                : "—"}
            </strong>
            <small>
              {objective.correct} acertos em {objective.total} respostas
            </small>
          </div>
        </div>
      </section>
      {recovery && (
        <Modal
          title="Códigos de recuperação"
          onClose={() => setRecovery(false)}
        >
          {codes.length ? (
            <>
              <p>
                Os códigos anteriores foram substituídos. Guarde estes em um
                lugar seguro; cada código só funciona uma vez.
              </p>
              <div className="recovery-codes">
                {codes.map((c) => (
                  <code key={c}>{c}</code>
                ))}
              </div>
              <Button
                onClick={() =>
                  exportFile(
                    "anki-battle-recuperacao.txt",
                    codes.join("\n"),
                    "text/plain",
                  )
                }
              >
                Baixar códigos
              </Button>
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const password = new FormData(e.currentTarget).get("password");
                setBusy("recovery");
                try {
                  const r = await api("/auth/recovery-codes", "POST", {
                    password,
                  });
                  setCodes(r.recoveryCodes);
                } catch (e) {
                  toast((e as Error).message);
                } finally {
                  setBusy("");
                }
              }}
            >
              <p>
                Confirme sua senha. Isso invalida códigos antigos de recuperação
                deste aplicativo.
              </p>
              <Field label="Senha atual">
                <input
                  type="password"
                  name="password"
                  required
                  autoComplete="current-password"
                />
              </Field>
              <Button type="submit" busy={busy === "recovery"}>
                Gerar códigos
              </Button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
