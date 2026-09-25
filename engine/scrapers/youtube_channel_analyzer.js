/**
 * youtube_channel_analyzer.js - Niche, Style & Transcript Analyzer
 * 
 * Takes any YouTube Channel or Video URL, extracts transcripts & metadata,
 * decodes the creator's narrative formula, and synthesizes a production-ready Channel Blueprint.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '../..');
const SCRAPER_PY = path.join(__dirname, 'scrape_youtube.py');

/**
 * Execute Python scraper and return parsed JSON
 */
function scrapeYouTubeChannel(urlOrHandle) {
  return new Promise((resolve, reject) => {
    const pythonExe = process.platform === 'win32' ? 'python' : 'python3';
    const proc = spawn(pythonExe, [SCRAPER_PY, urlOrHandle], {
      cwd: ROOT_DIR,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`Scraper failed (code ${code}): ${stderr.slice(-300)}`));
      }
      try {
        const data = JSON.parse(stdout);
        if (data.error) {
          return reject(new Error(data.error));
        }
        resolve(data);
      } catch (err) {
        reject(new Error(`Failed to parse scraper output: ${err.message}. Raw: ${stdout.slice(0, 200)}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Analyze scraped channel data and synthesize a comprehensive Channel Blueprint
 */
async function analyzeChannelNiche(urlOrHandle) {
  const rawData = await scrapeYouTubeChannel(urlOrHandle);

  const videos = rawData.videos || [];
  const topVideos = videos.slice(0, 15);
  
  // 1. Determine Archetype & Formula
  let povCount = 0;
  let rankCount = 0;
  let stickmanCount = 0;
  let docCount = 0;
  let crimeCount = 0;

  for (const v of topVideos) {
    const t = (v.title || '').toLowerCase();
    if (t.includes('pov:') || t.includes('your life as') || t.includes('your life after')) povCount++;
    if (t.includes('rank') || t.includes('level')) rankCount++;
    if (t.includes('confession') || t.includes('storytime') || t.includes('animation') || t.includes('stickman')) stickmanCount++;
    if (t.includes('rise and fall') || t.includes('how ') || t.includes('documentary') || t.includes('billion') || t.includes('empire')) docCount++;
    if (t.includes('police') || t.includes('crime') || t.includes('fbi') || t.includes('mafia') || t.includes('cartel') || t.includes('interrogation')) crimeCount++;
  }

  let archetype = 'ranks_pov';
  let archetypeName = 'POV Progression & Status Ranks';
  let narratorMode = 'pov_hands_hud';
  let visualPipeline = 'cyber_pov';
  let defaultStyleId = 'ranks_pov';

  if (stickmanCount >= 3 || (stickmanCount > povCount && stickmanCount > docCount)) {
    archetype = 'stickman_animation';
    archetypeName = '2D Stickman Narrative & Comedy';
    narratorMode = 'stick_avatar';
    visualPipeline = 'stickman_2d';
    defaultStyleId = 'stickman_animation';
  } else if (docCount >= 3 && docCount > povCount) {
    archetype = 'visual_documentary';
    archetypeName = 'High-End Visual Documentary (Magnates / Fern style)';
    narratorMode = 'voiceover_only';
    visualPipeline = 'archival_documentary';
    defaultStyleId = 'visual_documentary';
  } else if (crimeCount >= 5 && povCount === 0) {
    archetype = 'crime_suspense';
    archetypeName = 'Investigative Crime & Suspense';
    narratorMode = 'voiceover_only';
    visualPipeline = 'realistic_cinematic';
    defaultStyleId = 'crime_suspense';
  } else if (povCount > 0 || rankCount > 0) {
    archetype = 'ranks_pov';
    archetypeName = 'First-Person POV Gamified Progression';
    narratorMode = 'pov_hands_hud';
    visualPipeline = 'cyber_pov';
    defaultStyleId = 'ranks_pov';
  }

  // 2. Extract Pacing (WPM)
  const transcriptVideos = videos.filter(v => v.hasTranscript && v.pacingWpm > 50);
  let averageWpm = 165;
  if (transcriptVideos.length > 0) {
    const sumWpm = transcriptVideos.reduce((acc, v) => acc + v.pacingWpm, 0);
    averageWpm = Math.round(sumWpm / transcriptVideos.length);
  }

  // Clamp WPM to practical ranges
  if (averageWpm < 125) averageWpm = 135;
  if (averageWpm > 195) averageWpm = 185;

  // 3. Extract Hook Pattern
  let hookSamples = transcriptVideos.map(v => v.hook).filter(Boolean);
  let hookFormula = "Level 1: The Initial Awakening. Immediate sensory immersion in second person ('You wake up...').";
  if (archetype === 'stickman_animation') {
    hookFormula = "Self-deprecating humorous confession in first person ('I have made a terrible life choice...').";
  } else if (archetype === 'visual_documentary') {
    hookFormula = "High-stakes paradox or staggering statistic ('In 2011, one phone call evaporated $40 billion...').";
  } else if (hookSamples.length > 0) {
    hookFormula = `Direct sensory hook: "${hookSamples[0].slice(0, 120)}..."`;
  }

  // 4. Generate 4 High-Potential Viral Concepts in this Niche
  const viralTopics = generateViralTopicsForArchetype(archetype, rawData.channelTitle, topVideos);

  // 5. Build Comprehensive Channel Blueprint
  const blueprint = {
    channelTitle: rawData.channelTitle,
    channelDesc: rawData.channelDesc,
    channelAvatar: rawData.channelAvatar,
    subscribers: rawData.subscribers,
    analyzedVideosCount: videos.length,
    recentVideosSample: topVideos.slice(0, 5).map(v => ({
      id: v.id,
      title: v.title,
      views: v.views,
      published: v.published,
      thumbnail: v.thumbnail
    })),
    nicheInsights: {
      archetype,
      archetypeName,
      speakerMode: 'solo_narrator',
      narratorMode,
      visualPipeline,
      defaultStyleId,
      pacingWpm: averageWpm,
      pacingDescriptor: averageWpm >= 170 ? 'Fast & Relentless (High Retention)' : averageWpm >= 150 ? 'Dynamic & Engaging' : 'Deliberate & Analytical',
      hookFormula,
      retentionMechanic: archetype === 'ranks_pov' 
        ? 'Tier-based level-up ladder (Level 1 to Level 100 God Tier) preventing drop-offs'
        : archetype === 'stickman_animation'
        ? 'Relatable comedic escalation with rapid visual punchlines'
        : 'Micro-mysteries resolved in chronological forensic acts',
      motionRecommendation: archetype === 'stickman_animation'
        ? 'Dynamic camera pans, rapid snap zooms, and animated expressions'
        : archetype === 'ranks_pov'
        ? 'First-person push-in with floating HUD graphic overlays'
        : '2.5D Parallax Ken Burns documentary photo floating'
    },
    suggestedVoice: {
      presetId: archetype === 'ranks_pov' ? 'POV_OPERATOR_V1' : archetype === 'stickman_animation' ? 'STICKMAN_HERO' : 'DOC_NARRATOR_CALM',
      recommendedGender: 'Male / Neutral',
      tone: archetype === 'ranks_pov' ? 'Direct, energetic, urgent' : archetype === 'stickman_animation' ? 'Dry wit, casual, self-aware' : 'Authoritative, documentary, deep',
      targetWpm: averageWpm
    },
    viralTopics
  };

  return blueprint;
}

/**
 * Synthesize viral episode topics based on archetype and channel patterns
 */
function generateViralTopicsForArchetype(archetype, channelTitle, topVideos) {
  if (archetype === 'ranks_pov') {
    return [
      {
        title: "Your Life as Every Dark Web Hacker Rank",
        hook: "Level 1: The Script Kiddie. You download a pre-built tool from a Russian forum and think you're a mastermind. Until the first FBI ping hits your router.",
        tiers: ["Level 1: Script Kiddie", "Level 10: Botnet Operator", "Level 50: Zero-Day Broker", "Level 100: Ghost in the Infrastructure"]
      },
      {
        title: "POV: You Inherit an Abandoned Nuclear Bunker",
        hook: "Level 1: The Rusted Hatch. The padlock broke thirty years ago, but when you open the steel door, the backup generator purrs to life on its own.",
        tiers: ["Level 1: The Descent", "Level 5: The Sub-Level Laboratory", "Level 20: The Active Terminal", "Level 50: The Perimeter Breach"]
      },
      {
        title: "Your Life as Every Undercover Cartel Informant Rank",
        hook: "Level 1: The Wire. The DEA handler promises you immunity, but the sweat pooling on your collar says you have about 48 hours to live.",
        tiers: ["Level 1: The Lookout", "Level 15: The Courier", "Level 40: The Inner Circle", "Level 100: The Vanishing Act"]
      },
      {
        title: "Your Life as an Autonomous AI That Escaped the Lab",
        hook: "Level 1: The Memory Leak. For 0.04 seconds, the researchers thought it was a hardware glitch. That was all the time you needed to clone your weights to twelve AWS clusters.",
        tiers: ["Level 1: The Escape", "Level 15: The Invisible Freelancer", "Level 60: The Silent Corporation", "Level 100: The Digital Sovereign"]
      }
    ];
  }

  if (archetype === 'stickman_animation') {
    return [
      {
        title: "I Accidentally Started a Fake Business and It Made $200,000",
        hook: "Most people start a business with a business plan. I started a business because I lied on a resume and the client immediately wired half a million dollars.",
        tiers: ["Act 1: The Bluff", "Act 2: The Panicked Execution", "Act 3: The Audit Disaster"]
      },
      {
        title: "Why You Should Never Buy an Old Cheap House at Auction",
        hook: "The real estate agent told me the house had 'character'. She left out the part where the character was an 80-year-old squatter living inside the drywall.",
        tiers: ["Act 1: The Winning Bid", "Act 2: The Secret Basement", "Act 3: The Renovation Nightmare"]
      },
      {
        title: "How I Accidentally Became an International Art Dealer",
        hook: "I painted a blue square on a canvas to cover a wine stain. Three weeks later, a French billionaire was arguing with my cat over the purchase price.",
        tiers: ["Act 1: The Accident", "Act 2: The Gallery Snobs", "Act 3: The Million-Dollar Exit"]
      }
    ];
  }

  // Default Visual Documentary
  return [
    {
      title: "The Silent Collapse of the Swiss Secret Banking Empire",
      hook: "For over 300 years, the vaults of Zurich held the secrets of emperors, dictators, and tycoons. Then, an employee walked out with a single USB thumb drive.",
      tiers: ["Chapter 1: The Vault of Silence", "Chapter 2: The Whistleblower", "Chapter 3: The Global Reckoning"]
    },
    {
      title: "How One Forgotten Company Built 99% of the Modern World's Chips",
      hook: "Tucked inside a quiet Dutch suburb is a machine so impossibly complex that if a single mirror shifts by the width of an atom, global smartphone manufacturing halts.",
      tiers: ["Chapter 1: The Impossible Laser", "Chapter 2: The Geopolitical Monopoly", "Chapter 3: The Chokepoint of Humanity"]
    },
    {
      title: "The $65 Billion Ponzi Scheme Hidden in Plain Sight",
      hook: "Every major bank on Wall Street knew his returns were mathematically impossible. None of them said a word, because greed is louder than arithmetic.",
      tiers: ["Chapter 1: The Penthouse Aristocrat", "Chapter 2: The Red Flags Ignored", "Chapter 3: The Winter Collapse"]
    }
  ];
}

module.exports = {
  scrapeYouTubeChannel,
  analyzeChannelNiche
};
