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
  Avatar,
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
  invited: "Invitation sent",
  active: "In progress",
  completed: "Completed",
  declined: "Invitation declined",
  expired: "Expired",
  abandoned: "Abandoned",
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
          <span className="eyebrow">KNOWLEDGE THAT CONNECTS</span>
          <h1>Level up together.</h1>
          <p>A friendly challenge. One more reason to learn.</p>
        </div>
        <Button disabled={!online} onClick={() => setInvite(true)}>
          <Swords size={18} />
          Challenge a friend
        </Button>
      </div>
      <div className="tabs">
        <button
          className={tab === "battles" ? "active" : ""}
          onClick={() => setTab("battles")}
        >
          <Swords size={17} />
          Battles
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
          My groups
        </button>
      </div>
      {!online && (
        <div className="notice">
          Connect to get the latest battles, invitations, and rankings. Your
          last synced activity is shown below.
        </div>
      )}
      {tab === "battles" && (
        <>
          {!s.battles.length ? (
            <Empty
              icon={<Swords size={32} />}
              title="Your first battle awaits."
              description="Invite a friend and choose a shared deck. The same questions, one chance each."
              action="Create challenge"
              onAction={() =>
                online
                  ? setInvite(true)
                  : toast("Connect to challenge a friend.")
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
                        {received ? "You're invited" : statusNames[b.status]}
                      </span>
                      <small>
                        {b.deckName} · {b.rounds} rounds
                      </small>
                    </div>
                    <div className="versus">
                      <div>
                        <Avatar
                          userId={b.hostId}
                          photoId={b.hostAvatarPhotoId}
                          emoji={b.hostAvatar}
                        />
                        <strong>{b.hostName}</strong>
                        <small>
                          {b.hostCorrect} correct
                          {b.status === "completed" && (
                            <>
                              {" "}
                              ·{" "}
                              {(b.hostTime / 1000).toLocaleString("en-US", {
                                maximumFractionDigits: 2,
                              })}{" "}
                              s
                            </>
                          )}
                        </small>
                      </div>
                      <span className="vs">VS</span>
                      <div>
                        <Avatar
                          userId={b.guestId}
                          photoId={b.guestAvatarPhotoId}
                          emoji={b.guestAvatar}
                        />
                        <strong>{b.guestName}</strong>
                        <small>
                          {b.guestCorrect} correct
                          {b.status === "completed" && (
                            <>
                              {" "}
                              ·{" "}
                              {(b.guestTime / 1000).toLocaleString("en-US", {
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
                          Decline
                        </Button>
                        <Button
                          disabled={busy || !online}
                          onClick={() => respond(b, true)}
                        >
                          Accept challenge
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
                          ? "View progress"
                          : "Continue battle"}
                        <ArrowRight size={17} />
                      </Button>
                    ) : b.status === "completed" ? (
                      <p className="battle-result">
                        {b.winnerId === null
                          ? "A tie. You both learned something."
                          : b.winnerId === s.user.id
                            ? "You won this battle!"
                            : `${b.winnerId === b.hostId ? b.hostName : b.guestName} won this battle.`}
                      </p>
                    ) : b.status === "invited" ? (
                      <p className="footnote">
                        Waiting for acceptance. Expires:{" "}
                        {new Date(b.expiresAt).toLocaleString("en-US")}.
                      </p>
                    ) : null}
                    {b.status === "completed" &&
                      b.winnerId &&
                      b.hostCorrect === b.guestCorrect && (
                        <p className="footnote centered">
                          Tie broken by the fastest total time on correct
                          answers.
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
            Refresh challenges
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
                This week
              </button>
              <button
                className={period === "all" ? "active" : ""}
                onClick={() => setPeriod("all")}
              >
                All time
              </button>
            </div>
            <select
              aria-label="Leaderboard group"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="">All participants</option>
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
              <h2>Every step counts.</h2>
              <p>The leaderboard rewards consistent, valid activity.</p>
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
                  <Avatar
                    userId={r.id}
                    photoId={r.avatarPhotoId}
                    emoji={r.avatar}
                  />
                  <div>
                    <strong>
                      {r.nickname}
                      {r.id === s.user.id && <small> you</small>}
                    </strong>
                    <small>
                      {r.points
                        ? "Learning a little every day"
                        : "No points yet"}
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
            The leaderboard week starts Monday at 00:00 UTC. Your points history
            is always kept.
          </p>
        </>
      )}
      {tab === "groups" && (
        <>
          <SectionHead
            title="Your learning circle"
            extra={
              <Button
                variant="secondary"
                onClick={() => setGroupModal(true)}
                disabled={!online}
              >
                <Plus size={17} />
                Create or join
              </Button>
            }
          />
          {!s.groups.length ? (
            <Empty
              icon={<Users size={30} />}
              title="Better with company."
              description="Create a group to compare progress with friends. Share the code only with people you want to invite."
            />
          ) : (
            <div className="deck-grid">
              {s.groups.map((g) => (
                <section key={g.id} className="panel">
                  <h2>{g.name}</h2>
                  <p>{g.members} participants</p>
                  <Field label="Join code">
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
                    View leaderboard
                    <ArrowRight size={16} />
                  </Button>
                </section>
              ))}
            </div>
          )}
        </>
      )}
      <button className="text-button spaced" onClick={() => setRules(true)}>
        How do points and battles work?
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
        <Modal title="A fair competition" onClose={() => setRules(false)}>
          <div className="rules">
            <h3>Study points</h3>
            <p>
              Earn 5 points for the first valid review of a word each UTC day,
              up to 100 words per day. Study for at least 2 seconds. Again,
              Hard, Good, and Easy all earn the same points. Signing in,
              refreshing, and duplicate requests earn no points.
            </p>
            <h3>Battles</h3>
            <p>
              Answer up to 10 multiple-choice questions from the same shared
              deck. Each player has 60 seconds per question, timed by the
              server. Most correct answers wins; ties are broken by total time
              on correct answers. Equal times, rounded to seconds, result in a
              tie.
            </p>
            <p>
              Invitations and battles expire after 48 hours. You can return
              after leaving the screen, but the timer keeps running. Abandoning
              ends the battle without rewards. A win earns 20 points; finishing
              with at least one correct answer earns 10. A tie earns 10 each.
              Rewards are limited to 3 per day and one per opponent per week.
            </p>
            <p>
              Battles do not change your personal review schedule. Flashcard
              self-ratings and verified battle answers are tracked separately.
            </p>
            <h3>Weeks and offline study</h3>
            <p>
              The week resets Monday at 00:00 UTC for everyone. Offline reviews
              keep their original dates and earn points when synced within that
              leaderboard week. Conflicts between devices stay in your history
              without duplicate points.
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
    <Modal title="An invitation to grow" onClose={onClose}>
      <p>Choose a friend and a deck shared with both of you.</p>
      <form className="image-search" onSubmit={search}>
        <input
          aria-label="Find a person"
          placeholder="Search by nickname…"
          minLength={2}
          required
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <div className="people-list">
        {users.map((u) => (
          <button
            key={u.id}
            className={guest === u.id ? "selected" : ""}
            onClick={() => setGuest(u.id)}
          >
            <Avatar userId={u.id} photoId={u.avatarPhotoId} emoji={u.avatar} />
            {u.nickname}
            {guest === u.id && <Check size={18} />}
          </button>
        ))}
      </div>
      <Field label="Battle deck">
        <select value={deck} onChange={(e) => setDeck(e.target.value)} required>
          <option value="">Choose a deck</option>
          {decks
            .filter((d) => d.words >= 4)
            .map((d) => (
              <option value={d.id} key={d.id}>
                {d.name} · {d.owner} · {d.words} words
              </option>
            ))}
        </select>
      </Field>
      <p className="footnote">
        Can't find a deck? Open Study, edit the deck, and enable battles. It
        needs at least 4 distinct meanings.
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
            toast("Challenge sent.");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Swords size={18} />
        Send challenge
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
    <Modal title="Challenge time" onClose={onClose}>
      {!q ? (
        <p>Loading battle…</p>
      ) : q.status === "preparation" ? (
        <div className="battle-prep">
          <Swords size={48} />
          <h2>Ready?</h2>
          <p>
            {q.deckName} · {q.rounds} questions.
            <br />
            60 seconds per round. The timer keeps running if you leave.
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
            I'm ready
            <ArrowRight size={17} />
          </Button>
        </div>
      ) : q.status === "question" ? (
        <>
          <div className="battle-round">
            <span>
              Round {q.idx + 1} of {q.total}
            </span>
            <strong className={seconds < 10 ? "danger-text" : ""}>
              <Clock3 size={16} />
              {seconds}s
            </strong>
          </div>
          <Progress value={q.idx} max={q.total} />
          <h2 className="battle-prompt">{q.prompt}</h2>
          <p className="centered">What does it mean?</p>
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
              Time's up · continue
            </Button>
          )}
          {answer && (
            <div className="answer-feedback">
              <strong>
                {answer.correct
                  ? "Nice! Correct answer."
                  : answer.expired
                    ? "Time's up for this round."
                    : "Not quite. The correct answer is highlighted."}
              </strong>
              <Button onClick={next}>
                {q.idx + 1 === q.total ? "Finish my rounds" : "Next round"}
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
              ? "You've finished your rounds."
              : q.status === "completed"
                ? "Battle complete."
                : "This battle has ended."}
          </h2>
          <p>
            {q.status === "waiting"
              ? "Your opponent is still playing. The result will be saved when they finish."
              : "See the score and result in your battle list."}
          </p>
          <Button
            onClick={() => {
              void refresh();
              onClose();
            }}
          >
            View battles
          </Button>
          <button className="text-button" onClick={next}>
            Refresh result
          </button>
        </div>
      )}
      <ErrorText error={error} />
      {q && ["question", "preparation", "waiting"].includes(q.status) && (
        <div className="danger-zone">
          {abandon ? (
            <>
              <p>Abandoning ends the battle without rewards.</p>
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
                Confirm abandon
              </Button>
              <Button variant="ghost" onClick={() => setAbandon(false)}>
                Keep playing
              </Button>
            </>
          ) : (
            <button
              className="text-button danger-text"
              onClick={() => setAbandon(true)}
            >
              <Flag size={14} />
              Abandon battle
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
    <Modal title="Learning with good company" onClose={onClose}>
      <div className="segmented">
        <button
          className={mode === "create" ? "active" : ""}
          onClick={() => setMode("create")}
        >
          Create group
        </button>
        <button
          className={mode === "join" ? "active" : ""}
          onClick={() => setMode("join")}
        >
          Join with a code
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
        <Field label={mode === "create" ? "Group name" : "Invitation code"}>
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
          {mode === "create" ? "Create group" : "Join group"}
        </Button>
      </form>
    </Modal>
  );
}
