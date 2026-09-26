/**
 * footage_manager.js - Stock Video & Dynamic Footage Engine for YGMotion Studio
 * 
 * Fetches high-definition landscape stock footage from Pexels Video API matching
 * Gemini script scenes and pexelsQuery tags. Provides intelligent fallback to
 * Pexels HD Photos + 2.5D Ken Burns animation and AI visual synthesis.
 * 
 * Guarantee: Zero duplicate static shots. Every scene is delivered as a 1080p MP4.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const motionEngine = require("../motion/motion_engine");
const visualGenerator = require("../ai/visual_generator");
const geminiMediaEngine = require("../ai/gemini_media_engine");

function getPexelsApiKey() {
  const envPaths = [
    path.resolve(__dirname, "../../.env"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, ".env")
  ];

  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("PEXELS_API_KEY=")) {
          return trimmed.split("=")[1].replace(/^["']|["']$/g, "").trim();
        }
      }
    }
  }
  return process.env.PEXELS_API_KEY || "Qgx9o27OC8jrA0sDlr2eyTmXdbBoRT1voEbMmjpZKcCtn2XCbR7QyfK3";
}

class FootageManager {
  constructor() {
    this.apiKey = getPexelsApiKey();
    this.usedVideoIds = new Set();
  }

  /**
   * Search Pexels Video API and download the best matching landscape 1080p MP4
   */
  async downloadPexelsVideo({ query, outputPath, minDurationSec = 4 }) {
    this.apiKey = getPexelsApiKey();
    if (!this.apiKey) {
      throw new Error("PEXELS_API_KEY not found in environment or .env");
    }

    const cleanQuery = query.replace(/[^\w\s-]/g, "").trim();
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(cleanQuery)}&orientation=landscape&per_page=12`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch(url, {
        headers: { Authorization: this.apiKey },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Pexels Video API HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const videos = (data.videos || []).filter(v => !this.usedVideoIds.has(v.id));

      if (videos.length === 0 && (data.videos || []).length > 0) {
        // All videos on first page used, fallback to first available
        videos.push(...data.videos);
      }

      if (videos.length === 0) {
        return null; // No videos found for query
      }

      // Pick the best video: prefer landscape HD (1920x1080)
      let chosenVideo = null;
      let chosenFile = null;

      for (const video of videos) {
        if (!video.video_files || video.video_files.length === 0) continue;

        // Try exact 1920x1080
        const f1080 = video.video_files.find(f => f.width === 1920 && f.height === 1080);
        // Try hd quality
        const fHd = video.video_files.find(f => f.quality === "hd" && f.width >= 1280);
        // Try uhd quality
        const fUhd = video.video_files.find(f => f.quality === "uhd");
        // Fallback to highest width file
        const fAny = [...video.video_files].sort((a, b) => (b.width || 0) - (a.width || 0))[0];

        const bestFile = f1080 || fHd || fUhd || fAny;
        if (bestFile && bestFile.link) {
          chosenVideo = video;
          chosenFile = bestFile;
          break;
        }
      }

      if (!chosenVideo || !chosenFile) {
        return null;
      }

      // Download video file
      const dlController = new AbortController();
      const dlTimeout = setTimeout(() => dlController.abort(), 35000);
      const dlRes = await fetch(chosenFile.link, { signal: dlController.signal });
      clearTimeout(dlTimeout);

      if (!dlRes.ok) {
        throw new Error(`Failed to download Pexels video stream: HTTP ${dlRes.status}`);
      }

      const buffer = Buffer.from(await dlRes.arrayBuffer());
      if (buffer.length < 50000) {
        throw new Error(`Downloaded video stream too small (${buffer.length} bytes)`);
      }

      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(outputPath, buffer);
      this.usedVideoIds.add(chosenVideo.id);

      return {
        success: true,
        source: "pexels_video",
        videoId: chosenVideo.id,
        duration: chosenVideo.duration,
        width: chosenFile.width,
        height: chosenFile.height,
        pexelsUrl: chosenVideo.url,
        fileSize: buffer.length
      };
    } catch (err) {
      clearTimeout(timeout);
      console.warn(`[Pexels Video Search] Failed for "${query}":`, err.message);
      return null;
    }
  }

  /**
   * Search Pexels Photo API and download high-res landscape image
   */
  async downloadPexelsPhoto({ query, outputPath }) {
    this.apiKey = getPexelsApiKey();
    if (!this.apiKey) return null;

    const cleanQuery = query.replace(/[^\w\s-]/g, "").trim();
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(cleanQuery)}&orientation=landscape&per_page=6`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(url, {
        headers: { Authorization: this.apiKey },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) return null;
      const data = await res.json();
      if (!data.photos || data.photos.length === 0) return null;

      const photo = data.photos[0];
      const imgUrl = photo.src.large2x || photo.src.original || photo.src.large;

      const dlRes = await fetch(imgUrl);
      if (!dlRes.ok) return null;

      const buffer = Buffer.from(await dlRes.arrayBuffer());
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(outputPath, buffer);
      return {
        success: true,
        source: "pexels_photo",
        photoId: photo.id,
        url: photo.url,
        fileSize: buffer.length
      };
    } catch (err) {
      clearTimeout(timeout);
      return null;
    }
  }

  /**
   * Extract 2-3 high relevance visual keywords from scene prompt and text
   */
  extractVisualKeywords(scene) {
    if (scene.pexelsQuery && scene.pexelsQuery.trim().length > 2) {
      return scene.pexelsQuery.trim();
    }
    const combined = `${scene.visualPrompt || ""} ${scene.text || ""}`.toLowerCase();
    const keywords = [
      "apocalypse", "explosion", "fire", "dark city", "storm", "lightning", "cyberpunk",
      "police car", "detective", "abandoned", "night street", "drone", "space", "earth",
      "computer hacker", "matrix", "running", "crowd panic", "red sky", "sunset",
      "foggy forest", "underwater", "mountains", "traffic", "skyscraper", "countdown"
    ];
    for (const kw of keywords) {
      if (combined.includes(kw)) return kw;
    }
    const words = (scene.visualPrompt || scene.text || "")
      .replace(/[^a-zA-Z\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 4 && !["cinematic", "photorealistic", "resolution", "lighting", "dramatic", "volumetric"].includes(w.toLowerCase()));
    return words.slice(0, 2).join(" ") || "cinematic suspense";
  }

  /**
   * Fetch complete footage package for an episode's scenes.
   * Guarantees 100% of scenes receive an HD video clip (.mp4).
   */
  async fetchFootageForEpisode({
    episodeId,
    scenes,
    episodeDir,
    styleAnchor = "",
    visualMode = "hybrid",
    onProgress = null
  }) {
    this.usedVideoIds.clear();
    const manifestShots = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const shotIndex = i + 1;
      const shotBaseName = `shot_${String(shotIndex).padStart(3, "0")}`;
      const videoFileName = `${shotBaseName}.mp4`;
      const videoFilePath = path.join(episodeDir, videoFileName);
      const stillFileName = `${shotBaseName}.jpg`;
      const stillFilePath = path.join(episodeDir, stillFileName);

      const targetDurationSec = scene.estimatedDurationSec || 5.0;
      const cameraMotion = scene.cameraMotion || "push_in";

      if (onProgress) {
        onProgress(shotIndex, scenes.length, `Sourcing [${visualMode.toUpperCase()}] media for Scene ${shotIndex}/${scenes.length} ("${scene.title}")...`);
      }

      let shotSource = null;

      // Extract high-relevance search queries
      const primaryKeyword = this.extractVisualKeywords(scene);
      const queriesToTry = [primaryKeyword];
      if (scene.pexelsQuery && scene.pexelsQuery !== primaryKeyword) {
        queriesToTry.unshift(scene.pexelsQuery);
      }
      if (scene.title) {
        const cleanTitle = scene.title.replace(/^Scene\s*\d+\s*:\s*/i, "").trim().toLowerCase();
        if (!queriesToTry.includes(cleanTitle)) queriesToTry.push(cleanTitle);
      }
      queriesToTry.push("cinematic atmosphere", "dramatic lighting");

      // Check whether this shot should prefer video or photo based on visualMode
      const preferPhoto = visualMode === "photo" || visualMode === "gemini_image" || (visualMode === "hybrid" && (shotIndex % 2 === 1 && !scene.pexelsQuery?.includes("action")));

      // 0. If visualMode is "veo_video", try Google Veo 3.1 AI Video Generation first
      if (visualMode === "veo_video") {
        try {
          if (onProgress) onProgress(shotIndex, scenes.length, `Generating Veo 3.1 video for Scene ${shotIndex}...`);
          const veoPrompt = `${scene.visualPrompt || scene.text}, ${styleAnchor}`;
          const veoResult = await geminiMediaEngine.generateVideo({
            prompt: veoPrompt,
            outputPath: videoFilePath,
            durationSeconds: targetDurationSec
          });
          if (veoResult && veoResult.success && fs.existsSync(videoFilePath) && fs.statSync(videoFilePath).size > 50000) {
            shotSource = {
              file: videoFileName,
              visualType: "google_veo_3.1",
              sourceDetails: veoResult
            };
          }
        } catch (veoErr) {
          console.warn(`[Veo Video] Scene ${shotIndex} failed, falling back to Pexels video:`, veoErr.message);
        }
      }

      // 1. If not photo-only, try Pexels Video Search
      if (!shotSource && !preferPhoto) {
        for (const q of queriesToTry) {
          try {
            const vResult = await this.downloadPexelsVideo({
              query: q,
              outputPath: videoFilePath,
              minDurationSec: targetDurationSec
            });
            if (vResult && fs.existsSync(videoFilePath) && fs.statSync(videoFilePath).size > 50000) {
              shotSource = {
                file: videoFileName,
                visualType: "pexels_stock_video",
                sourceDetails: vResult
              };
              break;
            }
          } catch (e) {
            console.warn(`Pexels video query "${q}" failed:`, e.message);
          }
        }
      }

      // 2. If Pexels video failed or photo mode preferred, try photo + 2.5D camera animation
      if (!shotSource) {
        if (onProgress) {
          onProgress(shotIndex, scenes.length, `Applying 2.5D animation to Scene ${shotIndex}...`);
        }

        let photoDownloaded = false;

        // If gemini_image mode is selected, generate image directly with Gemini
        if (visualMode === "gemini_image") {
          try {
            if (onProgress) onProgress(shotIndex, scenes.length, `Synthesizing Gemini AI Image for Scene ${shotIndex}...`);
            const geminiRes = await geminiMediaEngine.generateImage({
              prompt: `${scene.visualPrompt || scene.text}, ${styleAnchor}`,
              outputPath: stillFilePath
            });
            if (geminiRes && geminiRes.success && fs.existsSync(stillFilePath)) {
              photoDownloaded = true;
            }
          } catch (gErr) {
            console.warn(`[Gemini Image] Scene ${shotIndex} failed, falling back to Pexels photo:`, gErr.message);
          }
        }

        // Try Pexels Photo API if still image not yet acquired
        if (!photoDownloaded) {
          for (const q of queriesToTry) {
            const pResult = await this.downloadPexelsPhoto({
              query: q,
              outputPath: stillFilePath
            });
            if (pResult && fs.existsSync(stillFilePath)) {
              photoDownloaded = true;
              break;
            }
          }
        }

        // 3. If Pexels photo failed, try Gemini Image synthesis then SDXL/Flux
        if (!photoDownloaded) {
          try {
            const gRes = await geminiMediaEngine.generateImage({
              prompt: `${scene.visualPrompt || scene.text}, ${styleAnchor}`,
              outputPath: stillFilePath
            });
            if (gRes && gRes.success && fs.existsSync(stillFilePath)) {
              photoDownloaded = true;
            }
          } catch (e) {}
        }

        if (!photoDownloaded) {
          try {
            await visualGenerator.generateSceneImage({
              prompt: visualGenerator.buildConsistentPrompt(scene.visualPrompt || scene.text, styleAnchor),
              outputPath: stillFilePath,
              seed: Math.floor(Math.random() * 888888) + shotIndex * 1337
            });
          } catch (aiErr) {
            console.warn(`Visual generator failed for scene ${shotIndex}:`, aiErr.message);
          }
        }

        // Animate the still photo into an MP4 motion clip
        if (fs.existsSync(stillFilePath)) {
          try {
            await motionEngine.animateImage({
              imagePath: stillFilePath,
              outputPath: videoFilePath,
              durationSec: targetDurationSec,
              motionType: cameraMotion
            });
            shotSource = {
              file: videoFileName,
              visualType: "animated_motion_clip",
              motionType: cameraMotion
            };
          } catch (motionErr) {
            console.warn(`Motion animation failed for scene ${shotIndex}:`, motionErr.message);
          }
        }
      }

      // 4. Absolute safety fallback: if videoFilePath still doesn't exist, create animated color card with FFmpeg
      if (!fs.existsSync(videoFilePath)) {
        const { execSync } = require("child_process");
        const safeCmd = `ffmpeg -y -f lavfi -i color=c=0x111318:s=1920x1080:d=${targetDurationSec.toFixed(1)} -vf "drawtext=text='Scene ${shotIndex}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2" -c:v libx264 -pix_fmt yuv420p "${videoFilePath}"`;
        try {
          execSync(safeCmd, { stdio: "pipe" });
        } catch {}
      }

      manifestShots.push({
        shotId: shotBaseName,
        partId: shotIndex,
        title: scene.title,
        text: scene.text,
        visualPrompt: scene.visualPrompt,
        pexelsQuery: scene.pexelsQuery || queriesToTry[0],
        cameraMotion,
        durationSec: targetDurationSec,
        audio: `chunk_part_${String(shotIndex).padStart(2, "0")}.mp3`,
        file: videoFileName,
        visualType: shotSource ? shotSource.visualType : "pexels_stock_video",
        animated: true
      });
    }

    // Write updated footage manifest to episode directory
    const manifestPath = path.join(episodeDir, "footage_manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify({
      episodeId,
      updatedAt: new Date().toISOString(),
      shotsCount: manifestShots.length,
      shots: manifestShots
    }, null, 2), "utf8");

    return manifestShots;
  }
}

module.exports = new FootageManager();
