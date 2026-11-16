import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import b from "../Button/Button.module.css";
import s from "./SegmentedControl.module.css";

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

export type SegmentedOption = {
  value: string;
  /** Text rendered as a miniPlus label (Trigger `label`) */
  label?: ReactNode;
  /** The trigger's text as string children (`S`: miniPlus, truncated; the unadorned padding) */
  text?: string;
  /** Leading icon (`before`) */
  icon?: ReactNode;
  /** Trailing element (`after`) */
  after?: ReactNode;
  disabled?: boolean;
};

export type SegmentedControlProps = {
  options: SegmentedOption[];
  value: string;
  onValueChange?: (value: string) => void;
  /** Stretch the list and its triggers */
  fullWidth?: boolean;
  /** `borderless` list: no background, no overlay shadows (the template library's categories) */
  borderless?: boolean;
  "aria-label"?: string;
  className?: string;
  style?: CSSProperties;
};

/** Segmented tabs:
 *  pill triggers styled as Button "tab"/"medium". ←/→ move focus (no wrap), Home/End jump, Enter/Space/click select. */
export function SegmentedControl({ options, value, onValueChange, fullWidth, borderless, className, style, ...aria }: SegmentedControlProps) {
  const list = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    const tabs = [...(list.current?.querySelectorAll<HTMLButtonElement>("[role=tab]:not([data-disabled])") ?? [])];
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowRight" ? tabs[Math.min(i + 1, tabs.length - 1)] : e.key === "ArrowLeft" ? tabs[Math.max(i - 1, 0)]
      : e.key === "Home" ? tabs[0] : e.key === "End" ? tabs[tabs.length - 1] : undefined;
    if (next) { e.preventDefault(); next.focus(); }
  };
  return (
    <div ref={list} role="tablist" aria-orientation="horizontal" data-orientation="horizontal" {...aria} onKeyDown={onKey}
      className={cx(s.list, fullWidth && s.fullWidth, borderless && s.borderless, className)} style={style}>
      {options.map(o => {
        const active = o.value === value;
        const btn = (
          <button key={o.value} type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1} data-orientation="horizontal"
            data-active={active ? "" : undefined} data-disabled={o.disabled ? "true" : undefined} aria-disabled={!!o.disabled}
            onClick={() => !o.disabled && !active && onValueChange?.(o.value)}
            className={cx(b.base, b.tab, b.medium, b.overlay, s.trigger, o.icon || o.after ? s.adorned : undefined, o.label != null && s.withLabel,
              fullWidth && s.triggerFullWidth, borderless && s.triggerBorderless)}>
            {o.icon}
            {o.text != null && <span className={s.text}>{o.text}</span>}
            {o.after}
            {o.label != null ? <span className={s.text}>{o.label}</span> : null}
          </button>
        );
        return btn;
      })}
    </div>
  );
}
