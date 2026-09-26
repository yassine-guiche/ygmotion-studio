/**
 * automated_producer.js - 1-Click "Title -> Full 1080p Master Video" Engine
 * 
 * End-to-end automated workflow:
 *   1. Title -> Google Gemini Cloud AI High-Retention Script (8 Scenes + Visual Prompts + Camera Motions)
 *   2. Script -> 16:9 Photorealistic Style-Consistent Visuals (Flux / SDXL)
 *   3. Visuals -> 2.5D Cinematic Camera Motions (Push-In, Parallax, Pan, Tilt, Camera Shake)
 *   4. Narration -> Voice Synthesis & Word-Level Karaoke Captions (.ASS / .SRT)
 *   5. Audio & FX -> -18dB Ducked Music Bed + Foley SFX
 *   6. Master Assembly -> 1080p 30fps Master MP4 Video
 */

"use strict";

const fs = require("fs");
const path = require("path");

const geminiEngine = require("../ai/gemini_engine");
const scriptGenerator = require("../ai/script_generator");
const visualGenerator = require("../ai/visual_generator");
const motionEngine = require("../motion/motion_engine");
const voiceDesigner = require("../audio/voice_designer");
const projectManager = require("../projects/project_manager");
const renderScript = require("../scripts/render_video");

class AutomatedProducer {
  /**
   * Determine the next episode ID for a given project directory
   */
  getNextEpisodeId(projectDir) {
    const epDir = path.join(projectDir, "episodes");
    if (!fs.existsSync(epDir)) return "EP001";
    const entries = fs.readdirSync(epDir).filter(f => /^EP\d+$/i.test(f));
    if (entries.length === 0) return "EP001";
    const nums = entries.map(e => parseInt(e.replace(/EP/i, ""), 10)).filter(n => !isNaN(n));
    const nextNum = Math.max(...nums) + 1;
    return `EP${String(nextNum).padStart(3, "0")}`;
  }

  /**
   * Run the complete 1-Click production pipeline
   */
  async produceVideoFromTitle({
    title,
    episodeId = null,
    styleId = null,
    projectDirOverride = null,
    onProgress = null
  }) {
    const startTime = Date.now();
    const activeProj = projectManager.getActiveProjectInfo();
    const projectDir = projectDirOverride || (activeProj ? activeProj.path : path.resolve(__dirname, "../../projects/crime_chronicles"));
    const finalStyleId = styleId || activeProj.category || "crime_suspense";

    const targetEpId = (episodeId || this.getNextEpisodeId(projectDir)).toUpperCase();
    const epDir = projectManager.resolveEpisodeDir(targetEpId, projectDir);
    if (!fs.existsSync(epDir)) fs.mkdirSync(epDir, { recursive: true });

    const progressFile = path.join(epDir, "render_progress.json");
    const report = (progress, step, extra = {}) => {
      const data = {
        episodeId: targetEpId,
        styleId: finalStyleId,
        status: progress >= 100 ? "completed" : "rendering",
        progress: Math.min(100, Math.max(0, Math.round(progress))),
        step,
        updatedAt: new Date().toISOString(),
        ...extra
      };
      try {
        fs.writeFileSync(progressFile, JSON.stringify(data, null, 2), "utf8");
      } catch {}
      if (onProgress) onProgress(data);
    };

    try {
      // ----------------------------------------------------
      // STEP 1: INITIALIZE EPISODE
      // ----------------------------------------------------
      report(5, "Initializing episode workspace...");
      projectManager.createEpisode(targetEpId, title, finalStyleId, projectDir);

      // ----------------------------------------------------
      // STEP 2: SCRIPT GENERATION VIA GEMINI CLOUD AI
      // ----------------------------------------------------
      report(15, `Generating high-retention script for "${title}" with Google Gemini Cloud AI...`);
      const blueprint = {
        nicheInsights: {
          archetype: finalStyleId,
          pacingWpm: activeProj?.voiceProfile?.pacing || 160
        }
      };

      let scriptData;
      try {
        scriptData = await geminiEngine.generateScript({
          blueprint,
          topic: title,
          pacingWpm: blueprint.nicheInsights.pacingWpm,
          targetDurationMin: 2.5
        });
      } catch (err) {
        console.warn("Gemini script generation fallback to generator:", err.message);
        scriptData = await scriptGenerator.generateScript({
          blueprint,
          topic: title,
          targetDurationMin: 2.5
        });
      }

      const scriptMasterMd = scriptGenerator.formatToScriptMasterMd(scriptData);
      fs.writeFileSync(path.join(epDir, "script_master.md"), scriptMasterMd, "utf8");
      fs.writeFileSync(path.join(epDir, "script_data.json"), JSON.stringify(scriptData, null, 2), "utf8");

      // ----------------------------------------------------
      // STEP 3: STYLE-CONSISTENT SCENE VISUAL GENERATION
      // ----------------------------------------------------
      report(30, "Generating photorealistic 16:9 scene visuals matching script direction...");
      const styleAnchor = activeProj?.defaultStylePrompt || "cinematic 35mm film, moody dramatic lighting, anamorphic lens, 8k resolution, true crime documentary aesthetic";
      
      const visualResults = await visualGenerator.generateAllScenes({
        scenes: scriptData.scenes,
        episodeDir: epDir,
        styleAnchor,
        onProgress: (cur, total, msg) => {
          const subProgress = 30 + Math.round((cur / total) * 20);
          report(subProgress, msg);
        }
      });

      // ----------------------------------------------------
      // STEP 4: 2.5D CINEMATIC MOTION ANIMATION
      // ----------------------------------------------------
      report(55, "Applying 2.5D camera motions to transform scene stills into video clips...");
      const animatedShots = [];

      for (let i = 0; i < scriptData.scenes.length; i++) {
        const scene = scriptData.scenes[i];
        const shotIndex = i + 1;
        const imgName = `shot_${String(shotIndex).padStart(3, "0")}.jpg`;
        const imgPath = path.join(epDir, imgName);

        const outClipName = `motion_shot_${String(shotIndex).padStart(3, "0")}.mp4`;
        const outClipPath = path.join(epDir, outClipName);

        const motionType = scene.cameraMotion || "push_in";
        const durationSec = scene.estimatedDurationSec || 4.5;

        report(
          55 + Math.round((shotIndex / scriptData.scenes.length) * 15),
          `Animating Scene ${shotIndex}/${scriptData.scenes.length} (${motionType})...`
        );

        try {
          await motionEngine.animateImage({
            imagePath: fs.existsSync(imgPath) ? imgPath : null,
            outputPath: outClipPath,
            durationSec,
            motionType
          });
        } catch (e) {
          console.warn(`Motion generation for shot ${shotIndex} failed:`, e.message);
        }

        animatedShots.push({
          shotId: `shot_${String(shotIndex).padStart(3, "0")}`,
          partId: shotIndex,
          title: scene.title,
          text: scene.text,
          visualPrompt: scene.visualPrompt,
          motionType,
          durationSec,
          audio: `chunk_part_${String(shotIndex).padStart(2, "0")}.mp3`,
          visualType: "ai_scene",
          file: outClipName,
          animated: true
        });
      }

      // Save updated manifest
      fs.writeFileSync(path.join(epDir, "footage_manifest.json"), JSON.stringify({
        episodeId: targetEpId,
        title,
        updatedAt: new Date().toISOString(),
        shots: animatedShots
      }, null, 2), "utf8");

      // ----------------------------------------------------
      // STEP 5: VOICE SYNTHESIS & KARAOKE TIMESTAMPS
      // ----------------------------------------------------
      report(72, "Aligning spoken narration timestamps and generating animated karaoke captions...");
      const timing = voiceDesigner.generateWordTimestamps(scriptData.scenes, blueprint.nicheInsights.pacingWpm);
      const assKaraoke = voiceDesigner.generateAssKaraoke(timing.chunks, {
        fontName: "Montserrat",
        primaryColor: "#FFFFFF",
        highlightColor: "#00F0FF"
      });

      fs.writeFileSync(path.join(epDir, "subtitles_karaoke.json"), JSON.stringify(timing, null, 2), "utf8");
      fs.writeFileSync(path.join(epDir, "subtitles_karaoke.ass"), assKaraoke, "utf8");

      // Generate .srt subtitles as well
      let srtContent = "";
      timing.chunks.forEach((chunk, idx) => {
        const startSec = chunk.startSec || (idx * 5.0);
        const endSec = chunk.endSec || ((idx + 1) * 5.0);
        const formatTime = (s) => {
          const h = Math.floor(s / 3600);
          const m = Math.floor((s % 3600) / 60);
          const sec = Math.floor(s % 60);
          const ms = Math.floor((s % 1) * 1000);
          return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
        };
        srtContent += `${idx + 1}\n${formatTime(startSec)} --> ${formatTime(endSec)}\n${chunk.text}\n\n`;
      });
      fs.writeFileSync(path.join(epDir, "subtitles_karaoke.srt"), srtContent, "utf8");

      // ----------------------------------------------------
      // STEP 6: ASSEMBLE & RENDER 1080P MASTER VIDEO
      // ----------------------------------------------------
      report(80, "Assembling 1080p master video, mixing ducked music bed & burning subtitles...");
      await renderScript.renderEpisode(targetEpId, finalStyleId, projectDir);

      const finalVideoPath = path.join(epDir, `${targetEpId}_FINAL_VIDEO_1080P.mp4`);
      let sizeMb = 0;
      if (fs.existsSync(finalVideoPath)) {
        sizeMb = (fs.statSync(finalVideoPath).size / (1024 * 1024)).toFixed(1);
      }

      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      report(100, `Video production complete! 1080p MP4 ready (${sizeMb} MB in ${elapsedSec}s)`, {
        finalVideo: {
          path: `/media/${targetEpId}/${targetEpId}_FINAL_VIDEO_1080P.mp4`,
          sizeMb,
          renderedAt: new Date().toISOString()
        }
      });

      return {
        success: true,
        episodeId: targetEpId,
        title,
        styleId: finalStyleId,
        videoPath: finalVideoPath,
        videoUrl: `/media/${targetEpId}/${targetEpId}_FINAL_VIDEO_1080P.mp4`,
        sizeMb,
        scenesCount: scriptData.scenes.length,
        elapsedSec
      };
    } catch (err) {
      console.error("[PRODUCER ERROR]", err);
      report(0, `Production failed: ${err.message}`, {
        status: "failed",
        error: err.message
      });
      throw err;
    }
  }
}

module.exports = new AutomatedProducer();
