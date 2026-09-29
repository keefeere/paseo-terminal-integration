import { usePaseo, useRpc, type PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import type { ITheme, Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import {
  closeTerminalView,
  openTerminalView,
  readTerminalView,
  resizeTerminalView,
} from "../shared/contracts";

type Theme = PluginWorkspacePanelProps["theme"];

// Same defaults as the app's terminal tabs.
const FONT_FAMILY = [
  "JetBrains Mono",
  "JetBrainsMono Nerd Font",
  "JetBrainsMono NF",
  "MesloLGM Nerd Font",
  "MesloLGM NF",
  "Hack Nerd Font",
  "FiraCode Nerd Font",
  "Symbols Nerd Font",
  "SF Mono",
  "Menlo",
  "Monaco",
  "Consolas",
  "'Liberation Mono'",
  "monospace",
].join(", ");
const FONT_SIZE = 13;
const SCROLLBACK_LINES = 5_000;
const RETRY_MS = 1_000;
const FIT_DEBOUNCE_MS = 100;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function translucent(color: string, alpha: number): string | undefined {
  const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (!hex) return undefined;
  const [red, green, blue] = hex.slice(1).map((part) => parseInt(part, 16));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function terminalTheme(theme: Theme): ITheme {
  return {
    background: theme.colors.surface0,
    foreground: theme.colors.foreground,
    cursor: theme.colors.foreground,
    cursorAccent: theme.colors.surface0,
    selectionBackground: translucent(theme.colors.accent, 0.35),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A live xterm.js view of a daemon terminal: the same stream and renderer as a terminal
 * tab. Web only; `onUnavailable` reports why the live stream could not start.
 */
export function XtermView({
  terminalId,
  theme,
  onUnavailable,
}: {
  terminalId: string;
  theme: Theme;
  onUnavailable(reason: string): void;
}) {
  const host = useRef<View>(null);
  const terminal = useRef<Terminal | null>(null);
  const [status, setStatus] = useState<string | null>("Connecting…");

  const paseo = usePaseo();
  const open = useRpc(openTerminalView);
  const read = useRpc(readTerminalView);
  const resize = useRpc(resizeTerminalView);
  const close = useRpc(closeTerminalView);
  const latest = useRef({ paseo, open, read, resize, close, theme, onUnavailable });
  latest.current = { paseo, open, read, resize, close, theme, onUnavailable };

  useEffect(() => {
    // react-native-web refs are the underlying DOM elements.
    const element = host.current as unknown as HTMLElement | null;
    if (!element) return;
    let disposed = false;
    let viewId: string | null = null;
    let observer: ResizeObserver | null = null;
    let fitTimer: ReturnType<typeof setTimeout> | undefined;

    async function stream(term: Terminal) {
      let connected = false;
      while (!disposed) {
        try {
          const opened = await latest.current.open({ terminalId, rows: term.rows, cols: term.cols });
          if (disposed) {
            void latest.current.close(opened).catch(() => {});
            return;
          }
          viewId = opened.viewId;
          connected = true;
          setStatus(null);
          let cursor = 0;
          for (;;) {
            const chunk = await latest.current.read({ viewId, cursor });
            if (disposed) return;
            if (chunk.data) term.write(chunk.data);
            cursor = chunk.cursor;
            if (chunk.closed) break;
          }
        } catch (error) {
          if (disposed) return;
          if (!connected) {
            latest.current.onUnavailable(errorMessage(error));
            return;
          }
          setStatus("Reconnecting…");
        }
        viewId = null;
        await sleep(RETRY_MS);
      }
    }

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm/lib/xterm.mjs"),
        import("@xterm/addon-fit/lib/addon-fit.mjs"),
      ]);
      if (disposed) return;
      const term = new Terminal({
        allowProposedApi: true,
        cursorBlink: true,
        cursorStyle: "bar",
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZE,
        lineHeight: 1,
        macOptionIsMeta: true,
        scrollback: SCROLLBACK_LINES,
        theme: terminalTheme(latest.current.theme),
      });
      terminal.current = term;
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(element);
      fit.fit();

      term.onData((data) => latest.current.paseo.terminals.ref(terminalId).write(data));
      term.onResize(({ rows, cols }) => {
        if (viewId) void latest.current.resize({ viewId, rows, cols }).catch(() => {});
      });
      // Ctrl-C and Ctrl-V belong to the shell; copy and paste use Ctrl-Shift like Linux terminals.
      term.attachCustomKeyEventHandler((event) => {
        if (event.type !== "keydown" || !event.ctrlKey || !event.shiftKey) return true;
        const key = event.key.toLowerCase();
        if (key === "c") {
          if (term.hasSelection()) void navigator.clipboard?.writeText(term.getSelection());
          return false;
        }
        // Returning false leaves the browser's paste to xterm's textarea.
        return key !== "v";
      });

      observer = new ResizeObserver(() => {
        clearTimeout(fitTimer);
        fitTimer = setTimeout(() => {
          if (!disposed && element.clientWidth > 0 && element.clientHeight > 0) fit.fit();
        }, FIT_DEBOUNCE_MS);
      });
      observer.observe(element);

      await stream(term);
    })().catch((error: unknown) => {
      if (!disposed) latest.current.onUnavailable(errorMessage(error));
    });

    return () => {
      disposed = true;
      observer?.disconnect();
      clearTimeout(fitTimer);
      if (viewId) void latest.current.close({ viewId }).catch(() => {});
      terminal.current?.dispose();
      terminal.current = null;
    };
  }, [terminalId]);

  useEffect(() => {
    if (terminal.current) terminal.current.options.theme = terminalTheme(theme);
  }, [theme]);

  return (
    <View style={{ flex: 1, padding: 6, backgroundColor: theme.colors.surface0 }}>
      <View ref={host} style={{ flex: 1, overflow: "hidden" }} />
      {status ? (
        <Text
          style={{
            position: "absolute",
            top: 8,
            right: 12,
            color: theme.colors.foregroundMuted,
            fontSize: 12,
          }}
        >
          {status}
        </Text>
      ) : null}
    </View>
  );
}
