#!/usr/bin/env node
/**
 * COLAB_ENGINE.JS — Google Colab CLI Integration Wrapper
 * Offload heavy AI video tasks, Whisper transcription, or GPU rendering to Google Colab.
 * Reference: https://developers.googleblog.com/introducing-the-google-colab-cli/
 */

"use strict";

const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const COLAB_BIN = path.join(process.env.USERPROFILE || "", ".local\\bin\\colab.exe");

function checkColab() {
  if (!fs.existsSync(COLAB_BIN)) {
    throw new Error(`Colab CLI executable not found at: ${COLAB_BIN}`);
  }
  try {
    const out = execSync(`"${COLAB_BIN}" --help`, { encoding: "utf8", stdio: "pipe" });
    return out.includes("Colab CLI");
  } catch (e) {
    return false;
  }
}

async function listSessions() {
  if (!checkColab()) throw new Error("Colab CLI is not ready");
  const out = execSync(`"${COLAB_BIN}" sessions`, { encoding: "utf8" });
  return out;
}

async function newSession(gpuType = "T4") {
  console.log(`[COLAB] Provisioning Google Colab session with --gpu ${gpuType}...`);
  const out = execSync(`"${COLAB_BIN}" new --gpu ${gpuType}`, { encoding: "utf8" });
  console.log(out);
  return out;
}

async function execRemote(scriptPath) {
  console.log(`[COLAB] Executing remote script: ${scriptPath}...`);
  const out = execSync(`"${COLAB_BIN}" exec -f "${scriptPath}"`, { encoding: "utf8" });
  console.log(out);
  return out;
}

async function downloadRemote(remoteFile, localDest) {
  console.log(`[COLAB] Downloading ${remoteFile} to ${localDest}...`);
  const out = execSync(`"${COLAB_BIN}" download "${remoteFile}" "${localDest}"`, { encoding: "utf8" });
  return out;
}

async function stopSession() {
  console.log(`[COLAB] Stopping active Colab session...`);
  const out = execSync(`"${COLAB_BIN}" stop`, { encoding: "utf8" });
  return out;
}

if (require.main === module) {
  const [,, cmd, arg] = process.argv;
  try {
    switch (cmd) {
      case "status":
      case "sessions":
        console.log(listSessions());
        break;
      case "new":
        newSession(arg || "T4");
        break;
      case "stop":
        stopSession();
        break;
      default:
        console.log("\n🚀 Google Colab CLI Integration Engine");
        console.log("Usage: node engine/scripts/colab_engine.js <sessions|new|stop> [gpuType]");
        console.log("Colab CLI path:", COLAB_BIN);
        console.log("CLI Verified:", checkColab() ? "READY ✅" : "ERROR ❌");
    }
  } catch (e) {
    console.error("[COLAB ERROR]:", e.message);
    process.exit(1);
  }
}

module.exports = {
  checkColab,
  newSession,
  execRemote,
  downloadRemote,
  stopSession,
  listSessions
};
