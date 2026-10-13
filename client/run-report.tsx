import {
  useSettings,
  type PluginTimelineItemProps,
  type PluginTimelineTransformerContribution,
} from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import {
  darkHighlightColors,
  highlightCode,
  lightHighlightColors,
  type HighlightStyle,
  type HighlightToken,
} from "@getpaseo/highlight";
import { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import {
  parseRunReport,
  runReportSchema,
  wrapRunReportOutcome,
  type RunReportData,
} from "../shared/run-report";
import { DEFAULT_COLLAPSE_OUTPUT_AFTER_LINES, preferences } from "../shared/settings";

type UserMessageTransformer = PluginTimelineTransformerContribution<"user_message">["transform"];
type Theme = PluginTimelineItemProps["theme"];

export const transformRunReport: UserMessageTransformer = ({ item }) => {
  const data = parseRunReport(item.text);
  if (!data) return;
  return {
    items: [{ type: "plugin", kind: "terminal-run-report", version: 1, data }],
  };
};

export { runReportSchema };

export function RunReport({ item, theme, layout }: PluginTimelineItemProps<RunReportData>) {
  const settings = useSettings(preferences);
  const threshold =
    settings.status === "ready"
      ? settings.values.collapseOutputAfterLines
      : DEFAULT_COLLAPSE_OUTPUT_AFTER_LINES;
  const autoCollapsed = threshold > 0 && item.data.outputLineCount > threshold;
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
  const expanded = expandedOverride ?? !autoCollapsed;
  const styles = useMemo(() => createStyles(theme, layout.compact), [theme, layout.compact]);

  if (!item.data.output) {
    return (
      <View style={styles.card}>
        <Text style={styles.intro}>{item.data.intro}</Text>
        <CodeBlock
          text={item.data.code}
          language={item.data.language}
          styles={styles}
          theme={theme}
        />
        <Text style={styles.outputLabel}>{item.data.outputLabel}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, !expanded && styles.collapsedCard]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Collapse" : "Expand"} terminal output`}
        accessibilityState={{ expanded }}
        onPress={() => setExpandedOverride(!expanded)}
        style={({ pressed }) => [styles.reportHeader, pressed && styles.pressed]}
      >
        <Icon
          name={expanded ? "ChevronDown" : "ChevronRight"}
          size={16}
          color={theme.colors.foregroundMuted}
        />
        <Text style={styles.reportTitle} numberOfLines={expanded ? undefined : 1}>
          {expanded ? wrapRunReportOutcome(item.data.intro) : item.data.intro}
        </Text>
        <Text style={styles.lineCount}>
          {item.data.outputLineCount} {item.data.outputLineCount === 1 ? "line" : "lines"}
        </Text>
      </Pressable>
      {expanded ? (
        <>
          <CodeBlock
            text={item.data.code}
            language={item.data.language}
            styles={styles}
            theme={theme}
          />
          <Text style={styles.outputLabel}>{item.data.outputLabel}</Text>
          <CodeBlock text={item.data.output} styles={styles} />
        </>
      ) : null}
    </View>
  );
}

type Styles = ReturnType<typeof createStyles>;

const MAX_HIGHLIGHT_CHARS = 100_000;

const LANGUAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  bash: "sh",
  shell: "sh",
  console: "sh",
  zsh: "sh",
  fish: "sh",
  python: "py",
  py: "py",
  javascript: "js",
  node: "js",
  typescript: "ts",
};

function CodeBlock({
  text,
  language,
  styles,
  theme,
}: {
  text: string;
  language?: string;
  styles: Styles;
  theme?: Theme;
}) {
  const highlighted = useMemo(() => highlight(text, language), [language, text]);
  const colors =
    theme && isDark(theme.colors.surface0) ? darkHighlightColors : lightHighlightColors;

  return (
    <ScrollView horizontal style={styles.codeBlock} contentContainerStyle={styles.codeContent}>
      <Text selectable style={styles.code}>
        {highlighted
          ? highlighted.map((line, lineIndex) => (
              <Text key={lineIndex}>
                {line.map((token, tokenIndex) => (
                  <Text
                    key={`${lineIndex}-${tokenIndex}`}
                    style={{ color: tokenColor(token, colors, theme?.colors.foreground) }}
                  >
                    {token.text}
                  </Text>
                ))}
                {lineIndex < highlighted.length - 1 ? "\n" : null}
              </Text>
            ))
          : text}
      </Text>
    </ScrollView>
  );
}

function highlight(text: string, language?: string): HighlightToken[][] | null {
  if (!language || text.length > MAX_HIGHLIGHT_CHARS) return null;
  const normalized = language.toLowerCase();
  const extension = LANGUAGE_EXTENSIONS[normalized] ?? normalized;
  try {
    return highlightCode(text, `command.${extension}`);
  } catch {
    return null;
  }
}

function tokenColor(
  token: HighlightToken,
  colors: Readonly<Record<HighlightStyle, string>>,
  fallback = "inherit",
): string {
  return token.style ? colors[token.style] : fallback;
}

function isDark(color: string): boolean {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return true;
  const value = Number.parseInt(match[1], 16);
  const red = value >> 16;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return red * 0.299 + green * 0.587 + blue * 0.114 < 128;
}

function createStyles(theme: Theme, compact: boolean) {
  return {
    card: {
      gap: 10,
      padding: compact ? 12 : 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 12,
      backgroundColor: theme.colors.surface1,
    },
    collapsedCard: { gap: 0, padding: 4 },
    intro: { color: theme.colors.foreground, fontSize: 14, lineHeight: 20 },
    reportHeader: {
      minHeight: 36,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      paddingHorizontal: 8,
      borderRadius: 6,
    },
    pressed: { opacity: 0.7 },
    reportTitle: {
      flex: 1,
      color: theme.colors.foreground,
      fontSize: 13,
      lineHeight: 18,
    },
    outputLabel: { flexShrink: 1, color: theme.colors.foreground, fontSize: 13 },
    lineCount: { marginLeft: "auto" as const, color: theme.colors.foregroundMuted, fontSize: 12 },
    codeBlock: {
      maxWidth: "100%" as const,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      backgroundColor: theme.colors.surface0,
    },
    codeContent: { paddingHorizontal: 10, paddingVertical: 8 },
    code: {
      color: theme.colors.foreground,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: Platform.select({
        ios: "Menlo",
        android: "monospace",
        default: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      }),
    },
  };
}
