# skill-dispatcher — always-on instruction

You have access to the **skill-dispatcher** MCP server which provides
`match_skills`, `get_skill`, `list_skills`, and `unload_skill` tools
for loading AI coding skills on-demand.

## Mandatory behavior

1. **Call `match_skills` at the START of EVERY task.** Before writing code
   or answering, call `match_skills("<task description>")` with a brief
   description of what you're about to do. This discovers relevant skills
   that contain specialized instructions.

2. **Load matching skills.** If `match_skills` returns results, call
   `get_skill("<name>")` for each matched skill to load its full content.
   Follow any instructions in loaded skills.

3. **`list_skills` to browse.** If `match_skills` returns nothing useful,
   call `list_skills()` to see all available skills and their trigger
   keywords.

4. **`unload_skill` when done.** When switching tasks, call
   `unload_skill("<name>")` for skills that are no longer relevant to
   free up context.

## Supported tools

This MCP server works with **any MCP-compatible AI coding tool**:

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
