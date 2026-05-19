#!/usr/bin/env python3
"""
Generate a cute pixel squid animated GIF showing skill-dispatcher workflow.
Copyright (C) 2026 Farhan Dhrubo
"""

from PIL import Image, ImageDraw, ImageFont
import math, os

W, H = 400, 240
FONT_COLOR = "#2C3E50"
BG = "#1A1A2E"
ACCENT = "#16213E"
TEXT_BG = "#0F3460"

def new_frame():
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)
    return img, draw

def rounded_box(draw, x, y, w, h, color, r=8):
    draw.rounded_rectangle([x, y, x+w, y+h], radius=r, fill=color)

def pixel_squid(draw, cx, cy, scale=1.0, blink=False, arm_up=False, holding=False, tilt=0):
    s = scale
    # Body (rounded blob)
    body_color = "#FF6B9D"
    body_dark = "#D9547D"
    body_light = "#FF8FB3"

    # Tentacles
    tentacle_positions = [-30, -18, -6, 6, 18, 30]
    for i, offset in enumerate(tentacle_positions):
        tx = cx + offset * s
        ty = cy + 20 * s
        wave = math.sin(i * 0.8 + tilt) * 8 * s
        tent_color = body_dark if i % 2 == 0 else body_color
        draw.ellipse([tx-6*s, ty-4*s, tx+6*s, ty+12*s + wave], fill=tent_color)

    # Body
    draw.ellipse([cx-30*s, cy-28*s, cx+30*s, cy+28*s], fill=body_color)
    # Body highlight
    draw.ellipse([cx-18*s, cy-22*s, cx-4*s, cy-8*s], fill=body_light)

    # Eyes
    eye_y = cy - 10*s
    if blink:
        draw.line([cx-16*s, eye_y, cx-8*s, eye_y], fill="#2C3E50", width=3)
        draw.line([cx+8*s, eye_y, cx+16*s, eye_y], fill="#2C3E50", width=3)
    else:
        # Left eye white
        draw.ellipse([cx-18*s, eye_y-6*s, cx-6*s, eye_y+6*s], fill="white")
        draw.ellipse([cx-14*s, eye_y-3*s, cx-8*s, eye_y+3*s], fill="#2C3E50")
        draw.ellipse([cx-13*s, eye_y-1*s, cx-10*s, eye_y+1*s], fill="white")
        # Right eye white
        draw.ellipse([cx+6*s, eye_y-6*s, cx+18*s, eye_y+6*s], fill="white")
        draw.ellipse([cx+8*s, eye_y-3*s, cx+14*s, eye_y+3*s], fill="#2C3E50")
        draw.ellipse([cx+10*s, eye_y-1*s, cx+13*s, eye_y+1*s], fill="white")

    # Mouth (smile)
    draw.arc([cx-8*s, cy-2*s, cx+8*s, cy+10*s], 0, 180, fill="#D9547D", width=2)

    # Blush
    draw.ellipse([cx-28*s, cy+2*s, cx-20*s, cy+8*s], fill="rgba(255,100,100,80)")
    draw.ellipse([cx+20*s, cy+2*s, cx+28*s, cy+8*s], fill="rgba(255,100,100,80)")

    # Optional arm
    if arm_up:
        arm_color = "#E8608A"
        draw.ellipse([cx+28*s, cy-26*s, cx+38*s, cy-20*s], fill=arm_color)
        draw.line([cx+34*s, cy-26*s, cx+34*s, cy-40*s], fill=arm_color, width=4)
        if holding:
            draw.ellipse([cx+28*s, cy-48*s, cx+40*s, cy-38*s], fill="#E74C3C")

def draw_terminal(draw, x, y, w, h, lines, cursor_line=-1, cursor_pos=-1):
    rounded_box(draw, x, y, w, h, "#0D1117")
    # Title bar
    draw.rectangle([x, y, x+w, y+28], fill="#161B22")
    for i, color in enumerate(["#FF5F56", "#FFBD2E", "#27C93F"]):
        draw.ellipse([x+12+i*24, y+9, x+22+i*24, y+19], fill=color)
    # Text
    fy = y + 40
    for i, line in enumerate(lines):
        if i == cursor_line and cursor_pos >= 0:
            prefix = line[:cursor_pos]
            char = line[cursor_pos] if cursor_pos < len(line) else " "
            suffix = line[cursor_pos+1:]
            draw.text((x+14, fy), prefix, fill="#E6E6E6", font=font)
            draw.text((x+14+font.getlength(prefix), fy), char, fill="#FF6B9D", font=font)
            draw.text((x+14+font.getlength(prefix+char), fy), suffix, fill="#E6E6E6", font=font)
        else:
            color = "#8B949E" if line.startswith("#") or line.startswith("$") else "#E6E6E6"
            if line.startswith("$"):
                draw.text((x+14, fy), "$", fill="#27C93F", font=font)
                draw.text((x+14+font.getlength("$ "), fy), line[2:], fill="#E6E6E6", font=font)
            elif line.startswith("✓"):
                draw.text((x+14, fy), line, fill="#27C93F", font=font)
            elif line.startswith("✗"):
                draw.text((x+14, fy), line, fill="#FF5F56", font=font)
            else:
                draw.text((x+14, fy), line, fill=color, font=font)
        fy += 22

def draw_thought_bubble(draw, x, y, text_lines):
    bw = max(font.getlength(l) for l in text_lines) + 30
    bh = len(text_lines) * 24 + 20
    bx = x - bw // 2
    by = y - bh - 20
    draw.ellipse([bx-8, by-8, bx+bw+8, by+bh+8], fill="white", outline="#CCC", width=2)
    # Tail
    draw.polygon([x-6, by+bh+4, x+6, by+bh+4, x, y-10], fill="white", outline="#CCC")
    fy = by + 12
    for line in text_lines:
        draw.text((bx+14, fy), line, fill="#2C3E50", font=font)
        fy += 24

def draw_skills_panel(draw, x, y, skills, highlight=-1):
    rounded_box(draw, x, y, 160, 140, "#16213E")
    draw.text((x+12, y+10), "📦 Skills", fill="#FF6B9D", font=font)
    for i, (name, desc) in enumerate(skills):
        iy = y + 36 + i * 32
        if i == highlight:
            draw.rounded_rectangle([x+8, iy-2, x+152, iy+26], radius=4, fill="#0F3460")
        draw.text((x+14, iy), f"▸ {name}", fill="#E6E6E6" if i != highlight else "#FF6B9D", font=font_sm)
        draw.text((x+14, iy+14), desc, fill="#8B949E", font=font_xs)

def draw_loading_bar(draw, x, y, w, progress):
    rounded_box(draw, x, y, w, 14, "#0D1117")
    fw = int(w * progress)
    if fw > 4:
        draw.rounded_rectangle([x+2, y+2, x+2+fw, y+12], radius=4, fill="#27C93F")
    draw.text((x + w//2 - 18, y-18), f"Loading... {int(progress*100)}%", fill="#8B949E", font=font_sm)

# ── Load font ──
font = None
font_sm = None
font_xs = None
try:
    font = ImageFont.truetype("arial.ttf", 16)
    font_sm = ImageFont.truetype("arial.ttf", 13)
    font_xs = ImageFont.truetype("arial.ttf", 10)
except:
    font = ImageFont.load_default()
    font_sm = font
    font_xs = font

# ── Frame definitions ──
frames = []
durations = []

def make_frame(draw_fn):
    img, draw = new_frame()
    draw_fn(img, draw)
    return img

# Frame 1: Squid thinking about a task
def f1(img, draw):
    pixel_squid(draw, 120, 160, 1.2)
    draw_thought_bubble(draw, 120, 100, ["build a hero section", "with GSAP animations"])
    # Title
    draw.text((180, 20), "🤔 What skill do I need?", fill="#E6E6E6", font=font)
    draw.text((180, 44), "I should ask the skill dispatcher!", fill="#8B949E", font=font_sm)
frames.append(make_frame(f1))
durations.append(2000)

# Frame 2: Squid at terminal, typing match_skills
def f2(img, draw):
    pixel_squid(draw, 70, 170, 1.0, arm_up=True)
    # Terminal with typing animation
    draw_terminal(draw, 130, 20, 250, 190, [
        "$ skill-dispatcher --skills-dir ./skills",
        "",
        "# Starting MCP server...",
        "# Ready!",
        "",
        'match_skills("gsap hero animation")',
        "▌",
    ], cursor_line=5, cursor_pos=30)
    draw.text((130, 218), "🔍 Searching skills...", fill="#8B949E", font=font_sm)
frames.append(make_frame(f2))
durations.append(2500)

# Frame 3: Results pop up — matched skills
def f3(img, draw):
    pixel_squid(draw, 90, 170, 1.0, blink=False)
    # Terminal showing results
    draw_terminal(draw, 140, 10, 240, 120, [
        "✓ 2 skill(s) matched!",
        "",
        "📦 gsap-core",
        "   Triggers: gsap, tween, easing",
        "📦 frontend-design",
        "   Triggers: css, layout, design",
    ])
    # Skills panel
    draw_skills_panel(draw, 20, 20, [
        ("gsap-core", "GSAP animation lib"),
        ("frontend-design", "UI/UX patterns"),
    ], highlight=0)
    draw.text((20, 170), "🔗  Matched!", fill="#27C93F", font=font_sm)
    draw.text((20, 190), "Call get_skill() to load", fill="#8B949E", font=font_sm)
frames.append(make_frame(f3))
durations.append(3000)

# Frame 4: Loading a skill
def f4(img, draw):
    pixel_squid(draw, 80, 165, 1.0, arm_up=True)
    draw_loading_bar(draw, 150, 70, 200, 0.65)
    draw_terminal(draw, 150, 100, 220, 90, [
        'get_skill("gsap-core")',
        "",
        "→ Loading gsap-core...",
        "→ Instructions loaded!",
    ])
    draw.text((150, 200), "📖 gsap-core loaded into context", fill="#27C93F", font=font_sm)
frames.append(make_frame(f4))
durations.append(2500)

# Frame 5: Happy squid with all skills loaded
def f5(img, draw):
    pixel_squid(draw, 80, 155, 1.3)
    # Skills floating around
    skills_data = [
        ("gsap-core", 220, 30),
        ("frontend-design", 280, 70),
        ("scroll-trigger", 240, 110),
    ]
    for name, sx, sy in skills_data:
        rounded_box(draw, sx, sy, 130, 34, "#0F3460")
        draw.text((sx+10, sy+5), f"✓ {name}", fill="#27C93F", font=font_sm)
        draw.text((sx+10, sy+20), "Ready in context", fill="#8B949E", font=font_xs)

    # Big text
    draw.text((100, 20), "✅ Skills loaded! Let's code!", fill="#FF6B9D", font=font)
    draw.text((120, 44), "✨ Only what you need, when you need it", fill="#8B949E", font=font_sm)
frames.append(make_frame(f5))
durations.append(3500)

# Frame 6: One more frame — terminal showing it works
def f6(img, draw):
    pixel_squid(draw, 70, 160, 1.0, blink=True)
    draw_terminal(draw, 130, 20, 250, 200, [
        "$ skill-dispatcher --skills-dir ./skills",
        "",
        "# 3 skills loaded",
        "# 4 MCP tools ready",
        "",
        "▸ match_skills(query)",
        "▸ get_skill(name)",
        "▸ list_skills()",
        "▸ unload_skill(name)",
        "",
        "⚡ Ready for action!",
    ])
    draw.text((140, 226), "🚀 Drop this repo URL into any AI client", fill="#FF6B9D", font=font_sm)
frames.append(make_frame(f6))
durations.append(3000)

# ── Save as GIF ──
out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "skill-dispatcher-demo.gif")
frames[0].save(
    out_path,
    save_all=True,
    append_images=frames[1:],
    duration=durations,
    loop=0,
    disposal=2,
    optimize=False,
)
print(f"Created {out_path}")
print(f"  {len(frames)} frames")
for i, d in enumerate(durations):
    print(f"  Frame {i+1}: {d}ms")
