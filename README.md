# Terminal integration for Paseo

Two-way bridge between agent chats and Paseo terminals.

**Agent → terminal.** When a turn ends, runnable fenced code blocks in the agent's reply
(`bash`, `sh`, `shell`, `console`, `zsh`, `fish`, `python`, `js`/`node`) get a **Run in terminal**
card under the reply:

- **Run** runs the block in the workspace terminal "Agent commands", a regular Paseo terminal tab.
- **Run in background** runs it as a hidden process in the agent's working directory: no terminal
  tab, and the card keeps the last 5,000 lines instead of what fits on a terminal screen. Nothing
  can be typed into it: stdin is empty, so password and confirmation prompts fail instead of
  waiting. Background runs do not wait for the terminal.
- With **Send output to agent** checked (the default), the command, exit code, and output go to
  the agent as a new message when the block finishes. If the agent is busy, delivery waits until
  its turn ends instead of interrupting it. Unchecked, **Send output** sends it later.
- **Stop** sends Ctrl-C; **Send output so far** reports a still-running command.

**Terminal beside the chat.** "Agent commands" opens as a background tab. Drag the tab onto the
right or bottom edge of the chat to split the workspace; it stays there while the terminal is open,
so you can watch runs and type answers to `sudo` passwords or `y/n` questions next to the
conversation. From the keyboard, split the pane and move the tab into it with the shortcuts in
**Settings → Shortcuts → Tabs & panes**. Closing the tab ends the terminal; the next run starts a
new one in a new tab.

Terminal runs in one workspace are queued so a command never types into another one's stdin.
Each block runs as a script in the agent's working directory, so `cd` and `export` do not persist
between runs. **Settings → Plugins → Terminal integration** sets the checkbox's default.

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

| Command                                         | Effect                                                      |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `/run <command>`                                | Run a shell command and send its output to the agent        |
| `/blocks`                                       | Add a run card for the latest reply (e.g. older chats)      |
| ⌘K / Ctrl+K → "Terminal: add run buttons to …"  | Same as `/blocks`                                           |

## Limitations

- Terminal output is read from the screen, so very long lines arrive wrapped and only the last
  3,000 rows are visible. The agent receives at most 300 lines or 24,000 characters.
- Run state lives in the plugin process; reloading the plugin forgets it (the cards stay).
- Plugins cannot split panes or move tabs, so placing the terminal beside the chat is up to you.
- A command that has not started within 20 seconds fails, for example when something else is
  running in "Agent commands".

## Develop

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
