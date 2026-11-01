  /* Built-in achievement art: a game pack may bundle official pictures (AC2's were
     cropped from a trophy-list recording; nothing is downloaded). Otherwise a
     picture is drawn from the achievement's symbol and group colour. */
  const ICON_GROUP_COLORS = {
    Story: ["#8a2a24", "#1d0b0a"],
    Tombs: ["#5b4a2c", "#15100a"],
    Collectibles: ["#24597a", "#0a1822"],
    Challenges: ["#59326f", "#170c1f"],
    Activities: ["#2f6a3b", "#0b1d0f"],
    Campaign: ["#5a5f2e", "#14160a"],
    Veteran: ["#7a2222", "#1c0707"],
    Intel: ["#2c5a74", "#09161f"],
    "Co-op & Multiplayer": ["#3b4a7a", "#0d1120"],
    Quests: ["#6a4c2a", "#1a1109"],
    Kingdom: ["#7a6224", "#1e1707"],
    Combat: ["#7a3324", "#1e0c08"],
    "Life in Albion": ["#2f6a55", "#0b1d17"],
    Online: ["#3b4a7a", "#0d1120"],
    Minigames: ["#6a2f6a", "#1b0b1b"],
    "Park Life": ["#2f6a3b", "#0b1d0f"],
    Building: ["#7a5a24", "#1e1607"],
    Missions: ["#24597a", "#0a1822"],
    Parks: ["#7a2a5a", "#1e0a16"],
    "Party Play": ["#5a2f7a", "#160b1e"],
    Talents: ["#24597a", "#0a1822"],
    Squad: ["#2f6a55", "#0b1d17"],
    Character: ["#6a4c2a", "#1a1109"],
    Exploration: ["#2c5a74", "#09161f"],
    "Downloadable content": ["#5a2f7a", "#160b1e"],
    Assassinations: ["#8a2a24", "#1d0b0a"],
    "Lairs of Romulus": ["#5b4a2c", "#15100a"],
    "Leonardo's machines": ["#7a5a24", "#1e1607"],
    Rome: ["#7a6224", "#1e1707"],
    Brotherhood: ["#59326f", "#170c1f"],
    Multiplayer: ["#3b4a7a", "#0d1120"],
    "The Da Vinci Disappearance": ["#2f6a3b", "#0b1d0f"],
  };
  const SPARE_COLORS = Object.values(ICON_GROUP_COLORS);
  function groupColors(group) {
    if (ICON_GROUP_COLORS[group]) return ICON_GROUP_COLORS[group];
    let hash = 0;
    for (const char of String(group)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return SPARE_COLORS[hash % SPARE_COLORS.length];
  }
  const F = "fill='url(#m)' stroke='none'";
  const ICON_SYMBOLS = {
    insignia: `<path ${F} d='M32 7 L11 53 Q22 47 26 40 L32 25 L38 40 Q42 47 53 53 Z'/>`,
    star: "<path d='M32 8 L38 26 L56 26 L41 37 L47 55 L32 44 L17 55 L23 37 L8 26 L26 26 Z'/>",
    door: `<path d='M14 54 V28 a12 12 0 0 1 24 0 V54 Z'/><circle ${F} cx='32' cy='41' r='2'/><path d='M44 36 H58 M52 30 L58 36 L52 42'/>`,
    animus: `<circle cx='32' cy='32' r='21'/><circle cx='32' cy='32' r='12' stroke-dasharray='4 4'/><circle ${F} cx='32' cy='32' r='5'/>`,
    dna: "<path d='M23 7 C41 15 23 24 41 32'/><path d='M41 7 C23 15 41 24 23 32'/><path d='M27 11 H37 M27 28 H37 M30 19.5 H34'/>",
    tomb: "<path d='M10 54 H54'/><path d='M16 54 V24 L32 11 L48 24 V54'/><path d='M32 25 V45 M25 32 H39'/>",
    eye: `<path d='M7 32 Q32 9 57 32 Q32 55 7 32 Z'/><circle ${F} cx='32' cy='32' r='8'/>`,
    statue: "<circle cx='32' cy='15' r='6'/><path d='M24 45 L26 25 H38 L40 45'/><path d='M19 53 H45 V45 H19 Z'/>",
    vitruvian: "<circle cx='32' cy='32' r='23'/><rect x='13' y='13' width='38' height='38'/><circle cx='32' cy='20' r='4'/><path d='M32 24 V40 M15 30 H49 M32 40 L22 52 M32 40 L42 52'/>",
    hay: "<path d='M10 51 Q32 11 54 51 Z'/><path d='M22 51 L28 31 M32 51 V25 M42 51 L36 31'/>",
    glider: "<path d='M5 35 Q32 9 59 35 Q32 27 5 35 Z'/><path d='M19 31 L32 48 L45 31 M32 26 V48'/>",
    sand: `<path d='M9 52 Q19 40 29 35'/><g ${F}><circle cx='36' cy='29' r='3'/><circle cx='45' cy='22' r='2.5'/><circle cx='42' cy='35' r='2.5'/><circle cx='52' cy='30' r='2'/><circle cx='50' cy='14' r='2'/><circle cx='55' cy='40' r='1.8'/></g>`,
    poison: "<path d='M25 9 H39 M28 9 V24 L17 46 Q15 55 24 55 H40 Q49 55 47 46 L36 24 V9'/><path d='M21 41 H43'/>",
    shield: "<path d='M32 7 L52 15 V31 Q52 48 32 57 Q12 48 12 31 V15 Z'/><path d='M23 32 L30 39 L42 25'/>",
    coin: "<circle cx='32' cy='32' r='21'/><circle cx='32' cy='32' r='15'/><path d='M36 21 Q30 19 29 26 V44 Q28 49 24 47 M25 32 H37'/>",
    bolt: `<path ${F} d='M37 5 L15 36 H30 L25 59 L49 26 H34 Z'/>`,
    spear: `<path d='M9 55 L45 19'/><path ${F} d='M45 19 L41 10 L56 8 L54 23 Z'/>`,
    target: `<circle cx='32' cy='32' r='19'/><circle ${F} cx='32' cy='32' r='5'/><path d='M32 6 V16 M32 48 V58 M6 32 H16 M48 32 H58'/>`,
    fist: "<rect x='17' y='20' width='30' height='23' rx='6'/><path d='M24 20 V29 M31.5 20 V29 M39 20 V29 M17 33 H11 V24'/><path d='M23 43 V55 H41 V43'/>",
    flag: `<path d='M17 57 V7'/><path ${F} fill-opacity='.45' d='M17 9 H49 L42 19 L49 29 H17 Z'/>`,
    cape: `<path d='M15 9 H49 V53 L32 43 L15 53 Z'/><path ${F} d='M32 17 L23 34 H41 Z'/>`,
    hammer: `<path d='M12 52 L37 27'/><path ${F} d='M29 14 L46 31 L53 24 L36 7 Z'/>`,
    tower: "<path d='M24 55 L26 22 H38 L40 55'/><path d='M22 22 H42 V14 H22 Z M28 14 V9 H36 V14'/><path d='M7 55 H57'/>",
    dive: "<path d='M32 7 V39 M23 31 L32 41 L41 31'/><path d='M8 49 Q14 45 20 49 T32 49 T44 49 T56 49'/><path d='M13 57 Q19 53 25 57 T37 57 T49 57'/>",
    letter: `<rect x='9' y='17' width='46' height='31' rx='2'/><path d='M9 19 L32 36 L55 19'/><circle ${F} cx='32' cy='45' r='4'/>`,
    glyph: `<path d='M32 7 L57 53 H7 Z'/><circle cx='32' cy='38' r='7'/><circle ${F} cx='32' cy='38' r='2.2'/>`,
    puzzle: "<path d='M12 20 H25 a7 7 0 1 1 14 0 H52 V31 a7 7 0 1 0 0 14 V55 H12 Z'/>",
    painting: "<rect x='9' y='11' width='46' height='42'/><rect x='15' y='17' width='34' height='30'/><path d='M15 43 L25 31 L33 39 L39 33 L49 43'/>",
    crown: "<path d='M9 46 L13 17 L24 31 L32 12 L40 31 L51 17 L55 46 Z'/><path d='M9 54 H55'/>",
    drops: "<path fill='#111' d='M22 11 Q10 31 10 39 a12 12 0 0 0 24 0 Q34 31 22 11 Z'/><path fill='#eee' d='M42 17 Q31 35 31 42 a11 11 0 0 0 22 0 Q53 35 42 17 Z'/>",
    feather: "<path d='M50 7 Q18 17 15 51 Q41 47 50 7 Z'/><path d='M10 57 L41 20'/>",
    heart: "<path d='M32 54 L11 32 a10.5 10.5 0 0 1 21 -14 a10.5 10.5 0 0 1 21 14 Z'/>",
    coins: "<circle cx='22' cy='40' r='11'/><circle cx='42' cy='44' r='9'/><circle cx='38' cy='20' r='10'/>",
    swords: "<path d='M12 12 L46 46 M52 12 L18 46'/><path d='M40 50 L50 40 M24 50 L14 40'/><circle cx='52' cy='52' r='3'/><circle cx='12' cy='52' r='3'/>",
    bars: "<path d='M12 56 V24 a20 14 0 0 1 40 0 V56 Z'/><path d='M22 16 V56 M32 11 V56 M42 16 V56 M12 36 H52'/>",
    bell: "<path d='M20 44 V30 a12 12 0 0 1 24 0 V44 L49 50 H15 Z'/><path d='M32 12 V18'/><circle cx='32' cy='55' r='3.5'/>",
    dome: "<path d='M12 54 H52 M16 54 V38 H48 V54'/><path d='M18 38 a14 14 0 0 1 28 0'/><path d='M32 24 V14 M28 18 H36 M24 54 V44 M32 54 V44 M40 54 V44'/>",
    eagle: `<path ${F} d='M32 20 L22 12 Q10 10 4 18 Q16 18 20 24 Q10 26 6 34 Q18 30 26 32 L28 46 L32 54 L36 46 L38 32 Q46 30 58 34 Q54 26 44 24 Q48 18 60 18 Q54 10 42 12 Z'/>`,
    sword: "<path d='M32 4 L36 10 V41 H28 V10 Z'/><path d='M17 41 H47 M32 41 V53'/><circle cx='32' cy='57' r='3'/>",
    medal: `<path d='M22 6 L32 24 L42 6'/><circle cx='32' cy='40' r='15'/><path ${F} d='M32 31 L35 38 L42 38 L36 42 L38 49 L32 45 L26 49 L28 42 L22 38 L29 38 Z'/>`,
    skull: `<path d='M14 30 a18 18 0 0 1 36 0 V40 L44 44 V54 H20 V44 L14 40 Z'/><circle ${F} cx='25' cy='33' r='5'/><circle ${F} cx='39' cy='33' r='5'/><path d='M27 54 V48 M32 54 V48 M37 54 V48'/>`,
    tank: "<rect x='8' y='36' width='48' height='14' rx='7'/><path d='M16 36 V27 H40 V36 M40 30 H58'/><circle cx='17' cy='43' r='2'/><circle cx='32' cy='43' r='2'/><circle cx='47' cy='43' r='2'/>",
    plane: `<path ${F} d='M32 5 L36 22 L58 34 V39 L36 33 L35 48 L43 54 V58 L32 55 L21 58 V54 L29 48 L28 33 L6 39 V34 L28 22 Z'/>`,
    flame: `<path ${F} d='M32 6 Q46 22 44 36 Q50 30 49 24 Q58 38 50 50 Q43 59 32 59 Q19 59 14 48 Q10 36 20 26 Q20 34 25 37 Q22 20 32 6 Z'/>`,
    key: "<circle cx='20' cy='32' r='11'/><circle cx='20' cy='32' r='4'/><path d='M31 32 H57 M50 32 V41 M43 32 V39'/>",
    flower: `<circle cx='32' cy='18' r='8'/><circle cx='46' cy='28' r='8'/><circle cx='41' cy='44' r='8'/><circle cx='23' cy='44' r='8'/><circle cx='18' cy='28' r='8'/><circle ${F} cx='32' cy='32' r='6'/>`,
    book: "<path d='M32 16 Q22 10 9 12 V50 Q22 48 32 54 Q42 48 55 50 V12 Q42 10 32 16 Z'/><path d='M32 16 V54'/>",
    house: "<path d='M8 32 L32 10 L56 32'/><path d='M15 26 V54 H49 V26'/><path d='M27 54 V40 H37 V54'/>",
    music: `<path d='M24 46 V14 L50 8 V40'/><circle ${F} cx='18' cy='46' r='7'/><circle ${F} cx='44' cy='40' r='7'/>`,
    ring: `<circle cx='32' cy='40' r='16'/><path ${F} d='M24 10 H40 L44 16 L32 26 L20 16 Z'/>`,
    coaster: "<path d='M4 50 Q14 8 24 30 T42 22 Q50 10 60 40'/><path d='M8 56 H58 M14 56 V36 M28 56 V36 M42 56 V24 M54 56 V34'/>",
    dog: "<path d='M14 50 V32 L22 22 L22 12 L30 20 H40 L48 28 V36 H38 L34 44 V50'/><circle cx='41' cy='27' r='2'/><path d='M14 38 Q6 34 8 26'/>",
    card: `<rect x='14' y='7' width='36' height='50' rx='3'/><circle ${F} cx='32' cy='28' r='8'/><path d='M26 44 H38 M24 50 H40'/>`,
    gear: "<circle cx='32' cy='32' r='10'/><path d='M32 6 V16 M32 48 V58 M6 32 H16 M48 32 H58 M14 14 L21 21 M43 43 L50 50 M50 14 L43 21 M21 43 L14 50'/><circle cx='32' cy='32' r='18'/>",
  };
  const iconCache = new Map();
  function builtInIcon(game, index) {
    if (typeof game.art?.[index] === "string") return game.art[index];
    return generatedIcon(game, index);
  }
  // Achievements carry an icon symbol and an optional numeral (AC2's DNA sequences).
  function generatedIcon(game, index) {
    const cacheKey = `${game.appId}:${index}`;
    if (iconCache.has(cacheKey)) return iconCache.get(cacheKey);
    const achievement = game.achievements[index] || {};
    const symbol = achievement.icon || "insignia", numeral = achievement.numeral;
    const [light, dark] = groupColors(achievement.group);
    const label = numeral
      ? `<text x='32' y='54' text-anchor='middle' font-family='Georgia,serif' font-weight='700' font-size='${numeral.length > 3 ? 15 : 18}' fill='url(#m)'>${numeral}</text>`
      : "";
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs>"
      + `<radialGradient id='g' cx='50%' cy='35%' r='75%'><stop offset='0' stop-color='${light}'/><stop offset='1' stop-color='${dark}'/></radialGradient>`
      + "<linearGradient id='m' gradientUnits='userSpaceOnUse' x1='0' y1='4' x2='0' y2='60'><stop offset='0' stop-color='#fbe7a1'/><stop offset='1' stop-color='#c8933a'/></linearGradient></defs>"
      + "<rect width='64' height='64' fill='url(#g)'/><rect x='1.5' y='1.5' width='61' height='61' fill='none' stroke='#ffffff26'/>"
      + `<g fill='none' stroke='url(#m)' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'>${ICON_SYMBOLS[symbol] || ICON_SYMBOLS.insignia}</g>${label}</svg>`;
    const url = "data:image/svg+xml," + encodeURIComponent(svg);
    iconCache.set(cacheKey, url);
    return url;
  }
  function iconFor(game, index) {
    const custom = game.customIcons[String(index)];
    return typeof custom === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(custom) ? custom : builtInIcon(game, index);
  }
