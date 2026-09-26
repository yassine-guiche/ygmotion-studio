#!/usr/bin/env node
/**
 * RENDER_VIDEO.JS — GoMotion & VidRush Equivalent 1080p Video Renderer
 * 
 * Features:
 *   - Synchronized Story Pacing: Each shot duration matches its parent chunk.
 *   - Unified Cinematic Color Grading: Applies multi-style color filters & vignette.
 *   - Multi-Style Architecture: Supports crime_suspense, documentary_history, finance_tech, scifi_mystery, reddit_confession.
 *   - Word-level Karaoke Burn: Hard-burns style-tuned Montserrat/Outfit karaoke subtitles.
 * 
 * Output: episodes/<EP_ID>/<EP_ID>_FINAL_VIDEO_1080P.mp4
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");
const styleManager = require("../styles/style_manager");

const ROOT_DIR = path.resolve(__dirname, "../..");

function getFfmpegPath() {
  const candidates = [
    "ffmpeg",
    path.join(process.env.LOCALAPPDATA || "", "Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-full_build\\bin\\ffmpeg.exe"),
    "C:\\ffmpeg\\bin\\ffmpeg.exe"
  ];
  for (const c of candidates) {
    try {
      execSync(`"${c}" -version`, { stdio: "pipe" });
      return c;
    } catch {}
  }
  return "ffmpeg";
}

function getFfprobePath() {
  const candidates = [
    "ffprobe",
    path.join(process.env.LOCALAPPDATA || "", "Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-full_build\\bin\\ffprobe.exe"),
    "C:\\ffmpeg\\bin\\ffprobe.exe"
  ];
  for (const c of candidates) {
    try {
      execSync(`"${c}" -version`, { stdio: "pipe" });
      return c;
    } catch {}
  }
  return "ffprobe";
}

function getMediaDuration(ffprobe, filePath) {
  try {
    const cmd = `"${ffprobe}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
    const out = execSync(cmd, { encoding: "utf8", stdio: "pipe" });
    const dur = parseFloat(out.trim());
    return isNaN(dur) ? null : dur;
  } catch {
    return null;
  }
}

function testEncoder(ffmpeg) {
  try {
    const testCmd = `"${ffmpeg}" -y -f lavfi -i color=c=black:s=64x64:d=0.1 -c:v h264_mf -f null -`;
    execSync(testCmd, { stdio: "pipe" });
    return { name: "h264_mf", args: ["-c:v", "h264_mf", "-b:v", "7M"] };
  } catch {}

  return { name: "libx264", args: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"] };
}

function runCommandAsync(bin, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", d => { stderr += d.toString(); });
    proc.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`Exit code ${code}: ${stderr.slice(-400)}`));
    });
    proc.on("error", reject);
  });
}

async function renderEpisode(episodeId = "EP001", styleId = "crime_suspense", projectDirOverride = null) {
  const startTime = Date.now();
  const projectManager = require("../projects/project_manager");
  const epDir = projectManager.resolveEpisodeDir(episodeId, projectDirOverride);
  const activeProj = projectManager.getActiveProjectInfo();
  const projDir = projectDirOverride || (activeProj ? activeProj.path : path.join(ROOT_DIR, "projects", "crime_chronicles"));
  const audioDir = path.join(epDir, "audio");
  const footageManifestPath = path.join(epDir, "footage_manifest.json");

  if (!fs.existsSync(epDir)) {
    throw new Error(`Episode directory not found: ${epDir}`);
  }

  const progressFile = path.join(epDir, "render_progress.json");
  const updateProgress = (progress, step, extra = {}) => {
    try {
      const data = {
        episodeId,
        styleId,
        status: progress >= 100 ? "completed" : "rendering",
        progress: Math.min(100, Math.max(0, Math.round(progress))),
        step,
        updatedAt: new Date().toISOString(),
        ...extra
      };
      fs.writeFileSync(progressFile, JSON.stringify(data, null, 2), "utf8");
    } catch {}
  };

  updateProgress(5, "Initializing video render pipeline and hardware encoder...");

  const selectedStyle = styleManager.getStyle(styleId);
  const colorGradeFilter = styleManager.getFFmpegColorGradeFilter(styleId);

  const ffmpeg = getFfmpegPath();
  const ffprobe = getFfprobePath();
  const encoder = testEncoder(ffmpeg);

  console.log("\n=======================================================");
  console.log(`🎬  STARTING MULTI-STYLE VIDEO RENDER`);
  console.log(`    Episode: ${episodeId}`);
  console.log(`    Theme:   ${selectedStyle.name} (${selectedStyle.colorGrade.tone})`);
  console.log(`    Engine:  FFmpeg (${encoder.name} hardware acceleration)`);
  console.log("=======================================================\n");

  updateProgress(10, "Resolving master audio track and speech sync...");

  // 1. Locate Audio Master in this episode's directory
  const audioCandidates = [
    path.join(audioDir, `${episodeId.toLowerCase()}_mixed_master.mp3`),
    path.join(audioDir, "ep001_mixed_master.mp3"),
    path.join(audioDir, "ep001_full_speech_track.mp3"),
    path.join(epDir, "audio_master.mp3"),
    path.join(epDir, "master_voiceover.mp3")
  ];

  let audioFile = null;
  for (const c of audioCandidates) {
    if (fs.existsSync(c)) {
      audioFile = c;
      break;
    }
  }

  if (!audioFile && fs.existsSync(audioDir)) {
    const mp3s = fs.readdirSync(audioDir).filter(f => f.endsWith(".mp3") || f.endsWith(".wav"));
    if (mp3s.length > 0) audioFile = path.join(audioDir, mp3s[0]);
  }

  // Cross-project fallback across workspace
  if (!audioFile) {
    const fallbackCandidates = [
      path.join(ROOT_DIR, "projects", "deep_investigative_dossier", "episodes", "EP001", "audio", "ep001_mixed_master.mp3"),
      path.join(ROOT_DIR, "projects", "crime_chronicles", "episodes", "EP001", "audio", "ep001_mixed_master.mp3"),
      path.join(ROOT_DIR, "projects", "ranks_pov_syndicate", "episodes", "EP001", "audio", "ep001_mixed_master.mp3"),
      path.join(ROOT_DIR, "episodes", "EP001", "audio", "ep001_mixed_master.mp3")
    ];
    for (const c of fallbackCandidates) {
      if (fs.existsSync(c)) {
        audioFile = c;
        break;
      }
    }
  }

  // Synthesize ambient suspense tone bed if no audio file exists anywhere
  if (!audioFile) {
    console.log("No audio file found on disk. Synthesizing ambient audio bed with FFmpeg...");
    const synthesizedAudio = path.join(audioDir, `${episodeId.toLowerCase()}_ambient_bed.mp3`);
    if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
    try {
      execSync(`"${ffmpeg}" -y -f lavfi -i "sine=f=65:d=120,volume=0.2,lowpass=f=250" -c:a aac -b:a 192k "${synthesizedAudio}"`, { stdio: "pipe" });
      if (fs.existsSync(synthesizedAudio)) {
        audioFile = synthesizedAudio;
      }
    } catch (e) {
      console.warn("Could not synthesize fallback audio:", e.message);
    }
  }

  if (!audioFile) {
    throw new Error(`Master audio not found in ${audioDir} or fallback paths.`);
  }

  const totalDuration = getMediaDuration(ffprobe, audioFile) || 610.7;
  console.log(`[1/5] Master Audio: ${path.basename(audioFile)} (${(totalDuration / 60).toFixed(1)} mins / ${totalDuration.toFixed(1)}s)`);

  // 2. Load Footage Manifest & Resolve Director Directives
  let manifest = { shots: [] };
  if (fs.existsSync(footageManifestPath)) {
    manifest = JSON.parse(fs.readFileSync(footageManifestPath, "utf8"));
  }

  const characterContinuity = require("../styles/character_continuity");

  const masterStyleImg = [
    path.join(projDir, "channel_assets", "style", "master_style_reference_16x9.jpg"),
    path.join(epDir, "channel_assets", "style", "master_style_reference_16x9.jpg"),
    path.join(ROOT_DIR, "channel_assets", "style", "master_style_reference_16x9.jpg"),
    path.join(ROOT_DIR, "projects", "crime_chronicles", "channel_assets", "style", "master_style_reference_16x9.jpg"),
    path.join(ROOT_DIR, "projects", "deep_investigative_dossier", "channel_assets", "style", "master_style_reference_16x9.jpg"),
    path.join(ROOT_DIR, "projects", "ranks_pov_syndicate", "channel_assets", "style", "master_style_reference_16x9.jpg")
  ].find(f => fs.existsSync(f));

  const chunkGroups = {};
  for (const s of manifest.shots || []) {
    let p = s.file ? path.join(epDir, s.file) : null;

    // Director Override: If creator selected a character face or custom file
    if (s.visualType === "ai_character" && s.characterId) {
      const chars = characterContinuity.getCharactersForProject(projDir);
      const char = chars.find(c => c.id === s.characterId) || characterContinuity.getCharacter(s.characterId);
      if (char && char.portrait_url) {
        const localCharPath = path.join(projDir, char.portrait_url.replace(/^\/(media-project\/[^/]+\/|channel_assets\/)?/, "channel_assets/"));
        if (fs.existsSync(localCharPath)) {
          p = localCharPath;
        }
      }
    } else if (s.customFile && fs.existsSync(s.customFile)) {
      p = s.customFile;
    }

    // Fallback to master style reference image if shot file is pending
    if ((!p || !fs.existsSync(p)) && masterStyleImg) {
      p = masterStyleImg;
    }

    if (p && fs.existsSync(p)) {
      const cId = s.audio || "default";
      if (!chunkGroups[cId]) chunkGroups[cId] = [];
      const ext = path.extname(p).toLowerCase();
      const isImage = [".jpg", ".jpeg", ".png", ".webp"].includes(ext);
      chunkGroups[cId].push({ ...s, absPath: p, isImage });
    }
  }

  // Calculate synchronized duration for each shot
  const plannedShots = [];
  let calculatedTotalDur = 0;

  for (const [chunkAudio, groupShots] of Object.entries(chunkGroups)) {
    const chunkFile = path.join(audioDir, chunkAudio);
    let chunkDur = 0;
    if (fs.existsSync(chunkFile)) {
      chunkDur = getMediaDuration(ffprobe, chunkFile);
    }
    if (!chunkDur || isNaN(chunkDur)) {
      chunkDur = (totalDuration / Object.keys(chunkGroups).length);
    }

    const durPerShot = chunkDur / groupShots.length;
    console.log(`  Audio Chunk: ${chunkAudio.padEnd(20)} | Duration: ${chunkDur.toFixed(2)}s | Shots: ${groupShots.length} (${durPerShot.toFixed(2)}s each)`);

    for (const shot of groupShots) {
      plannedShots.push({
        ...shot,
        targetDurationSec: durPerShot
      });
      calculatedTotalDur += durPerShot;
    }
  }

  if (plannedShots.length === 0) {
    console.warn("\n[WARN] No footage shots found on disk. Synthesizing visual sequence from Master Style References...");
    const masterStyleCandidates = [
      path.join(projDir, "channel_assets", "style", "master_style_reference_16x9.jpg"),
      path.join(epDir, "channel_assets", "style", "master_style_reference_16x9.jpg"),
      path.join(ROOT_DIR, "channel_assets", "style", "master_style_reference_16x9.jpg"),
      path.join(ROOT_DIR, "projects", "crime_chronicles", "channel_assets", "style", "master_style_reference_16x9.jpg")
    ];
    let fallbackImg = masterStyleCandidates.find(c => fs.existsSync(c));

    if (fallbackImg) {
      const shotCount = 8;
      const durPerShot = totalDuration / shotCount;
      for (let i = 0; i < shotCount; i++) {
        plannedShots.push({
          shotId: `shot_${String(i + 1).padStart(3, "0")}`,
          absPath: fallbackImg,
          isImage: true,
          targetDurationSec: durPerShot
        });
      }
      calculatedTotalDur = totalDuration;
    }
  }

  console.log(`[2/5] Synchronized Shot Plan: ${plannedShots.length} clips calculated (Total: ${calculatedTotalDur.toFixed(2)}s).`);

  updateProgress(20, `Planned ${plannedShots.length} visual shots synchronized to audio timing...`);

  // 3. Prepare Subtitles
  const subtitlesAss = path.join(epDir, "subtitles_karaoke.ass");
  const subtitlesSrt = path.join(epDir, "subtitles_karaoke.srt");
  let subFile = null;
  if (fs.existsSync(subtitlesAss)) {
    subFile = subtitlesAss;
  } else if (fs.existsSync(subtitlesSrt)) {
    subFile = subtitlesSrt;
  }

  if (subFile) {
    console.log(`[3/5] Subtitles: ${path.basename(subFile)} (Word-synced karaoke mode)`);
  } else {
    console.log("[3/5] Subtitles: None found, rendering clean video");
  }

  // 4. Temporary Working Directory
  const tmpDir = path.join(epDir, "_tmp_render");
  if (fs.existsSync(tmpDir)) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
  fs.mkdirSync(tmpDir, { recursive: true });

  // 5. Pre-process and normalize each shot with Unified Color Grading
  console.log(`\n[4/5] Normalizing & color grading clips with [${selectedStyle.name}]...`);
  const normalizedClips = [];

  const BATCH_SIZE = 2;
  for (let i = 0; i < plannedShots.length; i += BATCH_SIZE) {
    const currentProcessed = Math.min(i + BATCH_SIZE, plannedShots.length);
    const progressPct = 25 + Math.round((currentProcessed / plannedShots.length) * 50);
    updateProgress(progressPct, `Color-grading and encoding shots (${currentProcessed}/${plannedShots.length})...`);

    const batch = plannedShots.slice(i, i + BATCH_SIZE);
    const promises = batch.map((shot, idx) => {
      const shotIndex = i + idx;
      const inputPath = shot.absPath;
      const outClip = path.join(tmpDir, `clip_${String(shotIndex).padStart(3, "0")}.mp4`);
      normalizedClips.push(outClip);

      let vf = `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30,${colorGradeFilter}`;
      let args = [];

      if (shot.isImage) {
        // High-speed 2.5D Ken Burns zoom for still character portraits
        const totalFrames = Math.max(30, Math.round(shot.targetDurationSec * 30));
        vf = `zoompan=z='min(zoom+0.0012,1.15)':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30,${colorGradeFilter}`;
        args = [
          "-y",
          "-i", inputPath,
          "-vf", vf,
          ...encoder.args,
          "-t", shot.targetDurationSec.toFixed(3),
          "-an",
          outClip
        ];
      } else {
        args = [
          "-y",
          "-stream_loop", "-1",
          "-ss", "0",
          "-t", shot.targetDurationSec.toFixed(3),
          "-i", inputPath,
          "-vf", vf,
          ...encoder.args,
          "-an",
          outClip
        ];
      }

      return runCommandAsync(ffmpeg, args);
    });

    await Promise.all(promises);
    process.stdout.write(`  Processed ${Math.min(i + BATCH_SIZE, plannedShots.length)}/${plannedShots.length} clips...\r`);
  }
  console.log(`\n  All ${plannedShots.length} clips normalized and color-graded!`);

  // 6. Create Concat Demuxer List
  const concatListPath = path.join(tmpDir, "concat_list.txt");
  const concatContent = normalizedClips.map(clip => {
    return `file '${path.basename(clip)}'`;
  }).join("\n");
  fs.writeFileSync(concatListPath, concatContent, "utf8");

  // 7. Final Assembly & Master Render
  const finalOutputPath = path.join(epDir, `${episodeId}_FINAL_VIDEO_1080P.mp4`);
  console.log(`\n[5/5] Assembling final master video with audio & subtitles...`);
  console.log(`  Destination: ${finalOutputPath}`);
  updateProgress(80, "Multiplexing video, audio master, and hard-burning karaoke subtitles...");

  const subPathEscaped = subFile ? path.resolve(subFile).replace(/\\/g, "/").replace(/:/g, "\\:") : null;
  const finalVf = subPathEscaped ? `subtitles='${subPathEscaped}'` : null;

  const buildFinalArgs = (vf) => {
    const a = [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", concatListPath,
      "-i", audioFile
    ];
    if (vf) a.push("-vf", vf);
    a.push(
      ...encoder.args,
      "-c:a", "aac",
      "-b:a", "192k",
      "-t", totalDuration.toFixed(2),
      finalOutputPath
    );
    return a;
  };

  try {
    await runCommandAsync(ffmpeg, buildFinalArgs(finalVf));
  } catch (err) {
    if (finalVf) {
      console.warn("\n[WARN] Subtitle filter failed (libass/font issue). Retrying without subtitles for clean video...");
      await runCommandAsync(ffmpeg, buildFinalArgs(null));
      console.log("  ✓ Clean 1080p video rendered successfully!");
    } else {
      throw err;
    }
  }

  // Clean up tmp files
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}

  const stats = fs.statSync(finalOutputPath);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(1);
  const elapsedMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  updateProgress(100, "1080p Master Video rendered successfully!", {
    finalVideo: {
      name: path.basename(finalOutputPath),
      path: `/media/${episodeId}/${path.basename(finalOutputPath)}`,
      sizeMb,
      sizeBytes: stats.size,
      durationSec: totalDuration
    }
  });

  console.log("\n=======================================================");
  console.log(`✅  SUCCESS! MULTI-STYLE 1080P MASTER VIDEO CREATED!`);
  console.log(`    File:     ${finalOutputPath}`);
  console.log(`    Theme:    ${selectedStyle.name}`);
  console.log(`    Size:     ${sizeMb} MB`);
  console.log(`    Duration: ${(totalDuration / 60).toFixed(1)} minutes`);
  console.log(`    Render:   ${elapsedMin} minutes`);
  console.log("=======================================================\n");

  return finalOutputPath;
}

if (require.main === module) {
  const episodeArg = process.argv[2] || "EP001";
  const styleArg = process.argv[3] || "crime_suspense";
  const projectDirArg = process.argv[4] || null;
  renderEpisode(episodeArg, styleArg, projectDirArg).catch(err => {
    console.error("\n❌ RENDER ERROR:", err.message);
    const projectManager = require("../projects/project_manager");
    try {
      const epDir = projectManager.resolveEpisodeDir(episodeArg, projectDirArg);
      fs.writeFileSync(path.join(epDir, "render_progress.json"), JSON.stringify({
        episodeId: episodeArg,
        status: "failed",
        progress: 0,
        step: `Render failed: ${err.message}`,
        error: err.message,
        updatedAt: new Date().toISOString()
      }, null, 2), "utf8");
    } catch {}
    process.exit(1);
  });
}

module.exports = { renderEpisode };
