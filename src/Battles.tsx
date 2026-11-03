import { useEffect, useState } from "react";
import {
  Swords,
  Trophy,
  ArrowRight,
  Plus,
  Users,
  Check,
  Clock3,
  RefreshCw,
  Flag,
} from "lucide-react";
import { useApp } from "./context";
import {
  Button,
  Empty,
  Modal,
  Field,
  ErrorText,
  SectionHead,
  Progress,
  fmt,
} from "./ui";
import { api } from "./offline";
import { type Battle, type Ranking } from "../shared/model";
const statusNames: Record<string, string> = {
  invited: "Convite enviado",
  active: "Em andamento",
  completed: "Finalizada",
  declined: "Convite recusado",
  expired: "Expirada",
  abandoned: "Abandono",
};
export default function Battles() {
  const { s, online, refresh, toast } = useApp(),
    [tab, setTab] = useState("battles"),
    [period, setPeriod] = useState("weekly"),
    [invite, setInvite] = useState(false),
    [playing, setPlaying] = useState<string | null>(null),
    [group, setGroup] = useState(""),
    [groupRank, setGroupRank] = useState<Ranking[]>([]),
    [groupModal, setGroupModal] = useState(false),
    [busy, setBusy] = useState(false),
    [rules, setRules] = useState(false);
  useEffect(() => {
    if (group && online)
      api("/groups/" + group + "/ranking?period=" + period)
        .then(setGroupRank)
        .catch((e) => toast(e.message));
  }, [group, period, online]);
  const ranking = group
    ? groupRank
    : s.rankings[period === "weekly" ? "weekly" : "all"];
  async function respond(b: Battle, accept: boolean) {
    setBusy(true);
    try {
      await api("/battles/" + b.id + "/respond", "POST", { accept });
      await refresh();
      if (accept) setPlaying(b.id);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CONHECIMENTO QUE CONECTA</span>
          <h1>Juntos, um nível acima.</h1>
          <p>Um desafio saudável. Um motivo a mais para aprender.</p>
        </div>
        <Button disabled={!online} onClick={() => setInvite(true)}>
          <Swords size={18} />
          Desafiar alguém
        </Button>
      </div>
      <div className="tabs">
        <button
          className={tab === "battles" ? "active" : ""}
          onClick={() => setTab("battles")}
        >
          <Swords size={17} />
          Batalhas
        </button>
        <button
          className={tab === "ranking" ? "active" : ""}
          onClick={() => setTab("ranking")}
        >
          <Trophy size={17} />
          Ranking
        </button>
        <button
          className={tab === "groups" ? "active" : ""}
          onClick={() => setTab("groups")}
        >
          <Users size={17} />
          Meus grupos
        </button>
      </div>
      {!online && (
        <div className="notice">
          Batalhas, convites e rankings atualizados precisam de conexão. Abaixo
          está seu último estado sincronizado.
        </div>
      )}
      {tab === "battles" && (
        <>
          {!s.battles.length ? (
            <Empty
              icon={<Swords size={32} />}
              title="Sua primeira batalha está por vir."
              description="Convide uma pessoa e use um baralho autorizado. As mesmas perguntas, uma oportunidade para cada um."
              action="Criar desafio"
              onAction={() =>
                online
                  ? setInvite(true)
                  : toast("Conecte-se para desafiar alguém.")
              }
            />
          ) : (
            <div className="battles-list">
              {s.battles.map((b) => {
                const received =
                  b.status === "invited" && b.guestId === s.user.id;
                return (
                  <article className="panel battle-item" key={b.id}>
                    <div className="battle-top">
                      <span
                        className={
                          "badge " + (b.status === "active" ? "green" : "")
                        }
                      >
                        {received ? "Convite para você" : statusNames[b.status]}
                      </span>
                      <small>
                        {b.deckName} · {b.rounds} rodadas
                      </small>
                    </div>
                    <div className="versus">
                      <div>
                        <span className="avatar">{b.hostAvatar}</span>
                        <strong>{b.hostName}</strong>
                        <small>
                          {b.hostCorrect} acertos
                          {b.status === "completed" && (
                            <>
                              {" "}
                              ·{" "}
                              {(b.hostTime / 1000).toLocaleString("pt-BR", {
                                maximumFractionDigits: 2,
                              })}{" "}
                              s
                            </>
                          )}
                        </small>
                      </div>
                      <span className="vs">VS</span>
                      <div>
                        <span className="avatar">{b.guestAvatar}</span>
                        <strong>{b.guestName}</strong>
                        <small>
                          {b.guestCorrect} acertos
                          {b.status === "completed" && (
                            <>
                              {" "}
                              ·{" "}
                              {(b.guestTime / 1000).toLocaleString("pt-BR", {
                                maximumFractionDigits: 2,
                              })}{" "}
                              s
                            </>
                          )}
                        </small>
                      </div>
                    </div>
                    {received ? (
                      <div className="battle-actions">
                        <Button
                          variant="secondary"
                          disabled={busy || !online}
                          onClick={() => respond(b, false)}
                        >
                          Recusar
                        </Button>
                        <Button
                          disabled={busy || !online}
                          onClick={() => respond(b, true)}
                        >
                          Aceitar desafio
                          <Check size={17} />
                        </Button>
                      </div>
                    ) : b.status === "active" ? (
                      <Button
                        className="full"
                        disabled={!online}
                        onClick={() => setPlaying(b.id)}
                      >
                        {b.myAnswered >= b.rounds
                          ? "Ver andamento"
                          : "Continuar batalha"}
                        <ArrowRight size={17} />
                      </Button>
                    ) : b.status === "completed" ? (
                      <p className="battle-result">
                        {b.winnerId === null
                          ? "Empate. Conhecimento para os dois."
                          : b.winnerId === s.user.id
                            ? "Você venceu esta batalha!"
                            : `${b.winnerId === b.hostId ? b.hostName : b.guestName} venceu esta batalha.`}
                      </p>
                    ) : b.status === "invited" ? (
                      <p className="footnote">
                        Aguardando aceite. Prazo:{" "}
                        {new Date(b.expiresAt).toLocaleString("pt-BR")}.
                      </p>
                    ) : null}
                    {b.status === "completed" &&
                      b.winnerId &&
                      b.hostCorrect === b.guestCorrect && (
                        <p className="footnote centered">
                          Desempate pelo menor tempo nas respostas corretas.
                        </p>
                      )}
                  </article>
                );
              })}
            </div>
          )}
          <Button
            variant="secondary"
            disabled={!online}
            onClick={() => refresh()}
          >
            <RefreshCw size={16} />
            Atualizar desafios
          </Button>
        </>
      )}
      {tab === "ranking" && (
        <>
          <div className="ranking-toolbar">
            <div className="segmented">
              <button
                className={period === "weekly" ? "active" : ""}
                onClick={() => setPeriod("weekly")}
              >
                Esta semana
              </button>
              <button
                className={period === "all" ? "active" : ""}
                onClick={() => setPeriod("all")}
              >
                Geral
              </button>
            </div>
            <select
              aria-label="Grupo do ranking"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="">Todos os participantes</option>
              {s.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <section className="panel ranking-panel">
            <div className="ranking-title">
              <Trophy size={30} />
              <h2>Cada passo conta.</h2>
              <p>O ranking valoriza atividade válida e constância.</p>
            </div>
            <div className="ranking-table">
              {ranking.map((r) => (
                <div
                  className={"ranking-row " + (r.id === s.user.id ? "me" : "")}
                  key={r.id}
                >
                  <strong className="rank-number">
                    {r.points ? r.rank : "—"}
                  </strong>
                  <span className="avatar">{r.avatar}</span>
                  <div>
                    <strong>
                      {r.nickname}
                      {r.id === s.user.id && <small> você</small>}
                    </strong>
                    <small>
                      {r.points
                        ? "Aprendendo um pouco todos os dias"
                        : "Ainda sem pontos"}
                    </small>
                  </div>
                  <strong>
                    {fmt(r.points)} <small>pts</small>
                  </strong>
                </div>
              ))}
            </div>
          </section>
          <p className="footnote">
            A semana competitiva começa segunda-feira às 00:00 UTC (domingo, 21h
            em Brasília). O histórico de pontos é mantido.
          </p>
        </>
      )}
      {tab === "groups" && (
        <>
          <SectionHead
            title="Seu círculo de aprendizado"
            extra={
              <Button
                variant="secondary"
                onClick={() => setGroupModal(true)}
                disabled={!online}
              >
                <Plus size={17} />
                Criar ou entrar
              </Button>
            }
          />
          {!s.groups.length ? (
            <Empty
              icon={<Users size={30} />}
              title="Melhor com companhia."
              description="Crie um grupo para comparar seu progresso com amigos. Compartilhe o código apenas com quem você quer convidar."
            />
          ) : (
            <div className="deck-grid">
              {s.groups.map((g) => (
                <section key={g.id} className="panel">
                  <h2>{g.name}</h2>
                  <p>{g.members} participantes</p>
                  <Field label="Código para entrar">
                    <input
                      readOnly
                      value={g.code}
                      onFocus={(e) => e.target.select()}
                    />
                  </Field>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setGroup(g.id);
                      setTab("ranking");
                    }}
                  >
                    Ver ranking
                    <ArrowRight size={16} />
                  </Button>
                </section>
              ))}
            </div>
          )}
        </>
      )}
      <button className="text-button spaced" onClick={() => setRules(true)}>
        Como funcionam os pontos e as batalhas?
      </button>
      {invite && <Invite onClose={() => setInvite(false)} />}{" "}
      {playing && (
        <PlayBattle
          id={playing}
          onClose={() => {
            setPlaying(null);
            void refresh();
          }}
        />
      )}
      {groupModal && <GroupForm onClose={() => setGroupModal(false)} />}{" "}
      {rules && (
        <Modal title="Uma competição justa" onClose={() => setRules(false)}>
          <div className="rules">
            <h3>Pontos de estudo</h3>
            <p>
              5 pontos pela primeira revisão válida de uma palavra no dia UTC,
              até 100 palavras/dia. É preciso estudar por pelo menos 2 segundos.
              “Errei”, “Difícil”, “Bom” e “Fácil” valem exatamente o mesmo.
              Login, recarregar e repetir requisições não rendem pontos.
            </p>
            <h3>Batalhas</h3>
            <p>
              Até 10 perguntas de múltipla escolha do mesmo baralho autorizado.
              Cada pessoa tem 60 segundos por pergunta, contados no servidor.
              Acertos decidem; em igualdade, vence o menor tempo somado das
              respostas corretas. Tempos iguais, arredondados em segundos,
              empatam.
            </p>
            <p>
              Convites e partidas expiram após 48 horas. Sair da tela permite
              reconectar; o relógio continua. Abandono encerra a partida sem
              recompensa. 20 pontos para a vitória e 10 para quem completar com
              ao menos um acerto; em empate, 10 para cada. Limite de 3
              recompensas/dia e uma por adversário/semana.
            </p>
            <p>
              As batalhas não modificam o agendamento pessoal. Autoavaliação de
              flashcards e acertos objetivos de batalha são métricas separadas.
            </p>
            <h3>Semanas e offline</h3>
            <p>
              Fechamento: segunda às 00:00 UTC para todos. Revisões offline
              guardam sua data original; só rendem pontos se sincronizadas
              dentro da mesma semana competitiva. Conflitos entre dispositivos
              são preservados no histórico, sem pontuação duplicada.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
function Invite({ onClose }: { onClose: () => void }) {
  const { refresh, toast } = useApp(),
    [q, setQ] = useState(""),
    [users, setUsers] = useState<any[]>([]),
    [guest, setGuest] = useState(""),
    [decks, setDecks] = useState<any[]>([]),
    [deck, setDeck] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/shared-decks")
      .then(setDecks)
      .catch((e) => setError(e.message));
  }, []);
  async function search(e: React.FormEvent) {
    e.preventDefault();
    try {
      setUsers(await api("/users?q=" + encodeURIComponent(q)));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title="Um convite para evoluir" onClose={onClose}>
      <p>Escolha outra pessoa e um baralho autorizado para ambos.</p>
      <form className="image-search" onSubmit={search}>
        <input
          aria-label="Buscar pessoa"
          placeholder="Buscar pelo apelido…"
          minLength={2}
          required
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>
      <div className="people-list">
        {users.map((u) => (
          <button
            key={u.id}
            className={guest === u.id ? "selected" : ""}
            onClick={() => setGuest(u.id)}
          >
            <span className="avatar">{u.avatar}</span>
            {u.nickname}
            {guest === u.id && <Check size={18} />}
          </button>
        ))}
      </div>
      <Field label="Baralho da disputa">
        <select value={deck} onChange={(e) => setDeck(e.target.value)} required>
          <option value="">Selecione um baralho</option>
          {decks
            .filter((d) => d.words >= 4)
            .map((d) => (
              <option value={d.id} key={d.id}>
                {d.name} · {d.owner} · {d.words} palavras
              </option>
            ))}
        </select>
      </Field>
      <p className="footnote">
        Não encontrou um baralho? Em Estudar, edite o baralho e autorize seu uso
        em batalhas. É preciso ter 4 significados distintos.
      </p>
      <ErrorText error={error} />
      <Button
        className="full"
        busy={busy}
        disabled={!guest || !deck}
        onClick={async () => {
          setBusy(true);
          try {
            await api("/battles", "POST", {
              id: crypto.randomUUID(),
              guestId: guest,
              deckId: deck,
            });
            await refresh();
            onClose();
            toast("Desafio enviado.");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Swords size={18} />
        Enviar desafio
      </Button>
    </Modal>
  );
}
function PlayBattle({ id, onClose }: { id: string; onClose: () => void }) {
  const { online, refresh } = useApp(),
    [q, setQ] = useState<any>(null),
    [answer, setAnswer] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [seconds, setSeconds] = useState(60),
    [offset, setOffset] = useState(0),
    [abandon, setAbandon] = useState(false);
  async function next() {
    setBusy(true);
    setError("");
    setAnswer(null);
    try {
      const data = await api("/battles/" + id + "/question");
      setQ(data);
      if (data.serverTime) setOffset(+new Date(data.serverTime) - Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void next();
  }, [id]);
  useEffect(() => {
    if (q?.status !== "question" || answer) return;
    const update = () =>
      setSeconds(
        Math.max(
          0,
          Math.ceil((+new Date(q.deadline) - Date.now() - offset) / 1000),
        ),
      );
    update();
    const t = setInterval(update, 500);
    return () => clearInterval(t);
  }, [q, answer, offset]);
  async function respond(choice: string | null) {
    if (busy || answer) return;
    setBusy(true);
    try {
      setAnswer(
        await api("/battles/" + id + "/answer", "POST", { idx: q.idx, choice }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Hora do desafio" onClose={onClose}>
      {!q ? (
        <p>Carregando partida…</p>
      ) : q.status === "preparation" ? (
        <div className="battle-prep">
          <Swords size={48} />
          <h2>Preparado?</h2>
          <p>
            {q.deckName} · {q.rounds} perguntas.
            <br />
            60 segundos por rodada. O relógio continua se você sair.
          </p>
          <Button
            busy={busy}
            disabled={!online}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api("/battles/" + id + "/ready", "POST", {});
                await next();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Estou pronto
            <ArrowRight size={17} />
          </Button>
        </div>
      ) : q.status === "question" ? (
        <>
          <div className="battle-round">
            <span>
              Rodada {q.idx + 1} de {q.total}
            </span>
            <strong className={seconds < 10 ? "danger-text" : ""}>
              <Clock3 size={16} />
              {seconds}s
            </strong>
          </div>
          <Progress value={q.idx} max={q.total} />
          <h2 className="battle-prompt">{q.prompt}</h2>
          <p className="centered">Qual é o significado?</p>
          <div className="answer-options">
            {q.options.map((o: any) => (
              <button
                key={o.id}
                disabled={busy || !!answer || !seconds || !online}
                className={answer?.answer === o.id ? "correct" : ""}
                onClick={() => respond(o.id)}
              >
                {o.text}
                {answer?.answer === o.id && <Check size={20} />}
              </button>
            ))}
          </div>
          {!seconds && !answer && (
            <Button disabled={!online} onClick={() => respond(null)}>
              Tempo encerrado · continuar
            </Button>
          )}
          {answer && (
            <div className="answer-feedback">
              <strong>
                {answer.correct
                  ? "Boa! Resposta correta."
                  : answer.expired
                    ? "O tempo desta rodada acabou."
                    : "Essa não foi. A resposta está destacada."}
              </strong>
              <Button onClick={next}>
                {q.idx + 1 === q.total
                  ? "Finalizar minhas rodadas"
                  : "Próxima rodada"}
                <ArrowRight size={17} />
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="empty">
          <Trophy size={42} />
          <h2>
            {q.status === "waiting"
              ? "Sua parte está feita."
              : q.status === "completed"
                ? "Batalha concluída."
                : "Esta batalha foi encerrada."}
          </h2>
          <p>
            {q.status === "waiting"
              ? "A outra pessoa ainda está jogando. O resultado ficará salvo quando terminar."
              : "Veja o placar e o resultado na lista de batalhas."}
          </p>
          <Button
            onClick={() => {
              void refresh();
              onClose();
            }}
          >
            Ver batalhas
          </Button>
          <button className="text-button" onClick={next}>
            Atualizar resultado
          </button>
        </div>
      )}
      <ErrorText error={error} />
      {q && ["question", "preparation", "waiting"].includes(q.status) && (
        <div className="danger-zone">
          {abandon ? (
            <>
              <p>Abandonar encerra a partida sem recompensa.</p>
              <Button
                variant="danger"
                busy={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await api("/battles/" + id + "/abandon", "POST", {});
                    await refresh();
                    onClose();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Confirmar abandono
              </Button>
              <Button variant="ghost" onClick={() => setAbandon(false)}>
                Continuar jogando
              </Button>
            </>
          ) : (
            <button
              className="text-button danger-text"
              onClick={() => setAbandon(true)}
            >
              <Flag size={14} />
              Abandonar partida
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
function GroupForm({ onClose }: { onClose: () => void }) {
  const { refresh } = useApp(),
    [mode, setMode] = useState("create"),
    [value, setValue] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Aprendizado em boa companhia" onClose={onClose}>
      <div className="segmented">
        <button
          className={mode === "create" ? "active" : ""}
          onClick={() => setMode("create")}
        >
          Criar grupo
        </button>
        <button
          className={mode === "join" ? "active" : ""}
          onClick={() => setMode("join")}
        >
          Entrar com código
        </button>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api(
              mode === "create" ? "/groups" : "/groups/join",
              "POST",
              mode === "create" ? { name: value } : { code: value },
            );
            await refresh();
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field
          label={mode === "create" ? "Nome do grupo" : "Código de convite"}
        >
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
            minLength={2}
            maxLength={mode === "create" ? 50 : 100}
          />
        </Field>
        <ErrorText error={error} />
        <Button type="submit" busy={busy}>
          {mode === "create" ? "Criar grupo" : "Entrar no grupo"}
        </Button>
      </form>
    </Modal>
  );
}
