"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { formatLongDate, formatMonthYear, latestCompleteDay } from "@/lib/dates";
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
 * The range reads as `6th Nov 2026 – 10th Nov 2026`. Clicking it opens a
 * calendar of days only: the first click picks the start, the second picks
 * the end and applies the range straight away.
 */
export function DateRangePicker() {
  const { rangeDays, allTime, customStart, customEnd, setRangeDays, setCustomRange } =
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
    <div ref={rootRef} className="relative flex flex-wrap items-center justify-end gap-2">
      <div className="flex items-center gap-1">
        {RANGE_PRESETS.map((days) => (
          <button
            key={days}
            type="button"
            aria-pressed={presetActive(days)}
            onClick={() => {
              setRangeDays(days);
              setOpen(false);
            }}
            className={`rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
              presetActive(days)
                ? "border-[var(--nos-accent-border)] bg-white/10 text-white"
                : "border-[var(--border)] text-[var(--nos-text-secondary)] hover:border-[var(--nos-accent-border)] hover:text-white"
            }`}
          >
            {days} days
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={openPicker}
        aria-expanded={open}
        className="flex items-center gap-2 whitespace-nowrap rounded-full border border-[var(--border)] bg-white/5 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-[var(--nos-accent-border)]"
      >
        <CalendarDays size={15} className="text-[var(--nos-accent-2)]" />
        {dateFilterLabel(filter)}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a date range"
          className="absolute right-0 top-full z-40 mt-2 w-max rounded-2xl p-4"
          style={{
            background: "var(--vui-gradient-card)",
            border: "1px solid var(--nos-accent-border)",
            boxShadow: "0 20px 27px rgba(0,0,0,0.5)",
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-6">
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
                ? `From ${formatLongDate(pendingStart)}. Now choose the end day.`
                : "Choose a start day, then an end day."}
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
          <div className="flex items-start gap-10">
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
      )}
    </div>
  );
}

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
    <div className="w-[280px] shrink-0">
      <p className="mb-2 text-center text-sm font-bold tracking-wide text-white">
        {formatMonthYear(month.year, month.month)}
      </p>
      <div className="grid grid-cols-7 gap-x-2 gap-y-1 text-center">
        {WEEKDAYS.map((day) => (
          <span key={day} className="pb-1 text-[11px] font-semibold tracking-wide text-[var(--nos-text-muted)]">
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
