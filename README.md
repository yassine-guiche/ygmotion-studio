# 🎬 YGMotion Studio V3 — Multi-Channel AI Video Engine

> **Automated AI Storytelling, YouTube Niche Analysis & Cinematic Video Production Platform**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.8%2B-blue.svg)](https://python.org/)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-Required-red.svg)](https://ffmpeg.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🌟 What is YGMotion?

**YGMotion Studio** is an all-in-one desktop production studio designed for creators running high-retention YouTube channels and faceless video series. 

Instead of being locked into a single format, YGMotion features a **Multi-Channel Platform Architecture**:
1. **Analyze Any YouTube Channel**: Input any YouTube channel URL (e.g. documentary channels, stickman storytelling, true crime, POV narrators) to scrape pacing, top hooks, transcripts, and aesthetic styling.
2. **Interactive Script Gate**: Generate structured 8-scene viral storytelling scripts with built-in human-in-the-loop review, inline editing, and approval.
3. **Voiceover & Sound Design**: Synthesize synced voiceovers with word-level karaoke timestamps using ElevenLabs or offline mock synthesis.
4. **Cinematic Motion Director**: Animate still images with 6 smooth camera motion profiles (slow zooms, pans, dynamic drifts) directly via FFmpeg.
5. **Character & Style Continuity**: Lock character face anchors and visual master styles across every scene to eliminate AI hallucinations.
6. **Dual Export**: Export fully mastered 1080p MP4 videos with auto-subtitles, or generate native **CapCut timeline draft folders** for manual fine-tuning.

---

## 🚀 Key Features

- 📁 **Project Launcher Hub**: Create new channel workspaces or switch between isolated projects (`crime_chronicles`, `stickman_confessions`, `ranks_pov_syndicate`, `deep_investigative_dossier`). Each has its own characters, assets, and styling.
- 🔍 **YouTube Channel Scraper**: Deep analysis of video titles, views, average length, thumbnail styles, and full video transcripts.
- ✍️ **Retention-Optimized Scriptwriting**: 8-stage psychological pacing framework (Hook, Inciting Incident, Escalation, False Dawn, Dark Night, Climax, Resolution, Payoff).
- 🎙️ **Voice Designer**: Preset voice personas (Dramatic Deep, Analytical Storyteller, Energetic POV, Calm Narrator) with speed and stability controls.
- 🎥 **FFmpeg Camera Motion Engine**: Turn static images into dynamic shots with `Slow Zoom In`, `Push In Drift`, `Pan Right`, `Dramatic Tilt Up`, `Orbit Drift`, or `Static Anchor`.
- ✂️ **CapCut Timeline Bridge**: Generate native CapCut project files (`draft_content.json`) with pre-cut footage tracks, voiceover tracks, and auto-captions.

---

## 📋 System Prerequisites

Before installing, ensure your machine has the following tools installed:

1. **Node.js (v18.0 or newer)**
   - Download & install from [nodejs.org](https://nodejs.org/)
   - Verify in terminal: `node -v`
2. **Python (v3.8 or newer)**
   - Download from [python.org](https://python.org/)
   - Verify in terminal: `python --version`
3. **FFmpeg** *(Required for video rendering & camera motion)*
   - **Windows**: Install via `winget install Gyan.FFmpeg` or download from [ffmpeg.org](https://ffmpeg.org/) and add the `bin` folder to your Windows `PATH`.
   - **macOS**: `brew install ffmpeg`
   - **Linux**: `sudo apt install ffmpeg`
   - Verify in terminal: `ffmpeg -version`
4. *(Optional)* **ElevenLabs API Key**: For real AI voiceovers (if omitted, the studio will use simulated audio files).

---

## 📦 Installation & Setup Guide

### 1. Clone the Repository
```bash
git clone https://github.com/yassine-guiche/ygmotion-studio.git
cd ygmotion-studio
```

### 2. Install Python Dependencies
The YouTube scraper requires the `youtube-transcript-api` package:
```bash
pip install -r requirements.txt
```

### 3. Configure Environment Variables
Copy the example environment configuration:
```bash
# On Windows (PowerShell):
cp .env.example .env

# On macOS / Linux:
cp .env.example .env
```

Open `.env` in any text editor and optionally add your API keys:
```env
# Optional: Real Voice Synthesis
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# Optional: Stock Footage Auto-Download
PEXELS_API_KEY=your_pexels_api_key_here

# Optional: Local Ollama LLM endpoint (default: http://127.0.0.1:11434)
OLLAMA_HOST=http://127.0.0.1:11434
```
*(Note: If you don't provide an ElevenLabs key, YGMotion will operate smoothly in preview/simulation mode).*

---

## 🏃 Running the Studio

Start the local production server:

```bash
npm start
```
*(Or run directly: `node studio/server.js`)*

Open your browser and navigate to:
```
http://localhost:3300
```

---

## 🖥️ Studio Workflow: Step-by-Step

```
┌─────────────────┐     ┌────────────────┐     ┌──────────────────┐
│  Launcher Hub   │ ──> │ YouTube Scraper│ ──> │   Script Gate    │
│ (Choose Project)│     │(Extract Niche) │     │ (Review & Edit)  │
└─────────────────┘     └────────────────┘     └──────────────────┘
                                                        │
┌─────────────────┐     ┌────────────────┐              ▼
│  Dual Export    │ <── │ Motion Engine  │ <── ┌──────────────────┐
│ (Video/CapCut)  │     │(Camera Profiles│     │  Voice Designer  │
└─────────────────┘     └────────────────┘     │  (Synced Audio)  │
                                               └──────────────────┘
```

### Step 1: Select or Create a Channel
On the **Home Launcher**, select an existing channel project (e.g. `Crime Chronicles`, `Stickman Confessions`, `Ranks POV Syndicate`) or click **+ New Channel Project** to define a custom niche and art style.

### Step 2: YouTube Channel Niche Ingestion
- Paste any YouTube Channel handle or link (e.g., `https://www.youtube.com/@ranksofficiel`).
- Click **Analyze Channel & Scrape Niche**.
- YGMotion will extract the channel's top videos, visual themes, hook structures, and sample transcripts to build an adapted style profile.

### Step 3: Script Generation & Human-in-the-Loop Gate
- Enter your episode premise or target title.
- Click **Generate 8-Scene Script**.
- The script is loaded into the **Script Editor Gate**. You can edit scene narration, visual prompts, sound effects, and emotional tone directly.
- Click **Approve & Lock Script** to proceed.

### Step 4: Voiceover & Sound Design
- Select a voice persona (or create a custom speaker).
- Click **Synthesize Voiceover Track**.
- The system generates the spoken audio with precise timing and word-level timestamps.

### Step 5: Scene Generation & Camera Motion
- Generate or upload image scenes using your locked character DNA and master art reference.
- Assign camera motion profiles to each scene:
  - **Slow Zoom In**: Deepens tension and intimacy.
  - **Push In Drift**: Cinematic reveal with subtle perspective angle.
  - **Pan Right**: Scans wide environments or maps.
  - **Dramatic Tilt Up**: High drama, towering characters or monuments.
  - **Orbit Drift**: Dreamy, reflective narrative beats.
  - **Static Anchor**: Fast-paced dialogue cuts.
- Click **Render Motion Shot** to create 1080p MP4 clips using FFmpeg.

### Step 6: Render & Export
- **One-Click Render**: Render the complete video with music, sound effects, and auto-generated karaoke subtitles.
- **Export to CapCut**: Click **Export CapCut Project** to generate a native folder that opens directly in CapCut Desktop with all tracks aligned.

---

## 📂 Project Architecture

```
ygmotion-studio/
├── studio/
│   ├── server.js              # High-performance native Node.js HTTP server & API
│   ├── brand_profile.json     # Global brand configuration
│   └── public/                # Web UI (Vanilla HTML/CSS/JS, no build step needed)
│       ├── index.html         # Studio interface & Project Launcher Hub
│       ├── style.css          # Rich modern dark-mode aesthetic
│       └── app.js             # Interactive client-side controller
├── engine/
│   ├── ai/                    # Script generation & viral hook algorithms
│   │   └── script_generator.js
│   ├── audio/                 # Voice synthesis, timing & sound FX
│   │   └── voice_designer.js
│   ├── motion/                # FFmpeg 6-axis camera motion synthesizer
│   │   └── motion_engine.js
│   ├── projects/              # Multi-channel workspace manager
│   │   └── project_manager.js
│   ├── scrapers/              # YouTube channel & transcript analyzer
│   │   ├── scrape_youtube.py
│   │   └── youtube_channel_analyzer.js
│   ├── styles/                # Character DNA locking & visual style reference
│   │   ├── character_continuity.js
│   │   └── style_manager.js
│   └── scripts/               # CapCut bridge, stock footage fetcher, composers
│       └── build_capcut_project.js
├── projects/                  # Channel workspaces (isolated per niche)
│   ├── crime_chronicles/
│   ├── deep_investigative_dossier/
│   ├── ranks_pov_syndicate/
│   └── stickman_confessions/
├── .env.example               # Template for API credentials
├── requirements.txt           # Python dependencies
└── package.json               # Project manifest
```

---

## 🛠️ Frequently Asked Questions & Troubleshooting

#### Q: `ffmpeg: command not found` or motion rendering fails
> **Solution**: Ensure FFmpeg is installed and added to your system's PATH. Open a new terminal and type `ffmpeg -version`. If it is not recognized, restart your terminal after updating PATH.

#### Q: YouTube scraper fails to retrieve transcripts
> **Solution**: Some YouTube videos do not have open closed-captions or are region-locked. The scraper falls back to video descriptions and titles if captions are unavailable. Ensure you have installed `pip install -r requirements.txt`.

#### Q: Can I run this without paid API keys?
> **Yes!** The studio is completely functional without paid APIs:
> - Voice synthesis generates local demo audio preview tracks.
> - Scripts can be generated via local **Ollama** or custom manual entry.
> - Video rendering and camera motion are executed **100% locally** via FFmpeg.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE). Built for high-volume YouTube creators and automated storytelling producers.
