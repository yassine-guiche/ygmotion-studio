/**
 * gemini_engine.js - High-Speed Cloud AI Engine powered by Google Gemini
 * 
 * Provides:
 *   - Sub-second episodic script generation with cinematic visual prompts
 *   - Automatic multi-model fallback chain (gemini-flash-latest -> gemini-flash-lite-latest -> gemini-3-flash-preview)
 *   - Channel DNA extraction & niche analysis
 *   - AI Co-Director interactive chat
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
      const content = fs.readFileSync(p, "utf8");
      for (const line of content.split("\n")) {
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
const CANDIDATE_MODELS = [
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-3-flash-preview"
];

class GeminiEngine {
  constructor() {
    this.apiKey = getApiKey();
  }

  isAvailable() {
    this.apiKey = getApiKey();
    return Boolean(this.apiKey && this.apiKey.length > 10);
  }

  async getStatus() {
    this.apiKey = getApiKey();
    if (!this.isAvailable()) {
      return { online: false, reason: "GEMINI_API_KEY not configured in .env" };
    }

    for (const model of CANDIDATE_MODELS) {
      try {
        const url = `${API_BASE}/models/${model}?key=${this.apiKey}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          return {
            online: true,
            model,
            displayName: data.displayName || "Google Gemini Cloud Engine",
            tier: "cloud_accelerated"
          };
        }
      } catch {}
    }

    return { online: false, reason: "Could not reach Gemini endpoints" };
  }

  /**
   * Resilient content generation with model fallback chain
   */
  async generateContent(prompt, options = {}) {
    this.apiKey = getApiKey();
    if (!this.isAvailable()) {
      throw new Error("GEMINI_API_KEY not set in .env");
    }

    const modelsToTry = options.model ? [options.model, ...CANDIDATE_MODELS] : CANDIDATE_MODELS;
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        const url = `${API_BASE}/models/${modelName}:generateContent?key=${this.apiKey}`;
        const body = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: options.temperature !== undefined ? options.temperature : 0.6,
            maxOutputTokens: options.maxTokens || 2500
          }
        };

        if (options.jsonMode) {
          body.generationConfig.responseMimeType = "application/json";
        }

        if (options.systemInstruction) {
          body.systemInstruction = {
            parts: [{ text: options.systemInstruction }]
          };
        }

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });

        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) return { text, modelUsed: modelName };
        } else {
          const errText = await res.text();
          lastError = new Error(`Gemini ${modelName} error (${res.status}): ${errText.slice(0, 200)}`);
        }
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error("All Gemini candidate models failed");
  }

  /**
   * Generates a high-retention 6-8 scene episodic script
   */
  async generateScript({ blueprint, topic, pacingWpm = 160, targetDurationMin = 3 }) {
    const archetype = blueprint?.nicheInsights?.archetype || "crime_suspense";
    const title = typeof topic === "string" ? topic : topic?.title || "Untold Mystery";
    const hookContext = topic?.hook || "";

    const systemPrompt = `You are the lead storytelling director for YGMotion Studio V3.
You specialize in viral, high-retention YouTube storytelling (True Crime, Bodycam, Documentaries, POV thrillers).
Rules:
- Write an intensely gripping 8-scene episodic narrative script.
- Pacing: ${pacingWpm} words per minute.
- Hook within the first 5 seconds.
- Every scene must have a vivid, photorealistic 16:9 visual description suitable for Midjourney / SDXL image generation.
- Return ONLY a valid JSON array of 8 scene objects matching this exact schema:
[
  {
    "partIndex": 1,
    "title": "Scene 1: The Cold Hook",
    "text": "2 to 4 gripping sentences of spoken voiceover narration...",
    "visualPrompt": "Photorealistic 16:9 cinematic visual prompt, camera angle, atmospheric lighting, 8k resolution, color grade...",
    "cameraMotion": "push_in",
    "audioMood": "dark_suspense_drone"
  }
]
Camera motion options: push_in, zoom_out, pan_left_right, tilt_up_down, parallax_float, camera_shake.
Audio mood options: dark_suspense_drone, police_siren_echo, tense_heartbeat, low_frequency_hum, dramatic_stinger.`;

    const userPrompt = `Generate a master 8-scene video script for:
Title: "${title}"
Genre/Archetype: ${archetype}
Initial Premise/Hook: "${hookContext}"
Target Duration: ~${targetDurationMin} minutes.`;

    const { text: rawJson, modelUsed } = await this.generateContent(userPrompt, {
      systemInstruction: systemPrompt,
      jsonMode: true,
      temperature: 0.5
    });

    let scenes = [];
    try {
      scenes = JSON.parse(rawJson);
    } catch {
      const match = rawJson.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (match) scenes = JSON.parse(match[0]);
    }

    if (!Array.isArray(scenes) || scenes.length === 0) {
      throw new Error("Gemini returned invalid scene array format");
    }

    // Normalize word counts & durations
    const normalizedScenes = scenes.map((s, idx) => {
      const words = (s.text || "").trim().split(/\s+/).filter(Boolean).length;
      const durSec = Math.max(3.5, Math.round(words / (pacingWpm / 60)));
      return {
        partIndex: s.partIndex || (idx + 1),
        title: s.title || `Scene ${idx + 1}`,
        text: s.text || "",
        visualPrompt: s.visualPrompt || s.text,
        cameraMotion: s.cameraMotion || "push_in",
        audioMood: s.audioMood || "dark_suspense_drone",
        wordsCount: words,
        estimatedDurationSec: durSec
      };
    });

    const totalWords = normalizedScenes.reduce((acc, s) => acc + s.wordsCount, 0);
    const totalDurationSec = Math.round(totalWords / (pacingWpm / 60));

    return {
      title,
      archetype,
      pacingWpm,
      totalWords,
      estimatedDurationSec: totalDurationSec,
      scenes: normalizedScenes,
      generatedBy: `gemini (${modelUsed})`
    };
  }

  /**
   * AI Co-Director interactive chat
   */
  async chat({ message, history = [], currentProject = null, activeEpisode = null }) {
    const sysPrompt = `You are Antigravity AI Co-Director in YGMotion Studio V3.
You help video creators craft viral scripts, design 2.5D camera motions, analyze YouTube retention, and engineer hooks.
Current Channel: ${currentProject?.name || "Deep Investigative Dossier"} (${currentProject?.category || "crime_suspense"}).
Active Episode: ${activeEpisode || "EP001"}.
Be concise, punchy, and actionable. Use cinematic terminology (dolly-in, split-second pacing, cold open, focal anchor).`;

    let convo = "";
    for (const h of history.slice(-6)) {
      convo += `${h.role === "user" ? "Creator" : "Director"}: ${h.text}\n`;
    }
    convo += `Creator: ${message}\nDirector:`;

    const { text: reply } = await this.generateContent(convo, {
      systemInstruction: sysPrompt,
      temperature: 0.7,
      maxTokens: 800
    });

    return reply.trim();
  }
}

module.exports = new GeminiEngine();
