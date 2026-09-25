/**
 * Universal Character & Entity Continuity Engine (Calliope-Grade Face Consistency)
 * Direct Creator-Controlled Character Casting, Face Locks, and Model Turnarounds
 * Strictly Project-Scoped: Characters belong to their respective channel workspaces.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_CRIME_CHARACTERS = {
  "jake_driver": {
    id: "jake_driver",
    name: "Jake",
    category: "crime_suspense",
    role: "Driver / Protagonist in Crisis",
    age: "22",
    seed: 8392104,
    face_locked: true,
    portrait_url: "/channel_assets/characters/jake/jake_dna_sheet_1x1.jpg",
    sheet_url: "/channel_assets/characters/jake/jake_dna_sheet_1x1.jpg",
    appearance: "22yo American male, messy disheveled textured brown hair, expressive wide panicked brown eyes, light youthful stubble, authentic relatable features, dark grey zipped hoodie over plain white t-shirt",
    personality: "Stressed, anxious, loyal, hyper-vigilant",
    visual_traits: "22yo American male, messy disheveled brown hair, intense panicked brown eyes, dark grey zip hoodie, sweat on brow, high tension cinematic",
    midjourney_cref: "char_jake: 22yo American male, messy brown hair, dark grey zip hoodie over white tee, intense emotional panic, cinematic 35mm film still --ar 16:9",
    calliope_role_tag: "Display Name (Input:character)"
  },
  "officer_miller": {
    id: "officer_miller",
    name: "Officer Miller",
    category: "crime_suspense",
    role: "Lead Highway Patrol Trooper",
    age: "45",
    seed: 9028341,
    face_locked: true,
    portrait_url: "/channel_assets/characters/officer/officer_dna_sheet_1x1.jpg",
    sheet_url: "/channel_assets/characters/officer/officer_dna_sheet_1x1.jpg",
    appearance: "45yo imposing highway patrol officer, broad athletic build, square cleft jawline, high-and-tight military haircut, piercing blue-grey eyes, dark navy state police tactical uniform, silver chest badge, high-lumen flashlight",
    personality: "Stern, unyielding, observant, intimidating authority",
    visual_traits: "45yo imposing highway patrol officer, high-and-tight haircut, stern weathered jawline, tactical uniform with silver badge, tactical flashlight",
    midjourney_cref: "char_officer: 45yo state patrol officer, tactical police uniform, high lumen flashlight in hand, reflective aviators, moody night highway --ar 16:9",
    calliope_role_tag: "Display Name (Input:character)"
  },
  "chris_passenger": {
    id: "chris_passenger",
    name: "Chris",
    category: "crime_suspense",
    role: "Passenger / Cause of Conflict",
    age: "24",
    seed: 6710492,
    face_locked: true,
    portrait_url: "/channel_assets/characters/chris/chris_dna_sheet_1x1.jpg",
    sheet_url: "/channel_assets/characters/chris/chris_dna_sheet_1x1.jpg",
    appearance: "24yo male, short clean cropped buzzcut, olive complexion, sharp angular jawline, dark olive MA-1 bomber jacket with silver sleeve zip, sweating profusely, pale terrified face, clutching black nylon gym bag",
    personality: "Guilty, panicked, secretive, defensive",
    visual_traits: "24yo male, cropped buzzcut, olive skin, dark olive bomber jacket, sweating heavily, pale guilty expression",
    midjourney_cref: "char_chris: 24yo male, buzzcut, dark olive MA-1 bomber jacket, sweating profusely, pale terrified face clutching gym bag --ar 16:9",
    calliope_role_tag: "Display Name (Input:character)"
  },
  "host_investigator": {
    id: "host_investigator",
    name: "The Host",
    category: "crime_suspense",
    role: "Series Narrator & Investigative Anchor",
    age: "30",
    seed: 4892011,
    face_locked: true,
    portrait_url: "/channel_assets/characters/host/host_face_reference_1x1.jpg",
    sheet_url: "/channel_assets/characters/host/host_studio_master_16x9.jpg",
    appearance: "30yo charismatic host, neatly groomed textured dark hair with side-part, 3-day trimmed dark stubble, warm brown eyes, black crewneck sweater, dark studio with warm amber rim light",
    personality: "Confident, knowing, dramatic, introspective",
    visual_traits: "30yo charismatic male host, dark trimmed stubble, sharp intelligent hazel eyes, black crewneck, moody dark studio with amber rim light",
    midjourney_cref: "char_host: 30yo charismatic male, dark trimmed stubble, black crewneck sweater, moody dark studio, amber rim light --ar 16:9",
    calliope_role_tag: "Display Name (Input:character)"
  }
};

class CharacterContinuityManager {
  getCharactersForProject(projectDir) {
    if (!projectDir) return Object.values(DEFAULT_CRIME_CHARACTERS);

    const charDir = path.join(projectDir, "channel_assets", "characters");
    if (!fs.existsSync(charDir)) fs.mkdirSync(charDir, { recursive: true });

    const projDbPath = path.join(charDir, "characters_db.json");
    if (fs.existsSync(projDbPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(projDbPath, 'utf8'));
        return Object.values(data);
      } catch (err) {}
    }

    // Check project channel_profile.json
    const profPath = path.join(projectDir, "channel_profile.json");
    if (fs.existsSync(profPath)) {
      try {
        const prof = JSON.parse(fs.readFileSync(profPath, 'utf8'));
        if (prof.id === 'crime_chronicles' || prof.category === 'crime_suspense') {
          fs.writeFileSync(projDbPath, JSON.stringify(DEFAULT_CRIME_CHARACTERS, null, 2), 'utf8');
          return Object.values(DEFAULT_CRIME_CHARACTERS);
        }
      } catch (e) {}
    }

    // Scan character subdirectories in this project's channel_assets/characters
    const subdirs = fs.readdirSync(charDir, { withFileTypes: true });
    const discovered = {};
    for (const d of subdirs) {
      if (!d.isDirectory()) continue;
      const dnaPath = path.join(charDir, d.name, "character_dna.json");
      if (fs.existsSync(dnaPath)) {
        try {
          const charObj = JSON.parse(fs.readFileSync(dnaPath, 'utf8'));
          discovered[charObj.id || d.name] = charObj;
        } catch (e) {}
      }
    }

    if (Object.keys(discovered).length > 0) {
      fs.writeFileSync(projDbPath, JSON.stringify(discovered, null, 2), 'utf8');
      return Object.values(discovered);
    }

    return [];
  }

  getCharacterForProject(projectDir, id) {
    const list = this.getCharactersForProject(projectDir);
    return list.find(c => c.id === id) || null;
  }

  upsertCharacterForProject(projectDir, charData) {
    if (!charData.id) throw new Error('Character ID is required');
    const charDir = path.join(projectDir, "channel_assets", "characters");
    if (!fs.existsSync(charDir)) fs.mkdirSync(charDir, { recursive: true });

    const projDbPath = path.join(charDir, "characters_db.json");
    let currentMap = {};
    if (fs.existsSync(projDbPath)) {
      try { currentMap = JSON.parse(fs.readFileSync(projDbPath, 'utf8')); } catch (e) {}
    }

    currentMap[charData.id] = {
      ...(currentMap[charData.id] || {}),
      ...charData,
      updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(projDbPath, JSON.stringify(currentMap, null, 2), 'utf8');
    return currentMap[charData.id];
  }

  generateCharacterSheetPrompt(projectDir, characterId) {
    const char = this.getCharacterForProject(projectDir, characterId);
    if (!char) return "";
    const name = char.name || "Unnamed";
    const role = char.role || "Character";
    const age = char.age || "unspecified age";
    const appearance = char.appearance || char.visualDescription || char.visual_traits || "";
    const personality = char.personality ? `Personality cues: ${char.personality}\n` : "";

    return (
      `CHARACTER SHEET - ${name}\n` +
      `Role: ${role}. Age: ${age}.\n` +
      `Appearance: ${appearance}\n` +
      `${personality}\n` +
      `Layout: single character reference sheet on clean neutral backdrop, ` +
      `multiple panels - front full body, side profile, and head portrait close-up. ` +
      `Consistent face, clothing, and proportions across all panels. High detail --ar 16:9`
    );
  }

  generatePortraitPrompt(projectDir, characterId) {
    const char = this.getCharacterForProject(projectDir, characterId);
    if (!char) return "";
    const name = char.name || "Unnamed";
    const role = char.role || "Character";
    const appearance = char.appearance || char.visualDescription || char.visual_traits || "";

    return (
      `CHARACTER PORTRAIT - ${name}\n` +
      `Role: ${role}.\n` +
      `Appearance: ${appearance}\n` +
      `Layout: waist-up portrait, sharp facial detail, consistent eye and bone structure, neutral studio lighting, 8k resolution --ar 16:9`
    );
  }

  injectFaceConsistency(projectDir, basePrompt, characterId) {
    const char = this.getCharacterForProject(projectDir, characterId);
    if (!char) return basePrompt;
    return `${basePrompt} | [FACE_LOCK: ${char.name} - ${char.appearance || char.visualDescription}] (Seed: ${char.seed || 12345})`;
  }
}

module.exports = new CharacterContinuityManager();
