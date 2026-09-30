import { useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { Text } from "react-native";
import { preferences, type PanelLocation } from "../shared/settings";

const panelLocationChoices: { label: string; value: PanelLocation }[] = [
  { label: "Side panel (Explorer)", value: "explorer" },
  { label: "Workspace tab", value: "workspace" },
];

export function SettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(preferences);

  if (settings.status !== "ready") {
    const message =
      settings.status === "loading" ? "Loading…" : `Settings are unavailable: ${settings.error}`;
    return <Text style={{ color: theme.colors.foregroundMuted }}>{message}</Text>;
  }
  const { values, revision } = settings;

  return (
    <SettingsSection title="Run cards">
      <SettingsCard>
        <SettingsSelect
          label="Show the terminal in"
          hint={`Used by "Run in side terminal", the Terminal button, and /run. Phones always use a tab and never switch to it automatically.`}
          value={values.panelLocation}
          options={panelLocationChoices}
          disabled={settings.saving}
          error={settings.saveError}
          onValueChange={(panelLocation) => void settings.save({ ...values, panelLocation }, revision)}
        />
        <SettingsSwitch
          label="Send output to the agent by default"
          hint={`Initial state of the "Send to agent" checkbox on each run card.`}
          value={values.sendToAgent}
          disabled={settings.saving}
          onValueChange={(sendToAgent) => void settings.save({ ...values, sendToAgent }, revision)}
        />
        <SettingsRow
          label="What the panel shows"
          hint={`The live "Agent commands" terminal with colors and keyboard input, for prompts such as sudo passwords, y/n questions, or 2FA codes. Ctrl-C copies while text is selected; Ctrl-Shift-C and Ctrl-Shift-V copy and paste. Phones show a plain-text copy with an input line.`}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
