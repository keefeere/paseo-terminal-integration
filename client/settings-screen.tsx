import { useSettings, type PluginSurfaceProps, type SettingsState } from "@getpaseo/plugin/client";
import {
  ExternalLink,
  SettingsAction,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { useMemo, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { TERMINAL_NAME } from "../shared/contracts";
import { CLIENT_SERVER_INSTRUCTIONS, LOCAL_DAEMON_INSTRUCTIONS } from "../shared/instructions";
import { preferences, type InstructionTopology } from "../shared/settings";

const REPOSITORY = "https://github.com/keefeere/paseo-terminal-integration/blob/main";

type ReadySettings = Extract<SettingsState<typeof preferences.schema>, { status: "ready" }>;

export function SettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(preferences);

  if (settings.status !== "ready") {
    const message =
      settings.status === "loading" ? "Loading…" : `Settings are unavailable: ${settings.error}`;
    return <Text style={{ color: theme.colors.foregroundMuted }}>{message}</Text>;
  }

  return <ReadySettingsScreen key={settings.revision} settings={settings} theme={theme} />;
}

function ReadySettingsScreen({
  settings,
  theme,
}: {
  settings: ReadySettings;
  theme: PluginSurfaceProps["theme"];
}) {
  const { values, revision } = settings;
  const [draft, setDraft] = useState(values);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(values), [draft, values]);
  const editorStyle = useMemo(
    () => ({
      minHeight: 220,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      color: theme.colors.foreground,
      backgroundColor: theme.colors.surface0,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 12,
      lineHeight: 18,
      textAlignVertical: "top" as const,
    }),
    [theme],
  );
  const linkStyle = useMemo(() => ({ color: theme.colors.accent, fontSize: 12 }), [theme]);

  const updateTopology = (instructionTopology: InstructionTopology) =>
    setDraft((current) => ({ ...current, instructionTopology }));

  return (
    <>
      <SettingsSection title="Code block actions">
        <SettingsCard>
          <SettingsSwitch
            label="Send output to the agent by default"
            hint={`Initial state of the "Send output to agent" checkbox on each code block.`}
            value={values.sendToAgent}
            disabled={settings.saving}
            error={settings.saveError}
            onValueChange={(sendToAgent) =>
              void settings.save({ ...values, sendToAgent }, revision)
            }
          />
          <SettingsRow
            label="Where the terminal appears"
            hint={`Commands run in the "${TERMINAL_NAME}" terminal tab. Choose Main panel or On the side in Settings → Layout → Open location → Terminals. Manually moved tabs keep their location.`}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Agent command instructions">
        <SettingsCard>
          <SettingsSwitch
            label="Inject command instructions"
            hint="Add the selected guidance to the system prompt of newly created agents. Existing agents are unchanged."
            value={draft.injectCommandInstructions}
            disabled={settings.saving}
            onValueChange={(injectCommandInstructions) =>
              setDraft((current) => ({ ...current, injectCommandInstructions }))
            }
          />
          <SettingsSelect
            label="Execution topology"
            hint="Choose where clicking Run actually executes a command."
            value={draft.instructionTopology}
            options={[
              { label: "Local daemon", value: "local-daemon" },
              { label: "Client–server", value: "client-server" },
            ]}
            disabled={settings.saving}
            onValueChange={updateTopology}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Local daemon instructions">
        <SettingsCard>
          <SettingsRow
            label="Instruction text"
            hint="Used when Execution topology is Local daemon. Edit the host-scoped copy below."
          >
            <View style={{ gap: 8, width: "100%" }}>
              <ExternalLink href={`${REPOSITORY}/instructions/local-daemon.md`}>
                <Text style={linkStyle}>View shipped local-daemon.md</Text>
              </ExternalLink>
              <TextInput
                multiline
                accessibilityLabel="Local daemon command instructions"
                value={draft.localDaemonInstructions}
                editable={!settings.saving}
                onChangeText={(localDaemonInstructions) =>
                  setDraft((current) => ({ ...current, localDaemonInstructions }))
                }
                style={editorStyle}
              />
            </View>
          </SettingsRow>
          <SettingsAction
            label="Restore local template"
            hint="Replace the draft with the version shipped by the plugin."
            actionLabel="Restore default"
            disabled={
              settings.saving || draft.localDaemonInstructions === LOCAL_DAEMON_INSTRUCTIONS
            }
            onPress={() =>
              setDraft((current) => ({
                ...current,
                localDaemonInstructions: LOCAL_DAEMON_INSTRUCTIONS,
              }))
            }
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Client–server instructions">
        <SettingsCard>
          <SettingsRow
            label="Instruction text"
            hint="Used when Execution topology is Client–server. Edit the host-scoped copy below."
          >
            <View style={{ gap: 8, width: "100%" }}>
              <ExternalLink href={`${REPOSITORY}/instructions/client-server.md`}>
                <Text style={linkStyle}>View shipped client-server.md</Text>
              </ExternalLink>
              <TextInput
                multiline
                accessibilityLabel="Client-server command instructions"
                value={draft.clientServerInstructions}
                editable={!settings.saving}
                onChangeText={(clientServerInstructions) =>
                  setDraft((current) => ({ ...current, clientServerInstructions }))
                }
                style={editorStyle}
              />
            </View>
          </SettingsRow>
          <SettingsAction
            label="Restore client–server template"
            hint="Replace the draft with the version shipped by the plugin."
            actionLabel="Restore default"
            disabled={
              settings.saving || draft.clientServerInstructions === CLIENT_SERVER_INSTRUCTIONS
            }
            onPress={() =>
              setDraft((current) => ({
                ...current,
                clientServerInstructions: CLIENT_SERVER_INSTRUCTIONS,
              }))
            }
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Save instruction settings">
        <SettingsCard>
          <SettingsAction
            label="Apply to newly created agents"
            hint="Saving does not modify agents that already exist."
            error={settings.saveError}
            actionLabel={settings.saving ? "Saving…" : "Save changes"}
            disabled={settings.saving || !dirty}
            onPress={() => void settings.save(draft, revision)}
          />
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
