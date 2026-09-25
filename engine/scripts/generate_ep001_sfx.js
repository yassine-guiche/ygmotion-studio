/**
 * Automated Sound Effects Generator for EP001
 * Uses ElevenLabs Sound Generation API to create atmospheric sound design.
 */

const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
let apiKey = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('ELEVENLABS_API_KEY=')) {
    apiKey = line.split('=')[1].trim();
  }
}

const SFX_LIST = [
  {
    id: 'sfx_01_police_siren_distant',
    prompt: 'Distant police siren echoing on an empty highway road at night with subtle wind',
    duration_seconds: 6.0,
    prompt_influence: 0.4
  },
  {
    id: 'sfx_02_car_door_and_gravel',
    prompt: 'Heavy car door slamming shut followed by boots crunching on gravel shoulder',
    duration_seconds: 4.0,
    prompt_influence: 0.5
  },
  {
    id: 'sfx_03_police_radio_squawk',
    prompt: 'Loud police radio static burst with unintelligible emergency dispatch chatter',
    duration_seconds: 3.5,
    prompt_influence: 0.6
  },
  {
    id: 'sfx_04_tense_heartbeat_sub',
    prompt: 'Slow heavy muffled heartbeat pulsing with subtle low cinematic bass rumble',
    duration_seconds: 8.0,
    prompt_influence: 0.5
  }
];

async function generateSoundEffect(sfx) {
  console.log(`Generating SFX: "${sfx.id}" — [Prompt: "${sfx.prompt}"]`);

  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: sfx.prompt,
      duration_seconds: sfx.duration_seconds,
      prompt_influence: sfx.prompt_influence
    })
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[ERROR] SFX Generation failed: (${res.status}) ${err}`);
    return false;
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const outDir = path.resolve(__dirname, '../../episodes/EP001/audio/sfx');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${sfx.id}.mp3`);
  
  fs.writeFileSync(outPath, buffer);
  console.log(`[SUCCESS] Saved SFX (${buffer.length} bytes) -> ${outPath}\n`);
  return true;
}

async function runSfxBatch() {
  console.log('--- Starting EP001 Sound Effects Generation ---\n');
  for (const sfx of SFX_LIST) {
    await generateSoundEffect(sfx);
  }
  console.log('--- All Sound Effects Generated ---');
}

module.exports = { generateSoundEffect, runSfxBatch };

if (require.main === module) {
  runSfxBatch();
}
