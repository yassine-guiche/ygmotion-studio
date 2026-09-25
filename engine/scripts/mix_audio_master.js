#!/usr/bin/env node
/**
 * Phase 3: Audio Mixing Engine (FFmpeg-based)
 * Mixes: Narration + Music (ducked) + SFX (at exact cue points)
 * Output: episodes/EP001/audio/ep001_mixed_master.mp3 (ready for video)
 */

"use strict";

const fs   = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

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

// --- SFX Cue Sheet (from capcut_assembly_guide.md) ---
// Format: { timeSec, file, volumeDb, fadeInSec, fadeOutSec }
const SFX_CUES = [
  { timeSec: 158,  file: "sfx_01_police_siren_distant.mp3",  volumeDb: -6,  fadeInSec: 1.5, durationSec: 8  },
  { timeSec: 205,  file: "sfx_02_car_door_and_gravel.mp3",   volumeDb: -8,  fadeInSec: 0.5, durationSec: 4  },
  { timeSec: 330,  file: "sfx_04_tense_heartbeat_sub.mp3",   volumeDb: -10, fadeInSec: 2.0, durationSec: 45 },
  { timeSec: 398,  file: "sfx_02_car_door_and_gravel.mp3",   volumeDb: -6,  fadeInSec: 0.3, durationSec: 4  },
  { timeSec: 510,  file: "sfx_04_tense_heartbeat_sub.mp3",   volumeDb: -6,  fadeInSec: 1.0, durationSec: 105},
  { timeSec: 618,  file: "sfx_03_police_radio_squawk.mp3",   volumeDb: 0,   fadeInSec: 0.1, durationSec: 6  },
  { timeSec: 675,  file: "sfx_01_police_siren_distant.mp3",  volumeDb: -4,  fadeInSec: 0.5, durationSec: 8  }
];

function ffmpegPath() {
  // Try common paths after winget install
  const candidates = [
    "ffmpeg",
    "C:\\ffmpeg\\bin\\ffmpeg.exe",
    path.join(process.env.LOCALAPPDATA || "", "Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-full_build\\bin\\ffmpeg.exe")
  ];
  for (const c of candidates) {
    try { execSync('"' + c + '" -version', { stdio: "pipe" }); return c; } catch {}
  }
  throw new Error("FFmpeg not found. Run: winget install Gyan.FFmpeg");
}

async function run(episodeId, projectDirOverride = null) {
  const projectManager = require("../projects/project_manager");
  const epDir  = projectManager.resolveEpisodeDir(episodeId, projectDirOverride);
  const audioDir = path.join(epDir, "audio");
  const sfxDir   = path.join(audioDir, "sfx");
  const outFile  = path.join(audioDir, episodeId.toLowerCase() + "_mixed_master.mp3");
  const tmpDir   = path.join(audioDir, "_tmp_mix");

  fs.mkdirSync(tmpDir, { recursive: true });

  console.log("\n=== PHASE 3: AUDIO MIXING ENGINE ===");
  console.log("Episode:", episodeId);

  const ffmpeg = ffmpegPath();
  console.log("FFmpeg:", ffmpeg);

  // Step 1: Verify main narration file
  const narrationFile = path.join(audioDir, episodeId.toLowerCase() + "_full_speech_track.mp3");
  const narrationAlt  = path.join(audioDir, "ep001_full_speech_track.mp3");
  const narration = fs.existsSync(narrationFile) ? narrationFile : (fs.existsSync(narrationAlt) ? narrationAlt : null);
  if (!narration) throw new Error("Full speech track not found: " + narrationFile);
  console.log("Narration:", path.basename(narration));

  // Step 2: Verify music file
  const musicFile = path.join(audioDir, "music_dark_suspense_drone.mp3");
  if (!fs.existsSync(musicFile)) {
    console.warn("[WARN] Music file not found:", musicFile, "- mixing without music");
  }
  const hasMusic = fs.existsSync(musicFile);

  // Step 3: Find available SFX files
  const availableSFX = SFX_CUES.filter(cue => {
    const p = path.join(sfxDir, cue.file);
    if (fs.existsSync(p)) return true;
    console.log("[SKIP SFX] " + cue.file + " not found");
    return false;
  });
  console.log("SFX layers:", availableSFX.length + "/" + SFX_CUES.length, "available");

  // Build FFmpeg filter_complex for mixing
  // Inputs: 0=narration, 1=music (optional), 2..N = SFX files
  let inputArgs = ["-i", narration];
  if (hasMusic) inputArgs.push("-i", musicFile);

  const sfxInputs = [];
  for (const cue of availableSFX) {
    inputArgs.push("-i", path.join(sfxDir, cue.file));
    sfxInputs.push(cue);
  }

  // Build filter_complex string
  let filterParts = [];
  let mixInputs   = [];

  // Narration = stream 0, keep as-is at 0dB
  filterParts.push("[0:a]volume=1.0[narration]");
  mixInputs.push("[narration]");

  if (hasMusic) {
    // Music = stream 1: loop if short, duck to -18dB, fade in 2s, fade out 3s
    filterParts.push("[1:a]aloop=loop=-1:size=2e+09,volume=0.126[music_raw]");  // -18dB = 10^(-18/20) ~= 0.126
    filterParts.push("[music_raw]afade=t=in:st=0:d=2,afade=t=out:st=720:d=3[music]");
    mixInputs.push("[music]");
  }

  // SFX layers
  const musicOffset = hasMusic ? 1 : 0;
  sfxInputs.forEach((cue, idx) => {
    const streamIdx = 1 + musicOffset + idx;
    const volLinear = Math.pow(10, cue.volumeDb / 20).toFixed(4);
    const label = "sfx" + idx;
    // adelay puts SFX at correct timecode
    const delayMs = Math.round(cue.timeSec * 1000);
    filterParts.push("[" + streamIdx + ":a]volume=" + volLinear + ",afade=t=in:st=0:d=" + cue.fadeInSec + ",adelay=" + delayMs + "|" + delayMs + "[" + label + "]");
    mixInputs.push("[" + label + "]");
  });

  // Final amix
  filterParts.push(mixInputs.join("") + "amix=inputs=" + mixInputs.length + ":duration=first:normalize=0[out]");

  const filterComplex = filterParts.join("; ");

  const cmd = [
    '"' + ffmpeg + '"',
    ...inputArgs.map(a => '"' + a + '"'),
    "-filter_complex", '"' + filterComplex + '"',
    "-map", '"[out]"',
    "-ac", "2",
    "-ar", "48000",
    "-b:a", "192k",
    "-y",
    '"' + outFile + '"'
  ].join(" ");

  console.log("\nRunning FFmpeg mix...");
  console.log("Inputs:", 1 + (hasMusic ? 1 : 0) + sfxInputs.length);

  try {
    execSync(cmd, { stdio: "pipe", shell: true });
    const mb = (fs.statSync(outFile).size / 1024 / 1024).toFixed(1);
    console.log("\n--- COMPLETE ---");
    console.log("Mixed master: " + outFile);
    console.log("Size: " + mb + "MB\n");
  } catch (e) {
    // Try simpler mix as fallback (just narration + music, no SFX)
    console.warn("[WARN] Complex mix failed, trying simple mix:", e.stderr ? e.stderr.toString().slice(0,200) : e.message);
    if (hasMusic) {
      const simpleCmd = '"' + ffmpeg + '" -i "' + narration + '" -i "' + musicFile + '" -filter_complex "[0:a]volume=1.0[n]; [1:a]aloop=loop=-1:size=2e+09,volume=0.1[m]; [n][m]amix=inputs=2:duration=first:normalize=0[out]" -map "[out]" -ac 2 -ar 48000 -b:a 192k -y "' + outFile + '"';
      execSync(simpleCmd, { stdio: "pipe", shell: true });
      console.log("Simple mix complete:", outFile);
    } else {
      // Just copy narration
      fs.copyFileSync(narration, outFile);
      console.log("Copied narration as master:", outFile);
    }
  }

  // Cleanup tmp
  try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
}

run(process.argv[2] || "EP001").catch(e => { console.error("[ERROR]", e.message); process.exit(1); });
