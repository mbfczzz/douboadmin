import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import "../styles/date-field.css";

const pad = (n: number) => String(n).padStart(2, "0");
const format = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (text: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const d = m && new Date(+m[1], +m[2] - 1, +m[3]);
  return d && format(d) === text ? d : null;
};
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

// Date input with a themed calendar; the browser's own picker cannot be styled.
// The value stays a plain YYYY-MM-DD text field, so typing and forms still work.
export default function DateField({
  name,
  label,
  defaultValue = "",
}: {
  name: string;
  label: string;
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue),
    [open, setOpen] = useState(false),
    [month, setMonth] = useState(() => parse(defaultValue) || new Date()),
    box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function show() {
    // Clicks inside an enclosing <label> are forwarded to the input; only
    // reset the shown month when the calendar actually opens.
    if (open) return;
    setMonth(parse(value) || new Date());
    setOpen(true);
  }
  function pick(d: Date | null) {
    setValue(d ? format(d) : "");
    setOpen(false);
  }
  const first = new Date(month.getFullYear(), month.getMonth(), 1),
    start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    }),
    today = format(new Date()),
    shift = (n: number) =>
      setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  return (
    <div
      className="date-field"
      ref={box}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          // Close only the calendar, not a surrounding dialog.
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <input
        name={name}
        aria-label={label}
        value={value}
        placeholder="年-月-日"
        pattern="\d{4}-\d{2}-\d{2}"
        title="格式：2026-11-08"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        onChange={(e) => setValue(e.target.value.trim())}
        onClick={show}
      />
      <button
        type="button"
        className="icon"
        aria-label={`选择${label}`}
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
      >
        <CalendarDays size={16} />
      </button>
      {open && (
        <div
          className="date-popover"
          role="group"
          aria-label={`${label}日历`}
          // Stop the enclosing <label> from re-targeting clicks to the input.
          onClick={(e) => e.preventDefault()}
        >
          <header>
            <button
              type="button"
              className="icon"
              aria-label="上个月"
              onClick={() => shift(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <strong>
              {month.getFullYear()}年{month.getMonth() + 1}月
            </strong>
            <button
              type="button"
              className="icon"
              aria-label="下个月"
              onClick={() => shift(1)}
            >
              <ChevronRight size={16} />
            </button>
          </header>
          <div className="date-grid">
            {weekdays.map((w) => (
              <span key={w}>{w}</span>
            ))}
            {days.map((d) => {
              const key = format(d);
              return (
                <button
                  type="button"
                  key={key}
                  className={[
                    d.getMonth() !== month.getMonth() && "outside",
                    key === today && "today",
                    key === value && "selected",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-label={`${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`}
                  aria-pressed={key === value}
                  onClick={() => pick(d)}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <footer>
            <button
              type="button"
              className="text-button"
              onClick={() => pick(null)}
            >
              清除
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => pick(new Date())}
            >
              今天
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}
