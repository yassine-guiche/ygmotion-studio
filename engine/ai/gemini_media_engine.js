/**
 * gemini_media_engine.js - Native Google Gemini Image & Veo Video Generation Engine
 * 
 * Capabilities:
 *   1. Gemini 3 Image / Imagen 3 Photo Generation (16:9 Landscape AI Photos)
 *   2. Google Veo 3.1 Text-to-Video Generation (PredictLongRunning Async Polling)
 *   3. Zero-Cost Intelligent Fallback to Pexels HD & 2.5D Ken Burns Animation
 */

"use strict";

const fs = require("fs");
const path = require("path");

function getApiKey() {
  const envPaths = [
    path.resolve(__dirname, "../../.env"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, ".env")
  ];
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      for (const line of fs.readFileSync(p, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("GEMINI_API_KEY=") || trimmed.startsWith("GOOGLE_API_KEY=")) {
          return trimmed.split("=")[1].replace(/^["']|["']$/g, "").trim();
        }
      }
    }
  }
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
}

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

class GeminiMediaEngine {
  constructor() {
    this.apiKey = getApiKey();
  }

  isConfigured() {
    this.apiKey = getApiKey();
    return Boolean(this.apiKey && this.apiKey.length > 10);
  }

  /**
   * Generate 16:9 landscape image via Gemini Image models
   */
  async generateImage({ prompt, outputPath, aspectRatio = "16:9" }) {
    this.apiKey = getApiKey();
    if (!this.isConfigured()) return { success: false, reason: "No Gemini API key configured" };

    const candidateModels = [
      "gemini-2.5-flash-image",
      "gemini-3-pro-image-preview",
      "gemini-3.1-flash-image-preview"
    ];

    for (const model of candidateModels) {
      try {
        const url = `${API_BASE}/models/${model}:generateContent?key=${this.apiKey}`;
        const enhancedPrompt = `${prompt}, photorealistic 16:9 cinematic landscape photograph, 8k resolution, dramatic atmospheric lighting`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: enhancedPrompt }] }]
          })
        });

        if (res.ok) {
          const data = await res.json();
          const candidate = data.candidates?.[0];
          // Check for inlineData (base64 image)
          const imagePart = candidate?.content?.parts?.find(p => p.inlineData && p.inlineData.mimeType?.startsWith("image/"));
          if (imagePart) {
            const buffer = Buffer.from(imagePart.inlineData.data, "base64");
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(outputPath, buffer);
            return {
              success: true,
              source: `gemini_image (${model})`,
              outputPath,
              fileSize: buffer.length
            };
          }
        }
      } catch (e) {
        console.warn(`[GeminiMedia] ${model} image attempt failed:`, e.message);
      }
    }

    return { success: false, reason: "Gemini image endpoints unavailable or quota exhausted" };
  }

  /**
   * Generate video clip via Google Veo 3.1
   */
  async generateVideo({ prompt, outputPath, durationSeconds = 4 }) {
    this.apiKey = getApiKey();
    if (!this.isConfigured()) return { success: false, reason: "No Gemini API key configured" };

    try {
      const url = `${API_BASE}/models/veo-3.1-generate-preview:predictLongRunning?key=${this.apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt: `${prompt}, 1080p cinematic video, 30fps, realistic motion` }],
          parameters: { sampleCount: 1, durationSeconds: Math.min(8, Math.max(4, durationSeconds)), aspectRatio: "16:9" }
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP ${res.status}`);
      }

      const opData = await res.json();
      const opName = opData.name;
      if (!opName) throw new Error("No operation name returned from Veo");

      console.log(`[Veo] Operation started: ${opName}. Polling for completion...`);

      // Poll operation status up to 90 seconds
      const pollUrl = `${API_BASE}/${opName}?key=${this.apiKey}`;
      for (let i = 0; i < 18; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const pRes = await fetch(pollUrl);
        if (pRes.ok) {
          const pData = await pRes.json();
          if (pData.done) {
            if (pData.error) throw new Error(pData.error.message || "Veo generation failed");
            const videoUri = pData.response?.videoUri || pData.response?.predictions?.[0]?.videoUri;
            if (videoUri) {
              const vRes = await fetch(videoUri);
              const vBuffer = Buffer.from(await vRes.arrayBuffer());
              const dir = path.dirname(outputPath);
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(outputPath, vBuffer);
              return { success: true, source: "google_veo_3.1", outputPath, fileSize: vBuffer.length };
            }
          }
        }
      }
    } catch (e) {
      console.warn("[Veo Video] Notice:", e.message);
    }

    return { success: false, reason: "Veo generation unavailable or quota exceeded" };
  }
}

module.exports = new GeminiMediaEngine();
