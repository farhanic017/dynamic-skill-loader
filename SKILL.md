---
name: skill-dispatcher
description: >
  Universal MCP skill dispatcher for AI coding agents. Loads Claude Code,
  OpenCode, Cursor, Gemini-style, command, plain markdown, and GitHub-hosted
  skills on demand. Includes agent routing, active skill lifecycle tracking,
  external repo import, nested skill discovery, origin filtering, and hardened
  parsing for secure context management.
triggers:
  - skill-dispatcher
  - dynamic skill loader
  - dynamic skill
  - skill loader
  - skill dispatcher
  - on-demand skills
  - mcp server
  - model context protocol
  - ai coding agent
  - ai coding assistant
  - claude code skills
  - opencode skills
  - cursor rules
  - gemini cli skills
  - codex skills
  - agent routing
  - external repo import
  - github skills
  - prompt engineering
  - context management
  - token optimization
  - active skills
  - unload skills
tags:
  - mcp
  - mcp-server
  - ai-agent
  - ai-coding
  - claude-code
  - opencode
  - cursor-ai
  - codex
  - gemini-cli
  - skill-loader
  - context-management
---

# Dynamic Skill Loader

Dynamic Skill Loader is a zero-dependency Node.js MCP server and CLI that indexes skill files and loads only the instructions relevant to the current task.

It helps AI coding agents avoid context bloat by matching a task to skills, loading selected skill content, tracking what is active, and recommending stale skills for unloading when the task changes.

## Core Capabilities

| Capability | Description |
| --- | --- |
| Multi-format skills | YAML frontmatter, plain markdown, Gemini-style markdown, `.claude/commands`, and Claude Code skills |
| Agent routing | Filters compatible formats for Claude, OpenCode, Cursor, Windsurf, Aider, Gemini, Codex, Antigravity, Kilo Code, Augment, Hermes, Mistral Vibe, and OpenClaw |
| External repo import | Clones public GitHub skill repos with `--import-repo` and tracks skill origin |
| Lifecycle tracking | Marks loaded skills active, scores relevance, and suggests stale skills to unload |
| Nested discovery | Finds skills in domain and subdomain folder structures |
| Security hardening | Validates Git URLs, blocks path traversal, rejects prototype pollution keys, limits input size, validates MCP messages, and sanitizes git errors |

## MCP Tools

| Tool | Purpose |
| --- | --- |
| `match_skills(query)` | Match a task against skill triggers, descriptions, tags, and aliases |
| `get_skill(name)` | Load full skill content and mark it active |
| `list_skills()` | Browse indexed skills with active indicators |
| `unload_skill(name)` | Remove a skill from active tracking |
| `set_task_context({ description })` | Set the current task and return relevance scores |
| `get_active_skills()` | List loaded skills with domain, relevance, status, and call count |
| `set_workspace(scope)` | Restrict visible skills by name or trigger |
| `import_repo({ url })` | Clone a public skill repo and index its skills and commands |
| `list_commands()` | Show custom commands from `.claude/commands/` |
| `set_agent({ name })` | Switch agent routing and format compatibility |
| `get_publishable_keys()` | Return configured publishable keys |

## Usage

```bash
node index.mjs --skills-dir ./skills --list
node index.mjs --skills-dir ./skills --match "animation gsap"
node index.mjs --skills-dir ./skills --get gsap-core
node index.mjs --skills-dir ./skills --context "building a hero section"
node index.mjs --skills-dir ./skills --active
node index.mjs --skills-dir ./skills --unload gsap-core
node index.mjs --skills-dir ./skills --import-repo https://github.com/user/claude-skills
```

## Always-On Pattern

At task start:

1. Call `match_skills` with the task description.
2. Load relevant matches with `get_skill`.
3. Call `set_task_context` to enable lifecycle tracking.

When switching domains:

1. Call `set_task_context` with the new task.
2. Check stale recommendations.
3. Unload stale skills with `unload_skill`.
4. Match and load skills for the new domain.
