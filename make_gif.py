#!/usr/bin/env python3
# Dynamic Skill Loader --- Demo GIF Generator
# Copyright (c) 2026 Farhan Dhrubo  <farhaiee123@gmail.com>
# License: GPL-3.0  ---  https://github.com/farhanic017/dynamic-skill-loader

"""
Generate the README demo GIF using the real project mascot.

The source mascot lives at assets/mascot.png with a transparent background.
Run this script after updating copy, features, or mascot art:

    python make_gif.py
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math

ROOT = Path(__file__).resolve().parent
MASCOT_PATH = ROOT / "assets" / "mascot.png"
OUT_PATH = ROOT / "skill-dispatcher-demo.gif"

W, H = 960, 540
TARGET_FPS = 60
SPEED_MULTIPLIER = 3.5
ORIGINAL_SCENE_MS = 4400
SCENE_MS = ORIGINAL_SCENE_MS / SPEED_MULTIPLIER
FRAMES_PER_SCENE = round(SCENE_MS / (1000 / TARGET_FPS))
BG_TOP = "#070A12"
BG_BOTTOM = "#121827"
INK = "#F8FAFC"
MUTED = "#CBD5E1"
SOFT = "#94A3B8"
PANEL = "#111827"
PANEL_2 = "#0B1120"
BORDER = "#334155"
PURPLE = "#A855F7"
DEEP_PURPLE = "#6D28D9"
CYAN = "#38BDF8"
GREEN = "#22C55E"
YELLOW = "#FACC15"
PINK = "#F472B6"
RED = "#FB7185"


def font(size, bold=False):
    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            pass
    return ImageFont.load_default()


FONT_XS = font(14)
FONT_SM = font(18)
FONT = font(21)
FONT_MD = font(25, True)
FONT_LG = font(36, True)
FONT_MONO = font(18)
FONT_MONO_SM = font(15)


def text_w(draw, text, fnt):
    return draw.textbbox((0, 0), text, font=fnt)[2]


def wrap(draw, text, fnt, max_width):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        if not current or text_w(draw, trial, fnt) <= max_width:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def fit_wrapped_text(draw, text, fonts, max_width, max_lines=None):
    for fnt in fonts:
        lines = wrap(draw, text, fnt, max_width)
        if max_lines is None or len(lines) <= max_lines:
            return fnt, lines if max_lines is None else lines[:max_lines]
    fnt = fonts[-1]
    lines = wrap(draw, text, fnt, max_width)
    if max_lines is not None:
        lines = lines[:max_lines]
    return fnt, lines


def ellipsize(draw, text, fnt, max_width):
    if text_w(draw, text, fnt) <= max_width:
        return text
    ellipsis = "..."
    if text_w(draw, ellipsis, fnt) > max_width:
        return ""
    lo, hi = 0, len(text)
    best = ellipsis
    while lo <= hi:
        mid = (lo + hi) // 2
        candidate = text[:mid].rstrip() + ellipsis
        if text_w(draw, candidate, fnt) <= max_width:
            best = candidate
            lo = mid + 1
        else:
            hi = mid - 1
    return best


def rounded(draw, box, fill, outline=None, width=1, radius=18):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def base_frame():
    img = Image.new("RGBA", (W, H), BG_TOP)
    draw = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        top = tuple(int(BG_TOP[i:i + 2], 16) for i in (1, 3, 5))
        bottom = tuple(int(BG_BOTTOM[i:i + 2], 16) for i in (1, 3, 5))
        rgb = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        draw.line([(0, y), (W, y)], fill=rgb)

    for x in range(0, W, 64):
        draw.line([(x, 0), (x, H)], fill="#172033")
    for y in range(0, H, 64):
        draw.line([(0, y), (W, y)], fill="#172033")

    return img, draw


def load_mascot():
    if not MASCOT_PATH.exists():
        raise FileNotFoundError(f"Missing mascot asset: {MASCOT_PATH}")
    return Image.open(MASCOT_PATH).convert("RGBA")


MASCOT = load_mascot()


def paste_part(canvas, part, x, y):
    canvas.alpha_composite(part, (int(x), int(y)))


def crop_part(source, mask_box):
    x1, y1, x2, y2 = mask_box
    part = source.crop(mask_box)
    return part, x1, y1


def animated_mascot_source(phase=0.0, mood="talk"):
    return MASCOT.copy()


def paste_mascot(img, x, y, height=265, phase=0.0, mood="talk"):
    bob = math.sin(phase) * 8
    source = animated_mascot_source(phase, mood)
    scale = height / source.height
    w = int(source.width * scale)
    h = int(source.height * scale)
    mascot = source.resize((w, h), Image.Resampling.NEAREST)

    img.alpha_composite(mascot, (int(x), int(y + bob)))

    draw = ImageDraw.Draw(img)
    if mood == "point":
        pulse = 7 + int((math.sin(phase) + 1) * 4)
        draw.ellipse([x + w + 34 - pulse, y + bob + h * 0.34 - pulse, x + w + 34 + pulse, y + bob + h * 0.34 + pulse], outline=CYAN, width=3)
        for offset in [0, 10, 20]:
            yy = y + bob + h * 0.44 + math.sin(phase + offset) * 5
            draw.arc([x + w - 8 + offset, yy - 12, x + w + 18 + offset, yy + 12], 300, 60, fill=PURPLE, width=3)
    elif mood == "celebrate":
        for dx, dy, color in [(-20, -24, YELLOW), (w + 15, -12, CYAN), (w + 40, 42, PINK)]:
            draw.ellipse([x + dx, y + bob + dy, x + dx + 10, y + bob + dy + 10], fill=color)
    elif mood == "talk":
        dot_y = y + bob + 12
        for i, color in enumerate([PURPLE, CYAN, PINK]):
            radius = 3 + int((math.sin(phase + i) + 1) * 2)
            cx = x + w + 10 + i * 16
            draw.ellipse([cx - radius, dot_y - radius, cx + radius, dot_y + radius], fill=color)


def speech(draw, box, title, body, accent=PURPLE):
    x1, y1, x2, y2 = box
    rounded(draw, box, "#FFFFFF", "#E2E8F0", 2, 22)
    max_width = x2 - x1 - 48
    title_font, title_lines = fit_wrapped_text(draw, title, [FONT_MD, FONT, FONT_SM], max_width, max_lines=2)
    body_font, body_lines = fit_wrapped_text(draw, body, [FONT_SM, FONT_XS], max_width)

    while True:
        title_line_h = title_font.size + 5
        body_line_h = body_font.size + 6
        total_h = 18 + len(title_lines) * title_line_h + 6 + len(body_lines) * body_line_h + 28
        if total_h <= (y2 - y1) or body_font == FONT_XS:
            break
        body_font, body_lines = fit_wrapped_text(draw, body, [FONT_XS], max_width)

    y = y1 + 18
    for line in title_lines:
        draw.text((x1 + 24, y), line, font=title_font, fill="#0F172A")
        y += title_line_h
    y += 4
    for line in body_lines:
        draw.text((x1 + 24, y), line, font=body_font, fill="#1E293B")
        y += body_line_h
    draw.rectangle([x1, y2 - 8, x2, y2], fill=accent)


def title(draw, eyebrow, headline, subhead):
    tag_w = text_w(draw, eyebrow, FONT_XS) + 28
    rounded(draw, [42, 28, 42 + tag_w, 58], "#211337", PURPLE, 1, 9)
    draw.text((56, 35), eyebrow, font=FONT_XS, fill="#E9D5FF")
    draw.text((42, 78), headline, font=FONT_LG, fill=INK)
    y = 124
    for line in wrap(draw, subhead, FONT_SM, 830):
        draw.text((44, y), line, font=FONT_SM, fill=MUTED)
        y += 25


def card(draw, box, heading, bullets, accent=CYAN):
    x1, y1, x2, y2 = box
    rounded(draw, box, PANEL, BORDER, 2, 18)
    draw.rectangle([x1, y1, x1 + 8, y2], fill=accent)
    heading_font, heading_lines = fit_wrapped_text(draw, heading, [FONT_MD, FONT, FONT_SM], x2 - x1 - 52, max_lines=2)
    y = y1 + 18
    for line in heading_lines:
        draw.text((x1 + 26, y), line, font=heading_font, fill=INK)
        y += heading_font.size + 5
    y += 8
    bullet_font = FONT_XS if len(bullets) > 5 else FONT_SM
    line_h = bullet_font.size + 10
    for bullet in bullets:
        if y + line_h > y2 - 12:
            break
        draw.ellipse([x1 + 28, y + 8, x1 + 38, y + 18], fill=accent)
        max_width = x2 - x1 - 70
        bullet_text = ellipsize(draw, bullet, bullet_font, max_width)
        draw.text((x1 + 50, y), bullet_text, font=bullet_font, fill=MUTED)
        y += line_h


def terminal(draw, box, heading, lines, highlight=None):
    x1, y1, x2, y2 = box
    rounded(draw, box, PANEL_2, BORDER, 2, 18)
    draw.rectangle([x1, y1, x2, y1 + 44], fill="#161B22")
    for i, color in enumerate(["#FF5F56", "#FFBD2E", "#27C93F"]):
        draw.ellipse([x1 + 18 + i * 24, y1 + 16, x1 + 30 + i * 24, y1 + 28], fill=color)
    draw.text((x1 + 104, y1 + 12), heading, font=FONT_SM, fill=SOFT)

    non_empty_lines = [line for line in lines]
    available_h = y2 - (y1 + 62) - 18
    line_h = 24
    text_font = FONT_MONO
    if len(non_empty_lines) * line_h > available_h:
        line_h = 20
        text_font = FONT_MONO_SM
    if len(non_empty_lines) * line_h > available_h:
        line_h = 18
        text_font = FONT_XS

    y = y1 + 62
    max_y = y2 - line_h - 8
    max_width = x2 - x1 - 48
    for i, line in enumerate(lines):
        if y > max_y:
            break
        color = INK
        shown = line
        if line.startswith("$"):
            color = GREEN
        elif line.startswith(">"):
            color = CYAN
        elif line.startswith("#"):
            color = SOFT
        elif line.startswith("!"):
            color = YELLOW
            shown = line[1:]
        line_font = text_font
        if text_w(draw, shown, line_font) > max_width:
            line_font = FONT_XS
        shown = ellipsize(draw, shown, line_font, max_width)
        if highlight == i:
            rounded(draw, [x1 + 14, y - 4, x2 - 14, y + line_h + 1], "#172554", "#2563EB", 1, 9)
        draw.text((x1 + 24, y), shown, font=line_font, fill=color)
        y += line_h


SCENES = [
    {
        "eyebrow": "MEET THE MASCOT",
        "headline": "Dynamic Skill Loader",
        "subhead": "A universal MCP skill dispatcher for AI coding agents.",
        "bubble": ("I am the skill dispatcher.", "Give me a task, and I load only the useful instructions."),
        "card": ("What I do", [
            "match current tasks",
            "load right skill files",
            "keep noise out",
            "track active skills",
            "clean stale context",
        ], PURPLE),
    },
    {
        "eyebrow": "WHY IT EXISTS",
        "headline": "Agents get messy when every rule is always loaded",
        "subhead": "Design rules, framework notes, deployment steps, and command playbooks all compete for attention.",
        "bubble": ("The fix is simple.", "Index everything, but load only what the task needs."),
        "card": ("Without it", [
            "bloated prompt context",
            "wrong rules leak in",
            "skills are hard to reuse",
            "old rules stay active",
        ], RED),
    },
    {
        "eyebrow": "STEP 1",
        "headline": "Match the task",
        "subhead": "The agent asks the MCP server which skills match the work in front of it.",
        "bubble": ("I search skill metadata.", "Names, descriptions, triggers, tags, and aliases keep matches focused."),
        "terminal": ("match_skills", [
            "$ node index.mjs --skills-dir ./skills --match \"GSAP hero section\"",
            "",
            "> matched: gsap-core",
            "> matched: frontend-design",
            "# only relevant skills are selected",
        ], 0),
    },
    {
        "eyebrow": "STEP 2",
        "headline": "Load the details",
        "subhead": "After matching, the agent loads the full instruction files for the current task.",
        "bubble": ("I load the matched skills.", "Everything else stays unloaded."),
        "terminal": ("MCP flow", [
            "> match_skills({ query: \"GSAP hero section\" })",
            "> get_skill({ name: \"gsap-core\" })",
            "> get_skill({ name: \"frontend-design\" })",
            "",
            "# active: gsap-core, frontend-design",
        ], 1),
    },
    {
        "eyebrow": "FORMATS",
        "headline": "Works with existing skill libraries",
        "subhead": "You do not need to rewrite every instruction file before using the dispatcher.",
        "bubble": ("Five formats work.", "YAML, markdown, Gemini notes, commands, and Claude Code skills."),
        "card": ("Supported formats", [
            "YAML frontmatter",
            "plain markdown",
            "Gemini heading + quote",
            ".claude/commands/*.md",
            ".claude/skills/*.md",
        ], CYAN),
    },
    {
        "eyebrow": "AGENT ROUTING",
        "headline": "Each agent sees compatible skills",
        "subhead": "The same skill repo can serve Claude Code, OpenCode, Cursor, Codex, Gemini CLI, Windsurf, Aider, and more.",
        "bubble": ("Switch the agent mode.", "I filter formats so the client sees what it can actually use."),
        "terminal": ("agent routing", [
            "$ node index.mjs --skills-dir ./skills --agent cursor --list",
            "> cursor sees: standard, plain",
            "",
            "$ node index.mjs --skills-dir ./skills --agent claude --list",
            "> claude sees: standard, command, gemini, plain, claude",
        ], 3),
    },
    {
        "eyebrow": "LIFECYCLE",
        "headline": "Unload stale skills when the task changes",
        "subhead": "Active skills are scored against the current task so the agent knows what should stay and what should leave.",
        "bubble": ("I flag stale skills.", "When the task changes, old context gets marked for cleanup."),
        "terminal": ("context lifecycle", [
            "> set_task_context({ description: \"setup Supabase auth\" })",
            "! stale: gsap-core        relevance 0.04",
            "! stale: frontend-design  relevance 0.07",
            "> unload_skill({ name: \"gsap-core\" })",
            "> match_skills({ query: \"Supabase auth\" })",
        ], 0),
    },
    {
        "eyebrow": "GITHUB IMPORT",
        "headline": "Import external skill repos",
        "subhead": "Clone public GitHub skill libraries, index nested folders, and filter results by origin.",
        "bubble": ("Team repos work too.", "One skill repo can serve many coding agents."),
        "terminal": ("repo import", [
            "$ node index.mjs --skills-dir ./skills \\",
            "    --import-repo https://github.com/user/claude-skills",
            "",
            "> cloned safely",
            "> indexed nested SKILL.md files",
            "> origin: claude-skills",
        ], 1),
    },
    {
        "eyebrow": "SECURITY",
        "headline": "Hardened for MCP and imported repos",
        "subhead": "The loader validates the data it reads before returning instructions to an AI client.",
        "bubble": ("Imported text is checked.", "Git imports, paths, YAML, and MCP messages all get validated."),
        "card": ("Protections", [
            "safe Git URL checks",
            "path traversal blocked",
            "prototype keys blocked",
            "MCP messages validated",
            "input size limits",
            "tokens redacted in errors",
        ], GREEN),
    },
    {
        "eyebrow": "RESULT",
        "headline": "Cleaner context. Better agent focus.",
        "subhead": "Dynamic Skill Loader gives every AI coding agent a searchable skill library instead of a giant always-on prompt.",
        "bubble": ("That is the whole trick.", "Load the right knowledge at the right time, then clean it up."),
        "card": ("Why star it", [
            "zero dependencies",
            "14 agent profiles",
            "5 skill formats",
            "GitHub repo import",
            "active skill tracking",
            "166 passing tests",
        ], PURPLE),
        "footer": "github.com/farhanic017/dynamic-skill-loader",
    },
]


frames = []
durations = []


def frame_duration_ms(frame_index):
    # GIF frame delays are stored in centiseconds. Alternating 10/20/20ms
    # gives an average of 16.67ms, matching 60 fps as closely as GIF allows.
    return [10, 20, 20][frame_index % 3]


def render_scene(scene, subframe, total):
    phase = (subframe / total) * math.tau
    img, draw = base_frame()
    title(draw, scene["eyebrow"], scene["headline"], scene["subhead"])

    mascot_x = 56 + math.sin(phase * 0.8) * 6
    mascot_y = 214
    mood = "celebrate" if scene["eyebrow"] == "RESULT" else "point" if "terminal" in scene else "talk"
    paste_mascot(img, mascot_x, mascot_y, 252, phase, mood)
    draw = ImageDraw.Draw(img)

    if "terminal" in scene:
        speech(draw, [258, 176, 664, 328], scene["bubble"][0], scene["bubble"][1], PURPLE)
        heading, lines, highlight = scene["terminal"]
        terminal(draw, [284, 316, 924, 526], heading, lines, highlight)
    else:
        speech(draw, [258, 176, 626, 328], scene["bubble"][0], scene["bubble"][1], PURPLE)
        heading, bullets, accent = scene["card"]
        card(draw, [646, 176, 924, 506], heading, bullets, accent)

    if scene.get("footer"):
        draw.text((420, 506), scene["footer"], font=FONT_SM, fill=CYAN)

    return img


for scene in SCENES:
    for i in range(FRAMES_PER_SCENE):
        frame_index = len(frames)
        frame = render_scene(scene, i, FRAMES_PER_SCENE)
        # Keeps GIF encoders from coalescing near-identical animation frames,
        # preserving the requested 60 fps timing without adding visible UI.
        ImageDraw.Draw(frame).line([(frame_index % W, H - 2), (frame_index % W, H - 1)], fill=CYAN)
        frames.append(frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=160))
        durations.append(frame_duration_ms(len(frames) - 1))

OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
frames[0].save(
    OUT_PATH,
    save_all=True,
    append_images=frames[1:],
    duration=durations,
    loop=0,
    disposal=2,
    optimize=False,
)

print(f"Created {OUT_PATH}")
print(f"  scenes: {len(SCENES)}")
print(f"  frames: {len(frames)}")
print(f"  size: {W}x{H}")
print(f"  duration: {sum(durations) / 1000:.1f}s")
print(f"  target speed: {SPEED_MULTIPLIER}x")
print(f"  target fps: {TARGET_FPS}")
