/**
 * D-ID Studio Avatar Generator
 * Connects the Channel's Host Character with ElevenLabs Master Voice
 * to generate realistic lip-synced talking host video clips.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

(() => {
  try {
    const envPath = path.resolve(__dirname, '../../.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      lines.forEach(l => {
        const match = l.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2].trim();
        }
      });
    }
  } catch(e) {}
})();

const DID_API_KEY = process.env.DID_API_KEY || 'Z29vZ2xlLW9hdXRoMnwxMDMwNTI4OTM0ODMwNDY0OTQ5NTVAYWtfVlFLQ2xwaTlXang5cENYVEJ6ZzNy:CINFzam4Omy9qFd__Rd-X';
const AUTH_HEADER = 'Basic ' + Buffer.from(DID_API_KEY).toString('base64');

async function uploadImage(imageFilePath) {
  console.log(`[D-ID] Uploading source image: ${path.basename(imageFilePath)}...`);
  const imageBuffer = fs.readFileSync(imageFilePath);
  const blob = new Blob([imageBuffer], { type: 'image/jpeg' });

  const form = new FormData();
  form.append('image', blob, path.basename(imageFilePath));

  const res = await fetch('https://api.d-id.com/images', {
    method: 'POST',
    headers: {
      'Authorization': AUTH_HEADER
    },
    body: form
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to upload image: ${JSON.stringify(json)}`);
  }
  console.log(`[D-ID] Image uploaded successfully! URL: ${json.url}`);
  return json.url;
}

async function uploadAudio(audioFilePath) {
  console.log(`[D-ID] Uploading voice audio: ${path.basename(audioFilePath)}...`);
  const audioBuffer = fs.readFileSync(audioFilePath);
  const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });

  const form = new FormData();
  form.append('audio', blob, path.basename(audioFilePath));

  const res = await fetch('https://api.d-id.com/audios', {
    method: 'POST',
    headers: {
      'Authorization': AUTH_HEADER
    },
    body: form
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to upload audio: ${JSON.stringify(json)}`);
  }
  console.log(`[D-ID] Audio uploaded successfully! URL: ${json.url}`);
  return json.url;
}

async function createTalk(imageUrl, audioUrl) {
  console.log(`[D-ID] Initiating talk animation job...`);
  const payload = {
    source_url: imageUrl,
    script: {
      type: 'audio',
      audio_url: audioUrl
    },
    config: {
      fluent: true,
      stitch: true,
      pad_audio: 0.0,
      driver_expressions: {
        expressions: [
          { start_frame: 0, expression: 'neutral', intensity: 1.0 }
        ]
      }
    }
  };

  const res = await fetch('https://api.d-id.com/talks', {
    method: 'POST',
    headers: {
      'Authorization': AUTH_HEADER,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to create talk: ${JSON.stringify(json)}`);
  }
  console.log(`[D-ID] Talk job created! ID: ${json.id}, Status: ${json.status}`);
  return json.id;
}

async function pollTalkResult(talkId, maxWaitSec = 180) {
  console.log(`[D-ID] Waiting for video render to finish (polling every 4 seconds)...`);
  const startTime = Date.now();

  while ((Date.now() - startTime) / 1000 < maxWaitSec) {
    await new Promise(r => setTimeout(r, 4000));

    const res = await fetch(`https://api.d-id.com/talks/${talkId}`, {
      method: 'GET',
      headers: {
        'Authorization': AUTH_HEADER,
        'Accept': 'application/json'
      }
    });

    const json = await res.json();
    console.log(`  [Render Status] ${json.status || 'processing'} (${Math.round((Date.now() - startTime) / 1000)}s)`);

    if (json.status === 'done') {
      console.log(`[D-ID] Video render complete! URL: ${json.result_url}`);
      return json.result_url;
    }

    if (json.status === 'error' || json.status === 'rejected') {
      throw new Error(`Talk generation failed: ${JSON.stringify(json)}`);
    }
  }

  throw new Error('Timed out waiting for D-ID video render.');
}

async function downloadVideo(videoUrl, outputPath) {
  console.log(`[D-ID] Downloading generated MP4 to: ${outputPath}...`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Failed to download video: ${res.statusText}`);

  const fileStream = fs.createWriteStream(outputPath);
  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
  console.log(`[D-ID] Video saved successfully (${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB)!`);
}

async function main() {
  const rootDir = path.resolve(__dirname, '../..');
  const hostDir = path.join(rootDir, 'channel_assets', 'characters', 'host');
  const epAudioDir = path.join(rootDir, 'episodes', 'EP001', 'audio');
  const epAssetsDir = path.join(rootDir, 'episodes', 'EP001', 'assets');

  // We use the 16:9 widescreen Host in Office master frame
  const imageSource = path.join(hostDir, 'host_in_office_16x9.jpg');
  const audioSource = path.join(epAudioDir, 'chunk_part_01.mp3'); // 17.5s Host Intro Hook
  const outputFile = path.join(epAssetsDir, 'host_talking_intro.mp4');

  if (!fs.existsSync(imageSource)) {
    console.error(`Missing image source: ${imageSource}`);
    process.exit(1);
  }
  if (!fs.existsSync(audioSource)) {
    console.error(`Missing audio source: ${audioSource}`);
    process.exit(1);
  }

  try {
    console.log('=== STARTING D-ID HOST AVATAR VIDEO GENERATION ===\n');
    const imageUrl = await uploadImage(imageSource);
    const audioUrl = await uploadAudio(audioSource);
    const talkId = await createTalk(imageUrl, audioUrl);
    const resultVideoUrl = await pollTalkResult(talkId);
    await downloadVideo(resultVideoUrl, outputFile);

    console.log('\n[SUCCESS] Host talking avatar video ready at:');
    console.log(outputFile);
  } catch (err) {
    console.error('[ERROR]', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { uploadImage, uploadAudio, createTalk, pollTalkResult, downloadVideo };
