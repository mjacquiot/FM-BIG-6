/**
 * Moteur de calcul des classements FAS (Simulation Réelle, Créneaux & Points de Guerre)
 */

// Barème de coût pour franchir 100 niveaux selon le niveau de technologie (0 à 5)
export const TECH_COSTS_100 = {
  mount: [99000, 86400, 74250, 65532, 56600, 50160],
  skills: [379800, 360810, 341820, 322830, 303840, 284850],
  eggs: [191400, 174000, 159500, 147300, 136800, 127600]
};

/**
 * Simule la dépense des ressources avec le niveau de tech actuel
 * @param {string} category 'skills' | 'eggs' | 'mount' | 'forge'
 * @param {number} ascension 0 à 3
 * @param {number} currentLevel 0 à 100 (ou 0 à 35 pour la forge)
 * @param {number} techLevel 0 à 5
 * @param {number} resources
 * @param {boolean} isOrdreAscension true pour limiter la simulation à un seul passage d'ascension (règle rush)
 */
export function simulateRealProgression(category, ascension, currentLevel, techLevel, resources, isOrdreAscension = false) {
  const asc = Math.max(0, Math.min(3, Number(ascension) || 0));
  const res = Math.max(0, Number(resources) || 0);

  if (category === 'forge') {
    const lvl = Math.max(0, Math.min(35, Number(currentLevel) || 0));
    return {
      levelsGained: 0,
      totalAbsoluteLevels: (asc * 35) + lvl,
      finalAscension: asc,
      finalLevel: lvl,
      remainingResources: res,
      isMaxed: (asc >= 3 && lvl >= 35)
    };
  }

  const lvl = Math.max(0, Math.min(100, Number(currentLevel) || 0));

  // Si le joueur a déjà atteint le maximum absolu du jeu (Ascension 3, Niveau 100)
  if (asc >= 3 && lvl >= 100) {
    return {
      levelsGained: 0,
      totalAbsoluteLevels: 400,
      finalAscension: 3,
      finalLevel: 100,
      remainingResources: res,
      isMaxed: true
    };
  }

  const costs = TECH_COSTS_100[category];
  if (!costs) {
    return {
      levelsGained: 0,
      totalAbsoluteLevels: (asc * 100) + lvl,
      finalAscension: asc,
      finalLevel: lvl,
      remainingResources: res,
      isMaxed: false
    };
  }

  const techClamped = Math.max(0, Math.min(5, Number(techLevel) || 0));
  const cost100 = costs[techClamped];
  const costPerLevel = cost100 / 100;

  // Niveaux que les ressources peuvent acheter
  const affordableLevels = Math.floor(res / costPerLevel);

  // Plafond absolu du jeu : Ascension 3, Niveau 100 (l'ascension 4 n'existe pas)
  const levelsToGameMax = (3 - asc) * 100 + (100 - lvl);

  let maxAllowedLevels = levelsToGameMax;

  // Règle spécifique à l'Ordre d'Ascension (Rush) :
  // "dans l'ordre d'ascension je veux que tu puisse simuler un seul passage d'ascension,
  // si le nombre de ressource pourrait entrainer une double ascension, tu t'arrêteras à une seule dans la simulation."
  if (isOrdreAscension) {
    if (asc < 3) {
      // 1 seul passage d'ascension max :
      // - Finir l'ascension en cours : (100 - lvl)
      // - Monter jusqu'au niveau 100 dans l'ascension suivante (asc + 1) : 100 niveaux
      // Traverser asc + 2 serait une double ascension
      const maxOneAscLevels = (100 - lvl) + 100;
      maxAllowedLevels = Math.min(maxAllowedLevels, maxOneAscLevels);
    } else {
      // Déjà à l'ascension 3 : pas d'ascension 4, on ne peut que monter au niv. 100
      maxAllowedLevels = Math.min(maxAllowedLevels, 100 - lvl);
    }
  }

  const levelsGained = Math.min(affordableLevels, maxAllowedLevels);

  // Calcul de l'ascension et du niveau final atteint
  let finalAscension = asc;
  let finalLevel = lvl;

  if (levelsGained > 0) {
    const levelsToFinishCurrent = 100 - lvl;
    if (levelsGained < levelsToFinishCurrent) {
      finalLevel = lvl + levelsGained;
    } else if (levelsGained === levelsToFinishCurrent) {
      finalAscension = Math.min(3, asc + 1);
      finalLevel = 0;
    } else {
      const remAfterFirstAsc = levelsGained - levelsToFinishCurrent;
      if (isOrdreAscension) {
        // En ordre d'ascension, plafonné à asc + 1
        finalAscension = Math.min(3, asc + 1);
        finalLevel = Math.min(100, remAfterFirstAsc);
      } else {
        // En classement réel : multiple ascensions possibles jusqu'à Ascension 3 Niv. 100
        const fullAscGained = 1 + Math.floor(remAfterFirstAsc / 100);
        finalAscension = Math.min(3, asc + fullAscGained);
        if (finalAscension >= 3) {
          const totalAfterStart = (asc * 100) + lvl + levelsGained;
          if (totalAfterStart >= 400) {
            finalLevel = 100;
          } else {
            finalLevel = totalAfterStart % 100;
          }
        } else {
          finalLevel = remAfterFirstAsc % 100;
        }
      }
    }
  }

  const totalAbsoluteLevels = (finalAscension * 100) + finalLevel;
  const remainingResources = Math.round(res - (levelsGained * costPerLevel));

  return {
    levelsGained,
    totalAbsoluteLevels,
    finalAscension,
    finalLevel,
    remainingResources,
    isMaxed: (finalAscension >= 3 && finalLevel >= 100)
  };
}

/**
 * Calcule les Points de Guerre (War Points) selon les formules officielles
 */
export function calculateWarPoints(category, levelsGained, fusions = 0) {
  const lvls = Math.max(0, Number(levelsGained) || 0);
  const fusionsCount = Math.max(0, Number(fusions) || 0);

  if (category === 'skills') {
    // Compétence : 110 compétences par niveau * 175 pts par compétence
    return lvls * 110 * 175;
  } else if (category === 'eggs') {
    // Œufs : (fusions * 2250) + (23 oeufs par niveau * 2250 pts)
    const ptsFusions = fusionsCount * 2250;
    const ptsInvocations = lvls * 23 * 2250;
    return ptsFusions + ptsInvocations;
  } else if (category === 'mount') {
    // Monture : (fusions * 1080) + (20 montures par niveau * 1080 pts * 2)
    const ptsFusions = fusionsCount * 1080;
    const ptsInvocations = lvls * 20 * 1080 * 2;
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
 * Vérifie si un joueur a atteint le niveau maximum absolu (Ascension 3, Niveau 100 ou 35 pour la forge)
 */
export function isPlayerMaxed(player, category) {
  if (!player) return false;
  if (category === 'forge') {
    return (Number(player.forge_ascension) >= 3 && Number(player.forge_ascension_level) >= 35);
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
  return (Number(asc) >= 3 && Number(lvl) >= 100);
}

/**
 * Compare deux joueurs selon les critères d'Ordre d'ascension :
 * Règle utilisateur : "Si un joueur a atteint le niveau 100 ascension 3,
 * il faudra le descendre en toute fin de la liste car il ne pourra pas réaliser d'autres ascensions dans cette ressource."
 * 1) Joueurs non-maxés d'abord, joueurs maxés à la fin de la liste
 * 2) Nombre de ressources DESC
 * 3) Niveau de technologie DESC
 * 4) Niveau d'ascension DESC
 * 5) Niveau atteint dans l'ascension DESC
 */
function compareOrdreAscension(a, b, category) {
  const maxedA = isPlayerMaxed(a, category);
  const maxedB = isPlayerMaxed(b, category);

  // Si l'un des joueurs est maxé et pas l'autre, le maxé est relégué en fin de liste
  if (maxedA !== maxedB) {
    return maxedA ? 1 : -1;
  }

  let resA, resB, techA, techB, ascA, ascB, lvlA, lvlB;

  switch (category) {
    case 'skills':
      resA = a.skills_tickets; resB = b.skills_tickets;
      techA = a.skills_tech_level; techB = b.skills_tech_level;
      ascA = a.skills_ascension; ascB = b.skills_ascension;
      lvlA = a.skills_ascension_level; lvlB = b.skills_ascension_level;
      break;
    case 'eggs':
      resA = a.eggs_count; resB = b.eggs_count;
      techA = a.eggs_tech_level; techB = b.eggs_tech_level;
      ascA = a.eggs_ascension; ascB = b.eggs_ascension;
      lvlA = a.eggs_ascension_level; lvlB = b.eggs_ascension_level;
      break;
    case 'mount':
      resA = a.mount_keys; resB = b.mount_keys;
      techA = a.mount_tech_level; techB = b.mount_tech_level;
      ascA = a.mount_ascension; ascB = b.mount_ascension;
      lvlA = a.mount_ascension_level; lvlB = b.mount_ascension_level;
      break;
    default:
      return 0;
  }

  if (resB !== resA) return resB - resA;
  if (techB !== techA) return techB - techA;
  if (ascB !== ascA) return ascB - ascA;
  if (lvlB !== lvlA) return lvlB - lvlA;

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
 * - Les 4 Élus du Rush (Matin, Midi, Soir, Rush)
 * - La suite du classement (à partir du 5ème)
 * - Les Points de Guerre calculés pour chaque joueur
 */
export function getOrdreAscensionWithElus(players, category) {
  if (category !== 'skills' && category !== 'eggs' && category !== 'mount') return { elus: [], suite: [] };

  // 1. Enrichir chaque joueur avec sa simulation (plafonnée à 1 ascension) et ses points de guerre
  const enriched = players.map(p => {
    let res = 0, asc = 0, lvl = 0, tech = 0, fusions = 0;

    if (category === 'skills') {
      res = p.skills_tickets; asc = p.skills_ascension; lvl = p.skills_ascension_level; tech = p.skills_tech_level;
    } else if (category === 'eggs') {
      res = p.eggs_count; asc = p.eggs_ascension; lvl = p.eggs_ascension_level; tech = p.eggs_tech_level; fusions = p.eggs_fusions || 0;
    } else if (category === 'mount') {
      res = p.mount_keys; asc = p.mount_ascension; lvl = p.mount_ascension_level; tech = p.mount_tech_level; fusions = p.mount_fusions || 0;
    }

    // Simulation avec règle spécifique à l'ordre d'ascension : 1 seule ascension max (isOrdreAscension = true)
    const sim = simulateRealProgression(category, asc, lvl, tech, res, true);
    const warPoints = calculateWarPoints(category, sim.levelsGained, fusions);
    const maxed = isPlayerMaxed(p, category);

    return {
      ...p,
      sim,
      warPoints,
      isMaxed: maxed,
      available_slots: Array.isArray(p.available_slots) ? p.available_slots : []
    };
  });

  // 2. Trier tous les joueurs par ordre d'ascension (non-maxés d'abord avec ressources DESC, maxés en fin de liste)
  const sortedPlayers = [...enriched].sort((a, b) => compareOrdreAscension(a, b, category));

  // 3. Déterminer les 4 Élus du Rush (Matin, Midi, Soir, Rush)
  // Définition des 4 créneaux
  const slotsConfig = [
    { key: 'matin', label: 'Matin (2h - 9h)', icon: 'sunrise', order: 1 },
    { key: 'midi', label: 'Midi (9h - 15h00)', icon: 'sun', order: 2 },
    { key: 'soir', label: 'Soir (15h00 - 01h00)', icon: 'sunset', order: 3 },
    { key: 'rush', label: 'Rush (01h00 - 02h00)', icon: 'zap', order: 4 }
  ];

  const selectedElusIds = new Set();
  const elusMap = new Map(); // key -> élu

  // Compter le nombre de candidats non-maxés pour chaque créneau
  const slotCandidates = new Map();
  slotsConfig.forEach(s => {
    const candidates = sortedPlayers.filter(p => !p.isMaxed && p.available_slots.includes(s.key));
    slotCandidates.set(s.key, candidates);
  });

  // Trier les créneaux par rareté des candidats (les créneaux les plus contraints d'abord)
  const slotsSortedByRarity = [...slotsConfig].sort((a, b) => {
    const countA = slotCandidates.get(a.key)?.length || 0;
    const countB = slotCandidates.get(b.key)?.length || 0;
    return countA - countB;
  });

  // Première passe : affecter le meilleur candidat non-maxé ayant coché le créneau
  slotsSortedByRarity.forEach(s => {
    const candidates = slotCandidates.get(s.key) || [];
    const bestCandidate = candidates.find(c => !selectedElusIds.has(c.id));
    if (bestCandidate) {
      selectedElusIds.add(bestCandidate.id);
      elusMap.set(s.key, {
        ...bestCandidate,
        eluSlot: s,
        assignedBySlot: true
      });
    }
  });

  // Deuxième passe (règle utilisateur) : pour tout créneau restant sans candidat direct,
  // attribuer la place au joueur suivant non-maxé avec le plus de ressources
  slotsConfig.forEach(s => {
    if (!elusMap.has(s.key)) {
      const fallbackPlayer = sortedPlayers.find(p => !selectedElusIds.has(p.id) && !p.isMaxed);
      if (fallbackPlayer) {
        selectedElusIds.add(fallbackPlayer.id);
        elusMap.set(s.key, {
          ...fallbackPlayer,
          eluSlot: s,
          assignedBySlot: false // Attribué par ressources
        });
      }
    }
  });

  // Formater la liste des élus dans l'ordre chronologique des créneaux
  const elus = [];
  slotsConfig.forEach(s => {
    if (elusMap.has(s.key)) {
      elus.push(elusMap.get(s.key));
    }
  });

  // 4. Suite du classement : tous les joueurs non élus, classés par ressources décroissantes (maxés en fin de liste)
  const remainingPlayers = sortedPlayers.filter(p => !selectedElusIds.has(p.id));
  const suite = remainingPlayers.slice(0, 50).map((p, idx) => ({
    ...p,
    rank: elus.length + idx + 1,
    priorityNumber: idx + 1 // Priorité 1, Priorité 2, etc.
  }));

  return {
    elus,
    suite,
    allSorted: sortedPlayers
  };
}
