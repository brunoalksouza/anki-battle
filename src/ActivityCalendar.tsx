import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  MoveHorizontal,
} from "lucide-react";
import { useApp } from "./context";
import { dayKey } from "../shared/model";
import {
  annualActivity,
  activityCount,
  shiftDay,
  type ActivityKind,
} from "../shared/activity";
const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const number = (value: number, digits = 0) =>
  value.toLocaleString("en-US", { maximumFractionDigits: digits });
const duration = (ms: number) => {
  const seconds = Math.round(ms / 1000);
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} min`
    : seconds >= 60
      ? `${Math.floor(seconds / 60)} min ${seconds % 60} s`
      : `${seconds} s`;
};
const dateLabel = (day: string) =>
  new Date(day + "T12:00:00Z").toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
export default function ActivityCalendar() {
  const { s } = useApp(),
    today = dayKey(new Date(), s.user.timezone),
    currentYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(currentYear),
    [kind, setKind] = useState<ActivityKind>("study"),
    [selected, setSelected] = useState(today);
  const scroller = useRef<HTMLDivElement>(null),
    buttons = useRef(new Map<string, HTMLButtonElement>());
  const data = annualActivity(s.days, year, today, kind),
    todayData = s.days.find((d) => d.day === today);
  const todayCount = activityCount(todayData, kind),
    chosen = data.cells.find(
      (c) => c.day === selected && c.inYear && !c.future,
    );
  const focusDay =
    chosen?.day || (year === currentYear ? today : `${year}-12-31`);
  function centerCalendar() {
    const el = scroller.current;
    if (!el) return;
    const column = data.cells.findIndex((c) => c.day === today) / 7;
    el.scrollLeft =
      year === currentYear
        ? Math.max(
            0,
            (column / data.columns) * el.scrollWidth - el.clientWidth * 0.65,
          )
        : 0;
  }
  useEffect(centerCalendar, [year, today]);
  function navigateYear(next: number) {
    if (next === year) centerCalendar();
    setYear(next);
    setSelected(next === currentYear ? today : `${next}-12-31`);
  }
  function move(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    const delta = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[
      event.key
    ];
    if (delta === undefined && event.key !== "Home" && event.key !== "End")
      return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? `${year}-01-01`
        : event.key === "End"
          ? year === currentYear
            ? today
            : `${year}-12-31`
          : shiftDay(day, delta!);
    const target = buttons.current.get(next);
    if (target && !target.disabled) {
      target.focus();
      setSelected(next);
    }
  }
  function description(cell: (typeof data.cells)[number]) {
    return `${dateLabel(cell.day)}: ${cell.future ? "future day" : kind === "study" ? `${number(cell.count)} ${cell.count === 1 ? "review" : "reviews"} · ${duration(cell.activeMs)}` : cell.count ? "opened the app" : "no visits"}`;
  }
  const metrics = [
    {
      label: kind === "study" ? "Daily average" : "Days visited",
      value:
        kind === "study"
          ? `${number(data.average, 1)} ${number(data.average, 1) === "1" ? "review" : "reviews"}`
          : `${number(data.activeDays)} ${data.activeDays === 1 ? "day" : "days"}`,
      hint: `${number(data.total)} ${kind === "study" ? "reviews" : "visits"} in ${data.elapsedDays} elapsed days in ${year}; includes days without activity.`,
    },
    {
      label: kind === "study" ? "Days studied" : "Frequency",
      value: `${number(data.percent, 1)}%`,
      hint: `${data.activeDays} of ${data.elapsedDays} elapsed days in ${year}. Future days are excluded.`,
    },
    {
      label: "Longest streak",
      value: `${data.longest} ${data.longest === 1 ? "day" : "days"}`,
      hint: `Longest streak in ${year}.`,
    },
    {
      label: "Current streak",
      value: `${data.current} ${data.current === 1 ? "day" : "days"}`,
      hint: "Your streak through today or yesterday, including across years. Study today to keep it going.",
    },
  ];
  return (
    <section
      className="panel activity-heatmap"
      aria-labelledby="activity-title"
    >
      <div className="heatmap-heading">
        <div>
          <h2 id="activity-title">
            {kind === "study" ? "Flashcard activity" : "App visits"}
          </h2>
          <p>
            {kind === "study"
              ? "Your reviews and study streaks across the year."
              : "Your visits across the year."}
          </p>
        </div>
        <select
          aria-label="Activity type"
          value={kind}
          onChange={(e) => setKind(e.target.value as ActivityKind)}
        >
          <option value="study">Cards</option>
          <option value="access">Visits</option>
        </select>
      </div>
      <p className="heatmap-today">
        {kind === "study" ? (
          <>
            Today:{" "}
            <strong>
              {number(todayCount)} {todayCount === 1 ? "review" : "reviews"}
            </strong>{" "}
            in <strong>{duration(todayData?.activeMs || 0)}</strong>
            <span>
              {" "}
              ·{" "}
              {number(
                todayCount ? (todayData?.activeMs || 0) / 1000 / todayCount : 0,
                1,
              )}{" "}
              s per review
            </span>
          </>
        ) : todayCount ? (
          "You opened the app today."
        ) : (
          "No visits recorded today."
        )}
      </p>
      <div className="heatmap-year-nav" aria-label="Activity calendar year">
        <button
          aria-label="Previous year"
          disabled={year <= 1970}
          onClick={() => navigateYear(year - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          className="heatmap-year"
          aria-label={`Return to the current year, ${currentYear}`}
          title="Return to the current year"
          onClick={() => navigateYear(currentYear)}
        >
          <RotateCcw size={13} />
          <span aria-live="polite">{year}</span>
        </button>
        <button
          aria-label="Next year"
          disabled={year >= currentYear}
          onClick={() => navigateYear(year + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="heatmap-scroll" ref={scroller}>
        <div
          className="heatmap-canvas"
          style={{ "--heatmap-weeks": data.columns } as CSSProperties}
        >
          <div className="heatmap-months" aria-hidden="true">
            {data.months.map((m) => (
              <span key={m.month} style={{ gridColumn: m.column + 1 }}>
                {monthNames[m.month]}
              </span>
            ))}
          </div>
          <div className="heatmap-weekdays" aria-hidden="true">
            {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((label, i) => (
              <span key={i}>{label}</span>
            ))}
          </div>
          <div
            className="heatmap-grid"
            role="grid"
            aria-label={`${kind === "study" ? "Reviews" : "Visits"} in ${year}`}
            aria-rowcount={7}
            aria-colcount={data.columns}
          >
            {Array.from({ length: 7 }, (_, row) => (
              <div
                role="row"
                aria-label={
                  [
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                    "Sunday",
                  ][row]
                }
                className="heatmap-weekday-row"
                key={row}
              >
                {Array.from({ length: data.columns }, (_, column) => {
                  const cell = data.cells[column * 7 + row];
                  return cell.inYear ? (
                    <button
                      key={cell.day}
                      ref={(node) => {
                        if (node) buttons.current.set(cell.day, node);
                        else buttons.current.delete(cell.day);
                      }}
                      role="gridcell"
                      aria-selected={selected === cell.day}
                      aria-label={description(cell)}
                      title={description(cell)}
                      aria-current={cell.day === today ? "date" : undefined}
                      disabled={cell.future}
                      tabIndex={cell.day === focusDay ? 0 : -1}
                      className="heatmap-day"
                      data-level={cell.level}
                      data-today={cell.day === today}
                      onClick={() => setSelected(cell.day)}
                      onFocus={() => setSelected(cell.day)}
                      onKeyDown={(event) => move(event, cell.day)}
                    />
                  ) : (
                    <span
                      className="heatmap-padding"
                      role="gridcell"
                      aria-disabled="true"
                      key={cell.day}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="heatmap-key">
        <span className="heatmap-swipe">
          <MoveHorizontal size={14} />
          Swipe to explore the year
        </span>
        <div
          className="heatmap-legend"
          aria-label={
            kind === "study"
              ? "Intensity: none, 1 to 5, 6 to 15, 16 to 30, over 30 reviews"
              : "Intensity: no visit or visited"
          }
        >
          <span>{kind === "study" ? "Less" : "No visit"}</span>
          {(kind === "study" ? [0, 1, 2, 3, 4] : [0, 3]).map((level) => (
            <i key={level} data-level={level} />
          ))}
          <span>{kind === "study" ? "More" : "Visited"}</span>
        </div>
      </div>
      <p className="heatmap-detail" aria-live="polite" aria-atomic="true">
        {chosen ? (
          <>
            <strong>{dateLabel(chosen.day)}</strong>
            <span>
              {kind === "study"
                ? `${number(chosen.count)} ${chosen.count === 1 ? "review" : "reviews"} · ${duration(chosen.activeMs)} of study`
                : chosen.count
                  ? "Opened the app"
                  : "No visits recorded"}
            </span>
          </>
        ) : (
          <>Tap a day to see your activity.</>
        )}
      </p>
      <div className="heatmap-stats">
        {metrics.map((metric) => (
          <div key={metric.label} title={metric.hint}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>
      <p className="heatmap-footnote">
        {year}: {data.activeDays} of {data.elapsedDays} days{" "}
        {kind === "study" ? "with study" : "with a visit"}. Average and
        frequency use elapsed days this year; the current streak includes your
        history through today.
      </p>
    </section>
  );
}
