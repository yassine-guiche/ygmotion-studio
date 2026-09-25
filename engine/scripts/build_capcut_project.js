#!/usr/bin/env node
/**
 * Phase 4: CapCut Project Builder
 * Reads footage_manifest.json + voice_chunks.json + assembly guide
 * -> Builds complete CapCut draft_content.json (ready to open in CapCut Desktop)
 *
 * Output: episodes/EP001/capcut_draft/draft_content.json
 *         episodes/EP001/capcut_draft/draft_meta_info.json
 */

"use strict";

const fs   = require("fs");
const path = require("path");
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

// --- Helpers ---
const genId = () => require("crypto").randomUUID().replace(/-/g, "").toUpperCase();
const usToMicro = us => us; // CapCut uses microseconds internally
const secToMicro = s => Math.round(s * 1_000_000);

function getAudioDuration(filePath) {
  // Use ffprobe if available, fallback to estimate
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: "utf8", stdio: "pipe" }
    );
    return parseFloat(result.trim());
  } catch {
    return null;
  }
}

function ffmpegPath() {
  const candidates = ["ffprobe", "ffmpeg"];
  for (const c of candidates) {
    try { execSync('"' + c + '" -version', { stdio: "pipe" }); return c; } catch {}
  }
  return null;
}

// --- CapCut Track/Segment Builders ---

function makeVideoSegment(shotId, filePath, startMicro, durationMicro, zoomType = "normal") {
  const id = genId();
  // 2.5D Ken Burns zoom: normal = 100->106%, revelation = 100->112%
  const scaleEnd  = zoomType === "reveal" ? 1.12 : 1.06;

  return {
    id,
    type: "video",
    material_id: shotId,
    target_timerange: { start: startMicro, duration: durationMicro },
    source_timerange: { start: 0, duration: durationMicro },
    speed: 1.0,
    volume: 1.0,
    visible: true,
    clip: {
      alpha: 1.0,
      flip: { horizontal: false, vertical: false },
      rotation: 0.0,
      scale: { x: 1.0, y: 1.0 },
      transform: { x: 0.0, y: 0.0 }
    },
    // Ken Burns zoom animation via keyframes
    common_keyframes: [
      { id: genId(), time_offset: 0, values: [{ field_name: "scale_x", value: "1.0" }, { field_name: "scale_y", value: "1.0" }] },
      { id: genId(), time_offset: durationMicro, values: [{ field_name: "scale_x", value: scaleEnd.toFixed(3) }, { field_name: "scale_y", value: scaleEnd.toFixed(3) }] }
    ],
    path: filePath,
    display_name: shotId
  };
}

function makeAudioSegment(chunkId, filePath, startMicro, durationMicro, volumeDb = 0) {
  const vol = Math.pow(10, volumeDb / 20);
  return {
    id: genId(),
    type: "audio",
    material_id: chunkId,
    target_timerange: { start: startMicro, duration: durationMicro },
    source_timerange: { start: 0, duration: durationMicro },
    speed: 1.0,
    volume: Math.round(vol * 100) / 100,
    path: filePath,
    display_name: chunkId
  };
}

function makeTextSegment(text, startMicro, durationMicro, isHighlight = false) {
  return {
    id: genId(),
    type: "text",
    target_timerange: { start: startMicro, duration: durationMicro },
    content: text,
    style: {
      font_name: "Montserrat-ExtraBold",
      font_size: 72,
      bold: true,
      color: isHighlight ? [1.0, 0.9, 0.0, 1.0] : [1.0, 1.0, 1.0, 1.0],  // Yellow or White
      outline_color: [0, 0, 0, 1.0],
      outline_width: 4,
      shadow_color: [0, 0, 0, 0.8],
      shadow_x: 2, shadow_y: 2, shadow_blur: 15,
      alignment: "center",
      vertical_alignment: "bottom",
      position_y: -0.35  // Lower third
    }
  };
}

// --- Revelation shots (rapid zoom in) ---
const REVELATION_SHOTS = new Set(["SHOT_21", "SHOT_22", "SHOT_23", "SHOT_24", "SHOT_37", "SHOT_38"]);

// --- Main ---
async function run(episodeId, projectDirOverride = null) {
  const projectManager = require("../projects/project_manager");
  const epDir     = projectManager.resolveEpisodeDir(episodeId, projectDirOverride);
  const audioDir  = path.join(epDir, "audio");
  const draftDir  = path.join(epDir, "capcut_draft");
  fs.mkdirSync(draftDir, { recursive: true });

  console.log("\n=== PHASE 4: CAPCUT PROJECT BUILDER ===");
  console.log("Episode:", episodeId);

  // Load manifests
  let footageManifest = { shots: [] };
  const footageManifestPath = path.join(epDir, "footage_manifest.json");
  if (fs.existsSync(footageManifestPath)) {
    try { footageManifest = JSON.parse(fs.readFileSync(footageManifestPath, "utf8")); } catch {}
  }

  // Load or synthesize voice_chunks.json
  const voiceChunksPath = path.join(epDir, "voice_chunks.json");
  let chunks = [];
  if (fs.existsSync(voiceChunksPath)) {
    try { chunks = JSON.parse(fs.readFileSync(voiceChunksPath, "utf8")); } catch {}
  }

  if (!chunks || chunks.length === 0) {
    const kPath = path.join(epDir, "subtitles_karaoke.json");
    const sPath = path.join(epDir, "script_data.json");
    if (fs.existsSync(kPath)) {
      try {
        const kData = JSON.parse(fs.readFileSync(kPath, "utf8"));
        chunks = (kData.chunks || []).map((c, idx) => ({
          chunk_id: `CHUNK_${String(idx + 1).padStart(3, '0')}`,
          speaker: "NARRATOR",
          text: c.text,
          estimated_duration_sec: c.durationSec || 4.0
        }));
      } catch {}
    } else if (fs.existsSync(sPath)) {
      try {
        const sData = JSON.parse(fs.readFileSync(sPath, "utf8"));
        chunks = (sData.scenes || []).map((sc, idx) => ({
          chunk_id: `CHUNK_${String(idx + 1).padStart(3, '0')}`,
          speaker: "NARRATOR",
          text: sc.text,
          estimated_duration_sec: sc.estimatedDurationSec || 4.0
        }));
      } catch {}
    }
    if (!chunks || chunks.length === 0) {
      chunks = [{ chunk_id: "CHUNK_001", speaker: "NARRATOR", text: "Episode Master Narration", estimated_duration_sec: 15.0 }];
    }
    fs.writeFileSync(voiceChunksPath, JSON.stringify(chunks, null, 2), "utf8");
  }

  const srtPath     = path.join(epDir, "subtitles_karaoke.srt");
  const srtFallback = path.join(epDir, "subtitles.srt");

  // Build shot map
  const shotMap = {};
  const allShots = (footageManifest.shots && footageManifest.shots.length > 0) ? footageManifest.shots : [
    { shotId: "shot_001", file: "motion_shot_001.mp4", duration: 6, text: "Scene 1" }
  ];

  for (const s of allShots) {
    const sId = s.shotId || "shot_001";
    const resolvedPath = s.file ? path.join(epDir, s.file) : path.join(epDir, "master_style_reference_16x9.jpg");
    shotMap[sId] = { ...s, absPath: resolvedPath };
  }

  // Build audio timing from chunks
  const chunkTimings = [];
  let runningTime = 0;
  for (const chunk of chunks) {
    const audioFile = path.join(audioDir, chunk.chunk_id.toLowerCase() + ".mp3");
    let duration = chunk.estimated_duration_sec || 4.0;
    if (fs.existsSync(audioFile)) {
      const measured = getAudioDuration(audioFile);
      if (measured) duration = measured;
    }
    chunkTimings.push({ ...chunk, audioFile, startSec: runningTime, durationSec: duration });
    runningTime += duration + 0.2; // small gap
  }

  const totalDurationSec = Math.max(runningTime, 10);
  const totalDurationMicro = secToMicro(totalDurationSec);

  console.log("Total duration:", (totalDurationSec / 60).toFixed(1), "minutes");
  console.log("Shots available:", Object.keys(shotMap).length);
  console.log("Audio chunks:", chunks.length);

  // --- Build V1: Video Track ---
  const videoSegments = [];
  const allShotIds = Object.keys(shotMap);
  const segDuration = secToMicro(totalDurationSec / Math.max(allShotIds.length, 1));

  allShotIds.forEach((shotId, idx) => {
    const shot = shotMap[shotId];
    if (!shot) return;
    const startMicro = secToMicro(idx * (totalDurationSec / allShotIds.length));
    const zoomType   = REVELATION_SHOTS.has(shotId) ? "reveal" : "normal";
    const rawDur     = totalDurationSec / allShotIds.length;
    const clipDurSec = Math.max(3, Math.min(8, rawDur));
    videoSegments.push(makeVideoSegment(shotId, shot.absPath, startMicro, secToMicro(clipDurSec), zoomType));
  });

  // --- Build A1: Narration Track ---
  const narrationSegments = [];
  for (const ct of chunkTimings) {
    if (!fs.existsSync(ct.audioFile)) continue;
    narrationSegments.push(makeAudioSegment(ct.chunk_id, ct.audioFile, secToMicro(ct.startSec), secToMicro(ct.durationSec), 0));
  }

  // --- Build A2: Music Track ---
  const musicSegments = [];
  const musicFile = path.join(audioDir, "music_dark_suspense_drone.mp3");
  if (fs.existsSync(musicFile)) {
    musicSegments.push(makeAudioSegment("MUSIC_BED", musicFile, 0, totalDurationMicro, -18));
  }

  // --- Build V2: Captions Track ---
  const captionSegments = [];
  const srtFile = fs.existsSync(srtPath) ? srtPath : (fs.existsSync(srtFallback) ? srtFallback : null);
  if (srtFile) {
    const srtContent = fs.readFileSync(srtFile, "utf8");
    const blocks = srtContent.trim().split(/\n\n+/);
    for (const block of blocks) {
      const lines = block.trim().split("\n");
      if (lines.length < 3) continue;
      const timeMatch = lines[1].match(/(\d+:\d+:\d+[,\.]\d+)\s*-->\s*(\d+:\d+:\d+[,\.]\d+)/);
      if (!timeMatch) continue;
      const parseSRT = t => {
        const [hms, ms] = t.split(/[,\.]/);
        const [h, m, s] = hms.split(":").map(Number);
        return (h * 3600 + m * 60 + s) + (Number(ms) / 1000);
      };
      const start = parseSRT(timeMatch[1]);
      const end   = parseSRT(timeMatch[2]);
      const text  = lines.slice(2).join(" ");
      captionSegments.push(makeTextSegment(text, secToMicro(start), secToMicro(end - start)));
    }
  } else {
    // Synthesize captions directly from chunks
    let curSec = 0;
    for (const chunk of chunks) {
      const dur = chunk.estimated_duration_sec || 4.0;
      captionSegments.push(makeTextSegment(chunk.text || "", secToMicro(curSec), secToMicro(dur)));
      curSec += dur + 0.2;
    }
  }

  // --- Assemble CapCut Draft ---
  const draft = {
    id: genId(),
    version: "6.0.0",
    type: "draft_content",
    name: episodeId + " — " + (footageManifest.episode_id || "Episode"),
    canvas_config: { width: 1920, height: 1080, ratio: "16:9" },
    fps: 30.0,
    duration: totalDurationMicro,
    created_at: new Date().toISOString(),
    last_modified_platform: "windows",
    tracks: [
      {
        id: genId(), type: "video", attribute: 0,
        flag: 0, is_default_name: false, name: "V1 — Footage",
        segments: videoSegments
      },
      {
        id: genId(), type: "text", attribute: 0,
        flag: 0, is_default_name: false, name: "V2 — Captions",
        segments: captionSegments
      },
      {
        id: genId(), type: "audio", attribute: 1,
        flag: 0, is_default_name: false, name: "A1 — Narration",
        segments: narrationSegments
      },
      {
        id: genId(), type: "audio", attribute: 2,
        flag: 0, is_default_name: false, name: "A2 — Music Bed",
        segments: musicSegments
      }
    ],
    materials: {
      videos: allShotIds.map(id => ({ id, path: shotMap[id]?.absPath || "", type: "video", duration: secToMicro(8) })),
      audios: [...chunkTimings.map(ct => ({ id: ct.chunk_id, path: ct.audioFile, type: "audio" })),
               ...(fs.existsSync(musicFile) ? [{ id: "MUSIC_BED", path: musicFile, type: "audio" }] : [])]
    }
  };

  const metaInfo = {
    id: draft.id,
    name: draft.name,
    created_at: draft.created_at,
    resolution: "1920x1080",
    fps: 30,
    duration_ms: Math.round(totalDurationSec * 1000),
    video_segments: videoSegments.length,
    audio_segments: narrationSegments.length,
    caption_segments: captionSegments.length,
    episode_id: episodeId
  };

  fs.writeFileSync(path.join(draftDir, "draft_content.json"), JSON.stringify(draft, null, 2), "utf8");
  fs.writeFileSync(path.join(draftDir, "draft_meta_info.json"), JSON.stringify(metaInfo, null, 2), "utf8");

  // Also write an import guide
  const guide = `# CapCut Import Guide — ${episodeId}

## How to Open This Project in CapCut Desktop

1. Open CapCut Desktop
2. Click the folder icon (top-left) or go to File > Open Draft
3. Navigate to: ${draftDir}
4. Open "draft_content.json"

## Timeline Structure Built
- **V1 (Video):** ${videoSegments.length} footage clips with Ken Burns zoom
- **V2 (Captions):** ${captionSegments.length} subtitle segments
- **A1 (Narration):** ${narrationSegments.length} audio chunks (full voiceover)
- **A2 (Music):** Music bed ducked to -18dB under narration

## What to Do in CapCut After Opening
1. Review clip placement — adjust any shots that don't match narrative
2. Apply caption style: Bold Font, White + Yellow highlight, lower third position
3. Add SFX at cue points from capcut_assembly_guide.md
4. Export: 1080p, H.264, 30fps, high bitrate
`;
  fs.writeFileSync(path.join(draftDir, "IMPORT_GUIDE.md"), guide, "utf8");

  console.log("\n--- COMPLETE ---");
  console.log("Draft:  " + path.join(draftDir, "draft_content.json"));
  console.log("Meta:   " + path.join(draftDir, "draft_meta_info.json"));
  console.log("Guide:  " + path.join(draftDir, "IMPORT_GUIDE.md"));
  console.log("Video segments:", videoSegments.length);
  console.log("Caption segments:", captionSegments.length, "\n");

  return {
    success: true,
    draftDir,
    draftContentPath: path.join(draftDir, "draft_content.json"),
    metaInfoPath: path.join(draftDir, "draft_meta_info.json"),
    guidePath: path.join(draftDir, "IMPORT_GUIDE.md"),
    guide,
    metaInfo,
    videoSegments: videoSegments.length,
    captionSegments: captionSegments.length
  };
}

if (require.main === module) {
  run(process.argv[2] || "EP001").catch(e => { console.error("[ERROR]", e.message); process.exit(1); });
}

module.exports = {
  run,
  buildCapCutProject: run
};
