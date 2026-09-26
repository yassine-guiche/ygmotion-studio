/**
 * script_generator.js - AI Narrative Scriptwriting Engine
 * 
 * Generates structured, high-retention episodic scripts matching the scraped channel's
 * exact archetype, hook mechanics, retention pacing, and visual prompts.
 * Powered by local Ollama AI (with high-intensity fallback narrative templates).
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

class ScriptGenerator {
  /**
   * Generate an episode script matching a channel blueprint and topic
   */
  async generateScript({ blueprint, topic, targetDurationMin = 3 }) {
    const archetype = blueprint?.nicheInsights?.archetype || 'crime_suspense';
    const pacingWpm = blueprint?.nicheInsights?.pacingWpm || 160;
    const title = typeof topic === 'string' ? topic : topic?.title || "Untold Story";

    let scenes = [];
    let generatedBy = "template";

    // 1. Try Google Gemini Cloud AI for high-speed master storytelling first
    try {
      const geminiEngine = require("./gemini_engine");
      if (geminiEngine.isAvailable()) {
        const geminiRes = await geminiEngine.generateScript({ blueprint, topic, pacingWpm, targetDurationMin });
        if (geminiRes && geminiRes.scenes && geminiRes.scenes.length >= 4) {
          scenes = geminiRes.scenes;
          generatedBy = geminiRes.generatedBy || "google_gemini";
        }
      }
    } catch (e) {
      console.warn("Gemini script generation fallback:", e.message);
    }

    // 2. Try local Ollama LLM for local GPU AI scriptwriting fallback
    if (!scenes || scenes.length === 0) {
      try {
        const aiScenes = await this._queryOllamaScript(title, topic, archetype, pacingWpm);
        if (aiScenes && aiScenes.length >= 4) {
          scenes = aiScenes;
          generatedBy = "ollama (qwen2.5-coder:7b)";
        }
      } catch (e) {
        console.warn("Ollama script generation fallback to template:", e.message);
      }
    }

    // 2. High-Fidelity Archetype Script Generators Fallback
    if (!scenes || scenes.length === 0) {
      if (archetype === 'crime_suspense') {
        scenes = this._generateCrimeSuspenseScript(title, topic, pacingWpm);
      } else if (archetype === 'ranks_pov') {
        scenes = this._generateRanksPovScript(title, topic, pacingWpm);
      } else if (archetype === 'stickman_animation') {
        scenes = this._generateStickmanScript(title, topic, pacingWpm);
      } else {
        scenes = this._generateDocumentaryScript(title, topic, pacingWpm);
      }
    }

    const totalWords = scenes.reduce((acc, s) => acc + s.wordsCount, 0);
    const totalDurationSec = Math.round(totalWords / (pacingWpm / 60));

    return {
      title,
      archetype,
      pacingWpm,
      totalWords,
      estimatedDurationSec: totalDurationSec,
      scenes,
      generatedBy
    };
  }

  /**
   * Query local Ollama for bespoke structured scene scripts
   */
  _queryOllamaScript(title, topic, archetype, wpm) {
    return new Promise((resolve) => {
      const hook = topic?.hook || "";
      const prompt = `You are a master YouTube storytelling scriptwriter.
Write an intensely gripping, high-retention 6-to-8 scene episodic video script.
Title: "${title}"
Genre/Archetype: ${archetype}
Initial Hook Context: "${hook}"
Pacing: ${wpm} WPM

Return ONLY a valid JSON array of scenes without backticks, matching this exact schema:
[
  {
    "partIndex": 1,
    "title": "Part 1: The Cold Hook",
    "text": "Intensely engaging voiceover narration text (2 to 4 sentences)...",
    "visualPrompt": "Photorealistic 16:9 cinematic visual description for AI image generation...",
    "cameraMotion": "push_in",
    "audioMood": "dark_tension_drone"
  }
]`;

      const payload = JSON.stringify({
        model: "qwen2.5-coder:7b",
        prompt,
        stream: false,
        options: {
          temperature: 0.5,
          num_predict: 1200
        }
      });

      const req = http.request({
        host: "127.0.0.1",
        port: 11434,
        path: "/api/generate",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        },
        timeout: 6000
      }, (res) => {
        let data = "";
        res.on("data", chunk => { data += chunk; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            let rawText = parsed.response || "";
            rawText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
            const start = rawText.indexOf("[");
            const end = rawText.lastIndexOf("]");
            if (start !== -1 && end !== -1) {
              const jsonStr = rawText.slice(start, end + 1);
              const scenes = JSON.parse(jsonStr);
              if (Array.isArray(scenes) && scenes.length >= 4) {
                const processed = scenes.map((s, idx) => {
                  const words = (s.text || "").split(/\s+/).length;
                  return {
                    partIndex: idx + 1,
                    title: s.title || `Part ${idx + 1}`,
                    text: s.text,
                    visualPrompt: s.visualPrompt || "Cinematic 35mm film still, dramatic lighting, 8k",
                    cameraMotion: s.cameraMotion || "push_in",
                    audioMood: s.audioMood || "tension_ambient",
                    wordsCount: words,
                    estimatedDurationSec: parseFloat((words / (wpm / 60)).toFixed(1))
                  };
                });
                return resolve(processed);
              }
            }
            resolve(null);
          } catch (e) {
            resolve(null);
          }
        });
      });

      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * True Crime & Police Bodycam Suspense Formula
   */
  _generateCrimeSuspenseScript(title, topic, wpm) {
    const hookLine = topic?.hook || `At 2:14 AM on an unpaved county backroad, Officer Miller called in a routine abandoned vehicle. Five minutes later, his bodycam audio recorded what dispatch couldn't explain.`;
    const acts = topic?.tiers || [
      "Act 1: The Midnight Call",
      "Act 2: The Red Flags in the Trunk",
      "Act 3: The Ambush in the Dark",
      "Act 4: The Bodycam Breakdown"
    ];

    const scenes = [
      {
        partIndex: 1,
        title: "Part 1: The Cold Open & Dispatch",
        text: hookLine,
        visualPrompt: "Cinematic 35mm film still, police cruiser dashboard camera at night, red and blue strobe lights reflecting on rain-slicked asphalt, dark desolate highway, Kodak Vision3 500T, high suspense",
        cameraMotion: "push_in",
        audioMood: "radio_static_chilling_drone"
      },
      {
        partIndex: 2,
        title: `Part 2: ${acts[0] || "The Approach & Bodycam Timestamp"}`,
        text: `The cruiser's spotlight cuts through the heavy downpour. Deputy Miller steps out, flashlight beam cutting the steam rising from the abandoned sedan's hood. The engine is still warm, but the driver's side door is standing wide open. In the mud beside the tire, two sets of fresh boot prints lead directly toward the tree line.`,
        visualPrompt: "First person bodycam POV, tactical flashlight beam illuminating muddy tire tracks and open car door in rainstorm, timestamp HUD in corner, intense cinematic realism",
        cameraMotion: "tilt_up_down",
        audioMood: "heartbeat_pulse_deep"
      },
      {
        partIndex: 3,
        title: "Part 3: The First Red Flag",
        text: `Standard protocol says wait for backup. But when Miller shines his beam onto the back seat, he spots an open leather notebook, a pair of zip-ties, and a city map with three addresses circled in red marker. None of the names on the registration match the area code of the phone buzzing endlessly on the center console.`,
        visualPrompt: "Close up police flashlight beam resting on back seat of car, leather notebook and circled city map, rain beating against car window, gritty noir lighting",
        cameraMotion: "pan_left_right",
        audioMood: "dark_tension_riser"
      },
      {
        partIndex: 4,
        title: `Part 4: ${acts[1] || "The Escalation in the Woods"}`,
        text: `Miller clicks his radio mic to request immediate county backup. Just as dispatch acknowledges, the audio cuts into shrill feedback. Forty yards into the pines, a sharp metallic click breaks the silence, followed by the sound of boots crushing wet twigs in rapid succession.`,
        visualPrompt: "Low-angle cinematic view of dense pine woods at night, tactical officer silhouette holding duty light, ominous fog drifting between trees, deep shadow contrast",
        cameraMotion: "push_in",
        audioMood: "sharp_suspense_string_hit"
      },
      {
        partIndex: 5,
        title: `Part 5: ${acts[2] || "The Confrontation & Takedown"}`,
        text: `'Sheriff's department, step out with your hands where I can see them!' The command echoes through the timber. For three agonizing seconds, nothing moves. Then, a figure bolts from behind an oak trunk toward the ravine. Miller engages in pursuit, mud churning beneath his boots as adrenaline redlines.`,
        visualPrompt: "Dynamic bodycam action shot, running through dark misty woods, swaying flashlight beam revealing fleeing silhouette in distance, motion blur, visceral realism",
        cameraMotion: "camera_shake",
        audioMood: "rapid_percussion_chase"
      },
      {
        partIndex: 6,
        title: `Part 6: ${acts[3] || "The Smoking Gun & Confession"}`,
        text: `By 3:30 AM, secondary units surround the perimeter. When investigators pry open the false floor beneath the suspect's trunk, they uncover what this individual was desperate to conceal: three stolen police radios, an encrypted satellite relay, and a manifest detailing coordinated drops across four neighboring counties.`,
        visualPrompt: "Forensic evidence scene, yellow evidence placards on wet asphalt, opened vehicle trunk with tactical gear and radios illuminated by halogen crime scene lamps",
        cameraMotion: "parallax_float",
        audioMood: "deep_revelation_drone"
      },
      {
        partIndex: 7,
        title: "Part 7: The Interrogation Room",
        text: `Inside interrogation room 4, twelve hours later. The suspect sits handcuffed to the bolt in the table, refusing water and refusing to speak. Until Lead Detective Vance slides a single surveillance photo across the table, showing the suspect's face clearly at the exact moment the perimeter sensors were tripped.`,
        visualPrompt: "Gritty neo-noir interrogation room, single overhead fluorescent light fixture, handcuffed suspect in silhouette across metal table from seasoned detective, smoke haze",
        cameraMotion: "push_in",
        audioMood: "sub_bass_dread"
      },
      {
        partIndex: 8,
        title: "Part 8: The Chilling Verdict",
        text: `The case pulled back the curtain on an organized syndicate operating in plain sight for over seven years. Some crimes are caught by high-tech algorithms. But most unravel because of a single officer on an empty road noticing the one detail that didn't belong. If you want more real police investigations and tactical breakdowns, subscribe and drop your thoughts in the comments.`,
        visualPrompt: "Cinematic wide shot of courthouse steps at sunrise, lone detective looking toward horizon, cool dawn blue and gold morning light, Leica 35mm film aesthetic",
        cameraMotion: "zoom_out",
        audioMood: "fading_cinematic_outro"
      }
    ];

    return scenes.map(s => {
      const words = s.text.split(/\s+/).length;
      return {
        ...s,
        wordsCount: words,
        estimatedDurationSec: parseFloat((words / (wpm / 60)).toFixed(1))
      };
    });
  }

  _generateRanksPovScript(title, topic, wpm) {
    const hookLine = topic?.hook || `Level 1: The Initial Awakening. The room doesn't make sense yet. Everything smells like ozone and damp concrete.`;
    const tiers = topic?.tiers || [
      "Level 1: The First Mistake",
      "Level 10: The Syndicate Contact",
      "Level 50: The Impossible Score",
      "Level 100: The Apex Predator"
    ];

    const scenes = [
      {
        partIndex: 1,
        title: "Part 1: The Cold Hook",
        text: hookLine,
        visualPrompt: "First person POV, gloved tactical hands resting on a cold metal workstation, dual glowing monitors casting neon blue rim light, digital HUD overlay in corner, volumetric haze, cinematic 8k",
        cameraMotion: "push_in",
        audioMood: "cyber_ambient_hum"
      },
      {
        partIndex: 2,
        title: `Part 2: ${tiers[0] || "Level 1: The First Step"}`,
        text: `At Level 1, you think you're in control. You have a burner laptop, a tethered phone, and three thousand dollars in a paper bag. You tell yourself this is temporary. Just one gig to clear the debt. But the network doesn't let anyone leave with clean hands.`,
        visualPrompt: "First person POV looking down at a cracked burner smartphone showing encrypted text messages, dark alley background, subtle streetlamp bokeh, cyber noir aesthetic",
        cameraMotion: "tilt_up_down",
        audioMood: "dark_bass_drone"
      },
      {
        partIndex: 3,
        title: "Part 3: The Escalation",
        text: `By the end of the first week, your contact stops answering phone calls. Instead, encrypted delivery coordinates appear on your dashboard every morning at 4:12 AM. The pay is ten times what you asked for. That's how you know someone high up just noticed you.`,
        visualPrompt: "First person POV inside a high-speed vehicle cockpit at 4 AM, neon dashboard dials flickering, wet highway reflections streaking past windshield, cinematic camera drift",
        cameraMotion: "parallax_float",
        audioMood: "tension_riser"
      },
      {
        partIndex: 4,
        title: `Part 4: ${tiers[1] || "Level 10: The Syndicate"}`,
        text: `Level 10. You aren't executing tasks anymore; you're directing them. You hold the encryption keys to three safehouses and an offshore routing node. But when you look in the rearview mirror, the black sedan two cars behind you has been following your lane changes for forty miles.`,
        visualPrompt: "First person POV looking at vehicle rearview mirror reflecting shadowy headlights of following SUV, rain-soaked rear glass, deep shadows, high suspense",
        cameraMotion: "push_in",
        audioMood: "heartbeat_pulse"
      },
      {
        partIndex: 5,
        title: "Part 5: The Ambush",
        text: `You don't panic. Panicking at Level 10 gets you erased. You hit the turn signal, take the industrial cutoff, and wait for them to commit. When they accelerate, your thumb hits the master cutoff switch on your console. Every camera in a three-block radius goes black.`,
        visualPrompt: "Close-up first person POV gloved hand slamming illuminated emergency toggle on server panel, sparks leaping, screen glitch effect, dynamic action",
        cameraMotion: "camera_shake",
        audioMood: "impact_glitch_hit"
      },
      {
        partIndex: 6,
        title: `Part 6: ${tiers[2] || "Level 50: The Point of No Return"}`,
        text: `Level 50. You enter the room where the decisions are actually made. No names. No badges. Just five people behind soundproof smoked glass watching live telemetry feeds. One of them slides a manila folder across the mahogany table. It has your real birth certificate inside.`,
        visualPrompt: "First person POV standing in front of imposing frosted glass conference room, silhouette figures behind glass, single spotlight on folder, high contrast cinema",
        cameraMotion: "pan_left_right",
        audioMood: "sub_bass_drop"
      },
      {
        partIndex: 7,
        title: `Part 7: ${tiers[3] || "Level 100: The Sovereign Choice"}`,
        text: `They give you sixty seconds to choose. Walk out the door as a target, or take the master seat and inherit the entire operation. You look at the surveillance feed of your old apartment. The lights are off. Your old life is already gone.`,
        visualPrompt: "First person POV overlooking massive multi-screen operations control center, holographic city grid display, cinematic wide angle, master authority",
        cameraMotion: "zoom_out",
        audioMood: "orchestral_drone_swell"
      },
      {
        partIndex: 8,
        title: "Part 8: The Closing Word",
        text: `You pull the leather chair out, sit down, and place your palms flat on the glass desk. Welcome to Level 100. If you survived this far, subscribe and tell me in the comments what rank you would tap out at.`,
        visualPrompt: "First person POV hands resting firmly on executive glass desk, city skyline at night through floor to ceiling windows, sleek cyber aesthetic",
        cameraMotion: "push_in",
        audioMood: "heavy_bass_outro"
      }
    ];

    return scenes.map(s => {
      const words = s.text.split(/\s+/).length;
      return {
        ...s,
        wordsCount: words,
        estimatedDurationSec: parseFloat((words / (wpm / 60)).toFixed(1))
      };
    });
  }

  _generateStickmanScript(title, topic, wpm) {
    const hookLine = topic?.hook || `Most people start a business with a business plan. I started a business because I lied on a resume and the client immediately wired half a million dollars.`;

    const scenes = [
      {
        partIndex: 1,
        title: "Part 1: The Confession",
        text: hookLine,
        visualPrompt: "2D minimalist vector stickman with round white head and wide panic eyes, sitting at messy wooden desk staring at a glowing laptop screen with huge dollar balance, chalkboard background",
        cameraMotion: "snap_zoom",
        audioMood: "quirky_pizzicato_strings"
      },
      {
        partIndex: 2,
        title: "Part 2: The Terrible Decision",
        text: `Now, a normal human would call the client, apologize, and return the wire transfer. But I am not a normal human. I am an idiot with high-speed internet and six hours before the kickoff call. So I did what anyone would do: I Googled 'how to sound like a senior enterprise consultant in thirty minutes.'`,
        visualPrompt: "Stickman frantic typing on laptop with speed lines, twelve open tabs floating around his head, coffee cup spilling, clean vector art",
        cameraMotion: "pan_left_right",
        audioMood: "fast_ticking_clock"
      },
      {
        partIndex: 3,
        title: "Part 3: The Pitch",
        text: `The meeting starts. Five people in bespoke suits appear on my webcam. I look like I haven't slept since Tuesday. I open my presentation, clear my throat, and say the most confident nonsense in human history: 'We need to leverage synergistic omnichannel velocity.' They took notes. All of them.`,
        visualPrompt: "Stickman wearing a comical paper necktie, gesturing dramatically at a graph with squiggly lines that go straight up, suited silhouettes nodding, minimal flat cartoon aesthetic",
        cameraMotion: "push_in",
        audioMood: "comedic_suspense_piano"
      },
      {
        partIndex: 4,
        title: "Part 4: The Downward Spiral",
        text: `By month two, things got out of hand. I hired three freelancers from three different continents to do the work I was supposed to be doing. None of them spoke the same language, but through the magic of emojis and Google Translate, we accidentally built an actual software product that worked.`,
        visualPrompt: "Stickman juggling three glowing server icons with panicked face sweat drops, globe in background with dotted communication lines, pop art color accents",
        cameraMotion: "camera_shake",
        audioMood: "upbeat_chaotic_drums"
      },
      {
        partIndex: 5,
        title: "Part 5: The Climax",
        text: `Then came the compliance audit. A German auditor named Hans scheduled a site visit. Our registered office was my mother's guest bedroom. I had forty-eight hours to turn a room decorated with floral curtains and stuffed bears into an international headquarters.`,
        visualPrompt: "Stickman furiously painting over floral wallpaper with gray paint, teddy bears stuffed into a closet, frantic cartoon comedy",
        cameraMotion: "tilt_up_down",
        audioMood: "rapid_march_percussion"
      },
      {
        partIndex: 6,
        title: "Part 6: The Punchline",
        text: `The moral of the story? Fake it until you make it isn't career advice. It's a medical condition characterized by elevated cortisol and spontaneous sweating. Subscribe for more life advice you should never follow, and leave your worst workplace lie in the comments.`,
        visualPrompt: "Stickman sipping coffee calmly while room behind him is on fire, relaxed shrug expression, classic meme energy, chalkboard aesthetic",
        cameraMotion: "zoom_out",
        audioMood: "funny_cymbal_crash_outro"
      }
    ];

    return scenes.map(s => {
      const words = s.text.split(/\s+/).length;
      return {
        ...s,
        wordsCount: words,
        estimatedDurationSec: parseFloat((words / (wpm / 60)).toFixed(1))
      };
    });
  }

  _generateDocumentaryScript(title, topic, wpm) {
    const hookLine = topic?.hook || `In a quiet conference room in Zurich, three men signed a document that vanished $40 billion in less than twenty minutes.`;

    const scenes = [
      {
        partIndex: 1,
        title: "Part 1: The Inciting Mystery",
        text: hookLine,
        visualPrompt: "Archival 35mm photograph treatment, antique leather portfolio on polished mahogany table, fountain pen resting on parchment, warm amber side lighting, Fern documentary aesthetic",
        cameraMotion: "push_in",
        audioMood: "heavy_cello_drone"
      },
      {
        partIndex: 2,
        title: "Part 2: The Foundation",
        text: `To understand how this happened, you have to look back thirty years. At the time, the company wasn't an empire. It was a modest workshop operating out of a former warehouse, fueled by a single patent nobody else believed in.`,
        visualPrompt: "Black and white archival documentary photo, 1970s factory floor with engineers inspecting machinery, 2.5D parallax separation of background and foreground",
        cameraMotion: "pan_left_right",
        audioMood: "nostalgic_film_hum"
      },
      {
        partIndex: 3,
        title: "Part 3: The Breakthrough",
        text: `When the breakthrough arrived, it shifted the global supply chain overnight. Contracts poured in from Tokyo, London, and New York. By the turn of the century, nearly every home on earth contained at least one component they manufactured.`,
        visualPrompt: "Global shipping map with glowing golden supply line vectors tracing across oceans, vintage cartography aesthetic, deep navy paper texture",
        cameraMotion: "zoom_out",
        audioMood: "steady_curious_pulse"
      },
      {
        partIndex: 4,
        title: "Part 4: The Flaw in the Numbers",
        text: `Behind closed doors, however, the financial structure was cracking. The aggressive expansion had been leveraged on debt that required perpetual thirty percent annual growth just to service the interest. And the market was beginning to cool.`,
        visualPrompt: "Close-up macro lens on vintage mechanical balance scale tipped sharply to one side, dust motes in golden light beam, documentary metaphor",
        cameraMotion: "tilt_up_down",
        audioMood: "dissonant_violin_swell"
      },
      {
        partIndex: 5,
        title: "Part 5: The Whistleblower",
        text: `In October, an internal audit director found the hidden ledger. What she uncovered wasn't a minor rounding discrepancy; it was an elaborate architecture of offshore shell entities designed to hide billions in liabilities from regulatory scrutiny.`,
        visualPrompt: "Dimly lit archival office at midnight, paper documents spilling across desk, desk lamp casting harsh green tint, investigative dossier look",
        cameraMotion: "push_in",
        audioMood: "heartbeat_suspense_sub"
      },
      {
        partIndex: 6,
        title: "Part 6: The Unraveling",
        text: `When the news broke on a Tuesday morning, trading was halted within four minutes. Shareholders lost their life savings before lunch. The executives, however, had quietly liquidated their private stock options three weeks prior.`,
        visualPrompt: "Newspaper headlines spinning and floating in 2.5D parallax, bold vintage print typeface, historical newspaper montage with dramatic vignette",
        cameraMotion: "camera_shake",
        audioMood: "impact_orchestral_crescendo"
      },
      {
        partIndex: 7,
        title: "Part 7: The Systemic Verdict",
        text: `The collapse left a crater that reshaped global finance regulations for a generation. But the most unsettling truth isn't that the fraud occurred; it's how many institutions watched it unfold in silence because everyone was profiting from the lie.`,
        visualPrompt: "Imposing architectural facade of empty neoclassical stock exchange building, rain streaks on camera lens, cold slate blue grading",
        cameraMotion: "parallax_float",
        audioMood: "somber_piano_reverb"
      },
      {
        partIndex: 8,
        title: "Part 8: The Final Question",
        text: `The question isn't whether another collapse like this will happen again, but who is holding the ledger right now. Subscribe for our next investigation, and drop your thoughts in the comments below.`,
        visualPrompt: "Dramatic slow fade to black over silhouette of solitary figure walking down rain-slicked European cobblestone alley under single lantern",
        cameraMotion: "push_in",
        audioMood: "fading_cinematic_outro"
      }
    ];

    return scenes.map(s => {
      const words = s.text.split(/\s+/).length;
      return {
        ...s,
        wordsCount: words,
        estimatedDurationSec: parseFloat((words / (wpm / 60)).toFixed(1))
      };
    });
  }

  /**
   * Convert generated scenes array into script_master.md markdown string
   */
  formatToScriptMasterMd({ title, archetype, pacingWpm, scenes }) {
    let md = `# MASTER SCRIPT: ${title.toUpperCase()}\n\n`;
    md += `**Target Niche / Archetype:** ${archetype}\n`;
    md += `**Narrator Architecture:** Solo Narrator\n`;
    md += `**Pacing Standard:** ${pacingWpm} Words Per Minute\n`;
    md += `**Total Estimated Duration:** ${Math.round(scenes.reduce((a, s) => a + s.estimatedDurationSec, 0))}s\n\n`;
    md += `---\n\n`;

    scenes.forEach(s => {
      md += `### ${s.title}\n`;
      md += `* **Camera Motion:** \`${s.cameraMotion}\`\n`;
      md += `* **Audio Stinger:** \`${s.audioMood}\`\n`;
      md += `* **Visual Direction:** ${s.visualPrompt}\n\n`;
      md += `> "${s.text}"\n\n`;
      md += `---\n\n`;
    });

    return md;
  }
}

module.exports = new ScriptGenerator();
