# Terminal integration for Paseo

Two-way bridge between agent chats and Paseo terminals.

**Agent → terminal.** When a turn ends, runnable fenced code blocks in the agent's reply
(`bash`, `sh`, `shell`, `console`, `zsh`, `fish`, `python`, `js`/`node`) get a **Run in terminal**
card under the reply:

- **Run & send to agent** runs the block in the workspace terminal "Agent commands" and, when it
  finishes, sends the command, exit code, and output to the agent as a new message. If the agent is
  busy, delivery waits until its turn ends instead of interrupting it.
- **Run only** runs it without sending; **Send output** sends it later.
- **Stop** sends Ctrl-C; **Send output so far** reports a still-running command.

The terminal is a real PTY, so prompts (`sudo`, `y/n`) can be answered in the terminal tab. Runs in
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

- Output is read from the terminal screen, so very long lines arrive wrapped and only the last
  3,000 rows are visible. The agent receives at most 300 lines or 24,000 characters.
- Run state lives in the plugin process; reloading the plugin forgets it (the cards stay).
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
