import { useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { Text } from "react-native";
import { TERMINAL_NAME } from "../shared/contracts";
import { preferences } from "../shared/settings";

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
        <SettingsSwitch
          label="Send output to the agent by default"
          hint={`Initial state of the "Send to agent" checkbox on each run card.`}
          value={values.sendToAgent}
          disabled={settings.saving}
          error={settings.saveError}
          onValueChange={(sendToAgent) => void settings.save({ ...values, sendToAgent }, revision)}
        />
        <SettingsRow
          label="Where the terminal appears"
          hint={`Commands run in the "${TERMINAL_NAME}" terminal tab. To keep it beside the chat, drag the tab onto the right or bottom edge of the chat; it stays there while the terminal is open.`}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
