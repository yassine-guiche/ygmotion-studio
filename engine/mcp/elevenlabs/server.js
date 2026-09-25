#!/usr/bin/env node
/**
 * ElevenLabs Model Context Protocol (MCP) Stdio Server
 * Full-featured tool integration for Text-to-Speech, Voice Management, Sound Effects, and Episode Batch Generation.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Load .env if present
function loadEnv() {
  const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, '../../..', '.env')
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const [key, ...rest] = trimmed.split('=');
            const val = rest.join('=').replace(/^["']|["']$/g, '').trim();
            if (!process.env[key.trim()]) {
              process.env[key.trim()] = val;
            }
          }
        }
      } catch (err) {
        // Ignore read errors
      }
    }
  }
}

loadEnv();

function getApiKey() {
  return process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY || '';
}

const SERVER_INFO = {
  name: 'elevenlabs-mcp-server',
  version: '1.0.0'
};

const TOOLS = [
  {
    name: 'elevenlabs_list_voices',
    description: 'List all available ElevenLabs voices (custom, cloned, and default library voices) with their IDs, names, and labels.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'elevenlabs_text_to_speech',
    description: 'Convert text to speech using an ElevenLabs voice model and save to an audio file (.mp3).',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text script to synthesize into speech.'
        },
        voice_id: {
          type: 'string',
          description: 'The ElevenLabs Voice ID to use (e.g. 21m00Tcm4TlvDq8ikWAM, or your custom cloned voice ID).'
        },
        output_file_path: {
          type: 'string',
          description: 'The destination filepath to save the output audio (e.g. episodes/EP001/audio/part_01.mp3).'
        },
        model_id: {
          type: 'string',
          description: 'Model ID: eleven_multilingual_v2, eleven_turbo_v2_5, or eleven_monolingual_v1. Default: eleven_multilingual_v2.',
          default: 'eleven_multilingual_v2'
        },
        stability: {
          type: 'number',
          description: 'Voice stability (0.0 to 1.0). Default: 0.5',
          default: 0.5
        },
        similarity_boost: {
          type: 'number',
          description: 'Voice similarity boost (0.0 to 1.0). Default: 0.75',
          default: 0.75
        },
        style: {
          type: 'number',
          description: 'Style exaggeration (0.0 to 1.0). Default: 0.0',
          default: 0.0
        },
        speed: {
          type: 'number',
          description: 'Playback speed (0.7 to 1.2). Default: 1.0',
          default: 1.0
        }
      },
      required: ['text', 'voice_id', 'output_file_path']
    }
  },
  {
    name: 'elevenlabs_generate_sound_effect',
    description: 'Generate cinematic sound effects and foley audio (e.g. "distant police siren", "flashlight click", "car door slam") using ElevenLabs Sound Generation API.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Text description of the desired sound effect.'
        },
        output_file_path: {
          type: 'string',
          description: 'The destination filepath to save the audio file (.mp3).'
        },
        duration_seconds: {
          type: 'number',
          description: 'Optional duration in seconds (0.5 to 22.0).',
          default: 5.0
        },
        prompt_influence: {
          type: 'number',
          description: 'How closely to follow the prompt (0.0 to 1.0). Default: 0.3',
          default: 0.3
        }
      },
      required: ['prompt', 'output_file_path']
    }
  },
  {
    name: 'elevenlabs_synthesize_episode_chunks',
    description: 'Batch-synthesize an entire episode from a voice_chunks.json manifest, generating separate audio files for each scene/chunk.',
    inputSchema: {
      type: 'object',
      properties: {
        chunks_json_path: {
          type: 'string',
          description: 'Path to voice_chunks.json (e.g. episodes/EP001/voice_chunks.json).'
        },
        output_dir: {
          type: 'string',
          description: 'Output directory to store chunk audio files (e.g. episodes/EP001/audio).'
        },
        voice_id_map: {
          type: 'object',
          description: 'Mapping of abstract voice IDs (e.g. {"HOST_MASTER_V1": "actual_eleven_id", "JAKE_EP01_MASTER": "actual_eleven_id"}).'
        }
      },
      required: ['chunks_json_path', 'output_dir', 'voice_id_map']
    }
  },
  {
    name: 'elevenlabs_get_usage',
    description: 'Check your ElevenLabs subscription details, character count usage, and remaining balance.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

// Tool handlers
async function handleListVoices() {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      error: 'ELEVENLABS_API_KEY is not set. Please set it in your environment or .env file.'
    };
  }

  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey }
  });

  if (!res.ok) {
    const errorText = await res.text();
    return { error: `ElevenLabs API error (${res.status}): ${errorText}` };
  }

  const data = await res.json();
  const voices = (data.voices || []).map(v => ({
    voice_id: v.voice_id,
    name: v.name,
    category: v.category,
    labels: v.labels,
    preview_url: v.preview_url
  }));

  return {
    total_voices: voices.length,
    voices
  };
}

async function handleTextToSpeech(args) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { error: 'ELEVENLABS_API_KEY is not set.' };
  }

  const {
    text,
    voice_id,
    output_file_path,
    model_id = 'eleven_multilingual_v2',
    stability = 0.5,
    similarity_boost = 0.75,
    style = 0.0,
    speed = 1.0
  } = args;

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice_id)}`;

  const body = {
    text,
    model_id,
    voice_settings: {
      stability: Number(stability),
      similarity_boost: Number(similarity_boost),
      style: Number(style),
      use_speaker_boost: true
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    return { error: `ElevenLabs TTS Error (${res.status}): ${errText}` };
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const resolvedPath = path.resolve(process.cwd(), output_file_path);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, buffer);

  return {
    status: 'success',
    file_path: resolvedPath,
    bytes: buffer.length,
    model_id,
    character_count: text.length
  };
}

async function handleGenerateSoundEffect(args) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { error: 'ELEVENLABS_API_KEY is not set.' };
  }

  const {
    prompt,
    output_file_path,
    duration_seconds = 5.0,
    prompt_influence = 0.3
  } = args;

  const url = 'https://api.elevenlabs.io/v1/sound-generation';

  const body = {
    text: prompt,
    duration_seconds: Number(duration_seconds),
    prompt_influence: Number(prompt_influence)
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    return { error: `ElevenLabs Sound FX Error (${res.status}): ${err}` };
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const resolvedPath = path.resolve(process.cwd(), output_file_path);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, buffer);

  return {
    status: 'success',
    file_path: resolvedPath,
    bytes: buffer.length,
    prompt,
    duration_seconds
  };
}

async function handleSynthesizeEpisodeChunks(args) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { error: 'ELEVENLABS_API_KEY is not set.' };
  }

  const { chunks_json_path, output_dir, voice_id_map } = args;
  const resolvedJson = path.resolve(process.cwd(), chunks_json_path);
  const resolvedOutDir = path.resolve(process.cwd(), output_dir);

  if (!fs.existsSync(resolvedJson)) {
    return { error: `Manifest file not found: ${resolvedJson}` };
  }

  fs.mkdirSync(resolvedOutDir, { recursive: true });
  const rawData = fs.readFileSync(resolvedJson, 'utf8');
  const chunks = JSON.parse(rawData);

  const results = [];
  let totalChars = 0;
  let totalBytes = 0;

  for (const chunk of chunks) {
    const abstractVoice = chunk.voice_id;
    const actualVoiceId = voice_id_map[abstractVoice] || abstractVoice;

    const outFile = path.join(resolvedOutDir, `${chunk.chunk_id.toLowerCase()}.mp3`);
    
    // Call TTS
    const ttsRes = await handleTextToSpeech({
      text: chunk.text,
      voice_id: actualVoiceId,
      output_file_path: outFile
    });

    if (ttsRes.error) {
      results.push({
        chunk_id: chunk.chunk_id,
        status: 'failed',
        error: ttsRes.error
      });
    } else {
      totalChars += chunk.char_count || chunk.text.length;
      totalBytes += ttsRes.bytes;
      results.push({
        chunk_id: chunk.chunk_id,
        status: 'success',
        file_path: outFile,
        bytes: ttsRes.bytes
      });
    }
  }

  return {
    status: 'completed',
    total_chunks: chunks.length,
    successful_chunks: results.filter(r => r.status === 'success').length,
    failed_chunks: results.filter(r => r.status === 'failed').length,
    total_characters_synthesized: totalChars,
    total_bytes: totalBytes,
    chunks: results
  };
}

async function handleGetUsage() {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { error: 'ELEVENLABS_API_KEY is not set.' };
  }

  const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
    headers: { 'xi-api-key': apiKey }
  });

  if (!res.ok) {
    const err = await res.text();
    return { error: `ElevenLabs Subscription API Error (${res.status}): ${err}` };
  }

  const data = await res.json();
  return {
    tier: data.tier,
    character_count: data.character_count,
    character_limit: data.character_limit,
    can_extend_character_limit: data.can_extend_character_limit,
    status: data.status,
    next_character_count_reset_unix: data.next_character_count_reset_unix
  };
}

// JSON-RPC Dispatcher
async function handleRequest(request) {
  const { id, method, params } = request;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: SERVER_INFO
      }
    };
  }

  if (method === 'notifications/initialized') {
    return null; // No response needed for notification
  }

  if (method === 'ping') {
    return { jsonrpc: '2.0', id, result: {} };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: TOOLS
      }
    };
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const toolArgs = params?.arguments || {};

    let toolResult;
    try {
      switch (toolName) {
        case 'elevenlabs_list_voices':
          toolResult = await handleListVoices();
          break;
        case 'elevenlabs_text_to_speech':
          toolResult = await handleTextToSpeech(toolArgs);
          break;
        case 'elevenlabs_generate_sound_effect':
          toolResult = await handleGenerateSoundEffect(toolArgs);
          break;
        case 'elevenlabs_synthesize_episode_chunks':
          toolResult = await handleSynthesizeEpisodeChunks(toolArgs);
          break;
        case 'elevenlabs_get_usage':
          toolResult = await handleGetUsage();
          break;
        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Unknown tool: ${toolName}`
            }
          };
      }
    } catch (err) {
      toolResult = { error: err.message || String(err) };
    }

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(toolResult, null, 2)
          }
        ],
        isError: Boolean(toolResult.error)
      }
    };
  }

  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32601,
      message: `Method not found: ${method}`
    }
  };
}

// Start stdio loop
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const request = JSON.parse(trimmed);
    const response = await handleRequest(request);
    if (response) {
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  } catch (err) {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: `Parse error: ${err.message}`
      }
    }) + '\n');
  }
});
