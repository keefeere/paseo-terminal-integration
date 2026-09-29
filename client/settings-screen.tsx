import { useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsCard, SettingsRow, SettingsSection, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { Text } from "react-native";
import { preferences, type OpenTerminalOption } from "../shared/settings";

const openTerminalChoices: { label: string; value: OpenTerminalOption }[] = [
  { label: "Side panel (Explorer)", value: "explorer" },
  { label: "Workspace tab", value: "workspace" },
  { label: "Don't open", value: "off" },
];

export function SettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(preferences);

  if (settings.status !== "ready") {
    const message =
      settings.status === "loading" ? "Loading…" : `Settings are unavailable: ${settings.error}`;
    return <Text style={{ color: theme.colors.foregroundMuted }}>{message}</Text>;
  }

  return (
    <SettingsSection title="Terminal panel">
      <SettingsCard>
        <SettingsSelect
          label="When a command starts, show the terminal in"
          hint="Phones never switch tabs automatically; the Terminal button on a run card always works."
          value={settings.values.openTerminal}
          options={openTerminalChoices}
          disabled={settings.saving}
          error={settings.saveError}
          onValueChange={(openTerminal) =>
            void settings.save({ ...settings.values, openTerminal }, settings.revision)
          }
        />
        <SettingsRow
          label="What the panel shows"
          hint={`The live "Agent commands" terminal with colors and keyboard input, for prompts such as sudo passwords, y/n questions, or 2FA codes. Copy and paste with Ctrl-Shift-C and Ctrl-Shift-V. Phones show a plain-text copy with an input line.`}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
