import { useAgent, useRpc, useSettings, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { copyText, Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Platform, Pressable, Text, View, type TextStyle } from "react-native";
import {
  cancelRun,
  runKey,
  runStatus,
  sendRunOutput,
  startRun,
  TERMINAL_NAME,
  type RunCardData,
  type RunSnapshot,
} from "../shared/contracts";
import { preferences } from "../shared/settings";
import { openTerminalPanel } from "./panel-opener";

type Theme = PluginTimelineItemProps["theme"];
type Styles = ReturnType<typeof createStyles>;

const POLL_MS = 700;
const MONOSPACE = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
});

function isActive(run: RunSnapshot): boolean {
  if (run.status === "queued" || run.status === "running" || run.sending) return true;
  return run.status === "done" && run.sendOnFinish && !run.sent && !run.error;
}

export function RunCard({ item, agentId, theme, layout }: PluginTimelineItemProps<RunCardData>) {
  const { cardId, blocks } = item.data;
  const keys = useMemo(() => blocks.map((_, index) => runKey(cardId, index)), [cardId, blocks]);
  const styles = useMemo(() => createStyles(theme, layout.compact), [theme, layout.compact]);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  const fetchStatus = useRpc(runStatus);
  const start = useRpc(startRun);
  const cancel = useRpc(cancelRun);
  const send = useRpc(sendRunOutput);

  const workspaceId = useAgent(agentId, (agent) => agent.workspaceId);
  const settings = useSettings(preferences);
  const saved = settings.status === "ready" ? settings.values : null;
  const panelLocation = saved?.panelLocation ?? "explorer";
  const [sendChoice, setSendChoice] = useState<boolean | null>(null);
  const sendToAgent = sendChoice ?? saved?.sendToAgent ?? true;
  const runVisibleLabel =
    layout.compact || panelLocation === "workspace" ? "Run in terminal tab" : "Run in side terminal";

  function showTerminal() {
    if (!workspaceId) return;
    openTerminalPanel(workspaceId, panelLocation, { compact: layout.compact, explicit: true });
  }
  function runBlock(key: string, block: RunCardData["blocks"][number], visible: boolean) {
    return act(key, async () => {
      await start({ agentId, key, lang: block.lang, code: block.code, send: sendToAgent });
      if (visible) showTerminal();
    });
  }

  const queryKey = useMemo(() => ["terminal-run-status", cardId], [cardId]);
  const status = useQuery({
    queryKey,
    queryFn: () => fetchStatus({ keys }),
    refetchInterval: (query) => (query.state.data?.runs.some(isActive) ? POLL_MS : false),
  });
  const runs = useMemo(
    () => new Map((status.data?.runs ?? []).map((run) => [run.key, run])),
    [status.data],
  );

  async function act(key: string, action: () => Promise<unknown>) {
    setPending(key);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(null);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Icon name="SquareTerminal" size={16} color={theme.colors.foregroundMuted} />
        <Text style={styles.title}>Run in terminal</Text>
        <Text style={styles.muted} numberOfLines={1}>
          · {TERMINAL_NAME}
        </Text>
        <View style={styles.spacer} />
        <Checkbox
          styles={styles}
          theme={theme}
          label="Send to agent"
          checked={sendToAgent}
          onChange={setSendChoice}
        />
        {workspaceId ? (
          <ActionButton
            styles={styles}
            theme={theme}
            icon="PanelRight"
            label="Terminal"
            onPress={showTerminal}
          />
        ) : null}
      </View>
      {blocks.map((block, index) => {
        const key = keys[index];
        const run = runs.get(key);
        const active = run ? isActive(run) : false;
        const busy = pending === key;
        return (
          <View key={key} style={index > 0 ? [styles.block, styles.separated] : styles.block}>
            <View style={styles.codeRow}>
              <Text style={styles.lang}>{block.lang}</Text>
              <Text style={styles.code} numberOfLines={3}>
                {block.code}
              </Text>
            </View>
            <View style={styles.actions}>
              {run && (run.status === "queued" || run.status === "running") ? (
                <>
                  <ActionButton
                    styles={styles}
                    theme={theme}
                    icon="Square"
                    label="Stop"
                    tone="danger"
                    disabled={busy}
                    onPress={() => act(key, () => cancel({ key }))}
                  />
                  {run.status === "running" && !run.sendOnFinish ? (
                    <ActionButton
                      styles={styles}
                      theme={theme}
                      icon="Send"
                      label="Send output so far"
                      disabled={busy || run.sending}
                      onPress={() => act(key, () => send({ key }))}
                    />
                  ) : null}
                </>
              ) : (
                <>
                  <ActionButton
                    styles={styles}
                    theme={theme}
                    icon="PanelRight"
                    label={runVisibleLabel}
                    tone="primary"
                    disabled={busy || active}
                    onPress={() => runBlock(key, block, true)}
                  />
                  <ActionButton
                    styles={styles}
                    theme={theme}
                    icon="Play"
                    label="Run silently"
                    disabled={busy || active}
                    onPress={() => runBlock(key, block, false)}
                  />
                  {run && !run.sent && !active ? (
                    <ActionButton
                      styles={styles}
                      theme={theme}
                      icon="Send"
                      label="Send output"
                      disabled={busy}
                      onPress={() => act(key, () => send({ key }))}
                    />
                  ) : null}
                </>
              )}
              <ActionButton
                styles={styles}
                theme={theme}
                icon="Copy"
                label="Copy"
                onPress={() =>
                  act(key, async () => {
                    await copyText(block.code);
                    toast.show("Command copied", { variant: "success" });
                  })
                }
              />
            </View>
            {run ? <RunStatus run={run} styles={styles} /> : null}
          </View>
        );
      })}
    </View>
  );
}

function RunStatus({ run, styles }: { run: RunSnapshot; styles: Styles }) {
  const parts: string[] = [];
  let tone: TextStyle = styles.muted;
  if (run.status === "queued") parts.push("Queued, waiting for the terminal");
  if (run.status === "running") parts.push(`Running · ${elapsed(run)}`);
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
