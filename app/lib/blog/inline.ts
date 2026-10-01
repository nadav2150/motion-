// Render helpers shared by the blog screens. Kept apart from ./index so the
// client bundle never imports the post registry.

export function formatPostDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export type InlineToken =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "link"; text: string; href: string };

// Parses the two inline marks posts may use: [label](href) and **bold**.
export function parseInline(input: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  for (const m of input.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) tokens.push({ kind: "text", text: input.slice(last, at) });
    if (m[1] !== undefined) tokens.push({ kind: "link", text: m[1], href: m[2] });
    else tokens.push({ kind: "bold", text: m[3] });
    last = at + m[0].length;
  }
  if (last < input.length) tokens.push({ kind: "text", text: input.slice(last) });
  return tokens;
}
