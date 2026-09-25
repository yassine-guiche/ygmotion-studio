"use strict";

/**
 * Script-to-Visuals Engine (Documentary & POV Specialist)
 * Generates bespoke, sentence-specific visual prompts tailored to each narrative chunk,
 * supporting MagnatesMedia, Fern, James Jani, and @ranksofficiel visual formats.
 */

const fs = require("fs");
const path = require("path");

class ScriptToVisualsEngine {
  constructor() {
    this.visualKeywords = {
      tension: ["dark overpass", "shadows", "flashlight beam", "rearview mirror", "cold breath", "shaking hands"],
      action: ["spinning tires", "gravel flying", "flashing red and blue lights", "sirens blaring", "sprint"],
      investigation: ["classified FBI file folder", "newspaper cutout headline", "forensic evidence tag", "microfilm", "surveillance photo"],
      wealth_power: ["glossy mahogany desk", "pinstripe tailored suit", "skyscrapers at dusk", "whiskey glass with ice", "champagne bottle"],
      underground: ["green terminal text on dark CRT monitor", "dark server room", "neon backlit alleyway", "hooded figure", "cash stacks"]
    };
  }

  /**
   * Generates tailored visual prompts for a list of script chunks.
   * @param {Array<{text: string, partId: number, duration: number}>} chunks 
   * @param {Object} projectProfile (channel profile with visualPipeline, defaultStylePrompt, tag)
   * @returns {Array} List of enriched shots
   */
  generateShotsFromScript(chunks, projectProfile = {}) {
    const pipeline = projectProfile.visualPipeline || "realistic_cinematic";
    const baseStyle = projectProfile.defaultStylePrompt || "Cinematic photograph, 35mm film, dramatic lighting, 8k";
    const category = projectProfile.category || "documentary";

    return chunks.map((chunk, index) => {
      const shotId = `shot_${String(index + 1).padStart(3, "0")}`;
      const text = chunk.text || "";
      const duration = chunk.duration || 5.0;

      const visualPrompt = this._craftPromptForText(text, baseStyle, pipeline, category);
      const visualType = this._determineVisualType(text, pipeline);

      return {
        shotId,
        partId: chunk.partId || 1,
        duration: parseFloat(duration.toFixed(2)),
        text,
        visualPrompt,
        visualType,
        customFile: null,
        dnaLocked: true
      };
    });
  }

  _craftPromptForText(text, baseStyle, pipeline, category) {
    const lower = text.toLowerCase();
    let subjectDetail = "";

    // 1. Specialized by Pipeline: Stickman
    if (pipeline === "stickman_2d") {
      if (lower.includes("police") || lower.includes("cop")) {
        subjectDetail = "Stickman police officer with cartoon blue cap and flashing red siren drawn on chalkboard";
      } else if (lower.includes("car") || lower.includes("drive")) {
        subjectDetail = "Stick figure driving minimalist 2D line-art car, hands gripping steering wheel, dark background";
      } else if (lower.includes("sweat") || lower.includes("fear") || lower.includes("scared")) {
        subjectDetail = "Stick figure with exaggerated terrified eyes, giant sweat droplets bursting out, comedic horror expression";
      } else if (lower.includes("bag") || lower.includes("cocaine") || lower.includes("money")) {
        subjectDetail = "Stick figure pointing in shock at a black gym bag prop with bright yellow question mark overlay";
      } else {
        subjectDetail = "Minimalist 2D stick figure in dynamic storytelling pose, clean expressive line art";
      }
      return `${baseStyle}, ${subjectDetail}, high retention, clean framing`;
    }

    // 2. Specialized by Pipeline: Ranks POV
    if (pipeline === "cyber_pov") {
      if (lower.includes("car") || lower.includes("drive") || lower.includes("highway")) {
        subjectDetail = "First-person POV hands on sports steering wheel, dark highway ahead, neon speedometer HUD overlay";
      } else if (lower.includes("police") || lower.includes("cop") || lower.includes("lights")) {
        subjectDetail = "POV looking in rearview mirror, blinding red and blue strobe lights reflecting on driver's face, tension vignette";
      } else if (lower.includes("bag") || lower.includes("whisper") || lower.includes("contraband")) {
        subjectDetail = "POV looking down at passenger footwell, mysterious dark duffel bag, Level 1 Contraband HUD badge on screen";
      } else {
        subjectDetail = "Immersive first-person POV shot, high-contrast atmospheric cinematic lighting, dramatic angle";
      }
      return `${baseStyle}, ${subjectDetail}, photorealistic, Unreal Engine 5 render aesthetic`;
    }

    // 3. Specialized by Pipeline: Visual Documentary (MagnatesMedia / Fern)
    if (pipeline === "archival_documentary") {
      if (lower.includes("year") || lower.includes("history") || lower.includes("life") || lower.includes("job")) {
        subjectDetail = "Vintage archival photograph with warm sepia grain, subtle 2.5D parallax push-in, newspaper article collage in background";
      } else if (lower.includes("money") || lower.includes("business") || lower.includes("company") || lower.includes("warehouse")) {
        subjectDetail = "Dark corporate investigative setup, top-down isometric 3D lighting, blueprints and financial documents scattered on desk";
      } else if (lower.includes("police") || lower.includes("investigation") || lower.includes("prison") || lower.includes("federal")) {
        subjectDetail = "Classified forensic evidence folder, stamped with red TOP SECRET text, polaroid photo pinned with red string connection";
      } else {
        subjectDetail = "Cinematic documentary visual, dramatic lighting, subtle 2.5D depth map, rich archival texture";
      }
      return `${baseStyle}, ${subjectDetail}, Masterpiece, 8k resolution`;
    }

    // 4. Default: Realistic Cinematic
    if (lower.includes("police") || lower.includes("trooper") || lower.includes("lights")) {
      subjectDetail = "Blinding red and blue emergency police cruiser strobe lights illuminating rainy dark asphalt, heavy mist";
    } else if (lower.includes("bag") || lower.includes("cocaine") || lower.includes("gym")) {
      subjectDetail = "Close-up macro of black nylon gym bag on car floorboard, zipper slightly open, harsh flashlight beam cutting through shadow";
    } else if (lower.includes("car") || lower.includes("civic") || lower.includes("highway")) {
      subjectDetail = "Empty Route 9 interstate highway at 2am, car headlights cutting through dark overpass, moody cinematic film still";
    } else if (lower.includes("window") || lower.includes("license") || lower.includes("wallet")) {
      subjectDetail = "Nervous trembling hands holding driver's license at car window, harsh thousand-lumen flashlight beam reflecting on glass";
    } else {
      subjectDetail = "Cinematic narrative shot, atmospheric lighting, anamorphic lens flare, moody color grading";
    }

    return `${baseStyle}, ${subjectDetail}, 35mm film still, photorealistic`;
  }

  _determineVisualType(text, pipeline) {
    if (pipeline === "stickman_2d") return "stickman_frame";
    if (pipeline === "cyber_pov") return "pov_frame";
    if (pipeline === "archival_documentary") return "archival_frame";
    return "ai_consistent";
  }
}

module.exports = new ScriptToVisualsEngine();
