[![License](https://img.shields.io/badge/license-GPLv3-purple)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Node.js%2018%2B-green)]()
[![Author](https://img.shields.io/badge/author-Farhan%20Dhrubo-red)](https://github.com/farhanic017)
[![Tests](https://img.shields.io/badge/tests-162%20passed-brightgreen)](aggressive-test.mjs)

# Dynamic Skill Loader v3.0 — Universal Skill Dispatcher with Multi-Format Parsing, Agent Routing & External Repo Import

> Created by [Farhan Dhrubo](https://github.com/farhanic017) — [Submit an issue](https://github.com/farhanic017/dynamic-skill-loader-for/issues)

An MCP server and CLI that loads skills **on-demand** from any source, in any format, for any AI coding agent. Supports **4 skill formats**, **14 AI agents**, **nested multi-domain skills**, **external GitHub repo import**, and **intelligent lifecycle management** — zero-config.

---

## 📥 Drop-in install

### Via git clone
```bash
git clone --depth 1 --single-branch https://github.com/farhanic017/dynamic-skill-loader.git
cd dynamic-skill-loader
node index.mjs --skills-dir ./skills
```

### Via npm (when published)
```bash
npx skill-dispatcher --skills-dir ./skills
```

### Manual MCP config (add to your AI coding assistant)
```jsonc
{
  "mcp": {
    "skill-dispatcher": {
      "type": "local",
      "enabled": true,
      "command": ["node", "/path/to/dynamic-skill-loader/index.mjs", "--skills-dir", "/path/to/your/skills"]
    }
  }
}
```

---

## v3.0 What's new

| Feature | What it does |
|---------|-------------|
| **4 skill formats** | Standard YAML, plain markdown, Gemini-style, command format |
| **14 AI agent routing** | Skills auto-filtered per agent (OpenCode, Claude, Cursor, Windsurf, Aider, Gemini, Codex, Antigravity, Kilo Code, Augment, Hermes, Mistral Vibe, OpenClaw) |
| **External repo import** | `--import-repo <url>` clones & indexes any GitHub repo's skills |
| **Nested directory scanning** | Reads skills from `<domain>/<subdomain>/skills/<name>/SKILL.md` up to 4 levels deep |
| **Custom command registry** | `.claude/commands/*.md` parsed as runnable commands |
| **Cross-repo origin tracking** | Every skill tagged with its origin repo, filterable via `--origin` |
| **Universal YAML parser** | Handles inline arrays, anchors, aliases, quoted keys, unicode, multi-doc, tab indentation, folded `>`, typed nulls, flow mappings, escape sequences, booleans, numerics |
| **Tags fallback** | Skills with `tags:` (no `triggers:`) matched automatically |
| **Security hardened** | Shell injection (spawnSync), path traversal (resolve+startsWith), prototype pollution rejection, input size limits, MCP message validation, embedded credential detection |
| **162 tests, 0 failures** | MCP protocol stress, encoding, boundary, YAML syntax, expanded YAML, security, edge cases (import, unicode, deep nesting) |

## 11 MCP Tools

| Tool | What it does |
|------|-------------|
| `match_skills(query)` | Match query against skill triggers/description (fuzzy, synonym-expanded) |
| `get_skill(name)` | Load full SKILL.md content; auto-tracks as active |
| `list_skills()` | Browse all skills with [ACTIVE] indicators |
| `unload_skill(name)` | Remove from active tracking |
| `set_task_context({ description })` | Declare current task; get relevance scores & unload recommendations |
| `get_active_skills()` | List loaded skills with domain, relevance, status, call count |
| `set_workspace(scope)` | Restrict visible skills by name or trigger |
| `import_repo({ url })` | Clone external repo and index its skills + commands |
| `list_commands()` | Show all custom commands from `.claude/commands/` |
| `set_agent({ name })` | Switch agent routing (filters skills by format compatibility) |
| `get_publishable_keys()` | Get API keys (when configured) |

## Supported Skill Formats

### 1. Standard YAML frontmatter (OpenCode-style)
```markdown
---
name: gsap-core
description: Core GSAP animation library
triggers:
  - "gsap"
  - "animation"
  - "tween"
tags:
  - "motion"      ← optional, used as fallback triggers
alias:
  - "gsap-core"   ← additional aliases
---
# gsap-core
Full skill instructions here...
```

### 2. Plain markdown (no frontmatter)
```markdown
# My Skill Name
> Description in blockquote (or inferred from content)

This skill has no YAML frontmatter at all.
It must be >120 characters to be recognized.
Name is inferred from the H1 heading or directory name.
```

### 3. Gemini-style (`# heading` + `> blockquote`)
```markdown
# my-gemini-skill
> This blockquote description identifies this as a Gemini-style skill
```

### 4. Command format (`.claude/commands/*.md`)
```markdown
---
description: "Deploy the current branch to staging"
---
1. Run tests: `npm test`
2. Build: `npm run build`
3. Deploy: `npm run deploy:staging`
```

## Agent Routing

Each of the 14 supported agents sees only compatible skill formats:

| Agent | Formats |
|-------|---------|
| **OpenCode** | standard, plain, gemini, command |
| **Claude Code / Desktop** | standard, command, gemini, plain |
| **Cursor** | standard, plain |
| **Windsurf** | standard, plain, gemini |
| **Codex** | standard, command, plain |
| **Gemini CLI** | gemini, standard, plain |
| **Aider** | standard, plain |
| **Antigravity** | standard, command, plain, gemini |
| **Kilo Code** | standard, plain |
| **Augment** | standard, plain, command |
| **Hermes** | standard, gemini, plain |
| **Mistral Vibe** | standard, plain |
| **OpenClaw** | standard, plain, gemini |

## CLI modes

### MCP server mode (default)
```bash
skill-dispatcher --skills-dir ./skills
```

### Terminal mode
```bash
# List all skills
skill-dispatcher --list

# Match by trigger
skill-dispatcher --match "animation gsap"

# Import external repo
skill-dispatcher --import-repo https://github.com/user/claude-skills

# Show skills by origin
skill-dispatcher --origin local

# Switch agent
skill-dispatcher --agent cursor

# List commands
skill-dispatcher --list-commands

# Get full skill content
skill-dispatcher --get gsap-core

# Set task context
skill-dispatcher --context "building a hero section"

# Show active skills
skill-dispatcher --active

# Unload a skill
skill-dispatcher --unload gsap-core
```

## Options

| Flag | Alias | Default | Description |
|------|-------|---------|-------------|
| `--skills-dir` | `-s` | `./skills` | Path to skills directory |
| `--list` | `-l` | — | List all available skills |
| `--match` | `-m` | — | Match skills by trigger keywords |
| `--get` | `-g` | — | Get full content of a specific skill |
| `--unload` | `-u` | — | Unload a skill |
| `--active` | `-a` | — | Show active skills with relevance |
| `--context` | `-c` | — | Set task context |
| `--import-repo` | — | — | Import skills from external GitHub repo |
| `--agent` | — | `opencode` | Switch agent routing |
| `--list-commands` | — | — | List custom commands |
| `--origin` | — | `all` | Filter skills by origin repo |
| `--simple` | — | — | Plain JSON output (for local models) |
| `--agent-config` | — | — | JSON file with skill allow/block lists |
| `--help` | `-h` | — | Show help |

## YAML Features

The parser handles all common and advanced YAML patterns found in skill definitions:

| Feature | Example |
|---------|---------|
| Inline arrays | `triggers: [foo, bar]` |
| Multi-line literal (\|) | `description: \|` block (newlines preserved) |
| Folded block (>) | `description: >` block (lines joined with spaces) |
| Typed nulls | `value: ~`, `value: null`, `value: Null`, `value: NULL` |
| Flow mappings | `config: {a: 1, b: 2}` inline objects |
| Escape sequences | `"line1\\nline2\\ttabbed"` in double-quoted strings |
| Boolean literals | `yes`, `no`, `on`, `off`, `true`, `false` |
| Numeric formats | `0xFF` hex, `1_000_000` separators, `1e3` scientific, `+42`, `.5` |
| Anchors | `defaults: &defaults` with `<<: *defaults` |
| Quoted keys | `"my key": value` (preserves spaces) |
| Dots in keys | `some.key: value` |
| Unicode keys | `ключ: значение` |
| Multi-doc | `---\ndoc1\n---\doc2\n---` (first doc only) |
| End marker | `...` stops parsing |
| Tab indentation | Nested items with tabs |
| Inline comments | `#` lines ignored |
| Prototype pollution guard | Keys `__proto__`, `prototype`, `constructor` rejected |
| Max nesting limit | 20 levels max before truncation |

## Security

| Protection | Implementation |
|------------|---------------|
| Shell injection | `spawnSync` (no shell) for all child processes; `execSync` eliminated |
| Git URL validation | Only http/https/ssh/git protocols; rejects shell chars (`;`, `` ` ``, `$()`, `\`) |
| Path traversal | `resolve()` + `startsWith()` ensures all reads stay within `SKILLS_DIR` |
| Prototype pollution | `__proto__`, `prototype`, `constructor` keys rejected in all YAML input |
| Input size limits | Max YAML value 100K chars, max nesting 20 levels, max 500 triggers, 5000 list items, 500 keys/object |
| MCP validation | Message structure enforced (jsonrpc 2.0, valid types), 10MB max message size, 10MB max skill file |
| Stderr sanitization | Auth tokens stripped from git error output |

## Project Structure

```
skill-dispatcher/
├── index.mjs             # MCP server & CLI (v3.0 universal dispatcher, ~1930 lines)
├── ALWAYS_ON.md          # Permanent lifecycle instructions
├── SKILL.md              # self-defining skill
├── aggressive-test.mjs   # 162-test suite (MCP, encoding, YAML, security, edge cases)
├── README.md
├── LICENSE               # GPL-3.0
├── NOTICE
├── package.json
└── .gitignore
```

---

## Copyright & License

**Copyright (c) 2026 Farhan Dhrubo** — All rights reserved.

Licensed under the **GNU General Public License v3.0**.
See [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for full details.

---

*Built with Node.js, MCP, and 162 tests that never lie.*
