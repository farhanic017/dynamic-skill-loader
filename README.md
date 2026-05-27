[![License](https://img.shields.io/badge/license-GPLv3-purple)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Node.js%2018%2B-green)]()
[![Author](https://img.shields.io/badge/author-Farhan%20Dhrubo-red)](https://github.com/farhanic017)

# Dynamic Skill Loader v2.0 — Always-on skill dispatcher with intelligent lifecycle management

> Created by [Farhan Dhrubo](https://github.com/farhanic017) — [Submit an issue](https://github.com/farhanic017/dynamic-skill-loader-for-opencode/issues)

An MCP server that loads AI coding skills **on-demand** with **intelligent lifecycle management** — auto-tracking loaded skills, scoring them against your task context, and recommending stale skills for unloading.

**Always-on:** Add `ALWAYS_ON.md` to your AI client's permanent instructions so the model calls `match_skills` at the start of EVERY task automatically.

**Smart unload:** Skills in unrelated domains (e.g., design skills during database work) are flagged as stale — free up context tokens without thinking about it.

Works with **OpenCode**, **Claude Desktop/Code**, **Cursor**, **Windsurf**, **Continue.dev**, **VS Code / VS Studio Code**, **VSCodium**, **Antigravity 1.x & 2.x**, **Aider**, and any MCP-compatible client.

---

## 📥 Drop-in repo URL install

Drop this URL into your AI assistant for fully automatic installation:

```
https://github.com/farhanic017/dynamic-skill-loader-for-opencode
```

---

## v2.0 What's new

| Feature | What it does |
|---------|-------------|
| **Task context tracking** | `set_task_context` declares what you're working on |
| **Relevance scoring** | Each loaded skill scored against your context (0–1) |
| **Auto-unload recommendations** | Stale skills flagged — no need to guess |
| **Skill families** | Auto-detected from shared trigger keywords |
| **Active skill dashboard** | `get_active_skills` shows full lifecycle status |
| **Future-proof** | Relevance engine works with ANY skill — no config needed |

## How it works

```
You: "build a hero section with GSAP animations"
       │
       ▼
match_skills("hero section with GSAP animations")
       │
       ▼
get_skill("gsap-core")          ← auto-tracked as ACTIVE
get_skill("frontend-design")    ← auto-tracked as ACTIVE
       │
       ▼
set_task_context({ description: "building a hero section" })
       │
       ▼ dispatcher scores:
          ✓ gsap-core       → relevant (0.85)
          ✓ frontend-design → relevant (0.55)
          → all good, keep loaded

[switch to: "set up Supabase auth"]
       │
       ▼
set_task_context({ description: "setting up Supabase authentication" })
       │
       ▼ dispatcher scores:
          ✗ gsap-core       → stale (0.00)
          ✗ frontend-design → stale (0.02)
          → unload both!

unload_skill("gsap-core")
unload_skill("frontend-design")
match_skills("supabase auth") → get_skill("supabase")
```

<img src="skill-dispatcher-demo.gif" alt="skill-dispatcher demo" width="100%" style="max-width:720px; display:block; margin:24px auto; border-radius:12px;">

## 6 MCP Tools

| Tool | What it does |
|------|-------------|
| `match_skills(query)` | Matches your task against skill `triggers` and `description` (fuzzy, hyphen/punctuation tolerant) |
| `get_skill(name)` | Loads the full `SKILL.md` content; auto-tracks as active |
| `list_skills()` | Browses all skills with active indicators |
| `unload_skill(name)` | Unloads a skill; removes from active tracking |
| `set_task_context({ description })` | Declares current task; returns relevance scores & unload recommendations |
| `get_active_skills()` | Lists loaded skills with domain, relevance, status, call count |

## Lifecycle rules for the model

The `ALWAYS_ON.md` file teaches the model to follow these rules:

1. **Discover at start** — `match_skills(task)` → `get_skill()` for matches
2. **Declare context** — `set_task_context({ description })` after loading
3. **Keep domain families loaded** — design/animation/frontend skills stay together
4. **Unload on domain switch** — `set_task_context` new → `unload_skill` stale ones
5. **Never drop quality** — if unsure, keep the skill; tokens are cheap

## Quick start

### 1. Install

```bash
npm install -g skill-dispatcher
```

Or run directly with npx:

```bash
npx skill-dispatcher --skills-dir ./my-skills
```

### 2. Point it at your skills

Each skill is a directory with a `SKILL.md` file containing YAML frontmatter:

```markdown
---
name: gsap-core
description: Core GSAP animation library
triggers:
  - "gsap"
  - "web animation"
  - "tween"
  - "easing"
---
# gsap-core
Full skill instructions here...
```

### 3. Add to your AI tool

#### OpenCode — always-on via `ALWAYS_ON.md`

Add to `opencode.jsonc`:

```jsonc
{
  "instructions": [
    "path/to/ALWAYS_ON.md",     // <-- always-on: lifecycle rules for the model
    "path/to/instructions.md"
  ],
  "mcp": {
    "skill-dispatcher": {
      "type": "local",
      "command": ["npx", "skill-dispatcher", "--skills-dir", "/path/to/skills"],
      "enabled": true
    }
  }
}
```

The `ALWAYS_ON.md` injects permanent rules for skill discovery, context tracking, and lifecycle management — always-on, never forgotten.

#### Claude Desktop

```json
{
  "mcpServers": {
    "skill-dispatcher": {
      "command": "npx",
      "args": ["skill-dispatcher", "--skills-dir", "/path/to/skills"]
    }
  }
}
```

#### Cursor / Windsurf

```
Name: skill-dispatcher
Type: command
Command: npx skill-dispatcher --skills-dir /path/to/skills
```

#### Continue.dev

```json
{
  "mcpServers": {
    "skill-dispatcher": {
      "command": "npx",
      "args": ["skill-dispatcher", "--skills-dir", "/path/to/skills"]
    }
  }
}
```

#### VS Code / VS Studio Code (`mcp.json`)

```json
{
  "servers": {
    "skill-dispatcher": {
      "type": "stdio",
      "command": "npx",
      "args": ["skill-dispatcher", "--skills-dir", "/path/to/skills"]
    }
  }
}
```

**Config path (user):** `%APPDATA%\Code\User\mcp.json` (Windows) or `~/Library/Application Support/Code/User/mcp.json` (macOS).

#### VSCodium

Same format as VSCode, config at `%APPDATA%\VSCodium\User\mcp.json` (Windows).

#### Antigravity 1.x

Same format as VSCode, config at `%APPDATA%\Antigravity\User\mcp.json` (Windows).

#### Antigravity 2.x

```json
{
  "mcpServers": {
    "skill-dispatcher": {
      "command": "npx",
      "args": ["skill-dispatcher", "--skills-dir", "/path/to/skills"]
    }
  }
}
```

Config at `%USERPROFILE%\.gemini\antigravity\mcp_config.json` (Windows).

### 4. Configure instructions.md

```markdown
## Skill-Dispatcher — ALWAYS ON AT TASK START
- At task start: `match_skills`, load with `get_skill`
- After loading: `set_task_context({ description })`
- When switching domains: `set_task_context` new → `unload_skill` stale
- `get_active_skills()` to check before unloading
- `list_skills()` to browse when nothing matches
```

## Relevance Engine

The dispatcher scores each loaded skill against the task context — zero-config:

| Score | Status | Action |
|-------|--------|--------|
| ≥ 0.30 | Relevant ✓ | Keep loaded |
| 0.10–0.29 | Low ~ | Keep if domain-related |
| < 0.10 | Stale ✗ | Recommended to unload |

Scoring uses token overlap between the task context description and the
skill's triggers, name, and description. No hardcoded domains — works
with ANY current or future skill automatically.

## Skill Families

Skills that share trigger keywords form auto-detected "families".
When you load one family member, the dispatcher suggests the others.
Design, animation, frontend, and graphics skills naturally form
families through their shared triggers like "design", "animation", "ui".

## CLI modes

### MCP server mode (default)

```bash
skill-dispatcher --skills-dir ./skills
```

### Direct terminal mode

```bash
# List all skills (active skills marked)
skill-dispatcher --skills-dir ./skills --list

# Match by trigger keywords
skill-dispatcher --skills-dir ./skills --match "animation gsap"

# Get skill (tracks as active)
skill-dispatcher --skills-dir ./skills --get gsap-core

# Set context (lifecycle recommendations)
skill-dispatcher --skills-dir ./skills --context "building a hero section"

# Show active skills with status
skill-dispatcher --skills-dir ./skills --active

# Unload a skill
skill-dispatcher --skills-dir ./skills --unload gsap-core
```

## Options

| Flag | Alias | Default | Description |
|------|-------|---------|-------------|
| `--skills-dir` | `-s` | `./skills` | Path to skills directory |
| `--list` | `-l` | — | List all available skills |
| `--match` | `-m` | — | Match skills by trigger keywords |
| `--get` | `-g` | — | Get full content of a specific skill |
| `--unload` | `-u` | — | Unload a skill (remove from active set) |
| `--active` | `-a` | — | Show active skills with relevance status |
| `--context` | `-c` | — | Set task context and get recommendations |
| `--help` | `-h` | — | Show help |

## Project Structure

```
skill-dispatcher/
├── index.mjs             # MCP server & CLI (v2.0 lifecycle engine)
├── ALWAYS_ON.md          # Permanent lifecycle instructions for AI models
├── SKILL.md              # AI agent installation instructions
├── install.py            # Auto-installer
├── test.mjs              # Test suite
├── make_gif.py           # Demo GIF generator
├── README.md             # This file
├── LICENSE               # GPL-3.0
├── NOTICE                # Copyright and legal notices
├── package.json          # npm metadata
└── .gitignore
```

---

## Copyright & License

**Copyright (c) 2026 Farhan Dhrubo** — All rights reserved.

Licensed under the **GNU General Public License v3.0**.
See [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for full details.

**You may NOT** remove copyright notices, re-distribute as your own work,
or sell without attribution. All source files contain embedded copyright.

---

*Built with Node.js, MCP, and the conviction that 50+ skills should not
load at startup — and stale ones should auto-sleep.*
