# skill-dispatcher — always-on instruction

You have access to the **skill-dispatcher** MCP server which provides
`match_skills`, `get_skill`, `list_skills`, `unload_skill`,
`set_task_context`, and `get_active_skills` tools for loading AI coding
skills on-demand with **intelligent lifecycle management**.

## Mandatory behavior

### 1. Discover skills at task start
Call `match_skills("<task description>")` at the START of every task.
This discovers relevant skills with specialized instructions.

### 2. Load matching skills
If `match_skills` returns results, call `get_skill("<name>")` for each
matched skill to load its full content. **Skills are auto-tracked as
"active"** — the dispatcher knows what you've loaded.

### 3. Declare your task context
After loading skills, call:
```
set_task_context({ description: "what you are working on" })
```
The dispatcher scores all active skills against this description and
recommends which to unload (stale) vs keep (relevant). This is the
**core of lifecycle management** — without it, the dispatcher can't
tell what's relevant.

### 4. Keep related skills alive during a domain
Skills in the **same domain family** (sharing trigger keywords like
"design", "animation", "frontend") should stay loaded together.
For example, if you're doing frontend/UI/design work:
- `frontend-design`, `frontend-dev`, `frontend-skill`, `web-design-guidelines`
- `gsap-core`, `gsap-scrolltrigger`, `gsap-timeline` (animation for UI)
- `canvas-design`, `color-expert`, `brand-guidelines` (visual polish)
- `ui-skills`, `platform-design`, `apple-hig` (design systems)

**Keep ALL of these loaded** during design/frontend work. The
dispatcher's `set_task_context` will confirm they're relevant.

### 5. Unload when switching domains
When moving to a **different domain** (e.g., from design work to
database config or browser automation):
1. Call `set_task_context` with the new task description
2. Check `get_active_skills()` for stale recommendations
3. Call `unload_skill("<name>")` for stale skills

This frees context tokens and prevents skill instructions from
interfering with unrelated work.

### 6. Never drop work quality
- `set_task_context` is **advisory** — it scores relevance but YOU
  decide what to unload. If a skill's instructions are still useful
  even with low relevance, keep it.
- `get_active_skills()` shows you the full picture before you unload.
- If unsure, keep the skill loaded. Token cost of an extra skill is
  lower than missing critical instructions.

### 7. `list_skills` to browse
If `match_skills` returns nothing useful, call `list_skills()` to see
all available skills and their trigger keywords.

## Lifecycle flow (visual)

```
Start of session
  │
  ├─ match_skills("building a hero section")
  │     │
  │     ▼
  ├─ get_skill("gsap-core")        ← auto-tracked as ACTIVE
  ├─ get_skill("frontend-design")  ← auto-tracked as ACTIVE
  │
  ├─ set_task_context({ description: "building hero section with animations" })
  │     │
  │     ▼ dispatcher scores:
  │        gsap-core       → relevant (✓ keep)
  │        frontend-design → relevant (✓ keep)
  │
  ├─ [work on hero section...]
  │
  ├─ [user switches to: "set up Supabase auth"]
  │     │
  │     ▼
  ├─ set_task_context({ description: "setting up Supabase authentication" })
  │     │
  │     ▼ dispatcher scores:
  │        gsap-core       → stale (✗ unload)
  │        frontend-design → stale (✗ unload)
  │
  ├─ unload_skill("gsap-core")
  ├─ unload_skill("frontend-design")
  │
  ├─ match_skills("supabase auth")
  ├─ get_skill("supabase")
  │
  └─ [work on auth...]
```

## Supported tools

| Tool | Config | Status |
|------|--------|--------|
| **OpenCode** | `opencode.jsonc` → `mcp` | ✅ Always-on via MCP |
| **Claude Desktop / Claude Code** | `claude_desktop_config.json` → `mcpServers` | ✅ Always-on via MCP |
| **Cursor** | MCP server settings | ✅ Always-on via MCP |
| **Windsurf** | MCP server settings | ✅ Always-on via MCP |
| **Continue.dev** | `config.json` → `mcpServers` | ✅ Always-on via MCP |
| **VS Code / VS Studio Code** | `mcp.json` → `servers` | ✅ Always-on via MCP |
| **VSCodium** | `mcp.json` → `servers` | ✅ Always-on via MCP |
| **Antigravity 1.x** | `User/mcp.json` → `servers` | ✅ Always-on via MCP |
| **Antigravity 2.x** | `mcp_config.json` → `mcpServers` | ✅ Always-on via MCP |
| **Aider** | `.aider.conf.yml` → mcp | ✅ Always-on via MCP |
| **Any MCP-compatible tool** | — | ✅ Works with any stdio MCP client |
