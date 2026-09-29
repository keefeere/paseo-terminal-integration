import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { DaemonClient, type TerminalStreamEvent } from "@getpaseo/client/internal/daemon-client";
import { RUN_MARKER } from "../shared/text";

// The plugin SDK exposes terminal capture without colors or cursor state, so live views use
// their own daemon connection and the same terminal stream the app's terminal tabs render.

const SCROLLBACK_LINES = 5_000;
const READ_WAIT_MS = 15_000;
const IDLE_VIEW_MS = 60_000;
const SWEEP_MS = 30_000;
const MAX_PENDING_CHARS = 4_000_000;
const CONNECT_TIMEOUT_MS = 10_000;
// Full reset, so a restore after a reconnect replaces the screen instead of appending to it.
const RESET = "\x1bc";

interface Size {
  rows: number;
  cols: number;
}

interface View {
  id: string;
  terminalId: string;
  chunks: string[];
  /** Cursor value at the start of chunks[0]. */
  base: number;
  /** Cursor value after the last chunk. */
  end: number;
  closed: string | null;
  seenAt: number;
  decoder: TextDecoder;
  wake: (() => void) | null;
  release(): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function daemonTarget(): Promise<{ url: string; token: string | undefined }> {
  const home = process.env.PASEO_HOME?.trim() || path.join(homedir(), ".paseo");
  let listen = "";
  try {
    const lock = JSON.parse(await readFile(path.join(home, "paseo.pid"), "utf8")) as { listen?: unknown };
    if (typeof lock.listen === "string") listen = lock.listen.trim();
  } catch {
    throw new Error("The Paseo daemon lock file is missing");
  }
  if (/^\d+$/.test(listen)) listen = `127.0.0.1:${listen}`;
  listen = listen.replace(/^(0\.0\.0\.0|\[::\]):/, "127.0.0.1:");
  if (!/^(\[[\da-f:]+\]|[\w.-]+):\d+$/i.test(listen)) {
    throw new Error(`Live terminals need a TCP daemon address; this daemon listens on ${listen || "an unknown address"}`);
  }
  const token = await readFile(path.join(home, "local-credential"), "utf8").then(
    (text) => text.trim(),
    () => "",
  );
  return { url: `ws://${listen}/ws`, token: /^[\w-]{43}$/.test(token) ? token : undefined };
}

export class TerminalStreams {
  private client: Promise<DaemonClient> | null = null;
  private readonly views = new Map<string, View>();
  private readonly sweeper = setInterval(() => this.sweep(), SWEEP_MS);

  async open({ terminalId, rows, cols }: Size & { terminalId: string }): Promise<{ viewId: string }> {
    const client = await this.connect();
    const view: View = {
      id: randomUUID(),
      terminalId,
      chunks: [],
      base: 0,
      end: 0,
      closed: null,
      seenAt: Date.now(),
      decoder: new TextDecoder(),
      wake: null,
      release: () => {},
    };
    this.views.set(view.id, view);

    // Like a terminal tab, take over the PTY size before asking for the snapshot.
    client.sendTerminalInput(terminalId, { type: "resize", rows, cols, intent: "claim" });
    const subscription = client.observeTerminal(terminalId, (event) => this.receive(view, event), {
      restore: { mode: "full-snapshot", scrollbackLines: SCROLLBACK_LINES, size: { rows, cols } },
    });
    view.release = () => void subscription.release().catch(() => {});
    subscription.subscribe({
      snapshot: () => {},
      update: (message) => {
        if (message.type === "terminal_stream_exit") {
          this.finish(view, message.payload.error ?? "The terminal exited");
        }
      },
      error: (error) => this.finish(view, errorMessage(error)),
    });

    try {
      const ready = await subscription.ready;
      if (ready.error) throw new Error(ready.error);
    } catch (error) {
      this.drop(view);
      throw error;
    }
    return { viewId: view.id };
  }

  async read({ viewId, cursor }: { viewId: string; cursor: number }) {
    const view = this.views.get(viewId);
    if (!view) return { data: "", cursor, closed: "The terminal view expired" };
    view.seenAt = Date.now();
    while (view.chunks.length > 0 && view.base + view.chunks[0].length <= cursor) {
      view.base += view.chunks.shift()!.length;
    }
    if (view.end <= cursor && !view.closed) await this.waitForOutput(view);
    view.seenAt = Date.now();

    const data = view.chunks.join("").slice(Math.max(0, cursor - view.base));
    if (view.closed && !data) this.drop(view);
    return { data, cursor: view.end, closed: data ? null : view.closed };
  }

  async resize({ viewId, rows, cols }: Size & { viewId: string }) {
    const view = this.views.get(viewId);
    if (view && !view.closed) {
      const client = await this.connect();
      client.sendTerminalInput(view.terminalId, { type: "resize", rows, cols, intent: "claim" });
    }
    return {};
  }

  close({ viewId }: { viewId: string }) {
    const view = this.views.get(viewId);
    if (view) this.drop(view);
    return {};
  }

  async stop(): Promise<void> {
    clearInterval(this.sweeper);
    for (const view of [...this.views.values()]) this.drop(view);
    const client = this.client;
    this.client = null;
    await client?.then((connected) => connected.close()).catch(() => {});
  }

  private connect(): Promise<DaemonClient> {
    this.client ??= (async () => {
      const { url, token } = await daemonTarget();
      const client = new DaemonClient({
        url,
        clientId: `terminal-integration-${randomUUID()}`,
        clientType: "cli",
        ...(token ? { localCredential: () => token } : {}),
        connectTimeoutMs: CONNECT_TIMEOUT_MS,
        suppressSendErrors: true,
        reconnect: { enabled: true },
      });
      try {
        await client.connect();
      } catch (error) {
        await client.close().catch(() => {});
        throw new Error(`Could not connect to the Paseo daemon at ${url}: ${errorMessage(error)}`);
      }
      return client;
    })().catch((error: unknown) => {
      this.client = null;
      throw error;
    });
    return this.client;
  }

  private receive(view: View, event: TerminalStreamEvent) {
    // Cell snapshots only arrive for visible-snapshot subscriptions.
    if (event.type === "snapshot" || view.closed) return;
    if (event.type === "restore") view.decoder = new TextDecoder();
    // Snapshots drop the concealed attribute, so markers would show; blanking them keeps
    // every line's cursor positions intact.
    const text = view.decoder.decode(event.data, { stream: true }).replace(RUN_MARKER, "");
    this.push(view, event.type === "restore" ? RESET + text : text);
  }

  private push(view: View, text: string) {
    if (!text) return;
    view.chunks.push(text);
    view.end += text.length;
    if (view.end - view.base > MAX_PENDING_CHARS) {
      this.finish(view, "The terminal view fell behind");
      return;
    }
    view.wake?.();
  }

  private waitForOutput(view: View): Promise<void> {
    view.wake?.();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        if (view.wake === done) view.wake = null;
        resolve();
      };
      const timer = setTimeout(done, READ_WAIT_MS);
      view.wake = done;
    });
  }

  private finish(view: View, reason: string) {
    if (view.closed) return;
    view.closed = reason;
    view.release();
    view.wake?.();
  }

  private drop(view: View) {
    this.finish(view, "The terminal view closed");
    this.views.delete(view.id);
  }

  private sweep() {
    const cutoff = Date.now() - IDLE_VIEW_MS;
    for (const view of [...this.views.values()]) {
      if (!view.wake && view.seenAt < cutoff) this.drop(view);
    }
  }
}
