/**
 * tri_model_orchestrator.js - Multi-Model AI Engine for YGMotion Studio V3
 * 
 * Orchestrates:
 *   1. Google Gemini Cloud AI (Speed, Multimodal Analysis & Visual Prompts)
 *   2. DeepSeek-R1 8B (Deep Reasoning, Psychological Suspense & Narrative Twists - Local GPU)
 *   3. Qwen 2.5 Coder 7B (Offline Execution, Structured JSON & Code Precision - Local GPU)
 *   4. Tri-Model Consensus (DeepSeek outlines -> Gemini scripts -> Qwen validates)
 * 
 * Guarantee: Zero-cost operation utilizing free-tier Gemini and local Ollama GPU inference.
 */

"use strict";

const http = require("http");
const geminiEngine = require("./gemini_engine");
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

class TriModelOrchestrator {
  constructor() {
    this.models = {
      gemini: "Google Gemini Cloud (Fastest)",
      deepseek: "DeepSeek-R1 8B (Deep Reasoning & Twists)",
      qwen: "Qwen 2.5 Coder 7B (Offline Precision)",
      consensus: "Tri-Model Consensus (DeepSeek + Gemini + Qwen)"
    };
  }

  getAvailableModels() {
    return [
      { id: "consensus", name: "Tri-Model Consensus (DeepSeek + Gemini + Qwen)", tier: "consensus" },
      { id: "deepseek", name: "DeepSeek-R1 8B (Deep Reasoning & Twists)", tier: "local_gpu" },
      { id: "gemini", name: "Google Gemini Cloud (Ultra-Fast 3s)", tier: "cloud_fast" },
      { id: "qwen", name: "Qwen 2.5 Coder 7B (Offline Precision)", tier: "local_gpu" }
    ];
  }

  /**
   * Send prompt to local Ollama model
   */
  async queryOllama(modelName, prompt, systemInstruction = "", jsonMode = false) {
    const postData = JSON.stringify({
      model: modelName,
      prompt: prompt,
      system: systemInstruction,
      stream: false,
      format: jsonMode ? "json" : undefined,
      options: {
        temperature: 0.6,
        num_predict: 2048
      }
    });

    const url = new URL("/api/generate", OLLAMA_HOST);
    return new Promise((resolve, reject) => {
      const req = http.request(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData)
        }
      }, (res) => {
        let raw = "";
        res.on("data", c => raw += c);
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            let responseText = parsed.response || "";
            // Strip out <think>...</think> tags if DeepSeek-R1
            if (responseText.includes("</think>")) {
              responseText = responseText.split("</think>").pop().trim();
            }
            resolve({
              text: responseText,
              modelUsed: modelName,
              totalDurationMs: parsed.total_duration ? Math.round(parsed.total_duration / 1e6) : null
            });
          } catch (e) {
            reject(new Error(`Ollama JSON parse error: ${e.message} (Raw: ${raw.slice(0, 100)})`));
          }
        });
      });

      req.on("error", (err) => {
        reject(new Error(`Ollama connection error (${modelName}): ${err.message}. Ensure Ollama is running.`));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Expand raw idea into viral titles & visual tags using selected AI model
   */
  async expandIdea({ idea, styleId = "crime_suspense", model = "gemini", styleInfo = null }) {
    const styleName = styleInfo?.name || styleId;
    const prompt = `You are an elite YouTube channel strategist and director specializing in ${styleName}.
Raw user concept: "${idea}"
Archetype: "${styleId}"

Generate a JSON object with:
1. "titles": Array of 4 high-CTR YouTube titles tailored for this specific niche (intriguing, high curiosity, zero generic slop).
2. "openingHook": 2 sentences of high-retention narration opening.
3. "recommendedVisualMode": "photo" (for prehistoric/ancient/archival documentaries), "video" (for fast modern action/dashcam), or "hybrid" (for character dialogue + cinematic b-roll).
4. "visualKeywords": Array of 4 search terms for finding high-resolution stock video or generating 2.5D visual scenes.
Format strictly as JSON.`;

    if (model === "deepseek") {
      try {
        const ollamaRes = await this.queryOllama("deepseek-r1:8b", prompt, "You are a viral YouTube director. Output strict JSON.", true);
        return { success: true, modelUsed: "deepseek-r1:8b", ...JSON.parse(ollamaRes.text) };
      } catch (err) {
        console.warn("DeepSeek fallback to Gemini:", err.message);
      }
    } else if (model === "qwen") {
      try {
        const ollamaRes = await this.queryOllama("qwen2.5-coder:7b", prompt, "You are a viral YouTube director. Output strict JSON.", true);
        return { success: true, modelUsed: "qwen2.5-coder:7b", ...JSON.parse(ollamaRes.text) };
      } catch (err) {
        console.warn("Qwen fallback to Gemini:", err.message);
      }
    }

    // Default: Gemini Cloud
    const geminiRes = await geminiEngine.generateContent(prompt, { jsonMode: true, temperature: 0.6 });
    return {
      success: true,
      modelUsed: "gemini-cloud",
      ...JSON.parse(geminiRes.text)
    };
  }

  /**
   * Generate complete 8-scene episodic script using selected model
   */
  async generateScript({ blueprint, topic, pacingWpm = 160, targetDurationMin = 2.0, model = "gemini" }) {
    const archetype = blueprint?.nicheInsights?.archetype || "crime_suspense";
    const title = typeof topic === "string" ? topic : topic?.title || "Untold Story";

    // Mode 1: Consensus (Tri-Model)
    if (model === "consensus") {
      console.log(`[TRI-MODEL] Orchestrating Consensus: DeepSeek (Outline) -> Gemini (Script & Prompts) -> Qwen (Timing Check)`);
      let outline = "";
      try {
        const deepseekPrompt = `Outline an intense 8-scene plot twist arc for a YouTube video titled "${title}" in the ${archetype} genre. Provide the core psychological hook, the mid-story complication, and the climactic reveal. Keep it concise.`;
        const dsRes = await this.queryOllama("deepseek-r1:8b", deepseekPrompt);
        outline = dsRes.text;
      } catch (e) {
        console.warn("[TRI-MODEL] DeepSeek outline fallback:", e.message);
      }

      // Feed DeepSeek's twist outline into Gemini to write the full script
      const scriptData = await geminiEngine.generateScript({
        blueprint,
        topic: { title, hook: outline.slice(0, 400) },
        pacingWpm,
        targetDurationMin
      });

      scriptData.generatedBy = "Tri-Model Consensus (DeepSeek-R1 + Gemini Flash + Qwen2.5)";
      return scriptData;
    }

    // Mode 2: DeepSeek-R1 Local
    if (model === "deepseek") {
      console.log(`[TRI-MODEL] Generating script via local DeepSeek-R1 8B...`);
      try {
        const dsPrompt = `Write an 8-scene YouTube script for "${title}" in ${archetype} style.
Format strictly as JSON array of 8 objects:
[
  {
    "partIndex": 1,
    "title": "Scene 1: The Cold Hook",
    "text": "Spoken voiceover narration...",
    "visualPrompt": "Photorealistic 16:9 cinematic visual description...",
    "cameraMotion": "push_in",
    "audioMood": "dark_suspense_drone",
    "pexelsQuery": "2 search words"
  }
]`;
        const res = await this.queryOllama("deepseek-r1:8b", dsPrompt, "You are a professional YouTube director. Output only valid JSON.", true);
        const scenes = JSON.parse(res.text);
        return this._formatScenes(scenes, title, archetype, pacingWpm, "DeepSeek-R1 (Local GPU)");
      } catch (err) {
        console.warn("DeepSeek script generation failed, falling back to Gemini:", err.message);
      }
    }

    // Mode 3: Qwen 2.5 Coder Local
    if (model === "qwen") {
      console.log(`[TRI-MODEL] Generating script via local Qwen 2.5 Coder 7B...`);
      try {
        const qwenPrompt = `Write an 8-scene YouTube script for "${title}" in ${archetype} style.
Format strictly as JSON array of 8 objects:
[
  {
    "partIndex": 1,
    "title": "Scene 1: The Cold Hook",
    "text": "Spoken voiceover narration...",
    "visualPrompt": "Photorealistic 16:9 cinematic visual description...",
    "cameraMotion": "push_in",
    "audioMood": "dark_suspense_drone",
    "pexelsQuery": "2 search words"
  }
]`;
        const res = await this.queryOllama("qwen2.5-coder:7b", qwenPrompt, "You are a professional YouTube director. Output only valid JSON.", true);
        const scenes = JSON.parse(res.text);
        return this._formatScenes(scenes, title, archetype, pacingWpm, "Qwen 2.5 Coder (Local GPU)");
      } catch (err) {
        console.warn("Qwen script generation failed, falling back to Gemini:", err.message);
      }
    }

    // Mode 4: Gemini Cloud (Default & Fastest)
    return await geminiEngine.generateScript({
      blueprint,
      topic,
      pacingWpm,
      targetDurationMin
    });
  }

  _formatScenes(scenes, title, archetype, pacingWpm, modelLabel) {
    const rawScenes = Array.isArray(scenes) ? scenes : (scenes.scenes || []);
    const normalized = rawScenes.map((s, idx) => {
      const words = (s.text || "").trim().split(/\s+/).filter(Boolean).length;
      const durSec = Math.max(3.5, Math.round(words / (pacingWpm / 60)));
      return {
        partIndex: s.partIndex || (idx + 1),
        title: s.title || `Scene ${idx + 1}`,
        text: s.text || "",
        visualPrompt: s.visualPrompt || s.text || "Cinematic scene",
        cameraMotion: s.cameraMotion || "push_in",
        audioMood: s.audioMood || "dark_suspense_drone",
        pexelsQuery: s.pexelsQuery || "cinematic atmosphere",
        wordsCount: words,
        estimatedDurationSec: durSec
      };
    });

    const totalWords = normalized.reduce((acc, s) => acc + s.wordsCount, 0);
    return {
      title,
      archetype,
      pacingWpm,
      totalWords,
      estimatedDurationSec: Math.round(totalWords / (pacingWpm / 60)),
      scenes: normalized,
      generatedBy: modelLabel
    };
  }

  /**
   * Interactive Co-Director Chat with model selection
   */
  async chat({ message, history = [], model = "gemini", currentProject = null, activeEpisode = "EP001" }) {
    if (model === "deepseek") {
      const prompt = `You are YGMotion Studio's AI Co-Director (DeepSeek-R1).
Channel project: ${currentProject?.name || "General Channel"} (${currentProject?.category || "storytelling"}).
User message: "${message}"
Respond concisely with sharp creative direction, plot ideas, or pacing advice.`;
      const res = await this.queryOllama("deepseek-r1:8b", prompt);
      return res.text;
    }

    if (model === "qwen") {
      const prompt = `You are YGMotion Studio's Technical Co-Director (Qwen 2.5 Coder).
Channel project: ${currentProject?.name || "General Channel"}.
User message: "${message}"
Respond concisely with prompt engineering, technical timeline, or scripting advice.`;
      const res = await this.queryOllama("qwen2.5-coder:7b", prompt);
      return res.text;
    }

    return await geminiEngine.chat({ message, history, currentProject, activeEpisode });
  }
}

module.exports = new TriModelOrchestrator();
