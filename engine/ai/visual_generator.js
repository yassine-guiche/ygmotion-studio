/**
 * visual_generator.js - AI Visual Scene Generator for YGMotion Studio
 * 
 * Generates photorealistic, 16:9 1080p scene images matching Gemini visual prompts
 * and channel style anchors (using Pollinations Flux / SDXL with automatic fallback).
 */

"use strict";

const fs = require("fs");
const path = require("path");

class VisualGenerator {
  /**
   * Build a unified, style-consistent prompt by combining the channel style anchor with the scene prompt
   */
  buildConsistentPrompt(visualPrompt, styleAnchor = "", characterFace = "") {
    const defaultAnchor = "cinematic 35mm film photography, dark moody atmospheric lighting, anamorphic lens flare, 8k resolution, true crime documentary photorealism, detailed textures";
    const anchor = styleAnchor || defaultAnchor;
    
    let combined = `${anchor}, ${visualPrompt}`;
    if (characterFace) {
      combined = `${characterFace}, ${combined}`;
    }
    // Clean up extra whitespace and quotes
    return combined.replace(/["\n\r]/g, " ").replace(/\s+/g, " ").trim();
  }

  /**
   * Generate and download a single scene image
   */
  async generateSceneImage({ prompt, outputPath, width = 1920, height = 1080, seed = null }) {
    const finalSeed = seed || Math.floor(Math.random() * 999999);
    const encoded = encodeURIComponent(prompt.slice(0, 400));
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&model=flux&nologo=true&seed=${finalSeed}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Visual API responded with status ${res.status}`);
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 5000) {
        throw new Error(`Downloaded image is too small (${buffer.length} bytes)`);
      }

      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(outputPath, buffer);
      return { success: true, path: outputPath, sizeBytes: buffer.length };
    } catch (err) {
      clearTimeout(timeout);
      
      // Fallback 1: Try Pexels Photos API if PEXELS_API_KEY is available
      try {
        let pexelsKey = process.env.PEXELS_API_KEY;
        if (!pexelsKey) {
          const envPath = path.resolve(__dirname, "../../.env");
          if (fs.existsSync(envPath)) {
            const lines = fs.readFileSync(envPath, "utf8").split("\n");
            for (const l of lines) {
              if (l.trim().startsWith("PEXELS_API_KEY=")) {
                pexelsKey = l.trim().split("=")[1].replace(/^["']|["']$/g, "").trim();
              }
            }
          }
        }
        if (pexelsKey) {
          const queryWords = prompt.replace(/[^a-zA-Z\s]/g, " ").split(/\s+/).filter(w => w.length > 4 && !["cinematic", "photorealistic", "lighting", "resolution"].includes(w.toLowerCase()));
          const query = queryWords.slice(0, 3).join(" ") || "cinematic";
          const pexelsRes = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=landscape&per_page=5`, {
            headers: { Authorization: pexelsKey }
          });
          if (pexelsRes.ok) {
            const pData = await pexelsRes.json();
            if (pData.photos && pData.photos.length > 0) {
              const photo = pData.photos[Math.floor(Math.random() * Math.min(3, pData.photos.length))];
              const dlUrl = photo.src.large2x || photo.src.original || photo.src.large;
              const imgRes = await fetch(dlUrl);
              if (imgRes.ok) {
                const imgBuf = Buffer.from(await imgRes.arrayBuffer());
                const dir = path.dirname(outputPath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(outputPath, imgBuf);
                return { success: true, path: outputPath, isPexelsFallback: true, sizeBytes: imgBuf.length };
              }
            }
          }
        }
      } catch (pxErr) {
        console.warn("Pexels photo fallback failed:", pxErr.message);
      }

      // Fallback 2: Local master reference as last resort
      const fallbackCandidates = [
        path.resolve(__dirname, "../../channel_assets/style/master_style_reference_16x9.jpg"),
        path.resolve(__dirname, "../../projects/deep_investigative_dossier/channel_assets/style/master_style_reference_16x9.jpg"),
        path.resolve(__dirname, "../../projects/crime_chronicles/channel_assets/style/master_style_reference_16x9.jpg")
      ];
      for (const fallback of fallbackCandidates) {
        if (fs.existsSync(fallback)) {
          const dir = path.dirname(outputPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.copyFileSync(fallback, outputPath);
          return { success: true, path: outputPath, isFallback: true, warning: err.message };
        }
      }
      throw err;
    }
  }

  /**
   * Batch generate visuals for all scenes in a script
   */
  async generateAllScenes({ scenes, episodeDir, styleAnchor = "", characterFace = "", onProgress = null }) {
    const results = [];
    const baseSeed = Math.floor(Math.random() * 500000);

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const shotIndex = i + 1;
      const imgFileName = `shot_${String(shotIndex).padStart(3, "0")}.jpg`;
      const outPath = path.join(episodeDir, imgFileName);

      const prompt = this.buildConsistentPrompt(scene.visualPrompt || scene.text, styleAnchor, characterFace);

      if (onProgress) {
        onProgress(shotIndex, scenes.length, `Generating visual for Scene ${shotIndex}...`);
      }

      try {
        const res = await this.generateSceneImage({
          prompt,
          outputPath: outPath,
          seed: baseSeed + i
        });
        results.push({ shotIndex, fileName: imgFileName, absPath: outPath, success: true });
      } catch (err) {
        console.warn(`[WARN] Failed to generate visual for scene ${shotIndex}:`, err.message);
        results.push({ shotIndex, fileName: imgFileName, absPath: outPath, success: false, error: err.message });
      }
    }

    return results;
  }
}

module.exports = new VisualGenerator();
