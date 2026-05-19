#!/usr/bin/env python3
"""
Dynamic Skill Loader for OpenCode — Auto-Installer
Copyright (C) 2026 Farhan Dhrubo

Drop this repo URL into your AI assistant and it will automatically
run this script to clone, install, and configure everything.

Usage:  python install.py
"""

import json
import os
import shutil
import subprocess
import sys
import time

REPO_URL = "https://github.com/farhanic017/dynamic-skill-loader-for-opencode"
REPO_NAME = "dynamic-skill-loader-for-opencode"

def step(msg):
    print(f"\n  [{time.strftime('%H:%M:%S')}] {msg}")

def fail(msg):
    print(f"  [FAIL] {msg}")
    sys.exit(1)

def ok(msg):
    print(f"  [OK]   {msg}")

def run(cmd, cwd=None):
    result = subprocess.run(cmd, shell=True, cwd=cwd or os.getcwd(),
                            capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  stderr: {result.stderr.strip()}")
        fail(f"Command failed: {cmd}")
    return result.stdout.strip()

def check_node():
    try:
        v = run("node --version")
        ok(f"Node {v}")
    except Exception:
        fail("Node.js is required. Install from https://nodejs.org")

def find_dir():
    cwd = os.getcwd()
    if os.path.basename(cwd) == REPO_NAME:
        return cwd
    candidate = os.path.join(os.path.dirname(cwd), REPO_NAME)
    if os.path.isdir(candidate):
        return candidate
    for p in [os.path.join(os.path.expanduser("~"), REPO_NAME),
              os.path.join(os.path.expanduser("~"), ".local", "share", REPO_NAME),
              os.path.join(os.path.expanduser("~"), "AppData", "Local", REPO_NAME),
              os.path.join("/opt", REPO_NAME),
              os.path.join("/usr/local", "share", REPO_NAME)]:
        if os.path.isdir(p):
            return p
    return None

def clone_repo(target):
    if os.path.isdir(target):
        ok(f"Already cloned at {target}")
        return target
    step(f"Cloning {REPO_URL} ...")
    run(f"git clone {REPO_URL} \"{target}\"")
    ok("Repo cloned")
    return target

def install_global(target):
    step("Installing globally ...")
    run("npm install -g .", cwd=target)
    ok("Installed (npm -g)")

def detect_client():
    clients = []
    paths = {
        "opencode": [
            os.path.join(os.path.expanduser("~"), ".config", "opencode", "opencode.jsonc"),
            os.path.join(os.path.expanduser("~"), ".opencode", "opencode.jsonc"),
            "opencode.jsonc",
        ],
        "claude": [
            os.path.join(os.path.expanduser("~"), "AppData", "Roaming", "Claude", "claude_desktop_config.json"),
            os.path.join(os.path.expanduser("~"), "Library", "Application Support", "Claude", "claude_desktop_config.json"),
            os.path.join(os.path.expanduser("~"), ".config", "Claude", "claude_desktop_config.json"),
        ],
        "cursor": [
            os.path.join(os.path.expanduser("~"), ".cursor", "mcp.json"),
        ],
        "continue": [
            os.path.join(os.path.expanduser("~"), ".continue", "config.json"),
        ],
    }
    for client, config_paths in paths.items():
        for p in config_paths:
            if os.path.isfile(p):
                clients.append((client, p))
                break
    return clients

def configure_opencode(config_path, target_dir):
    step("Configuring opencode ...")
    config = {}
    if os.path.isfile(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            try:
                config = json.load(f)
            except json.JSONDecodeError:
                config = {}
    if "mcp" not in config:
        config["mcp"] = {}
    config["mcp"]["skill-dispatcher"] = {
        "type": "local",
        "command": [
            "node",
            os.path.join(target_dir, "index.mjs").replace("\\", "/"),
            "--skills-dir",
            os.path.join(target_dir, "skills").replace("\\", "/"),
        ],
        "enabled": True,
    }
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)
    ok(f"MCP server added to {config_path}")

    instructions_dir = os.path.dirname(config_path)
    instructions_path = os.path.join(instructions_dir, "instructions.md")
    instructions_content = (
        "## Skills\n\n"
        "Skills are NOT pre-loaded. At the start of every task, "
        "call `match_skills` with your task description to load "
        "relevant skills on-demand.\n"
    )
    if not os.path.isfile(instructions_path):
        with open(instructions_path, "w", encoding="utf-8") as f:
            f.write(instructions_content)
        ok(f"Created instructions.md at {instructions_path}")
    else:
        ok(f"instructions.md already exists at {instructions_path}")

def configure_claude(config_path, target_dir):
    step("Configuring Claude Desktop ...")
    config = {}
    if os.path.isfile(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            try:
                config = json.load(f)
            except json.JSONDecodeError:
                config = {}
    if "mcpServers" not in config:
        config["mcpServers"] = {}
    config["mcpServers"]["skill-dispatcher"] = {
        "command": "node",
        "args": [
            os.path.join(target_dir, "index.mjs").replace("\\", "/"),
            "--skills-dir",
            os.path.join(target_dir, "skills").replace("\\", "/"),
        ],
    }
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)
    ok(f"MCP server added to {config_path}")

def configure_cursor(config_path, target_dir):
    step("Configuring Cursor ...")
    config = {}
    if os.path.isfile(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            try:
                config = json.load(f)
            except json.JSONDecodeError:
                config = {}
    if "mcpServers" not in config:
        config["mcpServers"] = {}
    config["mcpServers"]["skill-dispatcher"] = {
        "command": "node",
        "args": [
            os.path.join(target_dir, "index.mjs").replace("\\", "/"),
            "--skills-dir",
            os.path.join(target_dir, "skills").replace("\\", "/"),
        ],
    }
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)
    ok(f"MCP server added to {config_path}")

def create_sample_skills(target_dir):
    skills_dir = os.path.join(target_dir, "skills")
    if os.path.isdir(skills_dir) and os.listdir(skills_dir):
        ok(f"Skills directory already exists at {skills_dir}")
        return
    os.makedirs(skills_dir, exist_ok=True)

    samples = {
        "gsap-core": {
            "triggers": ["gsap", "web animation", "tween", "easing"],
            "body": (
                "# GSAP Core\n\n"
                "GreenSock Animation Platform core library.\n\n"
                "## Quick Reference\n\n"
                "```javascript\n"
                "gsap.to('.box', { x: 100, duration: 1, ease: 'power2.out' });\n"
                "gsap.from('.box', { opacity: 0, y: 50 });\n"
                "gsap.timeline()\n"
                "  .to('.a', { x: 100 })\n"
                "  .to('.b', { x: 200 }, '-=0.5');\n"
                "```\n"
            ),
        },
        "frontend-design": {
            "triggers": ["frontend", "design", "css", "layout", "responsive"],
            "body": (
                "# Frontend Design\n\n"
                "Patterns for building beautiful, responsive UIs.\n\n"
                "## Principles\n\n"
                "- Mobile-first responsive design\n"
                "- Consistent spacing (8px grid)\n"
                "- Accessible color contrast (WCAG AA)\n"
                "- Semantic HTML\n"
            ),
        },
    }
    for name, info in samples.items():
        skill_dir = os.path.join(skills_dir, name)
        os.makedirs(skill_dir, exist_ok=True)
        skill_md = os.path.join(skill_dir, "SKILL.md")
        triggers_yaml = "\n".join(f'  - "{t}"' for t in info["triggers"])
        content = (
            "---\n"
            f"name: {name}\n"
            f"description: >\n"
            f"  {info['body'].split(chr(10))[0]}\n"
            f"triggers:\n"
            f"{triggers_yaml}\n"
            "---\n\n"
            f"{info['body']}"
        )
        with open(skill_md, "w", encoding="utf-8") as f:
            f.write(content)
    ok(f"Created {len(samples)} sample skills in {skills_dir}")

def main():
    print()
    print("  ==> Dynamic Skill Loader - Auto-Installer <==")
    print("  =============================================")
    print()

    check_node()

    target = find_dir()
    if not target:
        target = os.path.join(os.getcwd(), REPO_NAME)
    target = clone_repo(target)

    install_global(target)

    step("Detecting AI clients ...")
    clients = detect_client()
    if not clients:
        step("No supported AI client config found.")
        step("You can manually add the MCP server later (see SKILL.md).")
    else:
        for client, config_path in clients:
            if client == "opencode":
                configure_opencode(config_path, target)
            elif client == "claude":
                configure_claude(config_path, target)
            elif client == "cursor":
                configure_cursor(config_path, target)

    create_sample_skills(target)

    step("")
    step("  All done!")
    print()
    print(f"  Repo:  {target}")
    print(f"  MCP:   skill-dispatcher configured")
    print(f"  Skills: {os.path.join(target, 'skills')}")
    print()
    print("  Add your own skills as subdirectories with a SKILL.md file.")
    print("  See README.md for details.")
    print()

if __name__ == "__main__":
    main()
