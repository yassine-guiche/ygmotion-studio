
/**
 * script_generator.js - AI Narrative Scriptwriting Engine
 * 
 * Generates structured, high-retention episodic scripts matching the scraped channel's
 * exact archetype, hook mechanics, retention pacing, and visual prompts.
 */

const fs = require('fs');
const path = require('path');

class ScriptGenerator {
  /**
   * Generate an episode script matching a channel blueprint and topic
   */
  async generateScript({ blueprint, topic, targetDurationMin = 3 }) {
    const archetype = blueprint?.nicheInsights?.archetype || 'ranks_pov';
    const pacingWpm = blueprint?.nicheInsights?.pacingWpm || 165;
    const title = typeof topic === 'string' ? topic : topic?.title || "Untold Story";

    let scenes = [];

    if (archetype === 'ranks_pov') {
      scenes = this._generateRanksPovScript(title, topic, pacingWpm);
    } else if (archetype === 'stickman_animation') {
      scenes = this._generateStickmanScript(title, topic, pacingWpm);
    } else {
      scenes = this._generateDocumentaryScript(title, topic, pacingWpm);
    }

    const totalWords = scenes.reduce((acc, s) => acc + s.wordsCount, 0);
    const totalDurationSec = Math.round(totalWords / (pacingWpm / 60));

    return {
      title,
      archetype,
      pacingWpm,
      totalWords,
      estimatedDurationSec: totalDurationSec,
      scenes
    };
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
        audioMood: "outro_synth_wave"
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
    const hookLine = topic?.hook || `Most people start a project with careful research. I started this because I made a bet after three cups of espresso.`;

    const scenes = [
      {
        partIndex: 1,
        title: "Part 1: The Confession",
        text: hookLine,
        visualPrompt: "Minimalist 2D vector stick figure sitting with head in hands at messy wooden desk, coffee cup tipped over, chalkboard background, clean Casually Explained aesthetic",
        cameraMotion: "push_in",
        audioMood: "quirky_acoustic_intro"
      },
      {
        partIndex: 2,
        title: "Part 2: The Terrible Plan",
        text: `Here was the genius plan. Step one: pretend I was an industry expert with ten years of enterprise consulting experience. Step two: figure out what enterprise consulting actually means before Monday morning.`,
        visualPrompt: "2D stick figure holding giant blueprint with comically confusing squiggles, question marks floating above head, minimalist animation style",
        cameraMotion: "pan_left_right",
        audioMood: "puzzled_plink_melody"
      },
      {
        partIndex: 3,
        title: "Part 3: The Pitch",
        text: `On Monday, I wore the only collared shirt I owned. I opened the presentation with fifty buzzwords I found on LinkedIn. Synergy, paradigm shift, quantum scalability. The CEO nodded like I was reciting Shakespeare.`,
        visualPrompt: "2D stick figure in ill-fitting oversized tie standing next to chart pointing upward, boardroom stick figures with speech bubbles of thumbs up",
        cameraMotion: "zoom_out",
        audioMood: "cheerful_bossa_rhythm"
      },
      {
        partIndex: 4,
        title: "Part 4: The Escalation",
        text: `Then came the catastrophe. They didn't just like the pitch. They approved the entire multi-million dollar implementation and assigned fifty senior engineers to report directly to me by noon.`,
        visualPrompt: "2D stick figure sweating profusely, giant crowd of 50 stick figures staring with clipboards, exclamation marks, comedic tension",
        cameraMotion: "camera_shake",
        audioMood: "sudden_record_scratch"
      },
      {
        partIndex: 5,
        title: "Part 5: The Cover-up",
        text: `For the next forty-eight hours, I locked myself in the supply closet googling basic computer science terminology while pretending I was on urgent international stakeholder calls.`,
        visualPrompt: "2D stick figure cramped inside tiny broom closet surrounded by mops, laptop screen glowing in the dark, animated eye twitches",
        cameraMotion: "push_in",
        audioMood: "ticking_clock_beat"
      },
      {
        partIndex: 6,
        title: "Part 6: The Miracle",
        text: `And somehow, through sheer accidental luck, the solution I randomly suggested during a panic attack fixed their three-year database bug in twelve minutes. They thought I was a certified genius.`,
        visualPrompt: "2D stick figure wearing gold crown, angels singing, confetti falling, server rack turning bright green, hilarious triumphant vector art",
        cameraMotion: "zoom_out",
        audioMood: "triumphant_trumpet_fanfare"
      },
      {
        partIndex: 7,
        title: "Part 7: The Moral",
        text: `The lesson here is simple. Imposter syndrome is completely natural, because sometimes you genuinely have no idea what you're doing. But confidence and a decent haircut will carry you surprisingly far.`,
        visualPrompt: "2D stick figure shrugging with cheerful wink at camera, neat vector illustration, minimalist clean lines",
        cameraMotion: "tilt_up_down",
        audioMood: "warm_acoustic_outro"
      },
      {
        partIndex: 8,
        title: "Part 8: The Sign-off",
        text: `Hit like if you've ever bluffed your way through a meeting, and subscribe before my former clients find this video.`,
        visualPrompt: "2D stick figure running away from angry corporate logo, subscribe button animation, comic timing",
        cameraMotion: "push_in",
        audioMood: "comedic_pop_hit"
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
