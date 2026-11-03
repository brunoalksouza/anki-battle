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
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];
const number = (value: number, digits = 0) =>
  value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
const duration = (ms: number) => {
  const seconds = Math.round(ms / 1000);
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} min`
    : seconds >= 60
      ? `${Math.floor(seconds / 60)} min ${seconds % 60} s`
      : `${seconds} s`;
};
const dateLabel = (day: string) =>
  new Date(day + "T12:00:00Z").toLocaleDateString("pt-BR", {
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
    return `${dateLabel(cell.day)}: ${cell.future ? "dia futuro" : kind === "study" ? `${number(cell.count)} ${cell.count === 1 ? "revisão" : "revisões"} · ${duration(cell.activeMs)}` : cell.count ? "acessou o aplicativo" : "nenhum acesso"}`;
  }
  const metrics = [
    {
      label: kind === "study" ? "Média diária" : "Dias com acesso",
      value:
        kind === "study"
          ? `${number(data.average, 1)} ${number(data.average, 1) === "1" ? "revisão" : "revisões"}`
          : `${number(data.activeDays)} ${data.activeDays === 1 ? "dia" : "dias"}`,
      hint: `${number(data.total)} ${kind === "study" ? "revisões" : "acessos"} em ${data.elapsedDays} dias decorridos de ${year}; inclui dias sem atividade.`,
    },
    {
      label: kind === "study" ? "Dias estudados" : "Frequência",
      value: `${number(data.percent, 1)}%`,
      hint: `${data.activeDays} de ${data.elapsedDays} dias decorridos de ${year}. Dias futuros não entram no cálculo.`,
    },
    {
      label: "Maior sequência",
      value: `${data.longest} ${data.longest === 1 ? "dia" : "dias"}`,
      hint: `Maior sequência dentro de ${year}.`,
    },
    {
      label: "Sequência atual",
      value: `${data.current} ${data.current === 1 ? "dia" : "dias"}`,
      hint: "Sequência até hoje ou ontem, incluindo a passagem de ano. Você ainda pode estudar hoje para continuar.",
    },
  ];
  return (
    <section
      className="panel activity-heatmap"
      aria-labelledby="activity-title"
    >
      <div className="heatmap-heading">
        <div>
          <h2 id="activity-title">Cada dia conta</h2>
          <p>Um ano de pequenos passos.</p>
        </div>
        <select
          aria-label="Tipo de atividade"
          value={kind}
          onChange={(e) => setKind(e.target.value as ActivityKind)}
        >
          <option value="study">Estudo</option>
          <option value="access">Acessos</option>
        </select>
      </div>
      <p className="heatmap-today">
        {kind === "study" ? (
          <>
            Hoje:{" "}
            <strong>
              {number(todayCount)} {todayCount === 1 ? "revisão" : "revisões"}
            </strong>{" "}
            em <strong>{duration(todayData?.activeMs || 0)}</strong>
            <span>
              {" "}
              ·{" "}
              {number(
                todayCount ? (todayData?.activeMs || 0) / 1000 / todayCount : 0,
                1,
              )}{" "}
              s por revisão
            </span>
          </>
        ) : todayCount ? (
          "Você acessou o aplicativo hoje."
        ) : (
          "Nenhum acesso registrado hoje."
        )}
      </p>
      <div className="heatmap-year-nav" aria-label="Ano do mapa de atividade">
        <button
          aria-label="Ano anterior"
          disabled={year <= 1970}
          onClick={() => navigateYear(year - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          className="heatmap-year"
          aria-label={`Voltar ao ano atual, ${currentYear}`}
          title="Voltar ao ano atual"
          onClick={() => navigateYear(currentYear)}
        >
          <RotateCcw size={13} />
          <span aria-live="polite">{year}</span>
        </button>
        <button
          aria-label="Próximo ano"
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
            {["Seg", "", "Qua", "", "Sex", "", "Dom"].map((label, i) => (
              <span key={i}>{label}</span>
            ))}
          </div>
          <div
            className="heatmap-grid"
            role="grid"
            aria-label={`${kind === "study" ? "Revisões" : "Acessos"} em ${year}`}
            aria-rowcount={7}
            aria-colcount={data.columns}
          >
            {Array.from({ length: 7 }, (_, row) => (
              <div
                role="row"
                aria-label={
                  [
                    "Segunda-feira",
                    "Terça-feira",
                    "Quarta-feira",
                    "Quinta-feira",
                    "Sexta-feira",
                    "Sábado",
                    "Domingo",
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
          Deslize para ver o ano
        </span>
        <div
          className="heatmap-legend"
          aria-label={
            kind === "study"
              ? "Intensidade: nenhuma, 1 a 5, 6 a 15, 16 a 30, mais de 30 revisões"
              : "Intensidade: sem acesso ou com acesso"
          }
        >
          <span>{kind === "study" ? "Menos" : "Sem acesso"}</span>
          {(kind === "study" ? [0, 1, 2, 3, 4] : [0, 3]).map((level) => (
            <i key={level} data-level={level} />
          ))}
          <span>{kind === "study" ? "Mais" : "Com acesso"}</span>
        </div>
      </div>
      <p className="heatmap-detail" aria-live="polite" aria-atomic="true">
        {chosen ? (
          <>
            <strong>{dateLabel(chosen.day)}</strong>
            <span>
              {kind === "study"
                ? `${number(chosen.count)} ${chosen.count === 1 ? "revisão" : "revisões"} · ${duration(chosen.activeMs)} de estudo`
                : chosen.count
                  ? "Acessou o aplicativo"
                  : "Nenhum acesso registrado"}
            </span>
          </>
        ) : (
          <>Toque em um dia para ver sua atividade.</>
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
        {year}: {data.activeDays} de {data.elapsedDays} dias{" "}
        {kind === "study" ? "com estudo" : "com acesso"}. Média e frequência
        consideram os dias decorridos do ano; sequência atual considera o
        histórico até hoje.
      </p>
    </section>
  );
}
