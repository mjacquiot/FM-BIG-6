/**
 * Moteur de calcul des classements FM BIG 6
 */

/**
 * Compare deux joueurs selon les critères d'Avancement :
 * 1) Niveau d'ascension DESC
 * 2) Niveau de technologie DESC
 * 3) Niveau atteint dans l'ascension DESC
 * 4) Nombre de ressources DESC
 */
function compareAvancement(a, b, category) {
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

  // 1) Niveau d'ascension DESC
  if (ascB !== ascA) return ascB - ascA;
  // 2) Niveau de technologie DESC
  if (techB !== techA) return techB - techA;
  // 3) Niveau atteint dans l'ascension DESC
  if (lvlB !== lvlA) return lvlB - lvlA;
  // 4) Nombre de ressources DESC
  if (resB !== resA) return resB - resA;

  // En cas d'égalité parfaite, tri par date d'enregistrement (le plus ancien en premier)
  return new Date(a.created_at || 0) - new Date(b.created_at || 0);
}

/**
 * Compare deux joueurs selon les critères d'Ordre d'ascension :
 * 1) Nombre de ressources DESC
 * 2) Niveau de technologie DESC
 * 3) Niveau d'ascension DESC
 * (4: Niveau dans l'ascension DESC en départage)
 */
function compareOrdreAscension(a, b, category) {
  let resA, resB, techA, techB, ascA, ascB, lvlA, lvlB;

  switch (category) {
    case 'skills':
      resA = a.skills_tickets; resB = b.skills_tickets;
      techA = a.skills_tech_level; techB = b.skills_tech_level;
      ascA = a.skills_ascension; ascB = b.skills_ascension;
      lvlA = a.skills_ascension_level; lvlB = b.skills_ascension_level;
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

  // 1) Nombre de ressources DESC
  if (resB !== resA) return resB - resA;
  // 2) Niveau de technologie DESC
  if (techB !== techA) return techB - techA;
  // 3) Niveau d'ascension DESC
  if (ascB !== ascA) return ascB - ascA;
  // 4) Niveau atteint dans l'ascension DESC
  if (lvlB !== lvlA) return lvlB - lvlA;

  return new Date(a.created_at || 0) - new Date(b.created_at || 0);
}

/**
 * Calcule le classement complet pour une catégorie d'avancement
 */
export function getAvancementRanking(players, category, limit = 50) {
  const sorted = [...players].sort((a, b) => compareAvancement(a, b, category));
  return sorted.slice(0, limit).map((p, index) => ({
    ...p,
    rank: index + 1
  }));
}

/**
 * Calcule le classement de l'Ordre d'ascension (Compétences ou Montures)
 */
export function getOrdreAscensionRanking(players, category, limit = 50) {
  if (category !== 'skills' && category !== 'mount') return [];
  const sorted = [...players].sort((a, b) => compareOrdreAscension(a, b, category));
  return sorted.slice(0, limit).map((p, index) => ({
    ...p,
    rank: index + 1
  }));
}

/**
 * Calcule le Classement Général d'avancement :
 * Reprend le rang obtenu par chaque joueur dans les 4 classements d'avancement.
 * Le score global est la somme des 4 rangs (le plus petit total = 1er).
 * En cas d'égalité, compare le meilleur rang individuel puis les ressources totales.
 */
export function getGeneralRanking(players, limit = 50) {
  if (!players || players.length === 0) return [];

  // Obtenir le classement complet (sans limite) pour les 4 catégories
  const fullSkills = [...players].sort((a, b) => compareAvancement(a, b, 'skills'));
  const fullEggs = [...players].sort((a, b) => compareAvancement(a, b, 'eggs'));
  const fullMount = [...players].sort((a, b) => compareAvancement(a, b, 'mount'));
  const fullForge = [...players].sort((a, b) => compareAvancement(a, b, 'forge'));

  // Maps des rangs pour un accès O(1)
  const skillsRankMap = new Map();
  fullSkills.forEach((p, idx) => skillsRankMap.set(p.id, idx + 1));

  const eggsRankMap = new Map();
  fullEggs.forEach((p, idx) => eggsRankMap.set(p.id, idx + 1));

  const mountRankMap = new Map();
  fullMount.forEach((p, idx) => mountRankMap.set(p.id, idx + 1));

  const forgeRankMap = new Map();
  fullForge.forEach((p, idx) => forgeRankMap.set(p.id, idx + 1));

  // Calcul du score global
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

  // Tri général : plus petit totalScore en premier
  generalList.sort((a, b) => {
    if (a.totalScore !== b.totalScore) {
      return a.totalScore - b.totalScore;
    }
    // Départage par le meilleur classement individuel
    if (a.bestRank !== b.bestRank) {
      return a.bestRank - b.bestRank;
    }
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });

  return generalList.slice(0, limit).map((p, index) => ({
    ...p,
    rank: index + 1
  }));
}
