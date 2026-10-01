import { useRpc, useSettings } from "@getpaseo/plugin/client";
import type { PluginCodeBlockActionsProps } from "./sdk-compat";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { Platform, Pressable, Text, View, type TextStyle } from "react-native";
import {
  cancelRun,
  inlineRunKey,
  runStatus,
  sendRunOutput,
  startRun,
  type RunMode,
  type RunSnapshot,
} from "../shared/contracts";
import { runnableBlock } from "../shared/code-blocks";
import { preferences } from "../shared/settings";
import { revealStartedRun } from "./reveal-run";

type Theme = PluginCodeBlockActionsProps["theme"];
type Styles = ReturnType<typeof createStyles>;
const POLL_MS = 700;
const MONOSPACE = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
});
interface Controls {
  pending: boolean;
  send: boolean | null;
  error: string | null;
}
const INITIAL_CONTROLS: Controls = { pending: false, send: null, error: null };
function isActive(run: RunSnapshot): boolean {
  return run.status === "queued" || run.status === "running" || run.sending;
}
export function CodeBlockActions(props: PluginCodeBlockActionsProps) {
  const block = runnableBlock(props.code, props.language);
  if (!block) return null;
  return <RunnableActions {...props} command={block.code} />;
}
function RunnableActions({
  agentId,
  messageId,
  blockIndex,
  host,
  theme,
  layout,
  language,
  phase,
  navigation,
  command,
}: PluginCodeBlockActionsProps & { command: string }) {
  const key = inlineRunKey(host.id, agentId, messageId, blockIndex);
  const queryKey = useMemo(() => ["terminal-run-status", key], [key]);
  const controlsKey = useMemo(() => ["terminal-run-controls", key], [key]);
  const styles = useMemo(() => createStyles(theme, layout.compact), [theme, layout.compact]);
  const queryClient = useQueryClient();
  const fetchStatus = useRpc(runStatus);
  const start = useRpc(startRun);
  const cancel = useRpc(cancelRun);
  const send = useRpc(sendRunOutput);
  const settings = useSettings(preferences);
  const { data: controls = INITIAL_CONTROLS } = useQuery<Controls>({
    queryKey: controlsKey,
    queryFn: () => INITIAL_CONTROLS,
    initialData: INITIAL_CONTROLS,
    enabled: false,
    gcTime: Infinity,
  });
  const updateControls = (patch: Partial<Controls>) =>
    queryClient.setQueryData<Controls>(controlsKey, (previous) => ({
      ...INITIAL_CONTROLS,
      ...previous,
      ...patch,
    }));
  const sendToAgent =
    controls.send ?? (settings.status === "ready" ? settings.values.sendToAgent : true);
  const status = useQuery({
    queryKey,
    queryFn: () => fetchStatus({ keys: [key] }),
    refetchInterval: (query) => (query.state.data?.runs.some(isActive) ? POLL_MS : false),
  });
  const run = status.data?.runs[0];
  const running = run?.status === "queued" || run?.status === "running";
  const disabled = controls.pending || (!!run && isActive(run)) || phase !== "complete";
  async function act(action: () => Promise<unknown>) {
    if (queryClient.getQueryData<Controls>(controlsKey)?.pending) return;
    updateControls({ pending: true, error: null });
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      updateControls({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      updateControls({ pending: false });
    }
  }
  function runBlock(mode: RunMode) {
    if (disabled) return;
    void act(async () => {
      const started = await start({
        agentId,
        key,
        lang: language,
        code: command,
        send: sendToAgent,
        mode,
      });
      queryClient.setQueryData(queryKey, { runs: [started] });
      // Owned by this click, not by rendering or polling: remounts cannot steal focus.
      void revealStartedRun(started, navigation?.openTerminal, fetchStatus).catch((error) =>
        updateControls({ error: error instanceof Error ? error.message : String(error) }),
      );
    });
  }
  return (
    <View style={styles.card}>
      <View style={styles.actions}>
        {running ? (
          <ActionButton
            styles={styles}
            theme={theme}
            icon="Square"
            label="Stop"
            tone="danger"
            disabled={controls.pending}
            onPress={() => void act(() => cancel({ key }))}
          />
        ) : (
          <>
            <ActionButton
              styles={styles}
              theme={theme}
              icon="Play"
              label="Run"
              tone="primary"
              disabled={disabled}
              onPress={() => runBlock("terminal")}
            />
            <ActionButton
              styles={styles}
              theme={theme}
              icon="EyeOff"
              label="Run in background"
              disabled={disabled}
              onPress={() => runBlock("background")}
            />
          </>
        )}
        <Checkbox
          styles={styles}
          theme={theme}
          label="Send output to agent"
          checked={sendToAgent}
          onChange={(value) => updateControls({ send: value })}
        />
        {run && !run.sent && !run.sending && (!running || !run.sendOnFinish) ? (
          <ActionButton
            styles={styles}
            theme={theme}
            icon="Send"
            label={running ? "Send output so far" : "Send output"}
            disabled={controls.pending}
            onPress={() => void act(() => send({ key }))}
          />
        ) : null}
      </View>
      {phase !== "complete" ? (
        <Text style={styles.muted}>Available when the response finishes</Text>
      ) : null}
      {controls.error ? <Text style={styles.danger}>{controls.error}</Text> : null}
      {status.error ? <Text style={styles.danger}>{status.error.message}</Text> : null}
      {run ? <RunStatus run={run} styles={styles} /> : null}
    </View>
  );
}

function RunStatus({ run, styles }: { run: RunSnapshot; styles: Styles }) {
  const parts: string[] = [];
  let tone: TextStyle = styles.muted;
  if (run.status === "queued") parts.push("Queued, waiting for the terminal");
  if (run.status === "running") {
    parts.push(
      `${run.mode === "background" ? "Running in background" : "Running"} · ${elapsed(run)}`,
    );
  }
  if (run.status === "done") {
    parts.push(`${run.exitCode === 0 ? "✓" : "✗"} exit ${run.exitCode}`);
    tone = run.exitCode === 0 ? styles.success : styles.danger;
  }
  if (run.status === "canceled") parts.push("Stopped");
  if (run.status === "failed") tone = styles.danger;
  if (run.status !== "queued" && run.status !== "failed") {
    parts.push(`${run.lineCount} ${run.lineCount === 1 ? "line" : "lines"}`);
  }
  if (run.sent) parts.push("sent to agent");
  else if (run.sending) parts.push("sending when the agent is idle…");
  else if (run.sendOnFinish && (run.status === "queued" || run.status === "running")) {
    parts.push("output goes to the agent");
  }

  return (
    <View style={styles.status}>
      {parts.length > 0 ? <Text style={tone}>{parts.join(" · ")}</Text> : null}
      {run.error ? <Text style={styles.danger}>{run.error}</Text> : null}
      {run.tail.length > 0 ? (
        <View style={styles.tail}>
          {run.tail.map((line, index) => (
            <Text key={index} style={styles.tailLine} numberOfLines={1}>
              {line || " "}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Checkbox({
  styles,
  theme,
  label,
  checked,
  onChange,
}: {
  styles: Styles;
  theme: Theme;
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => [styles.checkbox, { opacity: pressed ? 0.75 : 1 }]}
    >
      <Icon
        name={checked ? "SquareCheck" : "Square"}
        size={16}
        color={checked ? theme.colors.accent : theme.colors.foregroundMuted}
      />
      <Text style={[styles.buttonText, { color: theme.colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({
  styles,
  theme,
  icon,
  label,
  tone = "default",
  disabled = false,
  onPress,
}: {
  styles: Styles;
  theme: Theme;
  icon: string;
  label: string;
  tone?: "default" | "primary" | "danger";
  disabled?: boolean;
  onPress(): void;
}) {
  const color =
    tone === "primary"
      ? theme.colors.accentForeground
      : tone === "danger"
        ? theme.colors.statusDanger
        : theme.colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === "primary" ? styles.primaryButton : null,
        { opacity: disabled ? 0.5 : pressed ? 0.75 : 1 },
      ]}
    >
      <Icon name={icon} size={14} color={color} />
      <Text style={[styles.buttonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function elapsed(run: RunSnapshot): string {
  const seconds = Math.max(0, Math.round((Date.now() - (run.startedAt ?? Date.now())) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function createStyles(theme: Theme, compact: boolean) {
  return {
    card: {
      gap: compact ? 8 : 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
      padding: compact ? 10 : 12,
      backgroundColor: theme.colors.surface1,
    },
    header: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      alignItems: "center" as const,
      gap: 6,
    },
    checkbox: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      paddingHorizontal: 4,
      paddingVertical: compact ? 7 : 5,
    },
    title: { color: theme.colors.foreground, fontWeight: "600" as const },
    muted: { color: theme.colors.foregroundMuted, flexShrink: 1 },
    spacer: { flex: 1 },
    success: { color: theme.colors.statusSuccess },
    danger: { color: theme.colors.statusDanger },
    block: { gap: 8 },
    separated: {
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      paddingTop: compact ? 8 : 10,
    },
    codeRow: { flexDirection: "row" as const, gap: 8, alignItems: "flex-start" as const },
    lang: {
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: theme.colors.surface2,
      overflow: "hidden" as const,
    },
    code: { color: theme.colors.foreground, fontFamily: MONOSPACE, fontSize: 13, flex: 1 },
    actions: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
    button: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: compact ? 7 : 5,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface2,
    },
    primaryButton: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    buttonText: { fontSize: 13 },
    status: { gap: 6 },
    tail: {
      padding: 8,
      borderRadius: 6,
      backgroundColor: theme.colors.surface0,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    tailLine: { color: theme.colors.foregroundMuted, fontFamily: MONOSPACE, fontSize: 12 },
  };
}
