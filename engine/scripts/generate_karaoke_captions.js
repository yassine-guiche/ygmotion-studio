#!/usr/bin/env node
/**
 * Phase 2: Karaoke Caption Generator (Synchronized & Cached)
 * Uses ElevenLabs alignment API to get word-level timestamps,
 * synchronizes offsets using exact measured audio durations from ffprobe,
 * and caches results to avoid re-billing credits.
 */

"use strict";

const fs   = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "../..");

function loadEnv() {
  const f = path.join(ROOT_DIR, ".env");
  if (!fs.existsSync(f)) return;
  fs.readFileSync(f, "utf8").split("\n").forEach(line => {
    const i = line.indexOf("="); if (i < 1) return;
    const k = line.slice(0, i).trim(); const v = line.slice(i + 1).trim();
    if (k && !k.startsWith("#")) process.env[k] = v;
  });
}
loadEnv();

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) throw new Error("ELEVENLABS_API_KEY not set");

const VOICE_MAP = {
  HOST_MASTER_V1:   "ZJrcXf7G0SY0yaRmgL0k",
  JAKE_EP01_MASTER: "OqWjQFjDCc2b4J88T4B8"
};

function getMediaDuration(filePath) {
  try {
    const out = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, { encoding: "utf8", stdio: "pipe" });
    const dur = parseFloat(out.trim());
    return isNaN(dur) ? null : dur;
  } catch {
    return null;
  }
}

// ElevenLabs timestamps API
async function getTimestamps(voiceId, text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true }
    });

    const req = https.request({
      hostname: "api.elevenlabs.io",
      path: "/v1/text-to-speech/" + voiceId + "/with-timestamps",
      method: "POST",
      headers: {
        "xi-api-key": API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          return reject(new Error("EL Timestamps API " + res.statusCode + ": " + Buffer.concat(chunks).toString()));
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function secToSRT(s) {
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const se = Math.floor(s % 60);
  const ms = Math.round((s % 1) * 1000);
  return h.toString().padStart(2,"0") + ":" + m.toString().padStart(2,"0") + ":" + se.toString().padStart(2,"0") + "," + ms.toString().padStart(3,"0");
}

function secToASS(s) {
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const cs = Math.round((s % 60) * 100);
  const se = Math.floor(cs / 100);
  const c  = cs % 100;
  return h + ":" + m.toString().padStart(2,"0") + ":" + se.toString().padStart(2,"0") + "." + c.toString().padStart(2,"0");
}

function buildASS(allLines) {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Montserrat ExtraBold,72,&H00FFFFFF,&H00FFE600,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,80,80,120,1
Style: Highlight,Montserrat ExtraBold,72,&H00FFE600,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,80,80,120,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = allLines.map(line => {
    const start = secToASS(line.start);
    const end   = secToASS(line.end);
    const kText = line.words.map(w => {
      const dur = Math.max(1, Math.round((w.end - w.start) * 100));
      return "{\\k" + dur + "}" + w.word;
    }).join(" ");
    return "Dialogue: 0," + start + "," + end + ",Default,,0,0,0,," + kText;
  }).join("\n");

  return header + events + "\n";
}

function buildSRT(allLines) {
  let idx = 1;
  const entries = [];
  for (const line of allLines) {
    entries.push(idx++ + "\n" + secToSRT(line.start) + " --> " + secToSRT(line.end) + "\n" + line.words.map(w => w.word).join(" ") + "\n");
  }
  return entries.join("\n");
}

function groupWords(words, offsetSec = 0, maxWords = 7) {
  const lines = [];
  for (let i = 0; i < words.length; i += maxWords) {
    const group = words.slice(i, i + maxWords);
    lines.push({
      start: group[0].start + offsetSec,
      end:   group[group.length - 1].end + offsetSec,
      words: group.map(w => ({ ...w, start: w.start + offsetSec, end: w.end + offsetSec }))
    });
  }
  return lines;
}

async function run(episodeId, projectDirOverride = null) {
  const projectManager = require("../projects/project_manager");
  const epDir = projectManager.resolveEpisodeDir(episodeId, projectDirOverride);
  const audioDir = path.join(epDir, "audio");
  const chunks = JSON.parse(fs.readFileSync(path.join(epDir, "voice_chunks.json"), "utf8"));
  const cachePath = path.join(epDir, "_alignment_cache.json");

  let cache = {};
  if (fs.existsSync(cachePath)) {
    try { cache = JSON.parse(fs.readFileSync(cachePath, "utf8")); } catch {}
  }

  console.log("\n=======================================================");
  console.log(`🎙️  KARAOKE CAPTION GENERATOR (PRECISION TIMING)`);
  console.log(`    Episode: ${episodeId} | Chunks: ${chunks.length}`);
  console.log("=======================================================\n");

  let runningOffsetSec = 0;
  const allLines = [];

  for (const chunk of chunks) {
    const realVoiceId = VOICE_MAP[chunk.voice_id] || chunk.voice_id;
    const audioFile = path.join(audioDir, chunk.chunk_id.toLowerCase() + ".mp3");

    // Measure EXACT audio duration from disk
    let measuredDur = null;
    if (fs.existsSync(audioFile)) {
      measuredDur = getMediaDuration(audioFile);
    }
    const chunkDurationSec = measuredDur || chunk.estimated_duration_sec || 30;

    process.stdout.write(`[CHUNK ${chunk.chunk_id}] Offset: ${runningOffsetSec.toFixed(2)}s | Duration: ${chunkDurationSec.toFixed(2)}s... `);

    let result = cache[chunk.chunk_id];
    if (!result) {
      try {
        result = await getTimestamps(realVoiceId, chunk.text);
        cache[chunk.chunk_id] = result;
        fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf8");
      } catch (e) {
        console.log(`[WARN] API alignment failed (${e.message}), using fallback pacing`);
      }
    }

    if (result && (result.alignment || result.normalized_alignment)) {
      const alignment = result.alignment || result.normalized_alignment;
      const chars = alignment.characters || [];
      const charTimes = alignment.character_start_times_seconds || [];
      const charEnds  = alignment.character_end_times_seconds   || [];

      // Detect if alignment duration exceeds measured duration and scale if needed
      const rawMaxTime = charEnds[charEnds.length - 1] || charTimes[charTimes.length - 1] || chunkDurationSec;
      const scaleFactor = rawMaxTime > 0 ? (chunkDurationSec / rawMaxTime) : 1.0;

      const words = [];
      let wordStart = (charTimes[0] || 0) * scaleFactor;
      let wordChars = "";

      for (let ci = 0; ci < chars.length; ci++) {
        const ch = chars[ci];
        if (ch === " " || ci === chars.length - 1) {
          if (ci === chars.length - 1 && ch !== " ") wordChars += ch;
          if (wordChars.trim()) {
            const wordEnd = (charEnds[ci] || charTimes[ci] || 0) * scaleFactor;
            words.push({ word: wordChars.trim(), start: wordStart, end: wordEnd });
          }
          wordStart = ((charTimes[ci + 1] || charTimes[ci] || 0) * scaleFactor);
          wordChars = "";
        } else {
          if (!wordChars) wordStart = (charTimes[ci] || 0) * scaleFactor;
          wordChars += ch;
        }
      }

      const lines = groupWords(words, runningOffsetSec, 7);
      allLines.push(...lines);
      console.log(`OK (${words.length} words, ${lines.length} lines)`);
    } else {
      // Fallback
      const fallbackWords = chunk.text.replace(/\n+/g, " ").split(/\s+/).filter(Boolean);
      const secPerWord = chunkDurationSec / Math.max(1, fallbackWords.length);
      const words = fallbackWords.map((w, i) => ({
        word: w,
        start: i * secPerWord,
        end: (i + 1) * secPerWord
      }));
      allLines.push(...groupWords(words, runningOffsetSec, 7));
      console.log(`Paced (${fallbackWords.length} words)`);
    }

    // Advance offset by EXACT measured duration of this audio file!
    runningOffsetSec += chunkDurationSec;
  }

  // Write files
  const assPath = path.join(epDir, "subtitles_karaoke.ass");
  const srtPath = path.join(epDir, "subtitles_karaoke.srt");

  fs.writeFileSync(assPath, buildASS(allLines), "utf8");
  fs.writeFileSync(srtPath, buildSRT(allLines), "utf8");

  console.log("\n=======================================================");
  console.log(`✅  KARAOKE SUBTITLES SYNCHRONIZED`);
  console.log(`    Total Audio Offset: ${runningOffsetSec.toFixed(2)}s (${(runningOffsetSec / 60).toFixed(1)} mins)`);
  console.log(`    Lines:              ${allLines.length}`);
  console.log(`    ASS Subtitles:      ${assPath}`);
  console.log(`    SRT Subtitles:      ${srtPath}`);
  console.log("=======================================================\n");
}

if (require.main === module) {
  run(process.argv[2] || "EP001").catch(e => {
    console.error("[ERROR]", e.message);
    process.exit(1);
  });
}

module.exports = { run };
