/**
 * STYLE_MANAGER.JS
 * Manages style archetypes, generates ASS subtitle headers,
 * and supplies color grading filtergraphs for FFmpeg.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const STYLES_FILE = path.join(__dirname, "style_definitions.json");
function _loadStyles() {
  try {
    return JSON.parse(fs.readFileSync(STYLES_FILE, "utf8"));
  } catch (e) {
    return {};
  }
}

function getStyle(styleId = "crime_suspense") {
  const all = _loadStyles();
  return all[styleId] || all["crime_suspense"] || null;
}

function getAllStyles() {
  return _loadStyles();
}

function saveCustomStyle(styleData) {
  if (!styleData || !styleData.id) {
    throw new Error("Style ID is required.");
  }
  const all = _loadStyles();
  const safeId = styleData.id.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  all[safeId] = {
    id: safeId,
    name: styleData.name || safeId,
    description: styleData.description || "Custom Creator Style Blueprint",
    colorGrade: styleData.colorGrade || {
      filter: "eq=contrast=1.15:saturation=1.05:brightness=0.01",
      tone: styleData.tone || "Custom Palette",
      vignette: true
    },
    subtitles: styleData.subtitles || {
      fontName: styleData.fontFamily || "Montserrat ExtraBold",
      fontSize: 72,
      primaryColor: "&H00FFFFFF",
      highlightColor: "&H0000F0FF",
      outlineColor: "&H000B0C10",
      backColor: "&H80000000",
      outline: 4,
      shadow: 2,
      alignment: 2,
      marginV: 120
    },
    pacing: styleData.pacing || {
      avgShotDurationSec: 3.5,
      hookShotDurationSec: 2.0,
      motion: "kinetic_drift"
    },
    audioProfile: styleData.audioProfile || {
      musicMood: styleData.musicMood || "modern_cinematic_pulse",
      sfxTypes: styleData.sfxTypes || ["sub_impact", "whoosh", "heartbeat"],
      duckingDb: styleData.duckingDb || -16
    },
    voiceProfile: styleData.voiceProfile || {
      voiceId: styleData.voiceId || "CUSTOM_VOICE",
      voiceName: styleData.voiceName || "Custom Narrator",
      tone: styleData.tone || "Engaging",
      pacing: styleData.voicePacing || "moderate"
    },
    narratorMode: styleData.narratorMode || "voiceover_only",
    scriptFormula: styleData.scriptFormula || {
      structureName: "Custom Script Formula",
      instructions: "Custom narrative structure"
    },
    searchTags: styleData.searchTags || ["custom video", "cinematic"]
  };

  fs.writeFileSync(STYLES_FILE, JSON.stringify(all, null, 2), "utf8");
  return all[safeId];
}

function getFFmpegColorGradeFilter(styleId = "crime_suspense") {
  const style = getStyle(styleId);
  return (style && style.colorGrade) ? style.colorGrade.filter : "eq=contrast=1.15:saturation=0.85";
}

function buildASSHeaderForStyle(styleId = "crime_suspense") {
  const style = getStyle(styleId);
  const sub = (style && style.subtitles) ? style.subtitles : {
    fontName: "Montserrat ExtraBold",
    fontSize: 72,
    primaryColor: "&H00FFFFFF",
    highlightColor: "&H00FFE600",
    outlineColor: "&H00000000",
    backColor: "&H80000000",
    outline: 4,
    shadow: 2,
    alignment: 2,
    marginV: 120
  };

  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${sub.fontName},${sub.fontSize},${sub.primaryColor},${sub.highlightColor},${sub.outlineColor},${sub.backColor},-1,0,0,0,100,100,0,0,1,${sub.outline},${sub.shadow},${sub.alignment},80,80,${sub.marginV},1
Style: Highlight,${sub.fontName},${sub.fontSize},${sub.highlightColor},${sub.primaryColor},${sub.outlineColor},${sub.backColor},-1,0,0,0,100,100,0,0,1,${sub.outline},${sub.shadow},${sub.alignment},80,80,${sub.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}

module.exports = {
  getStyle,
  getAllStyles,
  saveCustomStyle,
  getFFmpegColorGradeFilter,
  buildASSHeaderForStyle
};
