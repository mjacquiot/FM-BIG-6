/**
 * Module Discord Activity (Embedded App SDK)
 * Permet à l'application de fonctionner nativement dans Discord tout en
 * restant 100% compatible avec un navigateur web classique (Chrome, Safari, mobile).
 */

export const DISCORD_CLIENT_ID = "1555128741540143114";
export const DISCORD_PUBLIC_KEY = "c43b9b2c699df8cdf9da8e489e57c42a44261baaf91a45b2f9e37d5ee01b6ac3";
const SUPABASE_TARGET = "nkdgmxwznrrywwjwcsfk.supabase.co";

let sdkInstance = null;

/**
 * Initialise le SDK Discord si l'application est ouverte dans Discord Activity.
 * En dehors de Discord, cette fonction n'a aucun impact et retourne null.
 */
export async function initDiscordActivity() {
  const queryParams = new URLSearchParams(window.location.search);
  const isInsideDiscord = queryParams.has('frame_id') || 
                         window.location.hostname.includes('discordsays.com') ||
                         (window.parent !== window && window.location.search.includes('instance_id'));

  if (!isInsideDiscord) {
    // Mode Web standard (aucun chargement de SDK requis)
    return null;
  }

  try {
    const { DiscordSDK, patchUrlMappings } = await import('https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@2.5.0/+esm');

    // Mappage sécurisé du proxy pour les requêtes Supabase dans Discord
    if (typeof patchUrlMappings === 'function') {
      try {
        patchUrlMappings([
          { prefix: '/supabase', target: SUPABASE_TARGET }
        ]);
      } catch (patchErr) {
        console.warn("[Discord] Avertissement patchUrlMappings :", patchErr);
      }
    }

    const discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);

    // Timeout de sécurité au cas où l'iframe ne répond pas
    await Promise.race([
      discordSdk.ready(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Discord ready timeout')), 6000))
    ]);

    sdkInstance = discordSdk;
    console.log("[Discord] Activité connectée avec succès ! (Plateforme :", discordSdk.platform, ")");
    return discordSdk;
  } catch (err) {
    console.warn("[Discord] Mode autonome actif (SDK Discord non initialisé) :", err.message);
    return null;
  }
}

export function getDiscordSdk() {
  return sdkInstance;
}
