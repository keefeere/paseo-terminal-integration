# Terminal integration for Paseo

Two-way bridge between agent chats and Paseo terminals.

**Agent → terminal.** Runnable fenced code blocks in the agent's reply (`bash`, `sh`, `shell`,
`console`, `zsh`, `fish`, `python`, `js`/`node`) get run controls. On Paseo builds with inline code
block actions ([getpaseo/paseo#5874](https://github.com/getpaseo/paseo/pull/5874)) the controls sit
directly under each block, including in older messages as history loads, and become available when
the reply finishes. On other Paseo versions a **Run in terminal** card appears under the reply.

- **Run** runs the block in the workspace terminal "Agent commands", a regular Paseo terminal tab.
  With inline controls, Run also opens that tab.
- **Run in background** runs it as a hidden process in the agent's working directory: no terminal
  tab, and the runner keeps the last 5,000 lines instead of what fits on a terminal screen. Nothing
  can be typed into it: stdin is empty, so password and confirmation prompts fail instead of
  waiting. Background runs do not wait for the terminal.
- With **Send output to agent** checked (the default), the command, exit code, and output go to
  the agent as a new message when the block finishes. If the agent is busy, delivery waits until
  its turn ends instead of interrupting it. Unchecked, **Send output** sends it later.
- **Stop** sends Ctrl-C; **Send output so far** reports a still-running command.

**Terminal beside the chat.** On Paseo builds with the terminal open-location setting, choose
**Settings → Layout → Open location → Opening a terminal → On the side** and "Agent commands"
opens beside the chat. Elsewhere, drag the tab onto the right or bottom edge of the chat to split
the workspace. A tab you moved stays where you put it while the terminal is open. Background runs
never change the layout.

Terminal runs in one workspace are queued so a command never types into another one's stdin.
Each block runs as a script in the agent's working directory, so `cd` and `export` do not persist
between runs. **Settings → Plugins → Terminal integration** sets the checkbox's default.

**Command guidance for agents.** The same settings screen can add command-formatting and execution
guidance to the system prompt of newly created agents. Turn on **Inject command instructions** and
choose one topology:

- **Local daemon** tells the agent that Run already executes on the local Paseo daemon host, so it
  should not add SSH merely to reach that machine.
- **Client–server** tells the agent that the UI and daemon may be on different devices. Commands for
  the daemon need no prefix; commands for another machine must include an explicit transport such
  as SSH, using a destination supplied by the user rather than an invented host.

Both templates are editable and stored per host. The shipped defaults are also available as
[`local-daemon.md`](instructions/local-daemon.md) and
[`client-server.md`](instructions/client-server.md), and each editor has a restore-default action.
Changing or enabling the setting affects only agents created afterward; it does not rewrite the
system prompt of an existing agent.

**Terminal → agent.** In the composer's attachment menu, **Terminal output** attaches the latest
lines of any terminal on the daemon. Type part of a name or path to filter, and a number to choose
the line count (`build 500`; default 200).

## Install

Requires Paseo 0.10.1 or later and a macOS or Linux daemon host with `bash` (plus `python3` or
`node` for those blocks). Enable plugins under **Settings → Plugins**, then:

```bash
paseo plugin install npm:paseo-terminal-integration
# or from GitHub
paseo plugin install github:keefeere/paseo-terminal-integration
```

Plugins are trusted, unsandboxed code: this one types commands into terminals on the daemon host.
Nothing runs until you press a button or submit `/run`.

## Commands

| Command                                        | Effect                                                 |
| ---------------------------------------------- | ------------------------------------------------------ |
| `/run <command>`                               | Run a shell command and send its output to the agent   |
| `/blocks`                                      | Add a run card for the latest reply (e.g. older chats) |
| ⌘K / Ctrl+K → "Terminal: add run buttons to …" | Same as `/blocks`                                      |

The commands are available on Paseo versions without inline code block actions.

## Limitations

- Terminal output is read from the screen, so very long lines arrive wrapped and only the last
  3,000 rows are visible. The agent receives at most 300 lines or 24,000 characters.
- Run state lives in the plugin process; reloading the plugin forgets it. Controls and cards stay,
  and nothing is re-run.
- A command that has not started within 20 seconds fails, for example when something else is
  running in "Agent commands".

## Develop

The inline code block action types are not in a published `@getpaseo/plugin` yet, so
`client/sdk-compat.ts` declares them. Delete it once the SDK exports them. Use npm 11 for
`npm install`: npm 10 crashes on this dependency tree.

```bash
npm install
npm run typecheck
paseo plugin install "$PWD"   # first time
paseo plugin reload terminal-integration
paseo plugin logs terminal-integration
```

To release, bump the version and push the tag; GitHub Actions publishes it to npm through trusted
publishing, and Paseo Cafe picks up the new version from there:

```bash
npm version patch   # or minor; commits and tags vX.Y.Z
git push --follow-tags
```

## License

MIT
