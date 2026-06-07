[![License](https://img.shields.io/badge/license-GPLv3-purple)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)
[![MCP](https://img.shields.io/badge/MCP-server-blue)](https://modelcontextprotocol.io/)
[![Tests](https://img.shields.io/badge/tests-166%20passed-brightgreen)](aggressive-test.mjs)

# Dynamic Skill Loader

**Universal MCP skill dispatcher for AI coding agents.** Load Claude Code skills, OpenCode skills, Cursor rules, Gemini-style markdown, command files, and external GitHub skill repos on demand without bloating every prompt.

Dynamic Skill Loader is a zero-dependency Node.js MCP server and CLI for developers building with Claude Code, OpenCode, Cursor, Windsurf, Aider, Gemini CLI, Codex, Antigravity, Kilo Code, Augment, Hermes, Mistral Vibe, and other MCP-compatible coding assistants.

![Dynamic Skill Loader demo](skill-dispatcher-demo.gif)

## Why Developers Star It

- **On-demand AI skills:** match the current task to the right skill instead of loading every instruction file.
- **Universal agent routing:** filter skills by agent so Claude, Cursor, Codex, OpenCode, and Gemini each see compatible formats.
- **External repo import:** clone and index skills from any public GitHub repository with `--import-repo`.
- **Context lifecycle management:** track active skills, score relevance, and unload stale instructions when the task changes.
- **Multi-format parser:** supports YAML frontmatter, plain markdown, Gemini blockquotes, `.claude/commands`, and Claude Code skill files.
- **Security hardened:** validates Git URLs, blocks path traversal, rejects prototype pollution keys, limits input size, and keeps MCP stdout clean.

## Quick Start

```bash
git clone --depth 1 --single-branch https://github.com/farhanic017/dynamic-skill-loader.git
cd dynamic-skill-loader
node index.mjs --skills-dir ./skills --list
node index.mjs --skills-dir ./skills --match "build a GSAP landing page"
```

Run as an MCP server:

```bash
node index.mjs --skills-dir ./skills
```

Add it to an MCP-compatible assistant:

```jsonc
{
  "mcp": {
    "skill-dispatcher": {
      "type": "local",
      "enabled": true,
      "command": [
        "node",
        "/path/to/dynamic-skill-loader/index.mjs",
        "--skills-dir",
        "/path/to/your/skills"
      ]
    }
  }
}
```

## What It Solves

AI coding agents get weaker when every framework rule, design guide, deployment note, and workflow instruction is stuffed into context at once. Dynamic Skill Loader keeps those instructions searchable and loads only what the current task needs.

Use it for:

- Claude Code skill libraries
- OpenCode and Cursor workflow instructions
- MCP-powered agent toolkits
- Personal AI coding playbooks
- Team skill repositories
- Prompt and context optimization
- Agent-specific rule routing
- Reusing skills across multiple coding assistants

## v3.0 Features

| Feature | What it does |
| --- | --- |
| 5 skill formats | Standard YAML, plain markdown, Gemini-style markdown, command files, Claude Code skills |
| 14 AI agents | OpenCode, Claude, Cursor, Windsurf, Aider, Gemini, Codex, Antigravity, Kilo Code, Augment, Hermes, Mistral Vibe, OpenClaw |
| External repo import | `--import-repo <url>` clones and indexes public GitHub skill repos |
| Nested scanning | Reads `<domain>/<subdomain>/skills/<name>/SKILL.md` up to 4 levels deep |
| Command registry | Parses `.claude/commands/*.md` as reusable commands |
| Cross-repo origin tracking | Tags every imported skill with its origin repo and filters via `--origin` |
| Universal YAML parser | Handles arrays, anchors, aliases, quoted keys, Unicode, multi-doc, tabs, folded blocks, typed nulls, booleans, numerics, and comments |
| Tags fallback | Uses `tags:` as matching triggers when `triggers:` are missing |
| Security hardening | Blocks shell injection, path traversal, prototype pollution, oversized input, malformed MCP messages, and embedded credentials |
| Test coverage | 166 aggressive tests for MCP protocol, parsing, encoding, security, import, and edge cases |

## MCP Tools

| Tool | Purpose |
| --- | --- |
| `match_skills(query)` | Match a task against skill triggers, descriptions, tags, and aliases |
| `get_skill(name)` | Load full skill content and mark it active |
| `list_skills()` | Browse indexed skills with active indicators |
| `unload_skill(name)` | Remove a skill from active tracking |
| `set_task_context({ description })` | Set the current task and get relevance scores |
| `get_active_skills()` | View loaded skills, relevance, status, and call count |
| `set_workspace(scope)` | Restrict visible skills by name or trigger |
| `import_repo({ url })` | Clone a public skill repo and index its skills and commands |
| `list_commands()` | List custom commands from `.claude/commands/` |
| `set_agent({ name })` | Switch agent routing and format compatibility |
| `get_publishable_keys()` | Return configured publishable keys |

## Supported Skill Formats

### YAML frontmatter

```markdown
---
name: gsap-core
description: Core GSAP animation library
triggers:
  - gsap
  - animation
  - tween
tags:
  - motion
aliases:
  - gsap-core
---

# gsap-core

Full skill instructions here.
```

### Plain markdown

```markdown
# My Skill Name

> A short description can be inferred from a blockquote.

The body must be long enough to identify this file as a useful skill.
```

### Gemini-style markdown

```markdown
# my-gemini-skill

> This blockquote description identifies the skill.
```

### Claude command files

```markdown
---
description: Deploy the current branch to staging
---

1. Run tests.
2. Build.
3. Deploy.
```

### Claude Code skills

```markdown
---
name: my-claude-skill
description: A Claude Code skill with standard frontmatter
triggers:
  - cc-task
---

# Skill instructions
```

## Agent Routing

| Agent | Compatible formats |
| --- | --- |
| OpenCode | standard, plain, gemini, command, claude |
| Claude Code / Desktop | standard, command, gemini, plain, claude |
| Cursor | standard, plain |
| Windsurf | standard, plain, gemini |
| Codex | standard, command, plain |
| Gemini CLI | gemini, standard, plain |
| Aider | standard, plain |
| Antigravity | standard, command, plain, gemini |
| Kilo Code | standard, plain |
| Augment | standard, plain, command |
| Hermes | standard, gemini, plain |
| Mistral Vibe | standard, plain |
| OpenClaw | standard, plain, gemini |

## CLI Examples

```bash
# List all skills
node index.mjs --skills-dir ./skills --list

# Match by task
node index.mjs --skills-dir ./skills --match "animation gsap"

# Import an external skill repo
node index.mjs --skills-dir ./skills --import-repo https://github.com/user/claude-skills

# Show skills from one origin
node index.mjs --skills-dir ./skills --origin local --list

# Switch agent routing
node index.mjs --skills-dir ./skills --agent cursor --list

# List command files
node index.mjs --skills-dir ./skills --list-commands

# Load full skill content
node index.mjs --skills-dir ./skills --get gsap-core

# Set task context and get lifecycle guidance
node index.mjs --skills-dir ./skills --context "building a hero section"

# Show active skills
node index.mjs --skills-dir ./skills --active

# Unload a stale skill
node index.mjs --skills-dir ./skills --unload gsap-core
```

## Options

| Flag | Alias | Default | Description |
| --- | --- | --- | --- |
| `--skills-dir` | `-s` | `./skills` | Path to skills directory |
| `--list` | `-l` | n/a | List all available skills |
| `--match` | `-m` | n/a | Match skills by trigger keywords |
| `--get` | `-g` | n/a | Get full content of a skill |
| `--unload` | `-u` | n/a | Unload a skill |
| `--active` | `-a` | n/a | Show active skills with relevance |
| `--context` | `-c` | n/a | Set task context |
| `--import-repo` | n/a | n/a | Import skills from a public GitHub repo |
| `--agent` | n/a | `opencode` | Switch agent routing |
| `--list-commands` | n/a | n/a | List custom commands |
| `--origin` | n/a | `all` | Filter skills by origin repo |
| `--simple` | n/a | n/a | Plain JSON output for local models |
| `--agent-config` | n/a | n/a | JSON file with skill allow/block lists |
| `--help` | `-h` | n/a | Show help |

## Security

| Protection | Implementation |
| --- | --- |
| Shell injection | Uses `spawnSync` without shell execution for git operations |
| Git URL validation | Allows only safe `http`, `https`, `ssh`, and `git` protocols |
| Path traversal | Uses `resolve()` and base-directory checks before reading skills |
| Prototype pollution | Rejects `__proto__`, `prototype`, and `constructor` keys |
| Input size limits | Caps YAML values, nesting depth, trigger count, list size, object keys, MCP messages, and skill files |
| MCP validation | Enforces JSON-RPC 2.0 structure and valid field types |
| Stderr sanitization | Strips tokens from git error output |

## Project Structure

```text
dynamic-skill-loader/
|-- index.mjs             # MCP server and CLI
|-- install.py            # Optional installer
|-- ALWAYS_ON.md          # Always-on skill dispatcher instructions
|-- SKILL.md              # Self-describing skill
|-- skills/               # Example skills
|-- aggressive-test.mjs   # Aggressive test suite
|-- test.mjs              # Focused test suite
|-- README.md
|-- LICENSE
|-- NOTICE
`-- package.json
```

## Recommended GitHub Topics

Add these topics in the GitHub repository sidebar to improve discovery:

```text
mcp, mcp-server, model-context-protocol, ai-agent, ai-coding, claude-code, opencode, cursor-ai, codex, gemini-cli, skill-loader, prompt-engineering, context-management, developer-tools, agent-tools
```

## Contributing

Bug reports, feature requests, docs improvements, and new skill-format examples are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

If this saves tokens or makes your AI coding workflow cleaner, starring the repo helps other developers find it.

## License

Copyright (c) 2026 Farhan Dhrubo.

Licensed under the [GNU General Public License v3.0](LICENSE). See [NOTICE](NOTICE) for attribution details.
