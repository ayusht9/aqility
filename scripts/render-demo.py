"""Render a horizontal product film from actual app footage and original illustrations."""
import json, math, subprocess, wave, sys, os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(os.environ.get("DEMO_OUTPUT_DIR", "exports/demo-video")).resolve()
W, H, FPS = 1920, 1080, 30
TEAL, LIME, INK, MUTED = "#17c9b1", "#d3fa72", "#071d26", "#9fb8bc"
FONT = "C:/Windows/Fonts/seguisb.ttf"
BOLD = "C:/Windows/Fonts/seguibl.ttf"
REGULAR = "C:/Windows/Fonts/segoeui.ttf"
scenes = json.loads((OUT / "storyboard.json").read_text())
for scene in scenes:
    if scene["id"] == "overview": scene["title"] = "Your air.\nAt a glance."
    if scene["id"] == "planner": scene["title"] = "Plan your\nnext move."
    if scene["id"] == "voice": scene["title"] = "Press play.\nHear your air."
    if scene["id"] == "impact": scene["title"] = "Your choices.\nTheir impact."
capture = json.loads((OUT / "capture.json").read_text())
shots = {s["id"]: s for s in capture["shots"]}

def run(args):
    result = subprocess.run([str(a) for a in args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-4000:])
    return result.stdout

def duration(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path]).strip())

def font(size, bold=False): return ImageFont.truetype(BOLD if bold else FONT, size)

def wrap(draw, text, size, width, bold=False):
    lines, line = [], ""
    for word in text.split():
        candidate = f"{line} {word}".strip()
        if draw.textlength(candidate, font=font(size, bold)) > width and line:
            lines.append(line); line = word
        else: line = candidate
    return lines + ([line] if line else [])

def illustration(width, height, clean=False):
    """Original flat-vector city/park art drawn at export resolution."""
    im = Image.new("RGBA", (1000, 650)); d = ImageDraw.Draw(im)
    d.ellipse((500, 10, 950, 460), fill="#173c40")
    d.ellipse((670, 85, 850, 265), fill=LIME)
    # Floating air currents.
    for y, x in [(120, 70), (185, 120), (250, 20)]:
        d.line([(x, y), (x + 160, y), (x + 200, y - 20), (x + 260, y - 20)], fill="#3c6067", width=8)
    buildings = [(55, 270, 150, 540), (170, 210, 290, 540), (310, 310, 410, 540), (430, 160, 535, 540), (550, 290, 660, 540)]
    for index, box in enumerate(buildings):
        d.rounded_rectangle(box, radius=8, fill=["#24444e", "#315762", "#203e49"][index % 3])
        x1, y1, x2, y2 = box
        for x in range(x1 + 17, x2 - 12, 26):
            for y in range(y1 + 24, y2 - 25, 45):
                d.rectangle((x, y, x + 9, y + 17), fill="#6f9693" if (x+y) % 3 else LIME)
    d.rounded_rectangle((10, 520, 975, 550), radius=15, fill="#3d6970")
    d.polygon([(470, 549), (650, 549), (980, 645), (120, 645)], fill="#1d4147")
    d.line([(300, 610), (430, 610)], fill="#8fbcb4", width=5)
    d.line([(570, 610), (700, 610)], fill="#8fbcb4", width=5)
    for x, y in [(760, 390), (910, 435), (50, 450)]:
        d.line([(x, y), (x, 540)], fill="#82a38a", width=14)
        d.ellipse((x - 53, y - 70, x + 53, y + 25), fill=TEAL if x != 910 else "#8ebd74")
        d.line([(x, y + 20), (x-28, y-8)], fill="#8bd0b0", width=5)
    # Walking figure: a readable, distinctive silhouette.
    d.ellipse((651, 351, 694, 394), fill="#f0c99e")
    d.polygon([(652, 395), (691, 394), (714, 476), (661, 481), (638, 438)], fill=LIME)
    d.line([(657, 476), (643, 522), (598, 554)], fill="#c5e1e0", width=17)
    d.line([(694, 475), (721, 521), (762, 548)], fill="#c5e1e0", width=17)
    d.line([(652, 411), (620, 451), (590, 443)], fill="#f0c99e", width=14)
    d.line([(686, 409), (726, 430), (758, 409)], fill="#f0c99e", width=14)
    # Signal card links the illustration with environmental intelligence.
    d.rounded_rectangle((620, 225, 850, 318), radius=20, fill="#f1faf1")
    d.text((644, 239), "KNOW YOUR AIR", font=font(18, True), fill="#153e3c")
    d.line([(645, 292), (675, 279), (703, 287), (735, 270), (765, 281), (819, 258)], fill="#087c72", width=6)
    return im.resize((width, height), Image.Resampling.LANCZOS)

def background(scene, index):
    im = Image.new("RGB", (W, H), INK); d = ImageDraw.Draw(im)
    for y in range(H):
        f = y / H
        d.line((0, y, W, y), fill=(7 + int(3*f), 29 + int(11*f), 38 + int(9*f)))
    for x in range(0, W, 80): d.line((x, 0, x, H), fill="#10313b", width=1)
    for y in range(0, H, 80): d.line((0, y, W, y), fill="#10313b", width=1)
    d.text((70, 35), "aqility.", font=font(45, True), fill="white")
    d.ellipse((1645, 56, 1657, 68), fill=LIME)
    d.text((1673, 42), "PRODUCT FILM", font=font(20), fill=MUTED)
    if scene["id"] in ("intro", "outro"):
        d.text((80, 170), "YOUR AIR. YOUR NEXT MOVE.", font=font(25, True), fill=TEAL)
        for n, line in enumerate(scene["title"].split("\n")):
            d.text((73, 230 + n*114), line, font=font(102, True), fill="white" if n == 0 else LIME)
        art = illustration(1000, 650)
        im.paste(art, (840, 225), art)
        d.text((83, 530), "Low-emission choices  /  Indoor-air tips", font=font(27), fill="#c6dada")
        d.text((83, 578), "Personal routines  /  AI voice briefings", font=font(27), fill="#c6dada")
        d.rounded_rectangle((80, 700, 710, 782), radius=18, fill=LIME)
        d.text((108, 716), "MEET YOUR AIR COMPANION" if index == 0 else "MAKE YOUR NEXT MOVE INFORMED", font=font(25, True), fill=INK)
        d.text((85, 815), "PromptWars: Virtual  /  Hack2skill", font=font(23), fill=MUTED)
    else:
        num = index
        d.rounded_rectangle((75, 170, 165, 212), radius=20, fill="#224a4d")
        d.text((95, 175), f"0{num}", font=font(23, True), fill=LIME)
        yy = 255
        for paragraph in scene["title"].split("\n"):
            for line in wrap(d, paragraph, 68, 505, True):
                d.text((70, yy), line, font=font(68, True), fill="white"); yy += 83
        notes = {
            "overview": ["AQI + weather + pollutants", "A clearer starting point."],
            "profile": ["Profile stays in your tab", "Extra precautions when needed."],
            "routine": ["Commute / Home / Family / Community", "A plan that fits your daily routine."],
            "impact": ["Why this fits. How it helps.", "Source-linked practical guidance."],
            "planner": ["24-hour outdoor outlook", "Compare hours. Choose activity."],
            "summary": ["Generated with GPT-5 nano", "Your readings. Plain language."],
            "voice": ["Powered by smallest.ai", "Listen. Replay. Stop anytime."],
        }
        for n, note in enumerate(notes[scene["id"]]):
            d.text((78, yy + 42 + n*43), note, font=font(25), fill=TEAL if n == 0 else MUTED)
        art = illustration(490, 319)
        im.paste(art, (65, 585), art)
        # Frame and browser chrome around the actual screen capture.
        d.rounded_rectangle((621, 134, 1860, 934), radius=24, fill="#28505a")
        d.rounded_rectangle((629, 142, 1852, 926), radius=20, fill="#e8f1f2")
        for n, col in enumerate(["#f3907b", "#f0d16d", "#9acb86"]):
            d.ellipse((649+n*23, 152, 661+n*23, 164), fill=col)
        d.text((752, 145), "AQILITY  /  ACTUAL APP CAPTURE", font=font(15, True), fill="#31525c")
        d.text((1435, 145), "DEMO ENVIRONMENTAL DATA", font=font(15, True), fill="#087c72")
    # Caption backing and editorial footer keep captions out of the product UI.
    d.rounded_rectangle((100, 939, 1820, 1030), radius=20, fill="#03141c")
    d.text((72, 1043), "Planning support, not medical advice. Check local advisories.", font=font(17), fill="#8da9af")
    d.text((1574, 1043), f"AQILITY  /  {index+1:02d} OF {len(scenes):02d}", font=font(17, True), fill=MUTED)
    d.line((70, 1072, 1850, 1072), fill="#25454e", width=4)
    d.line((70, 1072, 70 + round(1780*(index+1)/len(scenes)), 1072), fill=LIME, width=4)
    path = OUT / f"{scene['id']}-design.png"; im.save(path)
    return path

timeline = []; elapsed = 0
for index, scene in enumerate(scenes):
    ident = scene["id"]
    voice = OUT / f"{ident}.wav"
    # Include an audible excerpt of the actual generated app briefing.
    if ident == "voice":
        voice = OUT / "voice-with-app.wav"
        run(["ffmpeg", "-y", "-v", "error", "-i", OUT / "voice.wav", "-i", OUT / "app-voice.wav",
             "-filter_complex", "[0:a]apad=pad_dur=0.25[a];[1:a]atrim=0:6,afade=t=out:st=5.7:d=0.3[b];[a][b]concat=n=2:v=0:a=1[out]", "-map", "[out]", voice])
    dur = duration(voice) + 0.45
    timeline.append({**scene, "start": elapsed, "duration": dur, "audio": str(voice)})
    elapsed += dur
    if len(sys.argv) > 1 and ident not in sys.argv[1:]:
        continue
    bg = background(scene, index)
    segment = OUT / f"scene-{index}.mp4"
    if ident in shots:
        shot = shots[ident]
        speed = (dur - 0.2) / shot["duration"]
        filters = f"[1:v]setpts={speed:.8f}*(PTS-STARTPTS),fps=30,scale=1200:750,setsar=1,tpad=stop_mode=clone:stop_duration=2[app];[0:v][app]overlay=640:174:shortest=1,fade=t=in:st=0:d=0.15,fade=t=out:st={dur-0.15:.4f}:d=0.15[v]"
        args = ["ffmpeg", "-y", "-v", "error", "-loop", "1", "-framerate", FPS, "-i", bg,
                "-ss", shot["start"], "-t", shot["duration"], "-i", capture["video"],
                "-i", voice, "-filter_complex", filters, "-map", "[v]", "-map", "2:a"]
    else:
        # A slow camera move gives the illustrated bookends breathing room.
        filters = f"zoompan=z='min(zoom+0.000035,1.008)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1920x1080:fps=30,fade=t=in:st=0:d=0.2,fade=t=out:st={dur-0.15:.4f}:d=0.15"
        args = ["ffmpeg", "-y", "-v", "error", "-loop", "1", "-framerate", FPS, "-i", bg,
                "-i", voice, "-vf", filters, "-map", "0:v", "-map", "1:a"]
    args += ["-af", "apad=pad_dur=0.45", "-t", dur, "-r", FPS,
             "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", segment]
    run(args)
    print(f"Rendered {ident}: {dur:.2f}s", flush=True)

(OUT / "timeline.json").write_text(json.dumps(timeline, indent=2))
(OUT / "scenes.txt").write_text("\n".join(f"file 'scene-{i}.mp4'" for i in range(len(scenes))))
run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", OUT / "scenes.txt", "-c", "copy", OUT / "uncaptioned.mp4"])
run(["ffmpeg", "-y", "-v", "error", "-i", OUT / "uncaptioned.mp4", "-vn", "-ac", "1", "-ar", "16000", OUT / "narration.wav"])
Image.open(OUT / "intro-design.png").save(OUT / "aqility-demo-cover.png")
print(f"Landscape edit ready: {elapsed:.2f}s. Next: caption alignment and final mix.", flush=True)
