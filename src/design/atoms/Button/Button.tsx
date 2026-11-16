import type { ButtonHTMLAttributes, ReactNode } from "react";
import s from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "borderless";
export type ButtonSize = "small" | "medium" | "normal" | "large";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon element, e.g. <Icon name="GitHub" />; it takes the text color */
  icon?: ReactNode;
  stretched?: boolean;
  /** Render as icon-only even with children (children become the accessible label) */
  onlyIcon?: boolean;
  /** Draws the button as an `<a>` opening `href` in a new tab */
  href?: string;
};

export function Button({ variant = "primary", size = "normal", icon, stretched, onlyIcon, href, className, children, ...rest }: ButtonProps) {
  const isOnlyIcon = !children || !!onlyIcon;
  const small = size === "small" || size === "medium";
  const iconEl = icon ? (
    <span aria-hidden className={[s.icon, !isOnlyIcon && s.iconGap, small ? s.iconSmall : s.iconNormal].filter(Boolean).join(" ")}>{icon}</span>
  ) : null;
  const cls = [s.base, s[variant], s[size], isOnlyIcon ? s.padOnly : icon ? s.padIcon : s.padText, stretched && s.stretched,
    variant === "secondary" && s.overlay, className].filter(Boolean).join(" ");
  if (href) return (
    <a href={href} target="_blank" rel="noreferrer" className={cls} aria-label={rest["aria-label"]} title={rest.title} style={rest.style}>
      {iconEl}{onlyIcon ? null : children}
    </a>
  );
  return <button type="button" {...rest} className={cls}>{iconEl}{onlyIcon ? null : children}</button>;
}
