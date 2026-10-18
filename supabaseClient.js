/**
 * Module Supabase Client pour FM BIG 6
 */

const isInsideDiscord = window.location.hostname.includes('discordsays.com') ||
                        window.location.search.includes('frame_id') ||
                        window.location.search.includes('instance_id');

const SUPABASE_URL = isInsideDiscord
  ? `${window.location.origin}/supabase`
  : "https://nkdgmxwznrrywwjwcsfk.supabase.co";

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZGdteHd6bnJyeXd3andjc2ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTU3MDgsImV4cCI6MjA5NTg5MTcwOH0.PHEA2ngQkln67Vm55Cb8YtDc_RlbVadsGiZ4aNmMd3U";

// Nettoyage préventif des anciens tokens persistés dans localStorage
try {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('sb-') || key.includes('supabase.auth.token'))) {
      localStorage.removeItem(key);
    }
  }
} catch (e) {}

// Initialisation du client Supabase avec sessionStorage (fermeture de l'onglet = déconnexion automatique)
export const supabase = (window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        storage: window.sessionStorage,
        autoRefreshToken: true
      }
    })
  : null;

if (!supabase) {
  console.error("Le SDK Supabase n'a pas pu être initialisé.");
}

function normalizePlayer(p) {
  if (!p) return p;
  let clanVials = p.clan_vials;
  if (clanVials === undefined || clanVials === null) {
    if (Array.isArray(p.available_slots)) {
      const match = p.available_slots.find(s => typeof s === 'string' && s.startsWith('fioles:'));
      if (match) {
        clanVials = parseInt(match.split(':')[1], 10) || 0;
      }
    }
  }
  return {
    ...p,
    clan_vials: Number(clanVials) || 0
  };
}

function withTimeout(promise, ms = 7000, errorMsg = "Délai de connexion dépassé (7s)") {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms))
  ]);
}

/**
 * Récupère tous les joueurs enregistrés (sécurisé avec timeout)
 */
export async function fetchPlayers() {
  if (!supabase) throw new Error("Client Supabase non initialisé");
  
  const query = supabase
    .from("fm_big6_players")
    .select("*")
    .order("updated_at", { ascending: false });

  const { data, error } = await withTimeout(query, 7000);

  if (error) {
    console.error("Erreur lors de la récupération des joueurs:", error);
    throw error;
  }
  return (data || []).map(normalizePlayer);
}

/**
 * Recherche un joueur par son pseudo (insensible à la casse)
 */
export async function getPlayerByPseudo(pseudo) {
  if (!supabase || !pseudo) return null;
  const cleanPseudo = pseudo.trim().toLowerCase();
  
  const { data, error } = await supabase
    .from("fm_big6_players")
    .select("*")
    .eq("pseudo_normalized", cleanPseudo)
    .maybeSingle();

  if (error) {
    console.error("Erreur lors de la recherche du joueur:", error);
    return null;
  }
  return normalizePlayer(data);
}

/**
 * Enregistre ou met à jour les scores d'un joueur
 */
export async function upsertPlayer(playerData) {
  if (!supabase) throw new Error("Client Supabase non initialisé");

  const normalizedPseudo = playerData.pseudo.trim().toLowerCase();
  
  // Vérifions d'abord si le joueur existe déjà par pseudo ou ID
  const existing = playerData.id ? null : await getPlayerByPseudo(normalizedPseudo);
  const targetId = playerData.id || (existing ? existing.id : null);

  const payload = {
    available_slots: Array.isArray(playerData.available_slots) ? playerData.available_slots : [],

    pseudo: playerData.pseudo.trim(),
    skills_tickets: Number(playerData.skills_tickets) || 0,
    skills_ascension: Number(playerData.skills_ascension) || 0,
    skills_ascension_level: Number(playerData.skills_ascension_level) || 0,
    skills_tech_level: Number(playerData.skills_tech_level) || 0,

    eggs_count: Number(playerData.eggs_count) || 0,
    eggs_ascension: Number(playerData.eggs_ascension) || 0,
    eggs_ascension_level: Number(playerData.eggs_ascension_level) || 0,
    eggs_tech_level: Number(playerData.eggs_tech_level) || 0,
    eggs_fusions: Number(playerData.eggs_fusions) || 0,

    mount_keys: Number(playerData.mount_keys) || 0,
    mount_ascension: Number(playerData.mount_ascension) || 0,
    mount_ascension_level: Number(playerData.mount_ascension_level) || 0,
    mount_tech_level: Number(playerData.mount_tech_level) || 0,
    mount_fusions: Number(playerData.mount_fusions) || 0,

    forge_hammers: Number(playerData.forge_hammers) || 0,
    forge_ascension: Number(playerData.forge_ascension) || 0,
    forge_ascension_level: Number(playerData.forge_ascension_level) || 0,
    forge_tech_level: Number(playerData.forge_tech_level) || 0
  };

  // Payload étendu si les colonnes dédiées existent dans Supabase
  const extendedPayload = {
    ...payload,
    want_skills_ascension: Boolean(playerData.want_skills_ascension),
    want_eggs_ascension: Boolean(playerData.want_eggs_ascension),
    want_mount_ascension: Boolean(playerData.want_mount_ascension),
    clan_vials: Number(playerData.clan_vials) || 0
  };

  let response;
  try {
    if (targetId) {
      response = await supabase
        .from("fm_big6_players")
        .update(extendedPayload)
        .eq("id", targetId)
        .select();
    } else {
      response = await supabase
        .from("fm_big6_players")
        .insert([extendedPayload])
        .select();
    }
  } catch (e) {
    // En cas d'erreur réseau ou autre
  }

  // Repli automatique si les colonnes dédiées ne sont pas encore créées en base (code PGRST204)
  if (!response || response.error) {
    if (targetId) {
      response = await supabase
        .from("fm_big6_players")
        .update(payload)
        .eq("id", targetId)
        .select();
    } else {
      response = await supabase
        .from("fm_big6_players")
        .insert([payload])
        .select();
    }
  }

  if (response.error) {
    console.error("Erreur lors de l'enregistrement du joueur:", response.error);
    throw response.error;
  }
  return normalizePlayer(response.data?.[0]);
}

/**
 * Supprime un joueur (action administrateur)
 */
export async function deletePlayer(playerId) {
  if (!supabase) throw new Error("Client Supabase non initialisé");

  const { data, error } = await supabase
    .from("fm_big6_players")
    .delete()
    .eq("id", playerId);

  if (error) {
    console.error("Erreur lors de la suppression:", error);
    throw error;
  }
  return true;
}

/**
 * Connexion Administrateur avec Supabase Auth
 */
export async function loginAdmin(email, password) {
  if (!supabase) throw new Error("Client Supabase non initialisé");

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: password
  });

  if (error) {
    console.error("Erreur de connexion admin:", error);
    throw error;
  }
  return data;
}

/**
 * Déconnexion Administrateur
 */
export async function logoutAdmin() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  
  // Vider les clés d'authentification des storages
  try {
    sessionStorage.clear();
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('sb-') || key.includes('supabase.auth.token'))) {
        localStorage.removeItem(key);
      }
    }
  } catch (e) {}

  if (error) {
    console.error("Erreur lors de la déconnexion:", error);
    throw error;
  }
}

/**
 * Récupère la session admin active
 */
export async function getAdminSession() {
  if (!supabase) return null;
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) return null;
  return session;
}

/**
 * Écouteur de changement d'état d'authentification
 */
export function onAuthStateChange(callback) {
  if (!supabase) return { unsubscribe: () => {} };
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return subscription;
}

/**
 * =============================================================================
 * MODULE SONDAGES & VOTES DE POPULARITÉ
 * =============================================================================
 */

/**
 * Récupère la configuration globale des votes (activé/désactivé)
 */
export async function fetchVotesSettings() {
  if (!supabase) return { enabled: false, show_results: true, isMissingTable: false };

  try {
    const { data, error } = await supabase
      .from("fm_big6_settings")
      .select("value")
      .eq("key", "votes_module")
      .maybeSingle();

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return { enabled: false, show_results: true, isMissingTable: true };
      }
      console.warn("Avertissement récupération paramètres votes:", error.message);
      return { enabled: false, show_results: true, isMissingTable: false };
    }

    if (!data || !data.value) {
      return { enabled: false, show_results: true, isMissingTable: false };
    }

    return {
      enabled: Boolean(data.value.enabled),
      show_results: data.value.show_results !== false,
      isMissingTable: false
    };
  } catch (err) {
    console.warn("Exception récupération paramètres votes:", err);
    return { enabled: false, show_results: true, isMissingTable: false };
  }
}

/**
 * Met à jour la configuration des votes (action admin)
 */
export async function updateVotesSettings(settings) {
  if (!supabase) throw new Error("Client Supabase non initialisé");

  const payload = {
    key: "votes_module",
    value: {
      enabled: Boolean(settings.enabled),
      show_results: settings.show_results !== false
    },
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("fm_big6_settings")
    .upsert(payload, { onConflict: 'key' })
    .select();

  if (error) {
    console.error("Erreur lors de la mise à jour des paramètres votes:", error);
    throw error;
  }
  return data?.[0]?.value || payload.value;
}

/**
 * Récupère tous les sondages
 */
export async function fetchPolls() {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("fm_big6_polls")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return [];
      }
      console.error("Erreur récupération des sondages:", error);
      throw error;
    }
    return data || [];
  } catch (err) {
    console.warn("Exception récupération sondages:", err);
    return [];
  }
}

/**
 * Crée un nouveau sondage (action admin)
 */
export async function createPoll(pollData) {
  if (!supabase) throw new Error("Client Supabase non initialisé");

  const payload = {
    title: pollData.title.trim(),
    description: pollData.description ? pollData.description.trim() : '',
    category: pollData.category || 'chef',
    is_active: pollData.is_active !== undefined ? Boolean(pollData.is_active) : true,
    allow_self_vote: Boolean(pollData.allow_self_vote),
    max_votes: Number(pollData.max_votes) || 5,
    role_options: Array.isArray(pollData.role_options) ? pollData.role_options : ['Dirigeant', 'R5']
  };

  const { data, error } = await supabase
    .from("fm_big6_polls")
    .insert([payload])
    .select();

  if (error) {
    console.error("Erreur création sondage:", error);
    throw error;
  }
  return data?.[0];
}

/**
 * Modifie un sondage existant (action admin)
 */
export async function updatePoll(pollId, updates) {
  if (!supabase) throw new Error("Client Supabase non initialisé");

  const payload = { ...updates, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from("fm_big6_polls")
    .update(payload)
    .eq("id", pollId)
    .select();

  if (error) {
    console.error("Erreur mise à jour sondage:", error);
    throw error;
  }
  return data?.[0];
}

/**
 * Supprime un sondage (action admin)
 */
export async function deletePoll(pollId) {
  if (!supabase) throw new Error("Client Supabase non initialisé");

  const { error } = await supabase
    .from("fm_big6_polls")
    .delete()
    .eq("id", pollId);

  if (error) {
    console.error("Erreur suppression sondage:", error);
    throw error;
  }
  return true;
}

/**
 * Récupère tous les votes d'un sondage
 */
export async function fetchVotesForPoll(pollId) {
  if (!supabase || !pollId) return [];

  try {
    const { data, error } = await supabase
      .from("fm_big6_votes")
      .select("*")
      .eq("poll_id", pollId)
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return [];
      }
      console.error("Erreur récupération des votes:", error);
      throw error;
    }
    return data || [];
  } catch (err) {
    console.warn("Exception récupération votes:", err);
    return [];
  }
}

/**
 * Enregistre ou modifie le vote d'un joueur pour un candidat avec son rôle (Dirigeant ou R5)
 */
export async function castVote(pollId, voterPseudo, candidateId, candidatePseudo, voteRole = 'R5') {
  if (!supabase) throw new Error("Client Supabase non initialisé");
  if (!pollId || !voterPseudo || !candidatePseudo) {
    throw new Error("Paramètres de vote incomplets");
  }

  const cleanVoter = voterPseudo.trim();
  const normalizedVoter = cleanVoter.toLowerCase();
  const cleanCandidate = candidatePseudo.trim();
  const cleanRole = voteRole === 'Dirigeant' ? 'Dirigeant' : 'R5';

  const payload = {
    poll_id: pollId,
    voter_pseudo: cleanVoter,
    voter_pseudo_normalized: normalizedVoter,
    candidate_id: candidateId || null,
    candidate_pseudo: cleanCandidate,
    vote_role: cleanRole,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("fm_big6_votes")
    .upsert(payload, { onConflict: 'poll_id, voter_pseudo_normalized, candidate_pseudo' })
    .select();

  if (error) {
    console.error("Erreur enregistrement vote:", error);
    throw error;
  }
  return data?.[0];
}

/**
 * Supprime le vote d'un joueur pour un candidat spécifique
 */
export async function deleteCandidateVote(pollId, voterPseudo, candidatePseudo) {
  if (!supabase) throw new Error("Client Supabase non initialisé");
  const normalizedVoter = voterPseudo.trim().toLowerCase();
  const cleanCandidate = candidatePseudo.trim();

  const { error } = await supabase
    .from("fm_big6_votes")
    .delete()
    .eq("poll_id", pollId)
    .eq("voter_pseudo_normalized", normalizedVoter)
    .eq("candidate_pseudo", cleanCandidate);

  if (error) {
    console.error("Erreur suppression vote candidat:", error);
    throw error;
  }
  return true;
}

/**
 * Annule tous les votes d'un joueur pour un sondage donné
 */
export async function cancelVote(pollId, voterPseudo) {
  if (!supabase) throw new Error("Client Supabase non initialisé");
  const normalizedVoter = voterPseudo.trim().toLowerCase();

  const { error } = await supabase
    .from("fm_big6_votes")
    .delete()
    .eq("poll_id", pollId)
    .eq("voter_pseudo_normalized", normalizedVoter);

  if (error) {
    console.error("Erreur annulation vote:", error);
    throw error;
  }
  return true;
}

/**
 * Réinitialise tous les votes d'un sondage (action admin)
 */
export async function resetPollVotes(pollId) {
  if (!supabase) throw new Error("Client Supabase non initialisé");

  const { error } = await supabase
    .from("fm_big6_votes")
    .delete()
    .eq("poll_id", pollId);

  if (error) {
    console.error("Erreur réinitialisation votes:", error);
    throw error;
  }
  return true;
}

