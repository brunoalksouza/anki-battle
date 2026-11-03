import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Flame,
  RefreshCw,
  Trophy,
  Users,
} from "lucide-react";
import type { ChallengePlayer, ConsistencyChallenge } from "../shared/model";
import { useApp } from "./context";
import { api } from "./offline";
import { Avatar, Button, Empty, Modal, fmt } from "./ui";

const dateLabel = (day: string) =>
  new Date(day + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const statuses = {
  invited: "Invitation sent",
  active: "In progress",
  completed: "Completed",
  declined: "Declined",
  expired: "Invitation expired",
  cancelled: "Ended early",
};

export default function ConsistencyChallenges({
  onInvite,
}: {
  onInvite: () => void;
}) {
  const { s, local, online, refresh, toast, study } = useApp();
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState<ConsistencyChallenge | null>(null);
  const challenges = [...(s.challenges || [])].sort((a, b) => {
    const priority = (c: ConsistencyChallenge) =>
      c.status === "active" ? 0 : c.status === "invited" ? 1 : 2;
    return priority(a) - priority(b);
  });
  async function act(
    c: ConsistencyChallenge,
    action: "accept" | "decline" | "cancel",
  ) {
    setBusy(true);
    try {
      await api(
        `/challenges/${c.id}/${action === "cancel" ? "cancel" : "respond"}`,
        "POST",
        action === "cancel" ? {} : { accept: action === "accept" },
      );
      setEnding(null);
      await refresh();
      toast(
        action === "accept"
          ? "Your 7-day challenge is on. Study your own cards!"
          : action === "decline"
            ? "Invitation declined."
            : "Challenge ended. Your study history is kept.",
      );
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="consistency-intro">
        <span className="stat-icon lavender">
          <Flame size={23} />
        </span>
        <div>
          <h2>Your cards. Your pace. Grow together.</h2>
          <p>
            Different words and levels, one friendly challenge. Study on your
            own and compare your daily progress.
          </p>
          <div className="challenge-rule-chips">
            <span>
              <CalendarDays size={15} /> 7 days
            </span>
            <span>
              <Flame size={15} /> Study days first
            </span>
            <span>
              <Trophy size={15} /> Words break a tie
            </span>
          </div>
        </div>
      </section>
      {local.pending.length > 0 && (
        <p className="notice">
          Your challenge score updates after your pending reviews sync. Sync
          before the last day ends.
        </p>
      )}
      {!challenges.length ? (
        <Empty
          icon={<Users size={32} />}
          title="A little every day. Together."
          description="Invite your study partner. Each of you uses your own private decks; only daily word counts and study days appear on your shared scoreboard."
          action="Invite your study partner"
          onAction={() =>
            online ? onInvite() : toast("Connect to invite your study partner.")
          }
        />
      ) : (
        <div className="consistency-list">
          {challenges.map((c) => {
            const received =
              c.status === "invited" && c.guest.userId === s.user.id;
            const started = c.startDay !== null;
            const leader = [c.host, c.guest].find(
              (p) => p.userId === c.leaderId,
            );
            const tied =
              c.host.totalWords === c.guest.totalWords &&
              c.host.studyDays === c.guest.studyDays;
            const dayNumber = c.host.days.filter(
              (d) => d.day <= c.today,
            ).length;
            return (
              <article className="panel consistency-card" key={c.id}>
                <div className="challenge-card-head">
                  <span
                    className={`badge ${c.status === "active" ? "green" : ""}`}
                  >
                    {received ? "You're invited" : statuses[c.status]}
                  </span>
                  <span>
                    {c.status === "active"
                      ? `Day ${dayNumber} of 7`
                      : "7-day challenge"}
                  </span>
                </div>
                <h2>
                  {c.host.nickname} <span>&amp;</span> {c.guest.nickname}
                </h2>
                <p className="challenge-dates">
                  {started
                    ? `${dateLabel(c.startDay!)} – ${dateLabel(c.endDay!)}`
                    : "Starts when accepted · includes that day's study"}{" "}
                  · {c.timezone.replaceAll("_", " ")}
                </p>
                {started ? (
                  <>
                    <div className="challenge-scoreboard">
                      <Player player={c.host} me={s.user.id} today={c.today} />
                      <Player player={c.guest} me={s.user.id} today={c.today} />
                    </div>
                    <p className="challenge-standing" role="status">
                      <Trophy size={18} />
                      {c.status === "cancelled"
                        ? "Ended early · no winner"
                        : c.status === "completed"
                          ? tied
                            ? "A tie. You both showed up!"
                            : `${leader?.nickname} wins!`
                          : !c.host.totalWords && !c.guest.totalWords
                            ? "Your first review starts the score."
                            : tied
                              ? "You're level. Keep showing up!"
                              : `${leader?.nickname} leads ${c.host.studyDays !== c.guest.studyDays ? "on study days" : "on words reviewed"}.`}
                    </p>
                  </>
                ) : (
                  <div className="challenge-invite-pair">
                    {[c.host, c.guest].map((p) => (
                      <div key={p.userId}>
                        <Avatar
                          userId={p.userId}
                          photoId={p.avatarPhotoId}
                          emoji={p.avatar}
                        />
                        <strong>{p.nickname}</strong>
                        <small>Own cards · own level</small>
                      </div>
                    ))}
                  </div>
                )}
                {received ? (
                  <div className="battle-actions">
                    <Button
                      variant="secondary"
                      busy={busy}
                      disabled={!online}
                      onClick={() => void act(c, "decline")}
                    >
                      Decline
                    </Button>
                    <Button
                      busy={busy}
                      disabled={!online}
                      onClick={() => void act(c, "accept")}
                    >
                      <Check size={17} /> Accept challenge
                    </Button>
                  </div>
                ) : c.status === "active" ? (
                  <div className="challenge-actions">
                    <Button onClick={() => study()}>
                      Study my cards <ArrowRight size={17} />
                    </Button>
                    <button
                      className="text-button"
                      disabled={busy || !online}
                      onClick={() => setEnding(c)}
                    >
                      End challenge
                    </button>
                  </div>
                ) : c.status === "invited" ? (
                  <div className="challenge-actions">
                    <p className="footnote">
                      Waiting for your partner. Accept by{" "}
                      {new Date(c.invitationExpiresAt).toLocaleDateString(
                        "en-US",
                        {
                          timeZone: c.timezone,
                          month: "short",
                          day: "numeric",
                        },
                      )}
                      .
                    </p>
                    <button
                      className="text-button"
                      disabled={busy || !online}
                      onClick={() => setEnding(c)}
                    >
                      Cancel invitation
                    </button>
                  </div>
                ) : null}
                {started && (
                  <p className="footnote">
                    Each word counts once per day, across all your decks. Study
                    days decide the winner; total daily word counts break a tie.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
      <Button
        variant="secondary"
        disabled={busy || !online}
        onClick={async () => {
          setBusy(true);
          try {
            await refresh();
          } catch (e) {
            toast((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <RefreshCw size={16} /> Refresh scores
      </Button>
      <p className="footnote">
        Scores use synced reviews of your own due cards, with at least 2 seconds
        of active study. All difficulty ratings count equally. Adding or
        importing words alone does not count. The same time zone applies to both
        players; sync before the final day ends.
      </p>
      {ending && (
        <Modal
          title={
            ending.status === "invited"
              ? "Cancel this invitation?"
              : "End this challenge?"
          }
          onClose={() => !busy && setEnding(null)}
        >
          <p>
            {ending.status === "invited"
              ? "Your partner will no longer be able to accept this invitation."
              : "The challenge will end for both of you without a winner. Your cards and study history are kept."}
          </p>
          <div className="modal-actions">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setEnding(null)}
            >
              Keep it
            </Button>
            <Button
              busy={busy}
              disabled={!online}
              onClick={() => void act(ending, "cancel")}
            >
              Confirm
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Player({
  player: p,
  me,
  today,
}: {
  player: ChallengePlayer;
  me: string;
  today: string;
}) {
  return (
    <div className={`challenge-player ${p.userId === me ? "is-me" : ""}`}>
      <Avatar userId={p.userId} photoId={p.avatarPhotoId} emoji={p.avatar} />
      <strong className="challenge-player-name">
        {p.nickname}
        {p.userId === me && <small> you</small>}
      </strong>
      <div className="challenge-today">
        <strong>{fmt(p.todayWords)}</strong>
        <span>words today</span>
      </div>
      <div className="challenge-totals">
        <div>
          <strong>
            {p.studyDays}
            <small>/7</small>
          </strong>
          <span>study days</span>
        </div>
        <div>
          <strong>{fmt(p.totalWords)}</strong>
          <span>total words</span>
        </div>
      </div>
      <ol
        className="challenge-days"
        aria-label={`${p.nickname}'s daily word counts`}
      >
        {p.days.map((d) => (
          <li
            key={d.day}
            className={`${d.words ? "studied" : ""} ${d.day === today ? "today" : ""} ${d.day > today ? "future" : ""}`}
            title={`${dateLabel(d.day)}: ${d.words} words`}
            aria-label={`${dateLabel(d.day)}: ${d.day > today ? "upcoming" : `${d.words} words`}`}
          >
            <span>
              {new Date(d.day + "T12:00:00Z").toLocaleDateString("en-US", {
                weekday: "narrow",
                timeZone: "UTC",
              })}
            </span>
            <strong>
              {d.day > today
                ? "·"
                : d.words
                  ? d.words >= 1000
                    ? `${Math.floor(d.words / 1000)}k`
                    : fmt(d.words)
                  : "–"}
            </strong>
          </li>
        ))}
      </ol>
    </div>
  );
}
