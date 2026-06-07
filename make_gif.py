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


def paste_part(canvas, part, x, y, angle=0):
    if angle:
        part = part.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    canvas.alpha_composite(part, (int(x), int(y)))


def crop_part(source, mask_box):
    x1, y1, x2, y2 = mask_box
    part = source.crop(mask_box)
    return part, x1, y1


def animated_mascot_source(phase=0.0, mood="talk"):
    source = MASCOT.copy()
    w, h = source.size
    alpha = source.getchannel("A")
    base = source.copy()
    bp = base.load()

    left_box = (0, int(h * 0.28), int(w * 0.30), int(h * 0.62))
    right_box = (int(w * 0.70), int(h * 0.28), w, int(h * 0.62))
    tentacle_box = (int(w * 0.18), int(h * 0.51), int(w * 0.82), h)

    # Remove movable appendages from the base layer, then recompose them with
    # small transforms so the real mascot artwork moves instead of being redrawn.
    for x1, y1, x2, y2 in [left_box, right_box, tentacle_box]:
        for yy in range(y1, y2):
            for xx in range(x1, x2):
                if alpha.getpixel((xx, yy)) > 0:
                    bp[xx, yy] = (0, 0, 0, 0)

    left, lx, ly = crop_part(source, left_box)
    right, rx, ry = crop_part(source, right_box)
    tentacles, tx, ty = crop_part(source, tentacle_box)

    arm_angle = math.sin(phase) * 9
    tentacle_dx = math.sin(phase + 1.1) * 6
    tentacle_dy = math.cos(phase * 1.2) * 3
    paste_part(base, left, lx + math.sin(phase + 0.4) * 4, ly + math.cos(phase) * 3, -arm_angle)
    paste_part(base, right, rx + math.sin(phase + 2.4) * 4, ry + math.cos(phase + 1.0) * 3, arm_angle)
    paste_part(base, tentacles, tx + tentacle_dx, ty + tentacle_dy, math.sin(phase * 0.8) * 2.5)

    draw = ImageDraw.Draw(base)
    face = (
        int(w * 0.24),
        int(h * 0.27),
        int(w * 0.78),
        int(h * 0.43),
    )
    face_color = source.getpixel((int(w * 0.50), int(h * 0.34)))[:3]

    # Hide the original eyes with small purple patches, then draw animated eyes.
    draw.rounded_rectangle([int(w * 0.25), int(h * 0.30), int(w * 0.43), int(h * 0.42)], radius=8, fill=face_color)
    draw.rounded_rectangle([int(w * 0.56), int(h * 0.30), int(w * 0.74), int(h * 0.42)], radius=8, fill=face_color)

    expr_cycle = int((phase % math.tau) / math.tau * 4)
    if mood == "celebrate":
        expr_cycle = 0
    elif mood == "point":
        expr_cycle = (expr_cycle + 1) % 4

    lw = max(5, int(w * 0.022))
    left_eye = (int(w * 0.33), int(h * 0.36))
    right_eye = (int(w * 0.64), int(h * 0.36))
    if expr_cycle == 0:
        # Happy upturned eyes, close to the original mascot expression.
        for cx, cy in [left_eye, right_eye]:
            draw.line([(cx - 22, cy + 8), (cx - 8, cy - 12), (cx + 8, cy - 12), (cx + 22, cy + 8)], fill="#050505", width=lw, joint="curve")
    elif expr_cycle == 1:
        # Blink.
        for cx, cy in [left_eye, right_eye]:
            draw.line([(cx - 22, cy), (cx + 22, cy)], fill="#050505", width=lw)
    elif expr_cycle == 2:
        # Focused dots.
        for cx, cy in [left_eye, right_eye]:
            draw.ellipse([cx - 13, cy - 13, cx + 13, cy + 13], fill="#050505")
    else:
        # Curious asymmetry.
        cx, cy = left_eye
        draw.line([(cx - 22, cy + 7), (cx - 8, cy - 11), (cx + 8, cy - 11), (cx + 22, cy + 7)], fill="#050505", width=lw, joint="curve")
        cx, cy = right_eye
        draw.ellipse([cx - 13, cy - 13, cx + 13, cy + 13], fill="#050505")

    return base


def paste_mascot(img, x, y, height=265, phase=0.0, mood="talk"):
    bob = math.sin(phase) * 8
    squash = 1 + math.sin(phase + 0.7) * 0.018
    source = animated_mascot_source(phase, mood)
    scale = height / source.height
    w = int(source.width * scale * squash)
    h = int(source.height * scale)
    mascot = source.resize((w, h), Image.Resampling.LANCZOS)

    shadow = Image.new("RGBA", (w + 42, h + 42), (0, 0, 0, 0))
    shadow.alpha_composite(mascot, (21, 18))
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    img.alpha_composite(shadow, (int(x - 12), int(y + bob + 16)))
    img.alpha_composite(mascot, (int(x), int(y + bob)))

    draw = ImageDraw.Draw(img)
    if mood == "point":
        pulse = 7 + int((math.sin(phase) + 1) * 4)
        draw.ellipse([x + w + 34 - pulse, y + bob + h * 0.34 - pulse, x + w + 34 + pulse, y + bob + h * 0.34 + pulse], outline=CYAN, width=3)
    elif mood == "celebrate":
        for dx, dy, color in [(-20, -24, YELLOW), (w + 15, -12, CYAN), (w + 40, 42, PINK)]:
            draw.ellipse([x + dx, y + bob + dy, x + dx + 10, y + bob + dy + 10], fill=color)


def speech(draw, box, title, body, accent=PURPLE):
    x1, y1, x2, y2 = box
    rounded(draw, box, "#FFFFFF", "#E2E8F0", 2, 22)
    title_lines = wrap(draw, title, FONT_MD, x2 - x1 - 48)
    y = y1 + 18
    for line in title_lines[:2]:
        draw.text((x1 + 24, y), line, font=FONT_MD, fill="#0F172A")
        y += 30
    y += 4
    body_font = FONT_SM
    max_body_y = y2 - 30
    for line in wrap(draw, body, body_font, x2 - x1 - 48):
        if y + 22 > max_body_y:
            break
        draw.text((x1 + 24, y), line, font=body_font, fill="#1E293B")
        y += 24
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
    draw.text((x1 + 26, y1 + 18), heading, font=FONT_MD, fill=INK)
    y = y1 + 62
    for bullet in bullets:
        draw.ellipse([x1 + 28, y + 8, x1 + 38, y + 18], fill=accent)
        draw.text((x1 + 50, y), bullet, font=FONT_SM, fill=MUTED)
        y += 32


def terminal(draw, box, heading, lines, highlight=None):
    x1, y1, x2, y2 = box
    rounded(draw, box, PANEL_2, BORDER, 2, 18)
    draw.rectangle([x1, y1, x2, y1 + 44], fill="#161B22")
    for i, color in enumerate(["#FF5F56", "#FFBD2E", "#27C93F"]):
        draw.ellipse([x1 + 18 + i * 24, y1 + 16, x1 + 30 + i * 24, y1 + 28], fill=color)
    draw.text((x1 + 104, y1 + 12), heading, font=FONT_SM, fill=SOFT)

    y = y1 + 62
    max_y = y2 - 22
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
        text_font = FONT_MONO
        if text_w(draw, shown, text_font) > max_width:
            text_font = FONT_XS
        while text_w(draw, shown, text_font) > max_width and len(shown) > 8:
            shown = shown[:-2] + "..."
        if highlight == i:
            rounded(draw, [x1 + 14, y - 4, x2 - 14, y + 25], "#172554", "#2563EB", 1, 9)
        draw.text((x1 + 24, y), shown, font=text_font, fill=color)
        y += 24


SCENES = [
    {
        "eyebrow": "MEET THE MASCOT",
        "headline": "Dynamic Skill Loader",
        "subhead": "A universal MCP skill dispatcher for AI coding agents.",
        "bubble": ("I am the skill dispatcher.", "Give me a task, and I load only the useful instructions."),
        "card": ("What I do", [
            "match the current task",
            "load the right skill file",
            "keep unrelated rules out",
            "track active skills",
            "clean up stale context",
        ], PURPLE),
    },
    {
        "eyebrow": "WHY IT EXISTS",
        "headline": "Agents get messy when every rule is always loaded",
        "subhead": "Design rules, framework notes, deployment steps, and command playbooks all compete for attention.",
        "bubble": ("The fix is simple.", "Index everything, but load only what the task needs."),
        "card": ("Without it", [
            "prompt context gets bloated",
            "wrong rules influence answers",
            "team skills are hard to reuse",
            "old instructions stay active",
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
            "YAML frontmatter skills",
            "plain markdown instructions",
            "Gemini-style heading + quote",
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
            "safe Git URL validation",
            "path traversal checks",
            "prototype pollution rejection",
            "MCP JSON-RPC validation",
            "input size limits",
            "credential redaction in errors",
        ], GREEN),
    },
    {
        "eyebrow": "RESULT",
        "headline": "Cleaner context. Better agent focus.",
        "subhead": "Dynamic Skill Loader gives every AI coding agent a searchable skill library instead of a giant always-on prompt.",
        "bubble": ("That is the whole trick.", "Load the right knowledge at the right time, then clean it up."),
        "card": ("Why star it", [
            "zero runtime dependencies",
            "14 agent routing profiles",
            "5 skill formats",
            "external GitHub import",
            "active skill lifecycle",
            "166 passing tests",
        ], PURPLE),
        "footer": "github.com/farhanic017/dynamic-skill-loader",
    },
]


frames = []
durations = []


def render_scene(scene, subframe, total):
    phase = (subframe / total) * math.tau
    img, draw = base_frame()
    title(draw, scene["eyebrow"], scene["headline"], scene["subhead"])

    mascot_x = 56 + math.sin(phase * 0.8) * 6
    mascot_y = 214
    mood = "celebrate" if scene["eyebrow"] == "RESULT" else "point" if "terminal" in scene else "talk"
    paste_mascot(img, mascot_x, mascot_y, 252, phase, mood)
    draw = ImageDraw.Draw(img)

    speech(draw, [260, 188, 626, 318], scene["bubble"][0], scene["bubble"][1], PURPLE)

    if "terminal" in scene:
        heading, lines, highlight = scene["terminal"]
        terminal(draw, [288, 336, 904, 526], heading, lines, highlight)
    else:
        heading, bullets, accent = scene["card"]
        card(draw, [648, 180, 904, 504], heading, bullets, accent)

    if scene.get("footer"):
        draw.text((420, 506), scene["footer"], font=FONT_SM, fill=CYAN)

    return img


for scene in SCENES:
    for i in range(6):
        frames.append(render_scene(scene, i, 6).convert("P", palette=Image.Palette.ADAPTIVE, colors=160))
        durations.append(560 if i < 5 else 1600)

OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
frames[0].save(
    OUT_PATH,
    save_all=True,
    append_images=frames[1:],
    duration=durations,
    loop=0,
    disposal=2,
    optimize=True,
)

print(f"Created {OUT_PATH}")
print(f"  scenes: {len(SCENES)}")
print(f"  frames: {len(frames)}")
print(f"  size: {W}x{H}")
print(f"  duration: {sum(durations) / 1000:.1f}s")
