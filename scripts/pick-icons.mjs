// Copies the named icons out of the design system's full icon set into src/design/atoms/Icon/icons.ts.
// Usage: node scripts/pick-icons.mjs <path to the full icons.ts> Name1 Name2 ...
import { readFileSync, writeFileSync } from "node:fs";
const [src, ...names] = process.argv.slice(2);
const lines = readFileSync(src, "utf8").split("\n");
const picked = names.map(n => {
  const line = lines.find(l => l.startsWith(`  ${JSON.stringify(n)}:`) || l.startsWith(`  ${n}:`));
  if (!line) throw new Error(`no icon ${n}`);
  return line.replace(/,?$/, ",");
});
writeFileSync(new URL("../src/design/atoms/Icon/icons.ts", import.meta.url),
  `// Picked by scripts/pick-icons.mjs. Rerun it to add an icon.\nexport const icons = {\n${picked.join("\n")}\n} satisfies Record<string, { viewBox?: string; body: string }>;\n\nexport type IconName = keyof typeof icons;\n`);
