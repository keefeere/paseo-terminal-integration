import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { constants as osConstants, tmpdir } from "node:os";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { interpreterFor, type Interpreter } from "../shared/code-blocks";
import { TERMINAL_NAME, type RunMode, type RunSnapshot } from "../shared/contracts";
import { fenced, trimBlankEdges } from "../shared/text";

type Paseo = PluginHandlerContext["paseo"];
type TerminalHandle = ReturnType<Paseo["terminals"]["ref"]>;

const SCRIPT_DIR = path.join(tmpdir(), "paseo-terminal-integration");
const POLL_MS = 500;
const CAPTURE_WINDOW = 3_000;
const PROMPT_WAIT_MS = 10_000;
const PROMPT_SETTLE_POLLS = 4;
const START_TIMEOUT_MS = 20_000;
const CANCEL_GRACE_MS = 1_500;
const MAX_RUN_MS = 6 * 60 * 60 * 1000;
const AGENT_IDLE_WAIT_MS = 30 * 60 * 1000;
const TAIL_LINES = 6;
const REPORT_MAX_LINES = 300;
const REPORT_MAX_CHARS = 24_000;
const FINISHED_RUN_LIMIT = 200;
const BACKGROUND_MAX_LINES = 5_000;
const BACKGROUND_MAX_LINE_CHARS = 16_000;
const BACKGROUND_FLUSH_MS = 1_000;

// sendKeys() expands only a few key names, so control characters are written as raw bytes.
const CTRL_C = "\x03";
const CTRL_U = "\x15";

const EXTENSIONS: Record<Interpreter, string> = {
  bash: "sh",
  zsh: "zsh",
  fish: "fish",
  python3: "py",
  node: "mjs",
};

interface Run {
  id: string;
  key: string;
  mode: RunMode;
  agentId: string;
  workspaceId: string;
  cwd: string;
  lang: string;
  code: string;
  interpreter: Interpreter;
  status: RunSnapshot["status"];
  exitCode: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  output: string[];
  truncated: boolean;
  sendOnFinish: boolean;
  sending: boolean;
  sent: boolean;
  error: string | null;
  cancelRequested: boolean;
  terminal: TerminalHandle | null;
  process: ChildProcess | null;
}

export interface StartRunInput {
  agentId: string;
  key: string;
  lang: string;
  code: string;
  send: boolean;
  mode: RunMode;
}

/**
 * Runs code blocks in a per-workspace Paseo terminal, or as background processes, and reports
 * output back to the agent.
 */
export class TerminalRunner {
  private readonly runs = new Map<string, Run>();
  private readonly lanes = new Map<string, Promise<void>>();
  private stopped = false;

  constructor(private readonly paseo: Paseo) {}

  async start(input: StartRunInput): Promise<RunSnapshot> {
    const active = this.runs.get(input.key);
    if (active && (active.status === "queued" || active.status === "running")) {
      return snapshot(active);
    }
    const interpreter = interpreterFor(input.lang);
    if (!interpreter) throw new Error(`Cannot run ${input.lang || "unlabeled"} code blocks`);

    const agent = this.paseo.agents.ref(input.agentId);
    await agent.refresh();
    if (!agent.workspaceId || !agent.cwd) throw new Error("This agent has no workspace to run in");

    const run: Run = {
      id: randomUUID().slice(0, 8),
      key: input.key,
      mode: input.mode,
      agentId: input.agentId,
      workspaceId: agent.workspaceId,
      cwd: agent.cwd,
      lang: input.lang,
      code: input.code,
      interpreter,
      status: "queued",
      exitCode: null,
      startedAt: null,
      finishedAt: null,
      output: [],
      truncated: false,
      sendOnFinish: input.send,
      sending: false,
      sent: false,
      error: null,
      cancelRequested: false,
      terminal: null,
      process: null,
    };
    this.runs.delete(input.key);
    this.runs.set(input.key, run);
    this.pruneFinished();

    if (run.mode === "background") {
      // Background runs never touch the terminal, so they skip its queue.
      void this.execute(run);
    } else {
      const lane = (this.lanes.get(run.workspaceId) ?? Promise.resolve()).then(() =>
        this.execute(run),
      );
      this.lanes.set(run.workspaceId, lane);
    }
    return snapshot(run);
  }

  status(keys: readonly string[]): RunSnapshot[] {
    return keys.flatMap((key) => {
      const run = this.runs.get(key);
      return run ? [snapshot(run)] : [];
    });
  }

  cancel(key: string): RunSnapshot | null {
    const run = this.runs.get(key);
    if (!run) return null;
    run.sendOnFinish = false;
    if (run.status === "queued") {
      run.cancelRequested = true;
      this.finish(run, "canceled");
    } else if (run.status === "running" && !run.cancelRequested) {
      run.cancelRequested = true;
      const child = run.process;
      if (child) {
        signalGroup(child, "SIGINT");
        setTimeout(() => signalGroup(child, "SIGKILL"), CANCEL_GRACE_MS).unref();
      } else {
        run.terminal?.write(CTRL_C);
      }
    }
    return snapshot(run);
  }

  sendOutput(key: string): RunSnapshot | null {
    const run = this.runs.get(key);
    if (!run) return null;
    if (run.status === "queued") {
      run.sendOnFinish = true;
    } else {
      void this.deliver(run);
    }
    return snapshot(run);
  }

  stop(): void {
    this.stopped = true;
    for (const run of this.runs.values()) {
      if (run.process) signalGroup(run.process, "SIGTERM");
      if (run.status === "queued" || run.status === "running") {
        run.error = "Plugin stopped before the command finished";
        this.finish(run, "failed");
      }
    }
  }

  private async execute(run: Run): Promise<void> {
    if (run.status !== "queued" || this.stopped) return;
    run.status = "running";
    run.startedAt = Date.now();
    try {
      if (run.mode === "background") {
        await this.runInBackground(run);
      } else {
        const terminal = await this.ensureTerminal(run.workspaceId, run.cwd);
        run.terminal = terminal;
        const wrapper = await writeScripts(run);
        terminal.write(`${CTRL_U} bash ${shellQuote(wrapper)}\r`);
        await this.watch(run, terminal);
      }
    } catch (error) {
      run.error = error instanceof Error ? error.message : String(error);
      this.finish(run, "failed");
    }
    // Delivery waits for the agent to go idle; keep it off the lane so queued runs proceed.
    if (finishedCleanly(run) && run.sendOnFinish) void this.deliver(run);
  }

  private async watch(run: Run, terminal: TerminalHandle): Promise<void> {
    const begin = `__PTI_BEGIN_${run.id}__`;
    const end = new RegExp(`__PTI_END_${run.id}_(\\d+)__`);
    let sawBegin = false;
    let canceledAt: number | null = null;
    let polls = 0;

    while (!this.stopped && run.startedAt !== null && Date.now() - run.startedAt < MAX_RUN_MS) {
      await delay(POLL_MS);
      polls++;
      const { lines } = await terminal.capture({ start: -CAPTURE_WINDOW, stripAnsi: true });
      if (lines.length === 0 && polls % 10 === 0 && !(await terminal.refresh())) {
        run.error = `Terminal "${TERMINAL_NAME}" was closed`;
        this.finish(run, "failed");
        return;
      }

      const beginIndex = lastIndexWhere(lines, (line) => line.includes(begin));
      if (beginIndex >= 0) sawBegin = true;
      if (!sawBegin && !run.cancelRequested && Date.now() - run.startedAt > START_TIMEOUT_MS) {
        run.error = `The command did not start. Is something else running in the "${TERMINAL_NAME}" terminal?`;
        this.finish(run, "failed");
        return;
      }
      const from = beginIndex >= 0 ? beginIndex + 1 : sawBegin ? 0 : lines.length;
      run.truncated = sawBegin && beginIndex < 0;
      const endIndex = lines.findIndex((line, index) => index >= from && end.test(line));
      const output = lines.slice(from, endIndex >= 0 ? endIndex : lines.length);
      run.output = withoutInterruptEcho(trimBlankEdges(output));

      if (endIndex >= 0) {
        run.exitCode = Number(end.exec(lines[endIndex])?.[1] ?? NaN);
        this.finish(run, run.cancelRequested ? "canceled" : "done");
        return;
      }
      if (run.cancelRequested) {
        canceledAt ??= Date.now();
        if (Date.now() - canceledAt > CANCEL_GRACE_MS) {
          this.finish(run, "canceled");
          return;
        }
      }
    }
    if (run.status === "running") {
      run.error = "Stopped watching: the command ran longer than 6 hours";
      this.finish(run, "failed");
    }
  }

  /** Runs the block as a child process with no terminal, stderr merged into stdout. */
  private async runInBackground(run: Run): Promise<void> {
    const codeFile = await writeCode(run);
    const output = new OutputLines();
    const sync = setInterval(() => (run.output = output.lines()), POLL_MS);
    let timedOut = false;
    try {
      const exitCode = await new Promise<number>((resolve, reject) => {
        // One pipe for both streams keeps their order, as a terminal shows it. The command gets
        // its own process group, so Stop reaches its children too, and no controlling terminal or
        // stdin, so a password prompt fails instead of waiting for input.
        const child = spawn("/bin/sh", ["-c", 'exec "$@" 2>&1', "sh", run.interpreter, codeFile], {
          cwd: run.cwd,
          env: backgroundEnv(),
          stdio: ["ignore", "pipe", "pipe"],
          detached: true,
        });
        run.process = child;
        const limit = setTimeout(() => {
          timedOut = true;
          signalGroup(child, "SIGKILL");
        }, MAX_RUN_MS);
        for (const stream of [child.stdout, child.stderr]) {
          const decoder = new StringDecoder("utf8");
          stream.on("data", (chunk: Buffer) => output.write(decoder.write(chunk)));
        }
        child.once("error", (error) => {
          clearTimeout(limit);
          reject(new Error(`Could not start the command in ${run.cwd}: ${error.message}`));
        });
        child.once("exit", (code, signal) => {
          clearTimeout(limit);
          const status = code ?? 128 + (signal ? osConstants.signals[signal] : 0);
          // Output still in the pipes arrives before "close", but a leftover background job that
          // holds them open must not keep the run going.
          const flushed = setTimeout(() => {
            child.stdout.destroy();
            child.stderr.destroy();
            resolve(status);
          }, BACKGROUND_FLUSH_MS);
          child.once("close", () => {
            clearTimeout(flushed);
            resolve(status);
          });
        });
      });
      run.output = trimBlankEdges(output.lines());
      run.truncated = output.dropped > 0;
      if (timedOut) {
        run.error = "Stopped: the command ran longer than 6 hours";
        this.finish(run, "failed");
      } else {
        run.exitCode = exitCode;
        this.finish(run, run.cancelRequested ? "canceled" : "done");
      }
    } finally {
      clearInterval(sync);
      run.process = null;
      await rm(codeFile, { force: true });
    }
  }

  private async ensureTerminal(workspaceId: string, cwd: string): Promise<TerminalHandle> {
    const { entries } = await this.paseo.terminals.list({ workspaceId });
    const existing = entries.find((entry) => entry.name === TERMINAL_NAME);
    if (existing) return this.paseo.terminals.ref(existing);

    const terminal = await this.paseo.terminals.create({ workspaceId, cwd, name: TERMINAL_NAME });
    // Input typed while the shell's rc files still run can be dropped; wait for output to settle.
    const deadline = Date.now() + PROMPT_WAIT_MS;
    let previous = "";
    let stablePolls = 0;
    while (Date.now() < deadline && stablePolls < PROMPT_SETTLE_POLLS) {
      await delay(250);
      const { lines } = await terminal.capture({ stripAnsi: true });
      const current = lines.join("\n");
      stablePolls = current.trim() && current === previous ? stablePolls + 1 : 0;
      previous = current;
    }
    return terminal;
  }

  private async deliver(run: Run): Promise<void> {
    if (run.sending) return;
    run.sending = true;
    run.error = null;
    try {
      const agent = this.paseo.agents.ref(run.agentId);
      await agent.refresh();
      if (agent.status === "running" || agent.status === "initializing") {
        await agent.waitForFinish(AGENT_IDLE_WAIT_MS);
      }
      await agent.send(formatReport(run));
      run.sent = true;
    } catch (error) {
      run.error = `Could not send output: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      run.sending = false;
    }
  }

  private finish(run: Run, status: RunSnapshot["status"]): void {
    run.status = status;
    run.finishedAt = Date.now();
  }

  private pruneFinished(): void {
    const finished = [...this.runs.values()].filter(
      (run) => run.status !== "queued" && run.status !== "running",
    );
    for (const run of finished.slice(0, Math.max(0, finished.length - FINISHED_RUN_LIMIT))) {
      this.runs.delete(run.key);
    }
  }
}

/** Read through a call: TypeScript keeps `run.status` narrowed across the awaits in execute(). */
function finishedCleanly(run: Run): boolean {
  return run.status === "done";
}

function snapshot(run: Run): RunSnapshot {
  return {
    runId: run.id,
    workspaceId: run.workspaceId,
    terminalId: run.terminal?.id ?? null,
    key: run.key,
    mode: run.mode,
    status: run.status,
    exitCode: run.exitCode,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    lineCount: run.output.length,
    tail: run.output.slice(-TAIL_LINES),
    sendOnFinish: run.sendOnFinish,
    sending: run.sending,
    sent: run.sent,
    error: run.error,
  };
}

/**
 * The typed command only names a wrapper script, so the markers never appear in the shell's echo
 * of the input line. The wrapper prints concealed begin/end markers around the command's output.
 */
async function writeScripts(run: Run): Promise<string> {
  const codeFile = await writeCode(run);
  const wrapper = path.join(SCRIPT_DIR, `${run.id}.run.sh`);
  const shell =
    run.interpreter === "bash" || run.interpreter === "zsh" || run.interpreter === "fish";
  const echo = shell
    ? `sed 's/^/$ /' -- ${shellQuote(codeFile)}`
    : `printf '# %s\\n' ${shellQuote(run.interpreter)}; cat -- ${shellQuote(codeFile)}`;

  await writeFile(
    wrapper,
    [
      // A trap handler (unlike an ignored signal) is reset in the child, so Ctrl-C still stops the
      // command while this script survives to print the end marker.
      `trap ':' INT`,
      `cd -- ${shellQuote(run.cwd)} 2>/dev/null`,
      `printf '\\033[2m'; ${echo}; printf '\\033[0m'`,
      `printf '\\033[8m%s\\033[0m\\n' '__PTI_BEGIN_${run.id}__'`,
      `${run.interpreter} ${shellQuote(codeFile)}`,
      `__pti_code=$?`,
      `printf '\\n\\033[8m%s\\033[0m\\033[2m[exit %s]\\033[0m\\n' "__PTI_END_${run.id}_\${__pti_code}__" "$__pti_code"`,
      `rm -f -- ${shellQuote(codeFile)} "$0"`,
      `exit $__pti_code`,
      "",
    ].join("\n"),
    "utf8",
  );
  return wrapper;
}

async function writeCode(run: Run): Promise<string> {
  await mkdir(SCRIPT_DIR, { recursive: true });
  const codeFile = path.join(SCRIPT_DIR, `${run.id}.${EXTENSIONS[run.interpreter]}`);
  await writeFile(codeFile, `${run.code}\n`, "utf8");
  return codeFile;
}

export async function cleanupScripts(): Promise<void> {
  await rm(SCRIPT_DIR, { recursive: true, force: true });
}

function formatReport(run: Run): string {
  const outcome =
    run.status === "done"
      ? `exit code ${run.exitCode}`
      : run.status === "canceled"
        ? "stopped by the user before it finished"
        : run.status === "failed"
          ? `failed: ${run.error ?? "unknown error"}`
          : "still running; partial output";

  let lines = run.output;
  let note = !run.truncated
    ? ""
    : run.mode === "background"
      ? " (earlier lines were dropped)"
      : " (earlier lines scrolled out of the terminal)";
  if (lines.length > REPORT_MAX_LINES) {
    note = ` (last ${REPORT_MAX_LINES} of ${lines.length} lines)`;
    lines = lines.slice(-REPORT_MAX_LINES);
  }
  let output = lines.join("\n");
  if (output.length > REPORT_MAX_CHARS) {
    output = output.slice(-REPORT_MAX_CHARS);
    note = ` (last ${REPORT_MAX_CHARS} characters)`;
  }

  const where =
    run.mode === "background"
      ? "in the background, with no terminal"
      : `in the Paseo terminal "${TERMINAL_NAME}"`;
  return [
    `I ran this ${where} (cwd \`${run.cwd}\`), ${outcome}:`,
    "",
    fenced(run.code, run.lang),
    "",
    output ? `Output${note}:` : "It printed no output.",
    ...(output ? ["", fenced(output, "text")] : []),
  ].join("\n");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Drops the `^C` the terminal echoes when the command is interrupted. */
function withoutInterruptEcho(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && /^\s*\^C\s*$/.test(lines[end - 1])) end--;
  return trimBlankEdges(lines.slice(0, end));
}

/** Terminals get the plugin's environment without the flag that runs Electron apps as Node. */
function backgroundEnv(): NodeJS.ProcessEnv {
  const { ELECTRON_RUN_AS_NODE: _electronAsNode, ...env } = process.env;
  // Python block-buffers a pipe; unbuffered output keeps the card's tail live.
  return { ...env, TERM: "dumb", PYTHONUNBUFFERED: "1" };
}

function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // The group is already gone.
  }
}

// Terminal output cleaning deliberately matches ANSI and control bytes.
// oxlint-disable-next-line no-control-regex
const ANSI_ESCAPE = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)?|[@-Z\\-_])/g;
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

/** Program output as a terminal would show it, without colors: `\r` rewrites the current line. */
class OutputLines {
  private readonly finished: string[] = [];
  private current = "";
  dropped = 0;

  write(text: string): void {
    const [first, ...rest] = text.replace(ANSI_ESCAPE, "").replace(CONTROL_CHARS, "").split("\n");
    this.current += first;
    for (const part of rest) {
      this.finished.push(overwrite(this.current));
      this.current = part;
    }
    if (this.current.length > BACKGROUND_MAX_LINE_CHARS) {
      this.current = overwrite(this.current).slice(-BACKGROUND_MAX_LINE_CHARS);
    }
    const excess = this.finished.length - BACKGROUND_MAX_LINES;
    if (excess > 0) {
      this.finished.splice(0, excess);
      this.dropped += excess;
    }
  }

  lines(): string[] {
    return this.current ? [...this.finished, overwrite(this.current)] : [...this.finished];
  }
}

/** Each segment after a carriage return overwrites the line from its start. */
function overwrite(line: string): string {
  if (!line.includes("\r")) return line;
  return line.split("\r").reduce((shown, segment) => segment + shown.slice(segment.length));
}

function lastIndexWhere<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index--) {
    if (predicate(items[index])) return index;
  }
  return -1;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
