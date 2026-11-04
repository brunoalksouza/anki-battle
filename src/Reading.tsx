import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Link2,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { useApp } from "./context";
import { Button, ErrorText, Field, Modal } from "./ui";
import { api } from "./offline";
import { dayKey } from "../shared/model";
import { emptyReading, readingStreak } from "../shared/reading";
const INSIGHTS = "https://www.amazon.com/kindle/reading/insights";
export function ReadingGoalCard() {
  const { s, navigate } = useApp();
  const r = s.reading || emptyReading(),
    today = dayKey(new Date(), s.user.timezone);
  const done = r.days.includes(today);
  return (
    <button
      className={"reading-goal-card " + (done ? "is-complete" : "")}
      onClick={() => navigate("reading")}
    >
      <span className="reading-goal-icon">
        {done ? <Check size={23} /> : <BookOpen size={23} />}
      </span>
      <span className="reading-goal-copy">
        <span className="eyebrow">YOUR DAILY READING</span>
        <strong>
          {done
            ? "A little reading. Another day of growth."
            : "Make room for a few pages."}
        </strong>
        <span>
          {done
            ? "Today's goal is complete · Confirmed by Kindle"
            : r.status === "disconnected"
              ? "Read every day · Connect your Kindle"
              : "Read every day · Waiting for Kindle confirmation"}
        </span>
      </span>
      <ArrowRight size={19} />
    </button>
  );
}
export default function Reading() {
  const { s, online, refresh, toast, navigate } = useApp();
  const r = s.reading || emptyReading(),
    today = dayKey(new Date(), s.user.timezone);
  const [connect, setConnect] = useState(false),
    [disconnect, setDisconnect] = useState(false),
    [cookie, setCookie] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [month, setMonth] = useState(today.slice(0, 7));
  const start = new Date(month + "-01T12:00:00Z"),
    year = start.getUTCFullYear(),
    monthIndex = start.getUTCMonth();
  const firstWeekday = (start.getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const known = new Set(r.days),
    done = known.has(today);
  const fresh =
    r.status === "connected" &&
    !!r.lastSync &&
    dayKey(r.lastSync, s.user.timezone) === today;
  const streak = readingStreak(
    r.days,
    fresh || !r.lastSync ? today : dayKey(r.lastSync, s.user.timezone),
  );
  const received = r.lastSync
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: s.user.timezone,
      }).format(new Date(r.lastSync))
    : "No data received yet";
  async function run(path: string, method = "POST", body?: unknown) {
    setBusy(true);
    setError("");
    try {
      const result = await api("/reading/" + path, method, body);
      setCookie("");
      setConnect(false);
      setDisconnect(false);
      await refresh();
      if (path === "sync")
        toast(
          result.status === "connected"
            ? "Showing your latest confirmed Kindle data."
            : "Kindle could not update. Your confirmed reading days are safe.",
        );
      else
        toast(
          path === "connect"
            ? "Kindle connected. Reading days will update automatically."
            : "Kindle disconnected. Your reading history is still here.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function shiftMonth(offset: number) {
    setMonth(
      new Date(Date.UTC(year, monthIndex + offset, 1))
        .toISOString()
        .slice(0, 7),
    );
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void run("connect", "POST", { cookie });
  }
  return (
    <>
      <button className="text-button" onClick={() => navigate("home")}>
        <ArrowLeft size={16} /> Back to home
      </button>
      <div className="page-heading reading-heading">
        <div>
          <span className="eyebrow">ONE DAY AT A TIME</span>
          <h1>Read. Reflect. Grow.</h1>
          <p>Your daily reading habit, alongside your words.</p>
        </div>
      </div>
      <section className={"panel reading-today " + (done ? "is-complete" : "")}>
        <span className="reading-goal-icon">
          {done ? <Check size={28} /> : <BookOpen size={28} />}
        </span>
        <div>
          <span className="eyebrow">DAILY GOAL · READ EVERY DAY</span>
          <h2>{done ? "You read today." : "A few pages are a good start."}</h2>
          <p>
            {done
              ? "Today's reading is confirmed by Kindle. Keep growing tomorrow."
              : "Read on your Kindle, then let it sync with Amazon. Your goal updates when Kindle confirms the day."}
          </p>
        </div>
        <span className="reading-badge">
          {done ? "Goal complete" : "Not confirmed yet"}
        </span>
      </section>
      <div className="reading-metrics">
        <div className="panel">
          <Flame size={20} />
          <strong>
            {r.lastSync ? streak : "—"}
            <small> days</small>
          </strong>
          <span>
            {fresh ? "Current reading streak" : "Last confirmed streak"}
          </span>
        </div>
        <div className="panel">
          <strong>
            {r.lastSync ? r.longestDaily : "—"}
            <small> days</small>
          </strong>
          <span>Best Kindle streak</span>
        </div>
        <div className="panel">
          <strong>
            {r.lastSync ? r.titlesByYear[today.slice(0, 4)] || 0 : "—"}
            <small> books</small>
          </strong>
          <span>Marked as read in {today.slice(0, 4)}</span>
        </div>
      </div>
      <div className="reading-layout">
        <section
          className="panel reading-calendar"
          aria-label="Confirmed reading days"
        >
          <div className="reading-calendar-head">
            <div>
              <span className="eyebrow">EVERY DAY COUNTS</span>
              <h2>
                {new Intl.DateTimeFormat("en", {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(start)}
              </h2>
            </div>
            <div>
              <button
                className="icon-button"
                aria-label="Previous reading month"
                onClick={() => shiftMonth(-1)}
              >
                <ChevronLeft size={20} />
              </button>
              <button
                className="icon-button"
                aria-label="Next reading month"
                disabled={month >= today.slice(0, 7)}
                onClick={() => shiftMonth(1)}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
          <div className="reading-calendar-grid">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <small key={day}>{day}</small>
            ))}
            {Array.from({ length: firstWeekday }, (_, i) => (
              <span key={"empty" + i} />
            ))}
            {Array.from({ length }, (_, i) => {
              const day = month + "-" + String(i + 1).padStart(2, "0");
              return (
                <span
                  key={day}
                  className={
                    "reading-day " +
                    (known.has(day) ? "confirmed " : "") +
                    (day === today ? "today " : "") +
                    (day > today ? "future" : "")
                  }
                  title={`${day}: ${known.has(day) ? "Reading confirmed by Kindle" : day > today ? "Upcoming day" : "No confirmed data"}`}
                  aria-label={`${day}: ${known.has(day) ? "Reading confirmed by Kindle" : day > today ? "Upcoming day" : "No confirmed data"}`}
                >
                  {i + 1}
                  {known.has(day) && <Check size={12} />}
                </span>
              );
            })}
          </div>
          <p className="reading-legend">
            <span /> Confirmed by Kindle <i /> No confirmed data
          </p>
          <p className="muted reading-note">
            Only confirmed dates appear here. Blank days may have missing data,
            especially before you connected Kindle.
          </p>
        </section>
        <section className="panel kindle-connection">
          <BookOpen size={25} />
          <h2>Your Kindle connection</h2>
          <span className={"reading-status " + r.status}>
            {
              {
                disconnected: "Not connected",
                connected: "Automatic updates on",
                reconnect: "Reconnect needed",
                error: "Update delayed",
              }[r.status]
            }
          </span>
          <p>
            {r.status === "disconnected"
              ? "Connect once on a computer. Your reading goal will then update on your iPhone, even with the computer off."
              : r.status === "reconnect"
                ? "Your Amazon session needs to be renewed. Reconnect to resume automatic updates. Your confirmed days are safe."
                : r.status === "error"
                  ? "Kindle is temporarily unavailable. We will try again automatically. Your confirmed days are safe."
                  : "We check Kindle every 15 minutes. Your Kindle needs to sync with Amazon first."}
          </p>
          <small>Last received: {received}</small>
          {!online && (
            <p className="reading-note">
              You are offline. Showing the last saved reading data.
            </p>
          )}
          <ErrorText error={error && !connect ? error : ""} />
          {r.status === "disconnected" || r.status === "reconnect" ? (
            <Button
              disabled={!online || busy}
              onClick={() => {
                setError("");
                setConnect(true);
              }}
            >
              <Link2 size={17} />
              {r.status === "reconnect" ? "Reconnect Kindle" : "Connect Kindle"}
            </Button>
          ) : (
            <Button
              disabled={!online || busy}
              onClick={() => void run("sync", "POST", {})}
            >
              <RefreshCw size={17} className={busy ? "spin" : ""} />
              {busy ? "Checking Kindle…" : "Check for updates"}
            </Button>
          )}
          <a
            className="text-button"
            href={INSIGHTS}
            target="_blank"
            rel="noreferrer"
          >
            Open Kindle Reading Insights <ArrowRight size={14} />
          </a>
          {r.status !== "disconnected" && (
            <button
              className="text-button muted"
              disabled={!online || busy}
              onClick={() => setDisconnect(true)}
            >
              <Unplug size={14} /> Disconnect Kindle
            </button>
          )}
          <p className="muted reading-note">
            Reading days are separate from flashcard points and challenges.
            Kindle does not provide reading minutes through this connection.
          </p>
        </section>
      </div>
      {connect && (
        <Modal
          title="Connect your Kindle"
          onClose={() => {
            if (!busy) {
              setConnect(false);
              setCookie("");
              setError("");
            }
          }}
        >
          <form className="kindle-connect-form" onSubmit={submit}>
            <p>
              This is an unofficial connection to Amazon Reading Insights. Your
              Amazon session is encrypted on the Study Grove server. It grants
              broader Amazon account access, so treat it like a password. You
              can disconnect at any time.
            </p>
            <details>
              <summary>Get your session on a computer</summary>
              <ol>
                <li>
                  Open{" "}
                  <a href={INSIGHTS} target="_blank" rel="noreferrer">
                    Kindle Reading Insights
                  </a>{" "}
                  and sign in to your Amazon account.
                </li>
                <li>
                  Open your browser's developer tools and select{" "}
                  <strong>Network</strong>. Reload Reading Insights.
                </li>
                <li>
                  Select the request ending in <strong>/insights/data</strong>.
                  Under <strong>Request Headers</strong>, copy the value of{" "}
                  <strong>Cookie</strong>.
                </li>
                <li>
                  Paste it below. Do not share it in a message or screenshot.
                </li>
              </ol>
            </details>
            <Field label="Amazon session (Cookie header)">
              <input
                type="password"
                required
                autoComplete="off"
                spellCheck={false}
                maxLength={16000}
                value={cookie}
                onChange={(e) => setCookie(e.target.value)}
                placeholder="Paste your session here"
              />
            </Field>
            <p className="reading-note muted">
              Your Amazon password is not needed. Only a successfully verified
              session is saved.
            </p>
            <ErrorText error={error} />
            <Button type="submit" disabled={!online || busy || !cookie.trim()}>
              {busy ? "Verifying session…" : "Connect and sync reading days"}
            </Button>
          </form>
        </Modal>
      )}
      {disconnect && (
        <Modal
          title="Disconnect Kindle?"
          onClose={() => !busy && setDisconnect(false)}
        >
          <p>
            Your saved Amazon session will be removed. Confirmed reading days
            will stay in Study Grove.
          </p>
          <Button
            disabled={busy}
            onClick={() => void run("connection", "DELETE")}
          >
            Disconnect Kindle
          </Button>
        </Modal>
      )}
    </>
  );
}
