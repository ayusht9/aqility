import { readFile, writeFile, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
const out = resolve("exports/demo-video");
const timeline = JSON.parse(await readFile(join(out, "timeline.json"), "utf8"));
const exists = path => access(path).then(() => true, () => false);
const wordsFile = join(out, "word-timestamps.json");
let words;
if (await exists(wordsFile)) words = JSON.parse(await readFile(wordsFile, "utf8"));
else {
  const response = await fetch("https://api.smallest.ai/waves/v1/stt/?model=pulse-pro&language=en&word_timestamps=true", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.SMALLEST_API_KEY}`, "Content-Type": "application/octet-stream" },
    body: await readFile(join(out, "narration.wav")), signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Caption alignment service returned ${response.status}; no credentials were logged.`);
  const result = await response.json();
  if (!result.words?.length) throw new Error("Caption alignment returned no word timestamps.");
  words = result.words;
  await writeFile(wordsFile, JSON.stringify(words, null, 2));
}
words = words.filter(w => Number.isFinite(w.start) && Number.isFinite(w.end) && typeof w.word === "string");
// Proofread the recognizer against the known narration script. The aligner
// missed three sentence-final words; keep those spoken words in the captions.
for (const [id, word] of [["overview", "data."], ["planner", "day."], ["outro", "advice."]]) {
  const scene = timeline.find(s => s.id === id);
  const inScene = words.filter(w => w.start >= scene.start - 0.03 && w.start < scene.start + scene.duration - 0.15);
  const last = inScene.at(-1);
  if (last && !new RegExp(`^${word.replace('.', '')}[.!?,]?$`, 'i').test(last.word)) {
    const end = Math.min(scene.start + scene.duration - 0.2, last.end + 0.6);
    words.push({ word, start: last.end + 0.03, end });
  }
}
words.sort((a, b) => a.start - b.start);
const assTime = value => {
  const cs = Math.max(0, Math.round(value * 100));
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2,"0")}:${String(Math.floor(cs / 100) % 60).padStart(2,"0")}.${String(cs % 100).padStart(2,"0")}`;
};
const srtTime = value => {
  const ms = Math.max(0, Math.round(value * 1000));
  return `${String(Math.floor(ms / 3600000)).padStart(2,"0")}:${String(Math.floor(ms / 60000) % 60).padStart(2,"0")}:${String(Math.floor(ms / 1000) % 60).padStart(2,"0")},${String(ms % 1000).padStart(3,"0")}`;
};
const clean = word => word.replace(/aqu?ility|agility/ig, "Aqility").replace(/ACUI/ig, "AQI").replace(/^23$/, "23:00").replace(/[{}\\]/g, "");
let ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nScaledBorderAndShadow: yes\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Reels,Segoe UI Black,56,&H00FFFFFF,&H0072FAD3,&H001C1403,&H00000000,-1,0,0,0,100,100,0,0,1,2,1,2,130,130,72,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
let srt = "", count = 0;
for (let i = 0; i < words.length;) {
  const group = [];
  while (i < words.length && group.length < 4) {
    if (group.length && words[i].start - group.at(-1).end > 0.45) break;
    group.push(words[i++]);
    if (/[.!?]$/.test(group.at(-1).word)) break;
  }
  const start = group[0].start, end = Math.min(group.at(-1).end + 0.1, words[i]?.start ?? Infinity);
  const phrase = group.map(w => clean(w.word)).join(" ");
  srt += `${++count}\n${srtTime(start)} --> ${srtTime(end)}\n${phrase}\n\n`;
  for (let j = 0; j < group.length; j++) {
    const next = j + 1 < group.length ? group[j+1].start : end;
    const text = group.map((w, n) => `${n === j ? "{\\c&H72FAD3&}" : "{\\c&HFFFFFF&}"}${clean(w.word).toUpperCase()}`).join(" ");
    ass += `Dialogue: 0,${assTime(group[j].start)},${assTime(Math.max(next, group[j].start + 0.05))},Reels,,0,0,0,,{\\fad(35,35)\\fscx100\\fscy100}${text}\n`;
  }
}
await writeFile(join(out, "captions.ass"), ass);
await writeFile(join(out, "aqility-demo.srt"), srt);
const duration = timeline.at(-1).start + timeline.at(-1).duration;
const ff = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", "uncaptioned.mp4", "-f", "lavfi", "-i",
  "aevalsrc=0.1*(sin(2*PI*164.81*t)+sin(2*PI*220*t)+sin(2*PI*329.63*t)):s=48000",
  "-filter_complex", `[0:v]ass=captions.ass[v];[0:a]loudnorm=I=-16:TP=-1.5:LRA=9[voice];[1:a]volume=0.045,afade=t=in:d=1,afade=t=out:st=${duration-1}:d=1[bed];[voice][bed]amix=inputs=2:duration=first:normalize=0[a]`,
  "-map", "[v]", "-map", "[a]", "-t", String(duration), "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "aqility-demo-1080p.mp4"], { cwd: out, encoding: "utf8" });
if (ff.status !== 0) throw new Error(ff.stderr.slice(-3000));
await writeFile(join(out, "production-notes.json"), JSON.stringify({ format: "1920x1080 landscape, H.264/AAC, 30 fps", duration,
  captions: "Burned-in word-highlight captions aligned with smallest.ai Pulse Pro word timestamps; editable SRT included",
  footage: "Actual localhost app operation; illustrative environmental demo data; genuine GPT-5 nano and smallest.ai requests",
  visuals: "Original vector-style city and park illustrations, generated with Pillow",
  audio: "smallest.ai narration, an actual app voice excerpt, and a quiet original synthesized ambient bed" }, null, 2));
console.log(JSON.stringify({ video: join(out, "aqility-demo-1080p.mp4"), duration, captionWords: words.length, captionGroups: count }));
