import { useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { runOutput, type RunSnapshot } from "../shared/contracts";

const AUTO_EXPAND_LINES = 5;
const POLL_MS = 700;
const MONOSPACE = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
});

interface OutputTheme {
  colors: {
    border: string;
    foregroundMuted: string;
    surface0: string;
  };
}

export function RunOutput({
  run,
  summary,
  summaryColor,
  theme,
}: {
  run: RunSnapshot;
  summary: string;
  summaryColor: string;
  theme: OutputTheme;
}) {
  const automatic = run.lineCount > 0 && run.lineCount <= AUTO_EXPAND_LINES;
  const [override, setOverride] = useState<boolean | null>(null);
  useEffect(() => setOverride(null), [run.runId]);
  const expanded = override ?? automatic;
  const fetchOutput = useRpc(runOutput);
  const active = run.status === "queued" || run.status === "running";
  const output = useQuery({
    queryKey: ["terminal-run-output", run.key, run.runId],
    queryFn: () => fetchOutput({ key: run.key }),
    enabled: expanded && run.lineCount > 0,
    refetchInterval: active && expanded ? POLL_MS : false,
  });
  const styles = useMemo(() => createStyles(theme), [theme]);
  const lines = output.data?.lines ?? run.tail;

  if (run.lineCount === 0) return <Text style={{ color: summaryColor }}>{summary}</Text>;

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Collapse" : "Expand"} command output`}
        accessibilityState={{ expanded }}
        onPress={() => setOverride(!expanded)}
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
      >
        <Icon name={expanded ? "ChevronDown" : "ChevronRight"} size={15} color={summaryColor} />
        <Text style={[styles.summary, { color: summaryColor }]}>{summary}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.output}>
          {output.isPending && lines.length === 0 ? (
            <Text style={styles.note}>Loading output…</Text>
          ) : null}
          {output.error ? <Text style={styles.note}>{output.error.message}</Text> : null}
          {output.data?.truncated ? (
            <Text style={styles.note}>Earlier output is no longer available.</Text>
          ) : null}
          {lines.length > 0 ? (
            <ScrollView style={styles.viewport} nestedScrollEnabled>
              <ScrollView horizontal contentContainerStyle={styles.outputContent}>
                <Text selectable style={styles.outputText}>
                  {lines.join("\n")}
                </Text>
              </ScrollView>
            </ScrollView>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(theme: OutputTheme) {
  return {
    container: { gap: 6 },
    toggle: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
    pressed: { opacity: 0.7 },
    summary: { flexShrink: 1 },
    output: {
      borderRadius: 6,
      backgroundColor: theme.colors.surface0,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: "hidden" as const,
    },
    viewport: { maxHeight: 280 },
    outputContent: { padding: 8 },
    outputText: {
      color: theme.colors.foregroundMuted,
      fontFamily: MONOSPACE,
      fontSize: 12,
      lineHeight: 18,
    },
    note: {
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      paddingHorizontal: 8,
      paddingTop: 6,
    },
  };
}
