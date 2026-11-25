/**
 * Moteur de calcul des classements FAS (Simulation Réelle, Créneaux & Points de Guerre)
 */

// Barème de coût pour franchir 100 niveaux selon le niveau de technologie (0 à 5)
export const TECH_COSTS_100 = {
  mount: [99000, 86400, 74250, 65532, 56600, 50160],
  skills: [379800, 360810, 341820, 322830, 303840, 284850],
  eggs: [191400, 174000, 159500, 147300, 136800, 127600]
};

export const MAX_ASCENSION = 3;
export const MAX_LEVEL_STANDARD = 100;
export const MAX_LEVEL_ASC3 = 150;
export const MAX_LEVEL_FORGE = 35;

// Coût en ressources d'une invocation unitaire
export const RESOURCE_PER_INVOCATION = {
  skills: 30,
  eggs: 100,
  mount: 40
};

// Niveau de technologie de référence correspondant au tableau officiel 101-150
export const LATE_GAME_REF_TECH = {
  skills: 5,
  eggs: 5,
  mount: 4
};

// Invocations par niveau pour les niveaux <= 100
export const STANDARD_INVOCATIONS_PER_LEVEL = {
  skills: 110,
  eggs: 23,
  mount: 20
};

// Tableau officiel des invocations requises par palier pour les niveaux 101 à 150 (Ascension 3)
export const LATE_GAME_INVOCATIONS = {
  skills: {
    101: 185, 102: 260, 103: 335, 104: 410, 105: 485,
    106: 560, 107: 635, 108: 710, 109: 785, 110: 860,
    111: 935, 112: 1010, 113: 1085, 114: 1160, 115: 1235,
    116: 1310, 117: 1385, 118: 1460, 119: 1500, 120: 1500,
    121: 1500, 122: 1500, 123: 1500, 124: 1500, 125: 1500,
    126: 1500, 127: 1500, 128: 1500, 129: 1500, 130: 1500,
    131: 1500, 132: 1500, 133: 1500, 134: 1500, 135: 1500,
    136: 1500, 137: 1500, 138: 1500, 139: 1500, 140: 1500,
    141: 1500, 142: 1500, 143: 1500, 144: 1500, 145: 1500,
    146: 1500, 147: 1500, 148: 1500, 149: 1500, 150: 1500
  },
  eggs: {
    101: 32, 102: 41, 103: 50, 104: 59, 105: 68,
    106: 77, 107: 86, 108: 95, 109: 104, 110: 113,
    111: 122, 112: 131, 113: 140, 114: 149, 115: 158,
    116: 167, 117: 176, 118: 185, 119: 194, 120: 203,
    121: 212, 122: 221, 123: 230, 124: 239, 125: 248,
    126: 257, 127: 266, 128: 275, 129: 284, 130: 293,
    131: 302, 132: 311, 133: 320, 134: 329, 135: 338,
    136: 347, 137: 356, 138: 365, 139: 374, 140: 383,
    141: 392, 142: 401, 143: 410, 144: 419, 145: 428,
    146: 437, 147: 446, 148: 455, 149: 464, 150: 473
  },
  mount: {
    101: 32, 102: 44, 103: 56, 104: 68, 105: 80,
    106: 92, 107: 104, 108: 116, 109: 128, 110: 140,
    111: 152, 112: 164, 113: 176, 114: 188, 115: 200,
    116: 212, 117: 224, 118: 236, 119: 248, 120: 260,
    121: 272, 122: 284, 123: 296, 124: 308, 125: 320,
    126: 332, 127: 344, 128: 356, 129: 368, 130: 380,
    131: 392, 132: 404, 133: 416, 134: 428, 135: 440,
    136: 452, 137: 464, 138: 476, 139: 488, 140: 500,
    141: 512, 142: 524, 143: 536, 144: 548, 145: 560,
    146: 572, 147: 584, 148: 596, 149: 608, 150: 620
  }
};

/**
 * Retourne le niveau maximal autorisé dans une ascension donnée
 */
export function getMaxLevelForAscension(category, ascension) {
  if (category === 'forge') return MAX_LEVEL_FORGE;
  return Number(ascension) >= MAX_ASCENSION ? MAX_LEVEL_ASC3 : MAX_LEVEL_STANDARD;
}

/**
 * Retourne le nombre d'invocations requises pour atteindre un niveau cible
 */
export function getInvocationsForLevel(category, targetLevel) {
  if (targetLevel >= 101 && targetLevel <= MAX_LEVEL_ASC3) {
    return LATE_GAME_INVOCATIONS[category]?.[targetLevel] || 0;
  }
  return STANDARD_INVOCATIONS_PER_LEVEL[category] || 0;
}

/**
 * Retourne le coût en ressources pour passer au niveau cible (targetLevel) dans l'ascension donnée,
 * en appliquant la réduction de technologie (0 à 5)
 */
export function getLevelCost(category, ascension, targetLevel, techLevel) {
  const costs = TECH_COSTS_100[category];
  if (!costs) return 0;
  const techClamped = Math.max(0, Math.min(5, Number(techLevel) || 0));

  if (Number(ascension) === MAX_ASCENSION && targetLevel >= 101 && targetLevel <= MAX_LEVEL_ASC3) {
    const invocs = getInvocationsForLevel(category, targetLevel);
    const resPerInvoc = RESOURCE_PER_INVOCATION[category] || 0;
    const refTech = LATE_GAME_REF_TECH[category] ?? 5;
    const techRatio = costs[techClamped] / costs[refTech];
    return invocs * resPerInvoc * techRatio;
  }

  return costs[techClamped] / 100;
}

/**
 * Simule la dépense des ressources avec le niveau de tech actuel
 * @param {string} category 'skills' | 'eggs' | 'mount' | 'forge'
 * @param {number} ascension 0 à 3
 * @param {number} currentLevel 0 à 100 (ou 0 à 150 en Asc. 3, 0 à 35 pour la forge)
 * @param {number} techLevel 0 à 5
 * @param {number} resources
 * @param {boolean} isOrdreAscension true pour appliquer la règle rush (seuil 30/100 sur nouvelles ascensions)
 */
export function simulateRealProgression(category, ascension, currentLevel, techLevel, resources, isOrdreAscension = false) {
  const asc = Math.max(0, Math.min(MAX_ASCENSION, Number(ascension) || 0));
  const res = Math.max(0, Number(resources) || 0);

  if (category === 'forge') {
    const lvl = Math.max(0, Math.min(MAX_LEVEL_FORGE, Number(currentLevel) || 0));
    return {
      levelsGained: 0,
      invocationsGained: 0,
      totalAbsoluteLevels: (asc * MAX_LEVEL_FORGE) + lvl,
      finalAscension: asc,
      finalLevel: lvl,
      remainingResources: res,
      isMaxed: (asc >= MAX_ASCENSION && lvl >= MAX_LEVEL_FORGE)
    };
  }

  const maxLvlForCurrentAsc = getMaxLevelForAscension(category, asc);
  const lvl = Math.max(0, Math.min(maxLvlForCurrentAsc, Number(currentLevel) || 0));

  // Si le joueur a déjà atteint le maximum absolu du jeu (Ascension 3, Niveau 150)
  if (asc >= MAX_ASCENSION && lvl >= MAX_LEVEL_ASC3) {
    return {
      levelsGained: 0,
      invocationsGained: 0,
      totalAbsoluteLevels: (MAX_ASCENSION * 100) + MAX_LEVEL_ASC3,
      finalAscension: MAX_ASCENSION,
      finalLevel: MAX_LEVEL_ASC3,
      remainingResources: res,
      isMaxed: true
    };
  }

  const costs = TECH_COSTS_100[category];
  if (!costs) {
    return {
      levelsGained: 0,
      invocationsGained: 0,
      totalAbsoluteLevels: (asc * 100) + lvl,
      finalAscension: asc,
      finalLevel: lvl,
      remainingResources: res,
      isMaxed: false
    };
  }

  const techClamped = Math.max(0, Math.min(5, Number(techLevel) || 0));
  const costPerLevel100 = costs[techClamped] / 100;
  const EPS = 1e-9;

  let curAsc = asc;
  let curLvl = lvl;
  let remainingRes = res;
  let levelsGained = 0;
  let invocationsGained = 0;

  if (isOrdreAscension) {
    if (curAsc >= MAX_ASCENSION) {
      // Déjà en Ascension 3 : progression jusqu'au niveau 150 sans contrainte de seuil 30/100
      while (curLvl < MAX_LEVEL_ASC3) {
        const nextLvl = curLvl + 1;
        const cost = getLevelCost(category, MAX_ASCENSION, nextLvl, techClamped);
        if (remainingRes + EPS < cost) break;
        remainingRes -= cost;
        curLvl = nextLvl;
        levelsGained += 1;
        invocationsGained += getInvocationsForLevel(category, nextLvl);
      }
    } else {
      // Normalisation : si le joueur a saisi lvl = 100 en Asc < 3, il est au seuil de l'ascension suivante (Asc+1, Niv 0)
      if (curLvl >= MAX_LEVEL_STANDARD && curAsc < MAX_ASCENSION) {
        curAsc += 1;
        curLvl = 0;
      }

      // 1. Finir l'ascension en cours si elle a déjà été entamée (curLvl > 0)
      if (curLvl > 0) {
        while (curLvl < MAX_LEVEL_STANDARD) {
          if (remainingRes + EPS < costPerLevel100) break;
          remainingRes -= costPerLevel100;
          curLvl += 1;
          levelsGained += 1;
          invocationsGained += getInvocationsForLevel(category, curLvl);
        }
        if (curLvl >= MAX_LEVEL_STANDARD && curAsc < MAX_ASCENSION) {
          curAsc += 1;
          curLvl = 0;
        }
      }

      // 2. Traitement des ascensions suivantes entamées à curLvl === 0 :
      // Règle Rush : chaque nouvelle ascension exige d'atteindre au MINIMUM le niveau 30/100.
      while (curAsc <= MAX_ASCENSION && curLvl === 0) {
        if (remainingRes + EPS < 30 * costPerLevel100) {
          // Seuil minimal 30/100 non atteint : arrêt au palier précédent
          break;
        }

        if (curAsc < MAX_ASCENSION) {
          while (curLvl < MAX_LEVEL_STANDARD) {
            if (remainingRes + EPS < costPerLevel100) break;
            remainingRes -= costPerLevel100;
            curLvl += 1;
            levelsGained += 1;
            invocationsGained += getInvocationsForLevel(category, curLvl);
          }
          if (curLvl >= MAX_LEVEL_STANDARD) {
            curAsc += 1;
            curLvl = 0;
          } else {
            break;
          }
        } else {
          // curAsc === MAX_ASCENSION : progression de 1 à 150 avec coûts progressifs dès 101
          while (curLvl < MAX_LEVEL_ASC3) {
            const nextLvl = curLvl + 1;
            const cost = getLevelCost(category, MAX_ASCENSION, nextLvl, techClamped);
            if (remainingRes + EPS < cost) break;
            remainingRes -= cost;
            curLvl = nextLvl;
            levelsGained += 1;
            invocationsGained += getInvocationsForLevel(category, nextLvl);
          }
          break;
        }
      }
    }
  } else {
    // Classement réel standard : progression libre jusqu'à Ascension 3 Niveau 150
    if (curAsc < MAX_ASCENSION && curLvl >= MAX_LEVEL_STANDARD) {
      curAsc += 1;
      curLvl = 0;
    }

    while (!(curAsc === MAX_ASCENSION && curLvl >= MAX_LEVEL_ASC3)) {
      const nextLvl = curLvl + 1;
      const cost = getLevelCost(category, curAsc, nextLvl, techClamped);
      if (remainingRes + EPS < cost) break;

      remainingRes -= cost;
      curLvl = nextLvl;
      levelsGained += 1;
      invocationsGained += getInvocationsForLevel(category, nextLvl);

      if (curAsc < MAX_ASCENSION && curLvl >= MAX_LEVEL_STANDARD) {
        curAsc += 1;
        curLvl = 0;
      }
    }
  }

  const totalAbsoluteLevels = (curAsc * 100) + curLvl;
  const remainingResources = Math.max(0, Math.round(remainingRes));

  return {
    levelsGained,
    invocationsGained,
    totalAbsoluteLevels,
    finalAscension: curAsc,
    finalLevel: curLvl,
    remainingResources,
    isMaxed: (curAsc >= MAX_ASCENSION && curLvl >= MAX_LEVEL_ASC3)
  };
}

/**
 * Calcule les Points de Guerre (War Points) selon les formules officielles
 */
export function calculateWarPoints(category, levelsGained, fusions = 0, invocationsGained = null) {
  const lvls = Math.max(0, Number(levelsGained) || 0);
  const fusionsCount = Math.max(0, Number(fusions) || 0);
  const useExactInvocs = invocationsGained !== null && invocationsGained !== undefined;
  const invocs = useExactInvocs ? Math.max(0, Number(invocationsGained) || 0) : null;

  if (category === 'skills') {
    // Compétence : invocations franchies * 175 pts (110/niv <= 100, tableau officiel 101-150)
    const totalInvocs = useExactInvocs ? invocs : (lvls * 110);
    return totalInvocs * 175;
  } else if (category === 'eggs') {
    // Œufs : (fusions * 2250) + (invocations franchies * 2250 pts)
    const ptsFusions = fusionsCount * 2250;
    const totalInvocs = useExactInvocs ? invocs : (lvls * 23);
    const ptsInvocations = totalInvocs * 2250;
    return ptsFusions + ptsInvocations;
  } else if (category === 'mount') {
    // Monture : (fusions * 1080) + (invocations franchies * 1080 pts * 2)
    const ptsFusions = fusionsCount * 1080;
    const totalInvocs = useExactInvocs ? invocs : (lvls * 20);
    const ptsInvocations = totalInvocs * 1080 * 2;
    return ptsFusions + ptsInvocations;
  }
  return 0;
}

/**
 * Compare deux joueurs selon les critères d'Avancement Réel (Dépense simulée des ressources)
 */
function compareAvancementReel(a, b, category) {
  if (category === 'forge') {
    return compareAvancementBrut(a, b, 'forge');
  }

  const simA = a.simulations?.[category] || simulateRealProgression(
    category,
    category === 'skills' ? a.skills_ascension : category === 'eggs' ? a.eggs_ascension : a.mount_ascension,
    category === 'skills' ? a.skills_ascension_level : category === 'eggs' ? a.eggs_ascension_level : a.mount_ascension_level,
    category === 'skills' ? a.skills_tech_level : category === 'eggs' ? a.eggs_tech_level : a.mount_tech_level,
    category === 'skills' ? a.skills_tickets : category === 'eggs' ? a.eggs_count : a.mount_keys
  );

  const simB = b.simulations?.[category] || simulateRealProgression(
    category,
    category === 'skills' ? b.skills_ascension : category === 'eggs' ? b.eggs_ascension : b.mount_ascension,
    category === 'skills' ? b.skills_ascension_level : category === 'eggs' ? b.eggs_ascension_level : b.mount_ascension_level,
    category === 'skills' ? b.skills_tech_level : category === 'eggs' ? b.eggs_tech_level : b.mount_tech_level,
    category === 'skills' ? b.skills_tickets : category === 'eggs' ? b.eggs_count : b.mount_keys
  );

  // 1) Ascension simulée DESC
  if (simB.finalAscension !== simA.finalAscension) return simB.finalAscension - simA.finalAscension;
  // 2) Niveau dans l'ascension simulé DESC
  if (simB.finalLevel !== simA.finalLevel) return simB.finalLevel - simA.finalLevel;
  // 3) Ressources résiduelles DESC
  if (simB.remainingResources !== simA.remainingResources) return simB.remainingResources - simA.remainingResources;

  // 4) Tech Level DESC
  const techA = category === 'skills' ? a.skills_tech_level : category === 'eggs' ? a.eggs_tech_level : a.mount_tech_level;
  const techB = category === 'skills' ? b.skills_tech_level : category === 'eggs' ? b.eggs_tech_level : b.mount_tech_level;
  if (techB !== techA) return techB - techA;

  return new Date(a.created_at || 0) - new Date(b.created_at || 0);
}

/**
 * Compare deux joueurs selon les critères d'Avancement Brut (Hors Ressources, sans dépense)
 */
function compareAvancementBrut(a, b, category) {
  let ascA, ascB, techA, techB, lvlA, lvlB, resA, resB;

  switch (category) {
    case 'skills':
      ascA = a.skills_ascension; ascB = b.skills_ascension;
      techA = a.skills_tech_level; techB = b.skills_tech_level;
      lvlA = a.skills_ascension_level; lvlB = b.skills_ascension_level;
      resA = a.skills_tickets; resB = b.skills_tickets;
      break;
    case 'eggs':
      ascA = a.eggs_ascension; ascB = b.eggs_ascension;
      techA = a.eggs_tech_level; techB = b.eggs_tech_level;
      lvlA = a.eggs_ascension_level; lvlB = b.eggs_ascension_level;
      resA = a.eggs_count; resB = b.eggs_count;
      break;
    case 'mount':
      ascA = a.mount_ascension; ascB = b.mount_ascension;
      techA = a.mount_tech_level; techB = b.mount_tech_level;
      lvlA = a.mount_ascension_level; lvlB = b.mount_ascension_level;
      resA = a.mount_keys; resB = b.mount_keys;
      break;
    case 'forge':
      ascA = a.forge_ascension; ascB = b.forge_ascension;
      techA = a.forge_tech_level || 0; techB = b.forge_tech_level || 0;
      lvlA = a.forge_ascension_level; lvlB = b.forge_ascension_level;
      resA = a.forge_hammers; resB = b.forge_hammers;
      break;
    default:
      return 0;
  }

  if (ascB !== ascA) return ascB - ascA;
  if (techB !== techA) return techB - techA;
  if (lvlB !== lvlA) return lvlB - lvlA;
  if (resB !== resA) return resB - resA;

  return new Date(a.created_at || 0) - new Date(b.created_at || 0);
}

/**
 * Vérifie si un joueur a atteint le palier post-ascension (Ascension 3, Niveau >= 100)
 * Il ne peut plus passer d'ascension, mais peut continuer jusqu'au niveau 150 ou dépenser ses fusions.
 */
export function isPlayerPostAscension(player, category) {
  if (!player || category === 'forge') return false;
  let asc = 0, lvl = 0;
  if (category === 'skills') {
    asc = player.skills_ascension;
    lvl = player.skills_ascension_level;
  } else if (category === 'eggs') {
    asc = player.eggs_ascension;
    lvl = player.eggs_ascension_level;
  } else if (category === 'mount') {
    asc = player.mount_ascension;
    lvl = player.mount_ascension_level;
  }
  return (Number(asc) >= MAX_ASCENSION && Number(lvl) >= MAX_LEVEL_STANDARD);
}

/**
 * Vérifie si un joueur a atteint le niveau maximum absolu (Ascension 3, Niveau 150 ou 35 pour la forge)
 */
export function isPlayerMaxed(player, category) {
  if (!player) return false;
  if (category === 'forge') {
    return (Number(player.forge_ascension) >= MAX_ASCENSION && Number(player.forge_ascension_level) >= MAX_LEVEL_FORGE);
  }
  let asc = 0, lvl = 0;
  if (category === 'skills') {
    asc = player.skills_ascension;
    lvl = player.skills_ascension_level;
  } else if (category === 'eggs') {
    asc = player.eggs_ascension;
    lvl = player.eggs_ascension_level;
  } else if (category === 'mount') {
    asc = player.mount_ascension;
    lvl = player.mount_ascension_level;
  }
  return (Number(asc) >= MAX_ASCENSION && Number(lvl) >= MAX_LEVEL_ASC3);
}

/**
 * Vérifie si un joueur a coché le souhait d'ascension pour une ressource donnée
 */
export function wantsAscensionForCategory(player, category) {
  if (!player) return false;
  const slots = Array.isArray(player.available_slots) ? player.available_slots : [];
  if (category === 'skills') {
    return Boolean(player.want_skills_ascension || slots.includes('asc_skills') || slots.includes('skills'));
  }
  if (category === 'eggs') {
    return Boolean(player.want_eggs_ascension || slots.includes('asc_eggs') || slots.includes('eggs'));
  }
  if (category === 'mount') {
    return Boolean(player.want_mount_ascension || slots.includes('asc_mount') || slots.includes('mount'));
  }
  return false;
}

/**
 * Vérifie si un joueur est disponible pour le rush de nuit (01h00 - 02h00)
 */
export function isRushAvailable(player) {
  if (!player) return false;
  const slots = Array.isArray(player.available_slots) ? player.available_slots : [];
  return slots.includes('rush');
}

/**
 * Compare deux joueurs selon les critères d'Ordre d'ascension :
 * 1) Joueurs encore éligibles (invocations ou fusions) d'abord, joueurs bloqués (Asc. 3 Niv. 150 sans fusions) en fin de liste
 * 2) Priorité 1 : avoir coché "Je veux faire mon ascension" ET ne pas être déjà en Asc. 3 Niv. 100+
 * 3) Priorité 2 : Points de Guerre prévisionnels DESC
 * 4) Départage : Ressources DESC, puis Technologie DESC
 */
function compareOrdreAscension(a, b, category) {
  const blockedA = a.isFullyBlocked !== undefined ? a.isFullyBlocked : isPlayerMaxed(a, category);
  const blockedB = b.isFullyBlocked !== undefined ? b.isFullyBlocked : isPlayerMaxed(b, category);

  // Si l'un des joueurs est complètement bloqué (150 sans fusions) et pas l'autre, le bloqué est relégué en fin de liste
  if (blockedA !== blockedB) {
    return blockedA ? 1 : -1;
  }

  // Priorité 1 : Coche "Je veux faire mon ascension" (valable uniquement si le joueur peut encore passer une ascension)
  const postA = a.isPostAscension !== undefined ? a.isPostAscension : isPlayerPostAscension(a, category);
  const postB = b.isPostAscension !== undefined ? b.isPostAscension : isPlayerPostAscension(b, category);
  const wantA = !postA && wantsAscensionForCategory(a, category);
  const wantB = !postB && wantsAscensionForCategory(b, category);
  if (wantA !== wantB) {
    return wantB ? 1 : -1;
  }

  // Priorité 2 : Points de Guerre prévisionnels DESC
  const warA = a.warPoints !== undefined ? a.warPoints : 0;
  const warB = b.warPoints !== undefined ? b.warPoints : 0;
  if (warB !== warA) return warB - warA;

  // Départage : Ressources DESC
  let resA = 0, resB = 0, techA = 0, techB = 0;
  switch (category) {
    case 'skills':
      resA = a.skills_tickets; resB = b.skills_tickets;
      techA = a.skills_tech_level; techB = b.skills_tech_level;
      break;
    case 'eggs':
      resA = a.eggs_count; resB = b.eggs_count;
      techA = a.eggs_tech_level; techB = b.eggs_tech_level;
      break;
    case 'mount':
      resA = a.mount_keys; resB = b.mount_keys;
      techA = a.mount_tech_level; techB = b.mount_tech_level;
      break;
  }

  if (resB !== resA) return resB - resA;
  if (techB !== techA) return techB - techA;

  return new Date(a.created_at || 0) - new Date(b.created_at || 0);
}

/**
 * Calcule le classement complet pour une catégorie d'avancement
 * @param {Array} players 
 * @param {string} category 'skills' | 'eggs' | 'mount' | 'forge'
 * @param {boolean} isReal true pour avancement simulé réel, false pour brut
 * @param {number} limit 
 */
export function getAvancementRanking(players, category, isReal = true, limit = 50) {
  const comparator = isReal ? compareAvancementReel : compareAvancementBrut;
  const sorted = [...players].sort((a, b) => comparator(a, b, category));

  return sorted.slice(0, limit).map((p, index) => {
    const sim = simulateRealProgression(
      category,
      category === 'skills' ? p.skills_ascension : category === 'eggs' ? p.eggs_ascension : category === 'mount' ? p.mount_ascension : p.forge_ascension,
      category === 'skills' ? p.skills_ascension_level : category === 'eggs' ? p.eggs_ascension_level : category === 'mount' ? p.mount_ascension_level : p.forge_ascension_level,
      category === 'skills' ? p.skills_tech_level : category === 'eggs' ? p.eggs_tech_level : category === 'mount' ? p.mount_tech_level : (p.forge_tech_level || 0),
      category === 'skills' ? p.skills_tickets : category === 'eggs' ? p.eggs_count : category === 'mount' ? p.mount_keys : p.forge_hammers
    );

    return {
      ...p,
      rank: index + 1,
      sim
    };
  });
}

/**
 * Calcule le Classement Réel Général (somme des rangs simulés dans les 4 catégories)
 */
export function getGeneralRealRanking(players, limit = 50) {
  if (!players || players.length === 0) return [];

  const fullSkills = [...players].sort((a, b) => compareAvancementReel(a, b, 'skills'));
  const fullEggs = [...players].sort((a, b) => compareAvancementReel(a, b, 'eggs'));
  const fullMount = [...players].sort((a, b) => compareAvancementReel(a, b, 'mount'));
  const fullForge = [...players].sort((a, b) => compareAvancementReel(a, b, 'forge'));

  const skillsRankMap = new Map();
  fullSkills.forEach((p, idx) => skillsRankMap.set(p.id, idx + 1));

  const eggsRankMap = new Map();
  fullEggs.forEach((p, idx) => eggsRankMap.set(p.id, idx + 1));

  const mountRankMap = new Map();
  fullMount.forEach((p, idx) => mountRankMap.set(p.id, idx + 1));

  const forgeRankMap = new Map();
  fullForge.forEach((p, idx) => forgeRankMap.set(p.id, idx + 1));

  const generalList = players.map(p => {
    const rSkills = skillsRankMap.get(p.id) || players.length;
    const rEggs = eggsRankMap.get(p.id) || players.length;
    const rMount = mountRankMap.get(p.id) || players.length;
    const rForge = forgeRankMap.get(p.id) || players.length;
    const totalScore = rSkills + rEggs + rMount + rForge;
    const bestRank = Math.min(rSkills, rEggs, rMount, rForge);

    const simSkills = simulateRealProgression('skills', p.skills_ascension, p.skills_ascension_level, p.skills_tech_level, p.skills_tickets);
    const simEggs = simulateRealProgression('eggs', p.eggs_ascension, p.eggs_ascension_level, p.eggs_tech_level, p.eggs_count);
    const simMount = simulateRealProgression('mount', p.mount_ascension, p.mount_ascension_level, p.mount_tech_level, p.mount_keys);

    return {
      ...p,
      rankSkills: rSkills,
      rankEggs: rEggs,
      rankMount: rMount,
      rankForge: rForge,
      totalScore,
      bestRank,
      simSkills,
      simEggs,
      simMount
    };
  });

  generalList.sort((a, b) => {
    if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
    if (a.bestRank !== b.bestRank) return a.bestRank - b.bestRank;
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });

  return generalList.slice(0, limit).map((p, index) => ({
    ...p,
    rank: index + 1
  }));
}

/**
 * Calcule le Classement Hors Ressources (l'ancien classement général basé sur le brut)
 */
export function getGeneralRawRanking(players, limit = 50) {
  if (!players || players.length === 0) return [];

  const fullSkills = [...players].sort((a, b) => compareAvancementBrut(a, b, 'skills'));
  const fullEggs = [...players].sort((a, b) => compareAvancementBrut(a, b, 'eggs'));
  const fullMount = [...players].sort((a, b) => compareAvancementBrut(a, b, 'mount'));
  const fullForge = [...players].sort((a, b) => compareAvancementBrut(a, b, 'forge'));

  const skillsRankMap = new Map();
  fullSkills.forEach((p, idx) => skillsRankMap.set(p.id, idx + 1));

  const eggsRankMap = new Map();
  fullEggs.forEach((p, idx) => eggsRankMap.set(p.id, idx + 1));

  const mountRankMap = new Map();
  fullMount.forEach((p, idx) => mountRankMap.set(p.id, idx + 1));

  const forgeRankMap = new Map();
  fullForge.forEach((p, idx) => forgeRankMap.set(p.id, idx + 1));

  const generalList = players.map(p => {
    const rSkills = skillsRankMap.get(p.id) || players.length;
    const rEggs = eggsRankMap.get(p.id) || players.length;
    const rMount = mountRankMap.get(p.id) || players.length;
    const rForge = forgeRankMap.get(p.id) || players.length;
    const totalScore = rSkills + rEggs + rMount + rForge;
    const bestRank = Math.min(rSkills, rEggs, rMount, rForge);

    return {
      ...p,
      rankSkills: rSkills,
      rankEggs: rEggs,
      rankMount: rMount,
      rankForge: rForge,
      totalScore,
      bestRank
    };
  });

  generalList.sort((a, b) => {
    if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
    if (a.bestRank !== b.bestRank) return a.bestRank - b.bestRank;
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });

  return generalList.slice(0, limit).map((p, index) => ({
    ...p,
    rank: index + 1
  }));
}

/**
 * Construit la structure de l'Ordre d'Ascension avec :
 * - Les Élus (en jaune doré) : joueurs pouvant encore passer une ascension (< Asc. 3 Niv. 100) ayant coché "Je veux faire mon ascension"
 * - La suite du classement (non doré) : joueurs n'ayant pas coché l'ascension + joueurs Asc. 3 Niv. 100-149 (late game) + joueurs Asc. 3 Niv. 150 ayant des fusions disponibles
 * - Les joueurs complètement bloqués (Ascension 3 Niv. 150 sans fusions) en toute fin de liste
 */
export function getOrdreAscensionWithElus(players, category) {
  if (category !== 'skills' && category !== 'eggs' && category !== 'mount') return { elus: [], suite: [], allSorted: [] };

  // 1. Enrichir chaque joueur avec sa simulation, ses points de guerre et ses drapeaux
  const enriched = players.map(p => {
    let res = 0, asc = 0, lvl = 0, tech = 0, fusions = 0;

    if (category === 'skills') {
      res = p.skills_tickets; asc = p.skills_ascension; lvl = p.skills_ascension_level; tech = p.skills_tech_level;
    } else if (category === 'eggs') {
      res = p.eggs_count; asc = p.eggs_ascension; lvl = p.eggs_ascension_level; tech = p.eggs_tech_level; fusions = p.eggs_fusions || 0;
    } else if (category === 'mount') {
      res = p.mount_keys; asc = p.mount_ascension; lvl = p.mount_ascension_level; tech = p.mount_tech_level; fusions = p.mount_fusions || 0;
    }

    // Simulation avec règle rush (seuil 30/100 sur nouvelles ascensions, libre de 100 à 150 en Asc. 3)
    const sim = simulateRealProgression(category, asc, lvl, tech, res, true);
    const warPoints = calculateWarPoints(category, sim.levelsGained, fusions, sim.invocationsGained);
    const postAsc = isPlayerPostAscension(p, category);
    const maxed = isPlayerMaxed(p, category);
    const fullyBlocked = maxed && warPoints <= 0;
    const wantAsc = wantsAscensionForCategory(p, category);
    const rushActive = isRushAvailable(p);

    return {
      ...p,
      sim,
      warPoints,
      isPostAscension: postAsc,
      isMaxed: maxed,
      isFullyBlocked: fullyBlocked,
      wantsAscension: wantAsc,
      isRushAvailable: rushActive,
      available_slots: Array.isArray(p.available_slots) ? p.available_slots : []
    };
  });

  // 2. Séparer en 3 groupes :
  // Groupe 1 : Peut encore faire une ascension (!isPostAscension) ET a coché "Je veux faire mon ascension" (Les Élus)
  // Groupe 2 : Non bloqués (!isFullyBlocked) ET (n'a PAS coché l'ascension OU est déjà en Asc. 3 Niv. 100+)
  // Groupe 3 : Joueurs complètement bloqués (Ascension 3, Niveau 150, 0 fusion)
  const elusRaw = enriched.filter(p => !p.isPostAscension && p.wantsAscension);
  const suiteRaw = enriched.filter(p => !p.isFullyBlocked && (!p.wantsAscension || p.isPostAscension));
  const maxedRaw = enriched.filter(p => p.isFullyBlocked);

  // Trier les Élus par Points de Guerre DESC (avec départages ressources/tech)
  elusRaw.sort((a, b) => compareOrdreAscension(a, b, category));

  // Trier la suite par Points de Guerre DESC (avec départages ressources/tech)
  suiteRaw.sort((a, b) => compareOrdreAscension(a, b, category));

  // Trier les bloqués par ressources DESC
  maxedRaw.sort((a, b) => compareOrdreAscension(a, b, category));

  // Attribuer les rangs et priorités
  const elus = elusRaw.map((p, idx) => ({
    ...p,
    rank: idx + 1,
    priorityNumber: idx + 1,
    isElu: true
  }));

  const suiteList = [...suiteRaw, ...maxedRaw];
  const suite = suiteList.map((p, idx) => ({
    ...p,
    rank: elus.length + idx + 1,
    priorityNumber: idx + 1,
    isElu: false
  }));

  const allSorted = [...elus, ...suite];

  return {
    elus,
    suite,
    allSorted
  };
}
