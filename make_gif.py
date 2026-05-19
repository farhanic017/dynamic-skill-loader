#!/usr/bin/env python3
"""
Generate a cute pixel squid animated GIF showing skill-dispatcher workflow.
Copyright (C) 2026 Farhan Dhrubo
"""

from PIL import Image, ImageDraw, ImageFont
import math, os

W, H = 480, 280
BG = "#1A1A2E"

def new_frame():
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)
    return img, draw

def rounded_box(draw, x, y, w, h, color, r=8):
    draw.rounded_rectangle([x, y, x+w, y+h], radius=r, fill=color)

def pixel_squid(draw, cx, cy, scale=1.0, blink=False, arm_up=False, holding=False, tilt=0):
    s = scale
    body_color = "#FF6B9D"
    body_dark = "#D9547D"
    body_light = "#FF8FB3"

    # Tentacles
    for i, offset in enumerate([-30, -18, -6, 6, 18, 30]):
        tx = cx + offset * s
        ty = cy + 20 * s
        wave = math.sin(i * 0.8 + tilt) * 8 * s
        col = body_dark if i % 2 == 0 else body_color
        draw.ellipse([tx-6*s, ty-4*s, tx+6*s, ty+12*s + wave], fill=col)

    # Body
    draw.ellipse([cx-30*s, cy-28*s, cx+30*s, cy+28*s], fill=body_color)
    draw.ellipse([cx-18*s, cy-22*s, cx-4*s, cy-8*s], fill=body_light)

    # Eyes
    eye_y = cy - 10*s
    if blink:
        draw.line([cx-16*s, eye_y, cx-8*s, eye_y], fill="#2C3E50", width=3)
        draw.line([cx+8*s, eye_y, cx+16*s, eye_y], fill="#2C3E50", width=3)
    else:
        draw.ellipse([cx-18*s, eye_y-6*s, cx-6*s, eye_y+6*s], fill="white")
        draw.ellipse([cx-14*s, eye_y-3*s, cx-8*s, eye_y+3*s], fill="#2C3E50")
        draw.ellipse([cx-13*s, eye_y-1*s, cx-10*s, eye_y+1*s], fill="white")
        draw.ellipse([cx+6*s, eye_y-6*s, cx+18*s, eye_y+6*s], fill="white")
        draw.ellipse([cx+8*s, eye_y-3*s, cx+14*s, eye_y+3*s], fill="#2C3E50")
        draw.ellipse([cx+10*s, eye_y-1*s, cx+13*s, eye_y+1*s], fill="white")

    # Smile
    draw.arc([cx-8*s, cy-2*s, cx+8*s, cy+10*s], 0, 180, fill="#D9547D", width=2)

    # Blush
    draw.ellipse([cx-28*s, cy+2*s, cx-20*s, cy+8*s], fill="rgba(255,100,100,80)")
    draw.ellipse([cx+20*s, cy+2*s, cx+28*s, cy+8*s], fill="rgba(255,100,100,80)")

    if arm_up:
        arm_color = "#E8608A"
        draw.ellipse([cx+28*s, cy-26*s, cx+38*s, cy-20*s], fill=arm_color)
        draw.line([cx+34*s, cy-26*s, cx+34*s, cy-40*s], fill=arm_color, width=4)
        if holding:
            draw.ellipse([cx+28*s, cy-48*s, cx+40*s, cy-38*s], fill="#E74C3C")

def draw_terminal(draw, x, y, w, h, lines, cursor_line=-1, cursor_pos=-1):
    rounded_box(draw, x, y, w, h, "#0D1117")
    draw.rectangle([x, y, x+w, y+28], fill="#161B22")
    for i, c in enumerate(["#FF5F56", "#FFBD2E", "#27C93F"]):
        draw.ellipse([x+12+i*24, y+9, x+22+i*24, y+19], fill=c)
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
            c = "#8B949E" if line.startswith("#") or line.startswith("$") else "#E6E6E6"
            if line.startswith("$"):
                draw.text((x+14, fy), "$", fill="#27C93F", font=font)
                draw.text((x+14+font.getlength("$ "), fy), line[2:], fill="#E6E6E6", font=font)
            elif line.startswith("Ã¢Ëœâ€¦"):
                draw.text((x+14, fy), line, fill="#27C93F", font=font)
            elif line.startswith("Ãƒâ€”"):
                draw.text((x+14, fy), line, fill="#FF5F56", font=font)
            else:
                draw.text((x+14, fy), line, fill=c, font=font)
        fy += 22

def draw_thought_bubble(draw, x, y, text_lines):
    bw = max(font.getlength(l) for l in text_lines) + 30
    bh = len(text_lines) * 24 + 20
    bx = x - bw // 2
    by = y - bh - 20
    draw.ellipse([bx-8, by-8, bx+bw+8, by+bh+8], fill="white", outline="#CCC", width=2)
    draw.polygon([x-6, by+bh+4, x+6, by+bh+4, x, y-10], fill="white", outline="#CCC")
    fy = by + 12
    for line in text_lines:
        draw.text((bx+14, fy), line, fill="#2C3E50", font=font)
        fy += 24

def draw_skills_panel(draw, x, y, skills, highlight=-1):
    rounded_box(draw, x, y, 160, 140, "#16213E")
    draw.text((x+12, y+10), "   Skills", fill="#FF6B9D", font=font)
    for i, (name, desc) in enumerate(skills):
        iy = y + 36 + i * 32
        if i == highlight:
            draw.rounded_rectangle([x+8, iy-2, x+152, iy+26], radius=4, fill="#0F3460")
        draw.text((x+14, iy), f"> {name}", fill="#E6E6E6" if i != highlight else "#FF6B9D", font=font_sm)
        draw.text((x+14, iy+14), desc, fill="#8B949E", font=font_xs)

def draw_loading_bar(draw, x, y, w, progress):
    rounded_box(draw, x, y, w, 14, "#0D1117")
    fw = int(w * progress)
    if fw > 4:
        draw.rounded_rectangle([x+2, y+2, x+2+fw, y+12], radius=4, fill="#27C93F")
    draw.text((x + w//2 - 18, y-18), f"Loading... {int(progress*100)}%", fill="#8B949E", font=font_sm)

# -- Font --
try:
    font = ImageFont.truetype("arial.ttf", 16)
    font_sm = ImageFont.truetype("arial.ttf", 13)
    font_xs = ImageFont.truetype("arial.ttf", 10)
except:
    font = ImageFont.load_default()
    font_sm = font_xs = font

frames = []
durations = []

def make_frame(fn):
    img, draw = new_frame()
    fn(img, draw)
    return img

# Frame 1: Squid thinking
def f1(img, draw):
    pixel_squid(draw, 100, 180, 1.2)
    draw_thought_bubble(draw, 100, 120, ["build a hero section", "with GSAP animations"])
    draw.text((180, 30), "What skill do I need?", fill="#E6E6E6", font=font)
    draw.text((180, 54), "Ask the skill dispatcher!", fill="#8B949E", font=font_sm)
frames.append(make_frame(f1))
durations.append(2000)

# Frame 2: Squid at terminal typing
def f2(img, draw):
    pixel_squid(draw, 60, 185, 0.9, arm_up=True)
    draw_terminal(draw, 150, 25, 290, 200, [
        "$ skill-dispatcher --skills-dir ./skills",
        "",
        "# MCP server ready!",
        "",
        'match_skills("gsap hero animation")',
        "",
    ], cursor_line=4, cursor_pos=35)
    draw.text((170, 240), "Searching skills...", fill="#8B949E", font=font_sm)
frames.append(make_frame(f2))
durations.append(2500)

# Frame 3: Matched skills shown
def f3(img, draw):
    pixel_squid(draw, 70, 185, 0.9)
    draw_terminal(draw, 160, 25, 290, 130, [
        "  2 skill(s) matched!",
        "",
        "  gsap-core",
        "    Triggers: gsap, tween, easing",
        "  frontend-design",
        "    Triggers: css, layout, design",
    ])
    draw_skills_panel(draw, 10, 10, [
        ("gsap-core", "GSAP animation lib"),
        ("frontend-design", "UI/UX patterns"),
    ], highlight=0)
    draw.text((20, 165), "Matched!", fill="#27C93F", font=font_sm)
    draw.text((20, 190), "Call get_skill() to load", fill="#8B949E", font=font_sm)
frames.append(make_frame(f3))
durations.append(3000)

# Frame 4: Loading a skill
def f4(img, draw):
    pixel_squid(draw, 60, 188, 0.9, arm_up=True)
    draw_loading_bar(draw, 170, 65, 250, 0.65)
    draw_terminal(draw, 170, 95, 250, 95, [
        'get_skill("gsap-core")',
        "",
        "> Loading gsap-core...",
        "> Instructions loaded!",
    ])
    draw.text((170, 200), "gsap-core loaded into context", fill="#27C93F", font=font_sm)
frames.append(make_frame(f4))
durations.append(2500)

# Frame 5: Happy squid with skills loaded
def f5(img, draw):
    pixel_squid(draw, 70, 175, 1.3)
    skills_data = [
        ("gsap-core", 230, 20),
        ("frontend-design", 300, 65),
        ("scroll-trigger", 250, 110),
    ]
    for name, sx, sy in skills_data:
        rounded_box(draw, sx, sy, 130, 34, "#0F3460")
        draw.text((sx+10, sy+5), f"  {name}", fill="#27C93F", font=font_sm)
        draw.text((sx+10, sy+20), "Ready in context", fill="#8B949E", font=font_xs)

    draw.text((80, 15), "Skills loaded! Let's code!", fill="#FF6B9D", font=font)
    draw.text((100, 42), "Only what you need, when you need it", fill="#8B949E", font=font_sm)
frames.append(make_frame(f5))
durations.append(3500)

# Frame 6: Terminal showing it works
def f6(img, draw):
    pixel_squid(draw, 60, 185, 0.9, blink=True)
    draw_terminal(draw, 150, 20, 290, 210, [
        "$ skill-dispatcher --skills-dir ./skills",
        "",
        "# 3 skills loaded",
        "# 4 MCP tools ready",
        "",
        "> match_skills(query)",
        "> get_skill(name)",
        "> list_skills()",
        "> unload_skill(name)",
        "",
        "Ready for action!",
    ])
    draw.text((140, 245), "Drop this repo URL into any AI client", fill="#FF6B9D", font=font_sm)
frames.append(make_frame(f6))
durations.append(3000)

# -- Save --
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
print(f"  {len(frames)} frames, {W}x{H}")
for i, d in enumerate(durations):
    print(f"  Frame {i+1}: {d}ms")
