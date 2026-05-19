# Dynamic Skill Loader for OpenCode (and any MCP-compatible AI tool)

> Created by [Farhan Dhrubo](https://github.com/farhanic017) — [Submit an issue](https://github.com/farhanic017/dynamic-skill-loader-for-opencode/issues)

An MCP server that loads AI coding skills **on-demand** by matching **trigger keywords** against your task — just like Claude Code's built-in skill system. Works with **OpenCode**, **Claude Desktop**, **Cursor**, and any MCP-compatible client.

Stop loading 50+ skills at startup. Only load what you need, when you need it.

## How it works

```
You: "build a hero section with GSAP animations"
       │
       ▼
skill-dispatcher matches triggers
       │
       ▼
Returns: gsap-core, gsap-scrolltrigger, frontend-design
       │
       ▼
You call get_skill("gsap-core") → full instructions loaded
```

**3 tools:**

| Tool | What it does |
|------|-------------|
| `match_skills(query)` | Matches your task against skill `triggers` and `description` fields |
| `get_skill(name)` | Loads the full `SKILL.md` content of a matched skill |
| `list_skills()` | Browses all available skills and their trigger keywords |

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

Your skills should follow the Claude Code skill format — each skill is a directory with a `SKILL.md` file containing YAML frontmatter:

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

#### opencode

Add to `opencode.jsonc`:

```jsonc
{
  "instructions": ["path/to/instructions.md"],
  "mcp": {
    "skill-dispatcher": {
      "type": "local",
      "command": ["npx", "skill-dispatcher", "--skills-dir", "/path/to/skills"],
      "enabled": true
    }
  }
}
```

Create `instructions.md`:

```markdown
## Skills
Skills are NOT pre-loaded. At the start of every task, call `match_skills`
with your task description to load relevant skills on-demand.
```

#### Claude Desktop

Add to `claude_desktop_config.json`:

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

#### Cursor

Add in Cursor's MCP server settings:

```
Name: skill-dispatcher
Type: command
Command: npx skill-dispatcher --skills-dir /path/to/skills
```

## Creating skills

Each skill is a directory with a `SKILL.md` file. The frontmatter controls matching:

```yaml
---
name: my-skill          # Display name
description: |           # Matched against your query
  What this skill does
triggers:                # Keywords that activate this skill
  - "keyword1"
  - "keyword2"
---
# Full markdown content
Instructions, examples, API docs...
```

## CLI modes

### MCP server mode (default)

Run without action flags to start the MCP server. AI tools connect to this via stdio:

```bash
skill-dispatcher --skills-dir ./skills
```

### Direct terminal mode

Use action flags to query skills directly from your terminal:

```bash
# List all skills
skill-dispatcher --skills-dir ./skills --list

# Match skills by trigger keywords
skill-dispatcher --skills-dir ./skills --match "animation gsap"

# Get full skill content
skill-dispatcher --skills-dir ./skills --get gsap-core

# Show help
skill-dispatcher --help
```

This makes it useful in shell scripts, CI/CD pipelines, or any workflow where you need to discover and load skills programmatically.

## Options

| Flag | Alias | Default | Description |
|------|-------|---------|-------------|
| `--skills-dir` | `-s` | `./skills` | Path to skills directory |
| `--list` | `-l` | — | List all available skills |
| `--match` | `-m` | — | Match skills by trigger keywords (requires a query) |
| `--get` | `-g` | — | Get full content of a specific skill (requires name) |
| `--help` | `-h` | — | Show help |

## License

GNU General Public License v3.0 — see [LICENSE](./LICENSE).

This program is free software: you can redistribute and/or modify it under the terms of the GPLv3.
Modified versions must be licensed under GPLv3 with clear attribution to the original author.

© 2026 Farhan Dhrubo.
