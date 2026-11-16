import type { ButtonHTMLAttributes, MouseEvent, MouseEventHandler, ReactNode, Ref } from "react";
import s from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "borderless" | "muted" | "dangerous-borderless" | "link" | "dangerous" | "circle" | "tab";
export type ButtonSize = "small" | "medium" | "normal" | "large";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading (or trailing with rightAlignIcon) icon element, e.g. <Icon name="GitHub" /> */
  icon?: ReactNode;
  /** Force 14px or 16px icon box; default 14 for small/medium, 16 otherwise */
  iconSize?: 14 | 16;
  iconContainerSize?: "default" | "content";
  /** Icons inherit the text color (default true) */
  monotoneIcon?: boolean;
  rightAlignIcon?: boolean;
  /** Selected/pressed state (data-active) */
  active?: boolean;
  stretched?: boolean;
  /** Cancels horizontal padding via negative margin (borderless / dangerous-borderless / link only) */
  noInvisiblePadding?: boolean;
  /** Render as icon-only even with children (children become the accessible label) */
  onlyIcon?: boolean;
  /** Element rendered first inside the button, under the content */
  underlay?: ReactNode;
  onMiddleClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  type?: "button" | "submit" | "reset";
  ref?: Ref<HTMLButtonElement>;
  "data-menu-open"?: boolean;
  /** Draws the button as an `<a>` opening `href` in a new tab */
  href?: string;
};

const variantClass: Record<ButtonVariant, string> = {
  primary: s.primary, secondary: s.secondary, ghost: s.ghost, borderless: s.borderless, muted: s.muted,
  "dangerous-borderless": s.dangerousBorderless, link: s.link, dangerous: s.dangerous, circle: s.circle, tab: s.tab,
};
const recolorsIcon = (v: ButtonVariant) => ["ghost", "borderless", "muted", "dangerous-borderless", "link", "tab"].includes(v);

export function Button({
  variant = "primary", size = "normal", icon, iconSize, iconContainerSize = "default", monotoneIcon = true,
  rightAlignIcon = false, active = false, stretched, noInvisiblePadding = false, onlyIcon,
  underlay, onMiddleClick, onClick, onAuxClick, type = "button", className, children, ref, href, ...rest
}: ButtonProps) {
  const isOnlyIcon = !children || !!onlyIcon;
  const isCircle = variant === "circle";
  const pad = isOnlyIcon || isCircle ? s.padOnly : icon ? (rightAlignIcon ? s.padIconRight : s.padIcon) : s.padText;
  const noPad = noInvisiblePadding && ["borderless", "dangerous-borderless", "link"].includes(variant);
  const small = iconSize === 14 || (iconSize === undefined && (size === "small" || size === "medium"));
  const iconEl = icon ? (
    <span aria-hidden className={[s.icon, !isOnlyIcon && (rightAlignIcon ? s.iconGapLeft : s.iconGapRight), small ? s.iconSmall : s.iconNormal, iconContainerSize === "content" && s.iconContent].filter(Boolean).join(" ")}>
      {icon}
    </span>
  ) : null;
  const handleAux = (e: MouseEvent<HTMLButtonElement>) => {
    if (e.button === 1 && onMiddleClick) { e.preventDefault(); e.stopPropagation(); if (!rest.disabled) onMiddleClick(e); }
    else onAuxClick?.(e);
  };
  const cls = [
    s.base, variantClass[variant], s[size], pad, noPad && s.noPad, active && s.active, stretched && s.stretched,
    (variant === "secondary" || variant === "tab") && s.overlay,
    monotoneIcon ? s.iconMonotone : undefined, (recolorsIcon(variant) || monotoneIcon) && s.iconFollow, className,
  ].filter(Boolean).join(" ");
  if (href) return (
    <a href={href} target="_blank" rel="noreferrer" data-active={active ? "true" : undefined} className={cls} aria-label={rest["aria-label"]} title={rest.title} style={rest.style}
      onClick={onClick as unknown as MouseEventHandler<HTMLAnchorElement>}>
      {rightAlignIcon ? null : iconEl}{onlyIcon ? null : children}{rightAlignIcon ? iconEl : null}
    </a>
  );
  return (
    <button ref={ref} type={type} data-active={active ? "true" : undefined} data-icon-hover={recolorsIcon(variant) && !monotoneIcon ? "" : undefined}
      {...rest} onClick={onClick} onAuxClick={onMiddleClick ? handleAux : onAuxClick} className={cls}>
      {underlay}
      {rightAlignIcon ? null : iconEl}
      {onlyIcon ? null : children}
      {rightAlignIcon ? iconEl : null}
    </button>
  );
}
