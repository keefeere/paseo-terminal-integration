# Terminal integration for Paseo

Two-way bridge between agent chats and Paseo terminals.

**Agent → terminal.** When a turn ends, runnable fenced code blocks in the agent's reply
(`bash`, `sh`, `shell`, `console`, `zsh`, `fish`, `python`, `js`/`node`) get a **Run in terminal**
card under the reply:

- **Run in side terminal** runs the block in the workspace terminal "Agent commands" and shows it in
  the side panel; **Run silently** runs it without showing anything.
- With **Send to agent** checked (the default), the command, exit code, and output go to the agent
  as a new message when the block finishes. If the agent is busy, delivery waits until its turn
  ends instead of interrupting it. Unchecked, **Send output** sends it later.
- **Stop** sends Ctrl-C; **Send output so far** reports a still-running command.

**Terminal panel.** The side panel (Explorer) shows "Agent commands" as a full terminal: the same
xterm.js renderer and live stream as Paseo's terminal tabs, with colors, the cursor, full-screen
programs, and keyboard input. Click it and type to answer `sudo` passwords, `y/n` questions, or
npm's "Press ENTER" without leaving the chat. Copy and paste with Ctrl-Shift-C and Ctrl-Shift-V;
Ctrl-C goes to the shell; web links open in the browser when clicked. The card's **Terminal**
button opens it without running anything. On
phones the panel is a plain-text copy with an input line and Enter, Ctrl-C, Ctrl-D, and Tab keys,
in a tab that opens only when you ask. **Settings → Plugins → Terminal integration** switches the
panel to a workspace tab and sets the checkbox's default.

Paseo gives every workspace terminal its own tab, so "Agent commands" also appears in the tab bar
(in the background). Closing that tab ends the terminal; the next run starts a new one. Runs in
one workspace are queued so a command never types into another one's stdin. Each block runs as a
script in the agent's working directory, so `cd` and `export` do not persist between runs.

**Terminal → agent.** In the composer's attachment menu, **Terminal output** attaches the latest
lines of any terminal on the daemon. Type part of a name or path to filter, and a number to choose
the line count (`build 500`; default 200).

## Install

Requires Paseo 0.10.1 or later and a macOS or Linux daemon host with `bash` (plus `python3` or
`node` for those blocks). Enable plugins under **Settings → Plugins**, then:

```bash
paseo plugin install npm:paseo-terminal-integration
```

Install from npm: GitHub installs skip npm dependencies, which the terminal panel needs.

Plugins are trusted, unsandboxed code: this one types commands into terminals on the daemon host.
Nothing runs until you press a button or submit `/run`.

## Commands

| Command                                         | Effect                                                      |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `/run <command>`                                | Run a shell command and send its output to the agent        |
| `/blocks`                                       | Add a run card for the latest reply (e.g. older chats)      |
| ⌘K / Ctrl+K → "Terminal: add run buttons to …"  | Same as `/blocks`                                           |
| ⌘K / Ctrl+K → "Terminal: show … in the side panel" | Open the terminal panel in the Explorer                  |

## Limitations

- Output is read from the terminal screen, so very long lines arrive wrapped and only the last
  3,000 rows are visible. The agent receives at most 300 lines or 24,000 characters.
- Run state lives in the plugin process; reloading the plugin forgets it (the cards stay).
- The live panel opens its own connection to the daemon on the plugin host, using the address in
  `$PASEO_HOME/paseo.pid` and the local credential, as the `paseo` CLI does. A daemon listening on
  a Unix socket gets the plain-text panel instead.
- Opening or resizing the panel resizes the PTY to fit it, as focusing a terminal tab does.
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

## License

MIT
