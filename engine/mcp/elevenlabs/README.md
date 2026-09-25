# ElevenLabs MCP Server for YouTube Storytelling Pipeline

A Model Context Protocol (MCP) Stdio Server providing automated Text-to-Speech (TTS), Sound Effects Generation, Voice Listing, and Full-Episode Batch Synthesis directly to Antigravity and AI agents.

## 🛠️ Provided Tools

1. **`elevenlabs_list_voices`**
   * Lists all available cloned, custom, and premade voices in your ElevenLabs account with IDs, names, and labels.

2. **`elevenlabs_text_to_speech`**
   * Synthesizes high-quality speech for a single passage/script.
   * Supports `stability`, `similarity_boost`, `style`, `speed`, and `model_id` (`eleven_multilingual_v2`, `eleven_turbo_v2_5`).

3. **`elevenlabs_generate_sound_effect`**
   * Generates cinematic sound design and foley audio directly from a text prompt (e.g. *"distant police siren in rain"*, *"car door slamming shut"*, *"slow tense heartbeat"*).

4. **`elevenlabs_synthesize_episode_chunks`**
   * Reads an episode manifest (e.g. `episodes/EP001/voice_chunks.json`), maps voice aliases (`HOST_MASTER_V1`, `JAKE_EP01_MASTER`) to actual ElevenLabs Voice IDs, and batch-generates all scene audio files into `episodes/EP001/audio/`.

5. **`elevenlabs_get_usage`**
   * Checks subscription tier, character quota used, remaining balance, and renewal dates.

---

## 🔑 Setup & Configuration

1. Create a `.env` file in the root of the workspace or in this folder:
   ```bash
   ELEVENLABS_API_KEY=your_actual_elevenlabs_api_key_here
   ```

2. Register in Antigravity's `mcp_config.json`:
   ```json
   {
     "mcpServers": {
       "elevenlabs": {
         "command": "node",
         "args": ["engine/mcp/elevenlabs/server.js"],
         "env": {
           "ELEVENLABS_API_KEY": "${ELEVENLABS_API_KEY}"
         }
       }
     }
   }
   ```
