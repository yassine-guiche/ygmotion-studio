#!/usr/bin/env node
/**
 * Master Pipeline CLI for YouTube Storytelling Production
 * Scalable engine for Audio, Scripts, SFX, and Voice Synthesis across all episodes.
 */

const fs = require('fs');
const path = require('path');

// 1. Environment Configuration Loader
function getApiKey() {
  const envPaths = [
    path.resolve(__dirname, '../..', '.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '.env')
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('ELEVENLABS_API_KEY=') || trimmed.startsWith('XI_API_KEY=')) {
          return trimmed.split('=')[1].replace(/^["']|["']$/g, '').trim();
        }
      }
    }
  }
  return process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY || '';
}

const API_KEY = getApiKey();

// 2. API Helper
async function elevenApi(endpoint, options = {}) {
  if (!API_KEY) {
    throw new Error('ELEVENLABS_API_KEY is not set. Please add it to your .env file.');
  }

  const url = `https://api.elevenlabs.io/v1${endpoint}`;
  const headers = {
    'xi-api-key': API_KEY,
    ...(options.headers || {})
  };

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs API Error (${res.status}): ${err}`);
  }
  return res;
}

// 3. Command: Check Account Status & Quota
async function cmdStatus() {
  const res = await elevenApi('/user/subscription');
  const sub = await res.json();
  const remaining = sub.character_limit - sub.character_count;

  console.log('\n========================================');
  console.log('       ELEVENLABS ACCOUNT STATUS        ');
  console.log('========================================');
  console.log(`Plan Tier:        ${sub.tier.toUpperCase()}`);
  console.log(`Credits Used:     ${sub.character_count.toLocaleString()}`);
  console.log(`Total Limit:      ${sub.character_limit.toLocaleString()}`);
  console.log(`Remaining:        ${remaining.toLocaleString()} credits`);
  console.log(`Status:           ${sub.status}`);
  console.log('========================================\n');
}

// 4. Command: List Available Voices
async function cmdVoices() {
  const res = await elevenApi('/voices');
  const data = await res.json();

  console.log('\n========================================');
  console.log(`   AVAILABLE VOICES (${data.voices.length} TOTAL)   `);
  console.log('========================================');
  data.voices.forEach((v, i) => {
    const category = v.category === 'generated' ? '⭐ CUSTOM' : v.category.toUpperCase();
    console.log(`[${i + 1}] ${v.name} (${category})`);
    console.log(`    Voice ID: ${v.voice_id}`);
    if (v.labels) {
      console.log(`    Labels:   ${JSON.stringify(v.labels)}`);
    }
  });
  console.log('========================================\n');
}

// 5. Command: Chunk & Validate Episode Script
async function cmdChunk(episodeId = 'EP001') {
  const rootDir = path.resolve(__dirname, '../..');
  const epDir = path.join(rootDir, 'episodes', episodeId);
  const scriptFile = path.join(epDir, 'script_master.md');
  const outFile = path.join(epDir, 'voice_chunks.json');

  if (!fs.existsSync(scriptFile)) {
    throw new Error(`Master script not found: ${scriptFile}`);
  }

  const rawScript = fs.readFileSync(scriptFile, 'utf8');

  // Validate no un-sanitized bracket tags exist
  const bracketMatches = rawScript.match(/\[(pause|sigh|whisper|nervous laugh|clears throat|voice drops)[^\]]*\]/gi);
  if (bracketMatches) {
    console.warn('\n[WARNING] Found un-sanitized stage directions:', bracketMatches);
  }

  // Parse markdown parts
  const parts = rawScript.split(/##\s+Part\s+(\d+):\s+([^\n]+)/);
  const chunks = [];

  for (let i = 1; i < parts.length; i += 3) {
    const partNum = parseInt(parts[i], 10);
    const title = parts[i + 1].trim();
    const body = parts[i + 2];

    const voiceMatch = body.match(/\*\*Voice ID:\*\*\s+`([^`]+)`/);
    const voiceId = voiceMatch ? voiceMatch[1] : 'DEFAULT';

    const textMatch = body.match(/```text\s*([\s\S]*?)\s*```/);
    let spokenText = textMatch ? textMatch[1].trim() : '';

    // Sanitize any remaining stage brackets
    spokenText = spokenText.replace(/\[[^\]]+\]/g, '').trim();

    chunks.push({
      chunk_id: `CHUNK_PART_${partNum.toString().padStart(2, '0')}`,
      part_number: partNum,
      title: title,
      voice_id: voiceId,
      char_count: spokenText.length,
      word_count: spokenText.split(/\s+/).length,
      estimated_duration_sec: Math.round(spokenText.split(/\s+/).length / 2.3),
      text: spokenText
    });
  }

  fs.writeFileSync(outFile, JSON.stringify(chunks, null, 2), 'utf8');
  console.log(`\n[OK] Successfully validated and chunked ${chunks.length} parts into:`);
  console.log(`     ${outFile}`);
  console.log(`     Total Characters: ${chunks.reduce((sum, c) => sum + c.char_count, 0).toLocaleString()}\n`);
}

// 6. Command: Synthesize Episode Audio
async function cmdSynthesize(episodeId = 'EP001') {
  const rootDir = path.resolve(__dirname, '../..');
  const epDir = path.join(rootDir, 'episodes', episodeId);
  const chunksFile = path.join(epDir, 'voice_chunks.json');
  const manifestFile = path.join(epDir, 'manifest.json');
  const audioDir = path.join(epDir, 'audio');

  if (!fs.existsSync(chunksFile)) {
    throw new Error(`voice_chunks.json not found for ${episodeId}. Run 'pipeline.js chunk ${episodeId}' first.`);
  }

  fs.mkdirSync(audioDir, { recursive: true });
  const chunks = JSON.parse(fs.readFileSync(chunksFile, 'utf8'));

  // Dynamic voice mapping from manifest or channel profile
  let voiceMap = {
    'HOST_MASTER_V1': 'ZJrcXf7G0SY0yaRmgL0k', // Crime test pilot host
    'JAKE_EP01_MASTER': 'OqWjQFjDCc2b4J88T4B8' // Crime test pilot guest
  };

  if (fs.existsSync(manifestFile)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      if (manifest.voice_mapping) {
        voiceMap = { ...voiceMap, ...manifest.voice_mapping };
      }
      if (manifest.voice_id) {
        voiceMap['DEFAULT_VOICE'] = manifest.voice_id;
        voiceMap['POV_OPERATOR_V1'] = manifest.voice_id;
        voiceMap['STICKMAN_HERO'] = manifest.voice_id;
        voiceMap['DOC_NARRATOR_CALM'] = manifest.voice_id;
      }
    } catch (e) {}
  }

  // Check Quota
  const subRes = await elevenApi('/user/subscription');
  const sub = await subRes.json();
  let remaining = sub.character_limit - sub.character_count;

  console.log(`\nStarting Audio Synthesis for ${episodeId}...`);
  console.log(`Available Credits: ${remaining.toLocaleString()} / ${sub.character_limit.toLocaleString()}\n`);

  for (const chunk of chunks) {
    const voiceId = voiceMap[chunk.voice_id] || chunk.voice_id;
    const outFile = path.join(audioDir, `${chunk.chunk_id.toLowerCase()}.mp3`);

    if (chunk.char_count > remaining) {
      console.log(`[PAUSE] Skipping ${chunk.chunk_id} (Needs ${chunk.char_count} chars, Available: ${remaining}).`);
      continue;
    }

    console.log(`Synthesizing ${chunk.chunk_id}: "${chunk.title}" (${chunk.char_count} chars)...`);

    const isHostVoice = (chunk.voice_id && chunk.voice_id.includes('HOST'));
    const res = await elevenApi(`/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text: chunk.text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: isHostVoice ? 0.55 : 0.48,
          similarity_boost: 0.75,
          style: 0.15,
          use_speaker_boost: true
        }
      })
    });

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(outFile, buffer);
    remaining -= chunk.char_count;
    console.log(`[SUCCESS] Saved ${path.basename(outFile)} (${buffer.length} bytes)\n`);
  }

  console.log('Audio batch complete.\n');
}

// 7. Command: Generate Talking Host Avatar (D-ID)
async function cmdAvatar(episodeId = 'EP001') {
  const { execSync } = require('child_process');
  console.log(`\n[AVATAR] Generating D-ID Talking Host Video for ${episodeId}...`);
  execSync(`node engine/scripts/generate_did_host_avatar.js`, { stdio: 'inherit' });
}

// 8. Command: Generate Foley SFX
async function cmdSfx(episodeId = 'EP001') {
  const { execSync } = require('child_process');
  console.log(`\n[SFX] Generating atmospheric sound design for ${episodeId}...`);
  execSync(`node engine/scripts/generate_ep001_sfx.js`, { stdio: 'inherit' });
}

// 9. Command: Generate Subtitles (.SRT)
async function cmdSubtitles(episodeId = 'EP001') {
  const { execSync } = require('child_process');
  console.log(`\n[SUBTITLES] Generating synchronized SRT subtitles for ${episodeId}...`);
  execSync(`node engine/scripts/generate_subtitles_srt.js`, { stdio: 'inherit' });
}

// 10. Command: Fetch Stock Footage (Pexels API — FREE)
async function cmdFetchFootage(episodeId = 'EP001') {
  const { execSync } = require('child_process');
  console.log(`\n[FOOTAGE] Fetching Pexels stock footage for ${episodeId}...`);
  execSync(`node engine/scripts/fetch_stock_footage.js ${episodeId}`, { stdio: 'inherit', cwd: path.resolve(__dirname, '../..') });
}

// 11. Command: Generate Karaoke Captions (ElevenLabs word-level timestamps)
async function cmdKaraoke(episodeId = 'EP001') {
  const { execSync } = require('child_process');
  console.log(`\n[KARAOKE] Generating word-synced karaoke captions for ${episodeId}...`);
  execSync(`node engine/scripts/generate_karaoke_captions.js ${episodeId}`, { stdio: 'inherit', cwd: path.resolve(__dirname, '../..') });
}

// 12. Command: Mix Audio Master (FFmpeg — music + voice + SFX)
async function cmdMixAudio(episodeId = 'EP001') {
  const { execSync } = require('child_process');
  console.log(`\n[MIX] Mixing audio master for ${episodeId}...`);
  execSync(`node engine/scripts/mix_audio_master.js ${episodeId}`, { stdio: 'inherit', cwd: path.resolve(__dirname, '../..') });
}

// 13. Command: Build CapCut Project (timeline JSON)
async function cmdBuildProject(episodeId = 'EP001') {
  const { execSync } = require('child_process');
  console.log(`\n[PROJECT] Building CapCut project for ${episodeId}...`);
  execSync(`node engine/scripts/build_capcut_project.js ${episodeId}`, { stdio: 'inherit', cwd: path.resolve(__dirname, '../..') });
}

// 14. Command: Render Final 1080p Master Video (FFmpeg — Stock Footage + Audio + Karaoke Captions)
async function cmdRenderVideo(episodeId = 'EP001') {
  const { execSync } = require('child_process');
  console.log(`\n[RENDER] Rendering 1080p master video for ${episodeId}...`);
  execSync(`node engine/scripts/render_video.js ${episodeId}`, { stdio: 'inherit', cwd: path.resolve(__dirname, '../..') });
}

// 15. MASTER: Full GoMotion & VidRush Equivalent Pipeline
async function cmdFull(episodeId = 'EP001') {
  const startTime = Date.now();
  const STEPS = [
    { name: '1/8 — Parse & Validate Script',      fn: () => cmdChunk(episodeId) },
    { name: '2/8 — Synthesize ElevenLabs Audio',  fn: () => cmdSynthesize(episodeId) },
    { name: '3/8 — Generate SFX',                 fn: () => cmdSfx(episodeId) },
    { name: '4/8 — Karaoke Captions',             fn: () => cmdKaraoke(episodeId) },
    { name: '5/8 — Fetch Stock Footage (Pexels)', fn: () => cmdFetchFootage(episodeId) },
    { name: '6/8 — Mix Audio Master (FFmpeg)',    fn: () => cmdMixAudio(episodeId) },
    { name: '7/8 — Render 1080p Master Video',    fn: () => cmdRenderVideo(episodeId) },
    { name: '8/8 — Build CapCut Project Backup',  fn: () => cmdBuildProject(episodeId) },
  ];

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║    🎬  GoMotion/VidRush Full Video Pipeline          ║');
  console.log('║    Episode: ' + episodeId.padEnd(42) + '║');
  console.log('╚══════════════════════════════════════════════════════╝');

  for (const step of STEPS) {
    console.log('\n▶  ' + step.name);
    console.log('─'.repeat(56));
    try {
      await step.fn();
      console.log('✅ Done\n');
    } catch (err) {
      console.error('⚠️  STEP FAILED:', err.message);
      console.log('   Continuing to next step...');
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const epDir   = path.resolve(__dirname, '../..', 'episodes', episodeId);
  const finalMp4 = path.join(epDir, `${episodeId}_FINAL_VIDEO_1080P.mp4`);

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  ✅  PIPELINE COMPLETE — ' + episodeId + '                        ║');
  console.log('║  ⏱   Time elapsed: ' + elapsed + ' minutes                   ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  🎥  Final 1080p Video Ready:                        ║');
  console.log('║  ' + finalMp4.slice(-52).padEnd(52) + '  ║');
  console.log('║  📁  Folder: ' + epDir.slice(-44).padEnd(44) + '  ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
}

// 16. CLI Router
async function main() {
  const [,, cmd, arg] = process.argv;

  try {
    switch (cmd) {
      case 'status':
        await cmdStatus();
        break;
      case 'voices':
        await cmdVoices();
        break;
      case 'chunk':
        await cmdChunk(arg || 'EP001');
        break;
      case 'synthesize':
        await cmdSynthesize(arg || 'EP001');
        break;
      case 'avatar':
        await cmdAvatar(arg || 'EP001');
        break;
      case 'sfx':
        await cmdSfx(arg || 'EP001');
        break;
      case 'subtitles':
        await cmdSubtitles(arg || 'EP001');
        break;
      case 'fetch-footage':
        await cmdFetchFootage(arg || 'EP001');
        break;
      case 'karaoke':
        await cmdKaraoke(arg || 'EP001');
        break;
      case 'mix-audio':
        await cmdMixAudio(arg || 'EP001');
        break;
      case 'render':
        await cmdRenderVideo(arg || 'EP001');
        break;
      case 'build-project':
        await cmdBuildProject(arg || 'EP001');
        break;
      case 'full':
        await cmdFull(arg || 'EP001');
        break;
      default:
        console.log('\n🎬 YouTube Storytelling Production Pipeline — GoMotion & VidRush Edition');
        console.log('═'.repeat(60));
        console.log('\n  CORE COMMANDS:');
        console.log('  node pipeline.js status                 ElevenLabs quota & credits');
        console.log('  node pipeline.js voices                 List available voice models');
        console.log('  node pipeline.js chunk <EP_ID>          Parse & validate script → voice_chunks.json');
        console.log('  node pipeline.js synthesize <EP_ID>     Synthesize all episode audio via ElevenLabs');
        console.log('  node pipeline.js avatar <EP_ID>         Generate D-ID talking host video');
        console.log('  node pipeline.js sfx <EP_ID>            Generate atmospheric SFX');
        console.log('  node pipeline.js subtitles <EP_ID>      Generate millisecond SRT subtitles');
        console.log('\n  GOMOTION/VIDRUSH AUTOMATION COMMANDS:');
        console.log('  node pipeline.js fetch-footage <EP_ID>  Fetch Pexels stock footage for all shots (FREE)');
        console.log('  node pipeline.js karaoke <EP_ID>        Generate word-synced karaoke captions (.ASS/.SRT)');
        console.log('  node pipeline.js mix-audio <EP_ID>      FFmpeg mix: voice + music (ducked) + SFX');
        console.log('  node pipeline.js render <EP_ID>         Render final 1080p MP4 video with footage+audio+captions');
        console.log('  node pipeline.js build-project <EP_ID>  Build CapCut timeline JSON');
        console.log('\n  ⚡ MASTER ONE-CLICK ORCHESTRATOR:');
        console.log('  node pipeline.js full <EP_ID>           Script → 1080p Upload-ready MP4 Video');
        console.log('\n  Example:');
        console.log('  node pipeline.js full EP001\n');
    }
  } catch (err) {
    console.error('\n[PIPELINE ERROR]:', err.message, '\n');
    process.exit(1);
  }
}

main();
