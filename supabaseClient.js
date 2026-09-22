/**
 * Module Supabase Client pour FM BIG 6
 */

const SUPABASE_URL = "https://nkdgmxwznrrywwjwcsfk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZGdteHd6bnJyeXd3andjc2ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTU3MDgsImV4cCI6MjA5NTg5MTcwOH0.PHEA2ngQkln67Vm55Cb8YtDc_RlbVadsGiZ4aNmMd3U";

// Initialisation du client Supabase
export const supabase = (window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

if (!supabase) {
  console.error("Le SDK Supabase n'a pas pu être initialisé.");
}

/**
 * Récupère tous les joueurs enregistrés
 */
export async function fetchPlayers() {
  if (!supabase) throw new Error("Client Supabase non initialisé");
  
  const { data, error } = await supabase
    .from("fm_big6_players")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Erreur lors de la récupération des joueurs:", error);
    throw error;
  }
  return data || [];
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
  return data;
}

/**
 * Enregistre ou met à jour les scores d'un joueur
 */
export async function upsertPlayer(playerData) {
  if (!supabase) throw new Error("Client Supabase non initialisé");

  const normalizedPseudo = playerData.pseudo.trim().toLowerCase();
  
  // Vérifions d'abord si le joueur existe déjà
  const existing = await getPlayerByPseudo(normalizedPseudo);

  const payload = {
    pseudo: playerData.pseudo.trim(),
    skills_tickets: Number(playerData.skills_tickets) || 0,
    skills_ascension: Number(playerData.skills_ascension) || 0,
    skills_ascension_level: Number(playerData.skills_ascension_level) || 0,
    skills_tech_level: Number(playerData.skills_tech_level) || 0,

    eggs_count: Number(playerData.eggs_count) || 0,
    eggs_ascension: Number(playerData.eggs_ascension) || 0,
    eggs_ascension_level: Number(playerData.eggs_ascension_level) || 0,
    eggs_tech_level: Number(playerData.eggs_tech_level) || 0,

    mount_keys: Number(playerData.mount_keys) || 0,
    mount_ascension: Number(playerData.mount_ascension) || 0,
    mount_ascension_level: Number(playerData.mount_ascension_level) || 0,
    mount_tech_level: Number(playerData.mount_tech_level) || 0,

    forge_hammers: Number(playerData.forge_hammers) || 0,
    forge_ascension: Number(playerData.forge_ascension) || 0,
    forge_ascension_level: Number(playerData.forge_ascension_level) || 0,
    forge_tech_level: Number(playerData.forge_tech_level) || 0
  };

  let response;
  if (existing && existing.id) {
    // Mise à jour de la ligne existante
    response = await supabase
      .from("fm_big6_players")
      .update(payload)
      .eq("id", existing.id)
      .select();
  } else {
    // Nouvelle inscription
    response = await supabase
      .from("fm_big6_players")
      .insert([payload])
      .select();
  }

  if (response.error) {
    console.error("Erreur lors de l'enregistrement du joueur:", response.error);
    throw response.error;
  }
  return response.data?.[0];
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
