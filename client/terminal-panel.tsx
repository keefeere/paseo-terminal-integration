import { usePaseo, type PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { Icon, ScrollView, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView as NativeScrollView,
} from "react-native";
import { TERMINAL_NAME } from "../shared/contracts";
import { trimBlankEdges, withoutRunMarkers } from "../shared/text";

type Theme = PluginWorkspacePanelProps["theme"];

const SCREEN_LINES = 400;
const SCREEN_POLL_MS = 600;
const LOOKUP_POLL_MS = 3_000;
const PIN_SLACK = 24;
const MONOSPACE = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
});

const KEYS = [
  { label: "Enter", data: "\r" },
  { label: "Ctrl-C", data: "\x03" },
  { label: "Ctrl-D", data: "\x04" },
  { label: "Tab", data: "\t" },
] as const;

/** A plain-text mirror of the "Agent commands" terminal with a line of input. */
export function TerminalPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  const paseo = usePaseo();
  const toast = useToast();
  const styles = useMemo(() => createStyles(theme, layout.compact), [theme, layout.compact]);
  const [draft, setDraft] = useState("");
  const [hidden, setHidden] = useState(false);
  const scroller = useRef<NativeScrollView>(null);
  const pinned = useRef(true);

  const lookup = useQuery({
    queryKey: ["agent-terminal", workspaceId],
    queryFn: async () => {
      const { entries } = await paseo.terminals.list({ workspaceId });
      return entries.find((entry) => entry.name === TERMINAL_NAME) ?? null;
    },
    refetchInterval: LOOKUP_POLL_MS,
  });
  const terminal = lookup.data ?? null;

  const screen = useQuery({
    queryKey: ["agent-terminal-screen", terminal?.id],
    enabled: terminal !== null,
    queryFn: async () => {
      if (!terminal) return "";
      const { lines } = await paseo.terminals
        .ref(terminal)
        .capture({ start: -SCREEN_LINES, stripAnsi: true });
      return trimBlankEdges(withoutRunMarkers(lines)).join("\n");
    },
    refetchInterval: SCREEN_POLL_MS,
  });

  function write(data: string) {
    if (!terminal) return;
    try {
      paseo.terminals.ref(terminal).write(data);
      pinned.current = true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  function submit() {
    write(`${draft}\r`);
    setDraft("");
  }

  function trackScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    pinned.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - PIN_SLACK;
  }

  let placeholder: string | null = null;
  if (lookup.isLoading) placeholder = "Looking for the terminal…";
  else if (!terminal) placeholder = `No "${TERMINAL_NAME}" terminal yet. It opens with the first run.`;

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scroller}
        style={styles.output}
        contentContainerStyle={styles.outputContent}
        onScroll={trackScroll}
        scrollEventThrottle={100}
        onContentSizeChange={() => {
          if (pinned.current) scroller.current?.scrollToEnd({ animated: false });
        }}
      >
        {placeholder ? (
          <Text style={styles.muted}>{placeholder}</Text>
        ) : (
          <Text style={styles.text} selectable>
            {screen.data ?? ""}
          </Text>
        )}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          submitBehavior="submit"
          editable={terminal !== null}
          secureTextEntry={hidden}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          placeholder="Input for the terminal; Enter sends it"
          placeholderTextColor={theme.colors.foregroundMuted}
          accessibilityLabel="Terminal input"
        />
        <KeyButton
          styles={styles}
          theme={theme}
          icon="SendHorizontal"
          label="Send"
          disabled={terminal === null}
          onPress={submit}
        />
      </View>
      <View style={styles.keys}>
        {KEYS.map((key) => (
          <KeyButton
            key={key.label}
            styles={styles}
            theme={theme}
            label={key.label}
            disabled={terminal === null}
            onPress={() => write(key.data)}
          />
        ))}
        <KeyButton
          styles={styles}
          theme={theme}
          icon={hidden ? "EyeOff" : "Eye"}
          label={hidden ? "Input hidden" : "Hide input"}
          onPress={() => setHidden((value) => !value)}
        />
      </View>
    </View>
  );
}

function KeyButton({
  styles,
  theme,
  icon,
  label,
  disabled = false,
  onPress,
}: {
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
  icon?: string;
  label: string;
  disabled?: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.key, { opacity: disabled ? 0.5 : pressed ? 0.75 : 1 }]}
    >
      {icon ? <Icon name={icon} size={14} color={theme.colors.foreground} /> : null}
      <Text style={styles.keyText}>{label}</Text>
    </Pressable>
  );
}

function createStyles(theme: Theme, compact: boolean) {
  const gap = compact ? 6 : 8;
  return {
    screen: { flex: 1, gap, padding: gap, backgroundColor: theme.colors.surface0 },
    output: {
      flex: 1,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface1,
    },
    outputContent: { padding: compact ? 8 : 10 },
    text: { color: theme.colors.foreground, fontFamily: MONOSPACE, fontSize: 12, lineHeight: 17 },
    muted: { color: theme.colors.foregroundMuted },
    inputRow: { flexDirection: "row" as const, gap, alignItems: "center" as const },
    input: {
      flex: 1,
      color: theme.colors.foreground,
      fontFamily: MONOSPACE,
      fontSize: 13,
      paddingHorizontal: 10,
      paddingVertical: compact ? 8 : 6,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface1,
    },
    keys: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap },
    key: {
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
    keyText: { color: theme.colors.foreground, fontSize: 13 },
  };
}
