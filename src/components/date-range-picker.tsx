"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { formatLongDate, latestCompleteDay } from "@/lib/dates";
import {
  RANGE_PRESETS,
  dateFilterFromStore,
  dateFilterLabel,
  dateFilterWindow,
  useDashboardStore,
} from "@/store/dashboard-store";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

type Month = { year: number; month: number };

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shift({ year, month }: Month, by: number): Month {
  const index = year * 12 + month + by;
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
}

function monthOf(date: string): Month {
  const [year, month] = date.split("-").map(Number);
  return { year, month: month - 1 };
}

/** Monday-first grid for one month. Null cells pad the first week. */
function monthGrid({ year, month }: Month): Array<string | null> {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const lead = (first + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, index) => iso(year, month, index + 1)),
  ];
}

/**
 * The range reads as `6th November 2026 to 10th November 2026`. Clicking it
 * opens a calendar: the first click picks the start, the second picks the end
 * and applies the range straight away.
 */
export function DateRangePicker() {
  const { rangeDays, allTime, customStart, customEnd, setRangeDays, setAllTime, setCustomRange } =
    useDashboardStore();
  const filter = dateFilterFromStore({ rangeDays, allTime, customStart, customEnd });
  const current = dateFilterWindow(filter);
  const yesterday = latestCompleteDay();
  const lastMonth = monthOf(yesterday);

  const [open, setOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [rightMonth, setRightMonth] = useState<Month>(monthOf(current?.end ?? yesterday));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const openPicker = () => {
    setPendingStart(null);
    setHovered(null);
    setRightMonth(monthOf(current?.end ?? yesterday));
    setOpen((value) => !value);
  };

  const pick = (date: string) => {
    if (!pendingStart) {
      setPendingStart(date);
      return;
    }
    const [start, end] = pendingStart <= date ? [pendingStart, date] : [date, pendingStart];
    setCustomRange(start, end);
    setPendingStart(null);
    setOpen(false);
  };

  const highlight = useMemo(() => {
    if (pendingStart) {
      const other = hovered ?? pendingStart;
      return pendingStart <= other
        ? { start: pendingStart, end: other }
        : { start: other, end: pendingStart };
    }
    return current;
  }, [pendingStart, hovered, current]);

  const presetActive = (days: number) => !customStart && !allTime && rangeDays === days;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={openPicker}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/5 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-[var(--nos-accent-border)]"
      >
        <CalendarDays size={15} className="text-[var(--nos-accent-2)]" />
        {dateFilterLabel(filter)}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a date range"
          className="absolute right-0 top-full z-40 mt-2 flex gap-4 rounded-2xl p-4"
          style={{
            background: "var(--vui-gradient-card)",
            backdropFilter: "blur(120px)",
            border: "1px solid var(--nos-accent-border)",
            boxShadow: "0 20px 27px rgba(0,0,0,0.5)",
          }}
        >
          <div className="flex w-32 shrink-0 flex-col gap-1 border-r border-[var(--border)] pr-3">
            {RANGE_PRESETS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => {
                  setRangeDays(days);
                  setOpen(false);
                }}
                className={`rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-white/10 ${
                  presetActive(days) ? "bg-white/10 font-bold text-white" : "text-[var(--nos-text-secondary)]"
                }`}
              >
                Last {days} days
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setAllTime();
                setOpen(false);
              }}
              className={`rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-white/10 ${
                allTime && !customStart ? "bg-white/10 font-bold text-white" : "text-[var(--nos-text-secondary)]"
              }`}
            >
              All time
            </button>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setRightMonth((month) => shift(month, -1))}
                className="rounded-full p-1 text-[var(--nos-text-secondary)] hover:bg-white/10 hover:text-white"
              >
                <ChevronLeft size={16} />
              </button>
              <p className="text-xs text-[var(--nos-text-secondary)]">
                {pendingStart
                  ? `From ${formatLongDate(pendingStart)}. Now pick the end date.`
                  : "Pick a start date, then an end date."}
              </p>
              <button
                type="button"
                aria-label="Next month"
                disabled={rightMonth.year * 12 + rightMonth.month >= lastMonth.year * 12 + lastMonth.month}
                onClick={() => setRightMonth((month) => shift(month, 1))}
                className="rounded-full p-1 text-[var(--nos-text-secondary)] hover:bg-white/10 hover:text-white disabled:opacity-30"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="flex gap-6">
              {[shift(rightMonth, -1), rightMonth].map((month) => (
                <MonthView
                  key={`${month.year}-${month.month}`}
                  month={month}
                  maxDate={yesterday}
                  highlight={highlight}
                  onPick={pick}
                  onHover={setHovered}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function MonthView({
  month,
  maxDate,
  highlight,
  onPick,
  onHover,
}: {
  month: Month;
  maxDate: string;
  highlight: { start: string; end: string } | null;
  onPick: (date: string) => void;
  onHover: (date: string | null) => void;
}) {
  return (
    <div className="w-[224px]">
      <p className="mb-2 text-center text-sm font-bold text-white">
        {MONTH_NAMES[month.month]} {month.year}
      </p>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((day) => (
          <span key={day} className="pb-1 text-[10px] font-semibold uppercase text-[var(--nos-text-muted)]">
            {day}
          </span>
        ))}
        {monthGrid(month).map((date, index) => {
          if (!date) return <span key={`pad-${index}`} />;
          const disabled = date > maxDate;
          const edge = highlight && (date === highlight.start || date === highlight.end);
          const inside = highlight && date > highlight.start && date < highlight.end;
          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              onClick={() => onPick(date)}
              onMouseEnter={() => onHover(date)}
              onMouseLeave={() => onHover(null)}
              aria-label={formatLongDate(date)}
              className={`mx-auto flex size-8 items-center justify-center rounded-full text-xs tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-25 ${
                edge
                  ? "font-bold text-white"
                  : inside
                    ? "bg-white/10 text-white"
                    : "text-[var(--nos-text-secondary)] hover:bg-white/10 hover:text-white"
              }`}
              style={edge ? { background: "var(--vui-gradient-brand)" } : undefined}
            >
              {Number(date.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
