import type { CSSProperties, SVGProps } from "react";
import { icons, type IconName } from "./icons";
import styles from "./Icon.module.css";

import { colorVar, type ColorToken } from "../../tokens";

/** Theme color token name (e.g. "labelMuted", "greenBase") or any CSS color. */
export type IconColor = ColorToken | (string & {});

export type IconProps = Omit<SVGProps<SVGSVGElement>, "color"> & {
  name: IconName;
  /** px; default 16 */
  size?: number;
  /** default "labelMuted" */
  color?: IconColor;
};

export function Icon({ name, size = 16, color = "labelMuted", className, style, ...rest }: IconProps) {
  const { viewBox = `0 0 ${size} ${size}`, body } = icons[name];
  const fill = colorVar(color);
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      role="img"
      focusable="false"
      aria-hidden={rest["aria-label"] ? undefined : true}
      className={[styles.icon, className].filter(Boolean).join(" ")}
      style={{ "--icon-default-color": fill, ...style } as CSSProperties}
      dangerouslySetInnerHTML={{ __html: body }}
      {...rest}
    />
  );
}
export { icons, type IconName };
