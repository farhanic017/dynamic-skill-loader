---
name: skill-dispatcher
description: >
  On-demand skill loader with intelligent lifecycle management for AI coding
  assistants. 6 MCP tools: match_skills, get_skill, list_skills, unload_skill,
  set_task_context, get_active_skills. Auto-tracks loaded skills, computes
  relevance against task context, recommends stale skills for unloading.
  Zero-config — works with any current or future skill. Zero dependencies.
  Works with any model (local or cloud) via MCP stdio.
triggers:
  - skill-dispatcher
  - skill loader
  - dynamic skill
  - on-demand skills
  - trigger matching
  - install skill-dispatcher
  - setup skill-dispatcher
  - always-on skills
  - opencode skills
  - vscode mcp
  - antigravity mcp
  - cursor mcp
  - claude mcp
  - skill lifecycle
  - unload skills
  - active skills
  - task context
  - token optimization
  - context management
---

# Dynamic Skill Loader — v2.0: Smart Lifecycle Management

An MCP server that loads AI coding skills **on-demand** with intelligent
lifecycle management. Skills are auto-tracked when loaded, scored against
the current task context, and stale skills are recommended for unloading.

**Always-on** via `ALWAYS_ON.md` — the model automatically calls
`match_skills` at task start and manages lifecycle with `set_task_context`.

Works with **any model** (local or cloud) and **any MCP-compatible client**.

## v2.0 New Features

| Feature | What it does |
|---------|-------------|
| **Task context tracking** | `set_task_context` declares what you're working on |
| **Relevance scoring** | Each loaded skill is scored against your context |
| **Auto-unload recommendations** | Stale skills flagged for unloading |
| **Skill families** | Auto-detected from shared trigger keywords |
| **Active skill dashboard** | `get_active_skills` shows full lifecycle status |

## 6 MCP Tools

| Tool | What it does |
|------|-------------|
| `match_skills(query)` | Matches your task against skill triggers (fuzzy, case-insensitive) |
| `get_skill(name)` | Loads full SKILL.md content; auto-tracks as active |
| `list_skills()` | Browses all skills with active indicators |
| `unload_skill(name)` | Unloads a skill; removes from active tracking |
| `set_task_context({ description })` | Declares current task; returns relevance scores & unload recommendations |
| `get_active_skills()` | Lists loaded skills with domain, relevance, status, call count |

## Lifecycle flow

```
match_skills("hero section with animations")
  → get_skill("gsap-core")           ← auto-tracked ACTIVE
  → get_skill("frontend-design")     ← auto-tracked ACTIVE
  → set_task_context("building hero section")
    → both relevant ✓

[switch to: "set up Supabase auth"]
  → set_task_context("setting up Supabase")
    → gsap-core stale ✗
    → frontend-design stale ✗
  → unload_skill("gsap-core")
  → unload_skill("frontend-design")
  → match_skills("supabase auth")
  → get_skill("supabase")
```

## Usage

```bash
# MCP server (default)
node index.mjs --skills-dir ./skills

# CLI: list skills
node index.mjs --skills-dir ./skills --list

# CLI: match skills
node index.mjs --skills-dir ./skills --match "animation gsap"

# CLI: get skill (tracks as active)
node index.mjs --skills-dir ./skills --get gsap-core

# CLI: set task context (lifecycle recommendation)
node index.mjs --skills-dir ./skills --context "building a hero section"

# CLI: show active skills
node index.mjs --skills-dir ./skills --active

# CLI: unload skill
node index.mjs --skills-dir ./skills --unload gsap-core
```

## Relevance Engine

The dispatcher scores each loaded skill against the task context by
analyzing token overlap between the context and the skill's triggers,
name, and description. No hardcoded domains — works with any skill:

- **Relevant** (score ≥ 0.30): Skill matches the task — keep loaded
- **Low** (score 0.10–0.29): Marginal match — keep if domain-related
- **Stale** (score < 0.10): No match — recommended for unloading

## Skill Families

Skills that share trigger keywords are auto-detected as a "family".
For example, if three skills all trigger on "design", they form a
family. When you load one, the dispatcher suggests the others.

## Quick Install

```bash
git clone https://github.com/farhanic017/dynamic-skill-loader-for-opencode.git
cd dynamic-skill-loader-for-opencode
python install.py
```

Or add to your MCP config:

```jsonc
// opencode.jsonc
{
  "mcp": {
    "skill-dispatcher": {
      "type": "local",
      "command": ["node", "/full/path/to/index.mjs", "--skills-dir", "/path/to/skills"],
      "enabled": true
    }
  }
}
```

## Config Instructions

Create an `instructions.md` referencing the always-on file:

```markdown
# HARD RULES
## 1. Skill-Dispatcher — ALWAYS ON AT TASK START
- At task start: call `match_skills`, load matches with `get_skill`
- After loading: call `set_task_context` to enable lifecycle management
- When switching domains: `set_task_context` again, then `unload_skill` stale ones
- `get_active_skills()` to check what's loaded before unloading
- `list_skills()` to browse when match_skills returns nothing
```

## Copyright & License

**Copyright (c) 2026 Farhan Dhrubo** — All rights reserved.
Licensed under **GNU General Public License v3.0**.
