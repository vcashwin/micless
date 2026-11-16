import { useRef, type KeyboardEvent } from "react";
import b from "../Button/Button.module.css";
import s from "./SegmentedControl.module.css";

export type SegmentedOption = { value: string; text: string };

export type SegmentedControlProps = {
  options: SegmentedOption[];
  value: string;
  onValueChange: (value: string) => void;
  /** Stretch the list and its triggers */
  fullWidth?: boolean;
  "aria-label": string;
  className?: string;
};

/** Segmented tabs: pill triggers styled as Button "tab"/"medium". ←/→ move focus (no wrap), Home/End jump, Enter/Space/click select. */
export function SegmentedControl({ options, value, onValueChange, fullWidth, className, ...aria }: SegmentedControlProps) {
  const list = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    const tabs = [...(list.current?.querySelectorAll<HTMLButtonElement>("[role=tab]") ?? [])];
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowRight" ? tabs[Math.min(i + 1, tabs.length - 1)] : e.key === "ArrowLeft" ? tabs[Math.max(i - 1, 0)]
      : e.key === "Home" ? tabs[0] : e.key === "End" ? tabs[tabs.length - 1] : undefined;
    if (next) { e.preventDefault(); next.focus(); }
  };
  return (
    <div ref={list} role="tablist" aria-orientation="horizontal" {...aria} onKeyDown={onKey}
      className={[s.list, fullWidth && s.fullWidth, className].filter(Boolean).join(" ")}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <button key={o.value} type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1} data-active={active ? "" : undefined}
            onClick={() => !active && onValueChange(o.value)}
            className={[b.base, b.tab, b.medium, b.overlay, s.trigger, fullWidth && s.triggerFullWidth].filter(Boolean).join(" ")}>
            <span className={s.text}>{o.text}</span>
          </button>
        );
      })}
    </div>
  );
}
