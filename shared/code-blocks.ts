export interface CodeBlock {
  lang: string;
  code: string;
}

export type Interpreter = "bash" | "zsh" | "fish" | "python3" | "node";

const INTERPRETERS: Record<string, Interpreter> = {
  bash: "bash",
  sh: "bash",
  shell: "bash",
  shellscript: "bash",
  console: "bash",
  "shell-session": "bash",
  zsh: "zsh",
  fish: "fish",
  python: "python3",
  python3: "python3",
  py: "python3",
  javascript: "node",
  js: "node",
  mjs: "node",
  node: "node",
};

const PROMPT_LANGUAGES = new Set(["console", "shell-session"]);
const MAX_BLOCK_CHARS = 8_000;
const MAX_BLOCKS = 20;

export function interpreterFor(lang: string): Interpreter | null {
  return INTERPRETERS[lang.toLowerCase()] ?? null;
}

/** Fenced code blocks in Markdown, in order. An unclosed trailing fence is ignored. */
export function extractCodeBlocks(markdown: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  let open: { indent: number; fence: string; lang: string; body: string[] } | null = null;

  for (const line of markdown.split(/\r?\n/)) {
    if (!open) {
      const match = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(line);
      if (!match) continue;
      const [, indent, fence, info] = match;
      if (fence.startsWith("`") && info.includes("`")) continue;
      const lang = info.trim().split(/[\s{},]+/)[0] ?? "";
      open = { indent: indent.length, fence, lang: lang.toLowerCase(), body: [] };
      continue;
    }
    const close = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
    if (close && close[1][0] === open.fence[0] && close[1].length >= open.fence.length) {
      blocks.push({ lang: open.lang, code: open.body.join("\n") });
      open = null;
      continue;
    }
    open.body.push(stripIndent(line, open.indent));
  }
  return blocks;
}

/** Code blocks a terminal can run, with shell-session prompts reduced to their commands. */
export function runnableBlocks(markdown: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  for (const block of extractCodeBlocks(markdown)) {
    if (!interpreterFor(block.lang)) continue;
    const code = normalizeCommand(block).trim();
    if (!code || code.length > MAX_BLOCK_CHARS) continue;
    blocks.push({ lang: block.lang, code });
    if (blocks.length === MAX_BLOCKS) break;
  }
  return blocks;
}

function normalizeCommand(block: CodeBlock): string {
  const lines = block.code.split("\n");
  const prompted = lines.filter((line) => /^\s*\$ /.test(line));
  const allPrompted = prompted.length > 0 && prompted.length === lines.filter((l) => l.trim()).length;
  if (!PROMPT_LANGUAGES.has(block.lang) && !allPrompted) return block.code;
  if (prompted.length === 0) return block.code;
  return prompted.map((line) => line.replace(/^\s*\$ /, "")).join("\n");
}

function stripIndent(line: string, indent: number): string {
  let index = 0;
  while (index < indent && line[index] === " ") index++;
  return line.slice(index);
}
