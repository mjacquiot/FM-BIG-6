/**
 * Logique Applicative Principale - FAS (Simulation Réelle, Créneaux & Points de Guerre)
 */

import {
  supabase,
  fetchPlayers,
  getPlayerByPseudo,
  upsertPlayer,
  deletePlayer,
  loginAdmin,
  logoutAdmin,
  getAdminSession,
  onAuthStateChange,
  fetchVotesSettings,
  updateVotesSettings,
  fetchPolls,
  createPoll,
  updatePoll,
  deletePoll,
  fetchVotesForPoll,
  castVote,
  deleteCandidateVote,
  cancelVote,
  resetPollVotes
} from './supabaseClient.js?v=20261018_5';

import {
  simulateRealProgression,
  calculateWarPoints,
  getAvancementRanking,
  getGeneralRealRanking,
  getGeneralRawRanking,
  getOrdreAscensionWithElus
} from './rankingEngine.js?v=20261018_5';

import { initDiscordActivity } from './discordActivity.js?v=20261018_5';

// =============================================================================
// ÉTAT DE L'APPLICATION
// =============================================================================
const state = {
  currentTab: 'inscription',  // 'inscription' | 'resultat' | 'sondages'
  currentStep: 0,            // 0 à 5 (étapes formulaire) ou 6 (succès)
  players: [],               // Données brutes depuis Supabase
  isLoading: false,
  isAdmin: false,
  adminSession: null,

  // Vue des classements
  rankingView: 'general-real', // 'general-real' | 'general-raw' | 'avancement' | 'ordre'
  rankingCategory: 'skills',   // 'skills' | 'eggs' | 'mount' | 'forge'
  searchQuery: '',

  // Données du joueur en cours de saisie
  editingPlayerId: null,
  deleteTarget: null,
  ascensionTarget: null,

  // Module Sondages & Votes de popularité
  connectedPseudo: (function() {
    try {
      return localStorage.getItem('fas_connected_pseudo') || null;
    } catch (e) {
      return null;
    }
  })(),
  votesEnabled: false,
  polls: [],
  currentPollId: null,
  pollVotes: [],
  selectedCandidate: null,
  selectedVoteRole: 'Dirigeant', // 'Dirigeant' | 'R5'
  candidateSearchQuery: '',
  isChangingVote: false
};

// =============================================================================
// INITIALISATION
// =============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Initialisation Discord Activity (si ouvert dans Discord, sans effet sinon)
  await initDiscordActivity();

  initLucide();
  initTabNavigation();
  initFormControls();
  initPlayerIdentity();
  initAdminFeatures();
  initRankingViews();
  initPollsEvents();

  // Vérifier la session admin existante
  try {
    const session = await getAdminSession();
    if (session && session.user && session.user.email === 'admin@admin.fr') {
      setAdminState(true, session);
    } else {
      setAdminState(false, null);
    }
  } catch (err) {
    console.warn("Vérification session:", err);
    setAdminState(false, null);
  }

  // Écouteur auth Supabase
  onAuthStateChange((event, session) => {
    const isUserAdmin = Boolean(session && session.user && session.user.email === 'admin@admin.fr');
    setAdminState(isUserAdmin, session);
  });

  // Charger les données initiales
  await loadData();
});

function initLucide() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// =============================================================================
// NAVIGATION ENTRE LES ONGLETS PRINCIPAUX
// =============================================================================
function initTabNavigation() {
  const btnInscription = document.getElementById('tab-btn-inscription');
  const btnResultat = document.getElementById('tab-btn-resultat');
  const btnSondages = document.getElementById('tab-btn-sondages');

  btnInscription?.addEventListener('click', () => switchTab('inscription'));
  btnResultat?.addEventListener('click', () => switchTab('resultat'));
  btnSondages?.addEventListener('click', () => switchTab('sondages'));

  document.getElementById('btn-refresh-data')?.addEventListener('click', async () => {
    const icon = document.querySelector('.refresh-icon');
    if (icon) icon.classList.add('animate-spin');
    try {
      await loadData(true);
    } finally {
      setTimeout(() => {
        if (icon) icon.classList.remove('animate-spin');
      }, 400);
    }
  });

  // Boutons de la vue de succès
  document.getElementById('btn-success-view-rankings')?.addEventListener('click', () => {
    switchTab('resultat');
  });

  document.getElementById('btn-success-new-entry')?.addEventListener('click', () => {
    goToStep(0);
  });
}

function switchTab(tab) {
  state.currentTab = tab;
  const btnInscription = document.getElementById('tab-btn-inscription');
  const btnResultat = document.getElementById('tab-btn-resultat');
  const btnSondages = document.getElementById('tab-btn-sondages');
  const viewInscription = document.getElementById('view-inscription');
  const viewResultat = document.getElementById('view-resultat');
  const viewSondages = document.getElementById('view-sondages');

  const allBtns = [btnInscription, btnResultat, btnSondages];
  const allViews = [viewInscription, viewResultat, viewSondages];

  allBtns.forEach(btn => {
    if (!btn) return;
    btn.classList.remove('bg-brand-600', 'text-white', 'shadow-md', 'shadow-brand-600/30');
    btn.classList.add('text-slate-400');
    btn.setAttribute('aria-selected', 'false');
  });

  allViews.forEach(v => {
    if (!v) return;
    v.classList.add('hidden');
  });

  if (tab === 'inscription') {
    if (btnInscription) {
      btnInscription.classList.add('bg-brand-600', 'text-white', 'shadow-md', 'shadow-brand-600/30');
      btnInscription.classList.remove('text-slate-400');
      btnInscription.setAttribute('aria-selected', 'true');
    }
    if (viewInscription) viewInscription.classList.remove('hidden');
  } else if (tab === 'resultat') {
    if (btnResultat) {
      btnResultat.classList.add('bg-brand-600', 'text-white', 'shadow-md', 'shadow-brand-600/30');
      btnResultat.classList.remove('text-slate-400');
      btnResultat.setAttribute('aria-selected', 'true');
    }
    if (viewResultat) viewResultat.classList.remove('hidden');
    renderRankings();
  } else if (tab === 'sondages') {
    if (btnSondages) {
      btnSondages.classList.add('bg-brand-600', 'text-white', 'shadow-md', 'shadow-brand-600/30');
      btnSondages.classList.remove('text-slate-400');
      btnSondages.setAttribute('aria-selected', 'true');
    }
    if (viewSondages) viewSondages.classList.remove('hidden');
    loadPollsData();
  }
}

// =============================================================================
// CHARGEMENT DES DONNÉES DEPUIS SUPABASE
// =============================================================================
async function loadData(showToastFeedback = false) {
  try {
    state.isLoading = true;
    const players = await fetchPlayers();
    state.players = players || [];
    
    // Mettre à jour le compteur d'inscrits dans l'en-tête
    const countEl = document.getElementById('header-players-count');
    if (countEl) countEl.textContent = state.players.length;

    renderRankings();
    updatePlayerBadge();

    // Charger la configuration des votes et les sondages
    await loadVotesConfig();
    await loadPollsData();

    if (showToastFeedback) {
      showToast("Données actualisées avec succès", "success");
    }
  } catch (error) {
    console.error("Erreur de chargement:", error);
    showToast("Impossible de charger les données. Vérifiez la connexion Supabase.", "error");
  } finally {
    state.isLoading = false;
  }
}

// =============================================================================
// GESTION DU FORMULAIRE D'INSCRIPTION PAR ÉTAPES (WIZARD)
// =============================================================================
function initFormControls() {
  // Navigation directe sur les pastilles de progression
  document.querySelectorAll('.step-dot').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetStep = parseInt(btn.dataset.step, 10);
      // On ne peut naviguer vers les étapes suivantes que si le pseudo est renseigné
      if (targetStep > 0 && !validatePseudo(false)) {
        showToast("Veuillez d'abord renseigner votre pseudo", "warning");
        return;
      }
      goToStep(targetStep);
    });
  });

  // Écouteur sur le pseudo (Étape 0)
  const pseudoInput = document.getElementById('input-pseudo');
  if (pseudoInput) {
    if (state.connectedPseudo && !pseudoInput.value) {
      pseudoInput.value = state.connectedPseudo;
    }

    // Synchronisation en temps réel dès que la personne renseigne son nom sur la 1ère page
    pseudoInput.addEventListener('input', () => {
      const val = pseudoInput.value.trim();
      if (val.length >= 2) {
        state.connectedPseudo = val;
        try {
          localStorage.setItem('fas_connected_pseudo', val);
        } catch (e) {}
        updatePlayerBadge();
        updatePollsNavVisibility();
      } else if (val.length === 0) {
        clearConnectedPlayer();
      }
    });

    // Validation à la touche Entrée sur le pseudo
    pseudoInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!validatePseudo(true)) return;
        await checkExistingPseudo();
        goToStep(1);
      }
    });

    // Détection automatique du pseudo dès la sortie du champ (blur)
    pseudoInput.addEventListener('blur', async () => {
      if (pseudoInput.value.trim().length >= 2) {
        await checkExistingPseudo();
      } else if (pseudoInput.value.trim().length === 0) {
        clearConnectedPlayer();
      }
    });
  }

  // Bouton "Suivant" Étape 0 (Pseudo)
  document.getElementById('btn-next-step-0')?.addEventListener('click', async () => {
    if (!validatePseudo(true)) return;
    await checkExistingPseudo();
    goToStep(1);
  });

  // Boutons Suivant / Précédent génériques
  document.querySelectorAll('.btn-next-step').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextStep = parseInt(btn.dataset.to, 10);
      goToStep(nextStep);
    });
  });

  document.querySelectorAll('.btn-prev-step').forEach(btn => {
    btn.addEventListener('click', () => {
      const prevStep = parseInt(btn.dataset.to, 10);
      goToStep(prevStep);
    });
  });

  // Bouton de soumission finale
  document.getElementById('btn-submit-inscription').addEventListener('click', handleSubmitInscription);

  // Synchronisation des sliders et des champs de saisie numérique
  setupSyncRangeAndNumber('input-clan-vials', 'range-clan-vials');
  setupSyncRangeAndNumber('input-skills-tickets', 'range-skills-tickets');
  setupSyncRangeAndNumber('input-skills-ascension-level', 'range-skills-ascension-level');

  setupSyncRangeAndNumber('input-eggs-count', 'range-eggs-count');
  setupSyncRangeAndNumber('input-eggs-ascension-level', 'range-eggs-ascension-level');
  setupSyncRangeAndNumber('input-eggs-fusions', 'range-eggs-fusions');

  setupSyncRangeAndNumber('input-mount-keys', 'range-mount-keys');
  setupSyncRangeAndNumber('input-mount-ascension-level', 'range-mount-ascension-level');
  setupSyncRangeAndNumber('input-mount-fusions', 'range-mount-fusions');

  setupSyncRangeAndNumber('input-forge-hammers', 'range-forge-hammers');
  setupSyncRangeAndNumber('input-forge-ascension-level', 'range-forge-ascension-level');

  // Puces d'ajout rapide (+5k, +25k, Max, 0)
  document.querySelectorAll('.quick-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = `input-${btn.dataset.target}`;
      const rangeId = `range-${btn.dataset.target}`;
      const inputEl = document.getElementById(targetId);
      const rangeEl = document.getElementById(rangeId);
      if (!inputEl) return;

      const currentVal = parseInt(inputEl.value, 10) || 0;
      const maxVal = parseInt(inputEl.max, 10);

      let newVal = currentVal;
      if (btn.dataset.val !== undefined) {
        newVal = parseInt(btn.dataset.val, 10);
      } else if (btn.dataset.add !== undefined) {
        newVal = currentVal + parseInt(btn.dataset.add, 10);
      }

      newVal = Math.max(0, Math.min(maxVal, newVal));
      inputEl.value = newVal;
      if (rangeEl) rangeEl.value = newVal;
    });
  });

  // Boutons de sélection pill (segmentés pour ascension et techno)
  setupPillGroup('skills-ascension', 'input-skills-ascension');
  setupPillGroup('skills-tech', 'input-skills-tech-level');

  setupPillGroup('eggs-ascension', 'input-eggs-ascension');
  setupPillGroup('eggs-tech', 'input-eggs-tech-level');

  setupPillGroup('mount-ascension', 'input-mount-ascension');
  setupPillGroup('mount-tech', 'input-mount-tech-level');

  setupPillGroup('forge-ascension', 'input-forge-ascension');
}

/**
 * Configure la synchronisation bidirectionnelle entre input number et range slider
 */
function setupSyncRangeAndNumber(numberId, rangeId) {
  const num = document.getElementById(numberId);
  const range = document.getElementById(rangeId);
  if (!num || !range) return;

  num.addEventListener('input', () => {
    let val = parseInt(num.value, 10);
    if (isNaN(val)) val = 0;
    const max = parseInt(num.max, 10);
    const min = parseInt(num.min, 10);
    if (val > max) val = max;
    if (val < min) val = min;
    range.value = val;
  });

  range.addEventListener('input', () => {
    num.value = range.value;
  });
}

/**
 * Configure les boutons segmentés (Pill buttons)
 */
function setupPillGroup(groupName, hiddenInputId) {
  const buttons = document.querySelectorAll(`[data-group="${groupName}"]`);
  const hiddenInput = document.getElementById(hiddenInputId);

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (hiddenInput) {
        hiddenInput.value = btn.dataset.val;
      }
    });
  });
}

function setPillGroupValue(groupName, hiddenInputId, value) {
  const hiddenInput = document.getElementById(hiddenInputId);
  if (hiddenInput) hiddenInput.value = value;

  const buttons = document.querySelectorAll(`[data-group="${groupName}"]`);
  buttons.forEach(btn => {
    if (btn.dataset.val === String(value)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

/**
 * Changement d'étape dans le Wizard
 */
function goToStep(stepIndex) {
  state.currentStep = stepIndex;

  // Cacher tous les panneaux d'étapes (0 à 5)
  for (let i = 0; i <= 5; i++) {
    const panel = document.getElementById(`step-panel-${i}`);
    if (panel) panel.classList.add('hidden');
  }
  const successPanel = document.getElementById('step-panel-success');
  if (successPanel) successPanel.classList.add('hidden');

  // Afficher le panneau demandé
  if (stepIndex === 6) {
    if (successPanel) successPanel.classList.remove('hidden');
  } else {
    const targetPanel = document.getElementById(`step-panel-${stepIndex}`);
    if (targetPanel) {
      targetPanel.classList.remove('hidden');
      targetPanel.classList.add('step-container');
    }
  }

  // Mettre à jour l'indicateur de progression (sur 6 étapes)
  const stepTitles = [
    "Étape 1 sur 6 : Pseudo",
    "Étape 2 sur 6 : Rush & Ascension",
    "Étape 3 sur 6 : Compétences (Tickets)",
    "Étape 4 sur 6 : Œufs de Compagnon",
    "Étape 5 sur 6 : Clés de Monture",
    "Étape 6 sur 6 : Marteaux de Forge",
    "Inscription terminée !"
  ];

  const textEl = document.getElementById('step-indicator-text');
  const percentEl = document.getElementById('step-percentage');
  const fillEl = document.getElementById('progress-bar-fill');

  if (textEl) textEl.textContent = stepTitles[stepIndex] || "";
  
  const percentage = Math.min(100, Math.round(((stepIndex + 1) / 6) * 100));
  if (percentEl) percentEl.textContent = `${percentage}%`;
  if (fillEl) fillEl.style.width = `${percentage}%`;

  // Mettre à jour les puces d'étapes (0 à 5)
  document.querySelectorAll('.step-dot').forEach((dot) => {
    const idx = parseInt(dot.dataset.step, 10);
    const dotSpan = dot.querySelector('span:first-child');
    if (idx < stepIndex) {
      dot.className = 'step-dot flex flex-col items-center gap-1 text-[11px] font-semibold text-emerald-400';
      if (dotSpan) {
        dotSpan.className = 'w-6 h-6 rounded-full flex items-center justify-center bg-emerald-500 text-slate-950 font-bold text-xs';
        dotSpan.innerHTML = '✓';
      }
    } else if (idx === stepIndex) {
      dot.className = 'step-dot flex flex-col items-center gap-1 text-[11px] font-semibold text-brand-400';
      if (dotSpan) {
        dotSpan.className = 'w-6 h-6 rounded-full flex items-center justify-center bg-brand-500 text-white shadow-sm shadow-brand-500/40 text-xs font-bold';
        dotSpan.textContent = String(idx + 1);
      }
    } else {
      dot.className = 'step-dot flex flex-col items-center gap-1 text-[11px] font-semibold text-slate-500';
      if (dotSpan) {
        dotSpan.className = 'w-6 h-6 rounded-full flex items-center justify-center bg-slate-800 text-slate-400 text-xs font-bold';
        dotSpan.textContent = String(idx + 1);
      }
    }
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function validatePseudo(showAlert = true) {
  const pseudoInput = document.getElementById('input-pseudo');
  const pseudo = pseudoInput.value.trim();

  if (!pseudo) {
    if (showAlert) {
      showToast("Veuillez entrer un pseudo valide", "warning");
      pseudoInput.focus();
    }
    return false;
  }
  return true;
}

/**
 * Vérifie si le pseudo est déjà dans la base Supabase et pré-remplit les valeurs
 */
async function checkExistingPseudo() {
  const pseudo = document.getElementById('input-pseudo')?.value.trim();
  const statusMsg = document.getElementById('pseudo-status-msg');
  const spinner = document.getElementById('pseudo-check-spinner');

  if (!pseudo) {
    clearConnectedPlayer();
    return;
  }

  if (spinner) spinner.classList.remove('hidden');

  try {
    const existingPlayer = await getPlayerByPseudo(pseudo);
    if (existingPlayer) {
      state.editingPlayerId = existingPlayer.id;
      fillFormWithPlayerData(existingPlayer);

      if (statusMsg) {
        statusMsg.className = 'p-3 rounded-xl text-xs flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300';
        statusMsg.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4 shrink-0"></i> <span>Joueur <strong>${escapeHtml(existingPlayer.pseudo)}</strong> trouvé ! Données pré-chargées.</span>`;
        statusMsg.classList.remove('hidden');
        initLucide();
      }
      setConnectedPlayer(existingPlayer.pseudo);
      showToast(`Connecté en tant que ${existingPlayer.pseudo}`, "info");
    } else {
      state.editingPlayerId = null;
      setConnectedPlayer(pseudo);
      if (statusMsg) {
        statusMsg.className = 'p-3 rounded-xl text-xs flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300';
        statusMsg.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4 shrink-0"></i> <span>Nouveau joueur ! Vos données seront créées à la fin.</span>`;
        statusMsg.classList.remove('hidden');
        initLucide();
      }
    }
  } catch (err) {
    console.warn("Vérification pseudo:", err);
    setConnectedPlayer(pseudo);
  } finally {
    if (spinner) spinner.classList.add('hidden');
  }
}

function fillFormWithPlayerData(player) {
  // Disponibilité Rush & Souhaits d'Ascension (Étape 2)
  const playerSlots = Array.isArray(player.available_slots) ? player.available_slots : [];
  
  const cbRush = document.getElementById('cb-rush-available');
  if (cbRush) cbRush.checked = playerSlots.includes('rush');

  const cbSkills = document.getElementById('cb-want-skills');
  if (cbSkills) {
    cbSkills.checked = Boolean(
      player.want_skills_ascension ||
      playerSlots.includes('asc_skills') ||
      playerSlots.includes('skills')
    );
  }

  const cbEggs = document.getElementById('cb-want-eggs');
  if (cbEggs) {
    cbEggs.checked = Boolean(
      player.want_eggs_ascension ||
      playerSlots.includes('asc_eggs') ||
      playerSlots.includes('eggs')
    );
  }

  const cbMount = document.getElementById('cb-want-mount');
  if (cbMount) {
    cbMount.checked = Boolean(
      player.want_mount_ascension ||
      playerSlots.includes('asc_mount') ||
      playerSlots.includes('mount')
    );
  }

  // Fioles de Clan (Étape 2)
  setFieldValue('input-clan-vials', 'range-clan-vials', player.clan_vials || 0);

  // Compétences (Étape 3)
  setFieldValue('input-skills-tickets', 'range-skills-tickets', player.skills_tickets);
  setPillGroupValue('skills-ascension', 'input-skills-ascension', player.skills_ascension);
  setFieldValue('input-skills-ascension-level', 'range-skills-ascension-level', player.skills_ascension_level);
  setPillGroupValue('skills-tech', 'input-skills-tech-level', player.skills_tech_level);

  // Œufs (Étape 4)
  setFieldValue('input-eggs-count', 'range-eggs-count', player.eggs_count);
  setPillGroupValue('eggs-ascension', 'input-eggs-ascension', player.eggs_ascension);
  setFieldValue('input-eggs-ascension-level', 'range-eggs-ascension-level', player.eggs_ascension_level);
  setPillGroupValue('eggs-tech', 'input-eggs-tech-level', player.eggs_tech_level);
  setFieldValue('input-eggs-fusions', 'range-eggs-fusions', player.eggs_fusions || 0);

  // Monture (Étape 5)
  setFieldValue('input-mount-keys', 'range-mount-keys', player.mount_keys);
  setPillGroupValue('mount-ascension', 'input-mount-ascension', player.mount_ascension);
  setFieldValue('input-mount-ascension-level', 'range-mount-ascension-level', player.mount_ascension_level);
  setPillGroupValue('mount-tech', 'input-mount-tech-level', player.mount_tech_level);
  setFieldValue('input-mount-fusions', 'range-mount-fusions', player.mount_fusions || 0);

  // Forge (Étape 6)
  setFieldValue('input-forge-hammers', 'range-forge-hammers', player.forge_hammers);
  setPillGroupValue('forge-ascension', 'input-forge-ascension', player.forge_ascension);
  setFieldValue('input-forge-ascension-level', 'range-forge-ascension-level', player.forge_ascension_level);
}

function setFieldValue(inputId, rangeId, value) {
  const input = document.getElementById(inputId);
  const range = document.getElementById(rangeId);
  const val = Number(value) || 0;
  if (input) input.value = val;
  if (range) range.value = val;
}

/**
 * Envoi final du formulaire (Création ou Mise à jour sans doublon)
 */
async function handleSubmitInscription() {
  const pseudo = document.getElementById('input-pseudo').value.trim();
  if (!pseudo) {
    showToast("Le pseudo est obligatoire", "error");
    goToStep(0);
    return;
  }

  const btnSubmit = document.getElementById('btn-submit-inscription');
  const originalHtml = btnSubmit.innerHTML;
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> <span>Enregistrement...</span>`;
  initLucide();

  // Encodage des choix dans available_slots pour rétrocompatibilité totale
  const selectedSlots = [];
  if (document.getElementById('cb-rush-available')?.checked) selectedSlots.push('rush');
  if (document.getElementById('cb-want-skills')?.checked) selectedSlots.push('asc_skills');
  if (document.getElementById('cb-want-eggs')?.checked) selectedSlots.push('asc_eggs');
  if (document.getElementById('cb-want-mount')?.checked) selectedSlots.push('asc_mount');

  const clanVials = Number(document.getElementById('input-clan-vials')?.value) || 0;
  if (clanVials > 0) selectedSlots.push(`fioles:${clanVials}`);

  const isEditingAsAdmin = Boolean(state.isAdmin && state.editingPlayerId);

  const playerData = {
    id: state.editingPlayerId || undefined,
    available_slots: selectedSlots,
    want_skills_ascension: document.getElementById('cb-want-skills')?.checked || false,
    want_eggs_ascension: document.getElementById('cb-want-eggs')?.checked || false,
    want_mount_ascension: document.getElementById('cb-want-mount')?.checked || false,
    clan_vials: clanVials,

    pseudo,
    skills_tickets: document.getElementById('input-skills-tickets').value,
    skills_ascension: document.getElementById('input-skills-ascension').value,
    skills_ascension_level: document.getElementById('input-skills-ascension-level').value,
    skills_tech_level: document.getElementById('input-skills-tech-level').value,

    eggs_count: document.getElementById('input-eggs-count').value,
    eggs_ascension: document.getElementById('input-eggs-ascension').value,
    eggs_ascension_level: document.getElementById('input-eggs-ascension-level').value,
    eggs_tech_level: document.getElementById('input-eggs-tech-level').value,
    eggs_fusions: document.getElementById('input-eggs-fusions')?.value || 0,

    mount_keys: document.getElementById('input-mount-keys').value,
    mount_ascension: document.getElementById('input-mount-ascension').value,
    mount_ascension_level: document.getElementById('input-mount-ascension-level').value,
    mount_tech_level: document.getElementById('input-mount-tech-level').value,
    mount_fusions: document.getElementById('input-mount-fusions')?.value || 0,

    forge_hammers: document.getElementById('input-forge-hammers').value,
    forge_ascension: document.getElementById('input-forge-ascension').value,
    forge_ascension_level: document.getElementById('input-forge-ascension-level').value,
    forge_tech_level: document.getElementById('input-forge-tech-level')?.value || 0
  };

  try {
    const savedPlayer = await upsertPlayer(playerData);
    
    // Animation de confettis
    triggerConfetti();

    // Mettre à jour l'écran de succès
    const successPseudoEl = document.getElementById('success-summary-pseudo');
    if (successPseudoEl) {
      if (isEditingAsAdmin) {
        successPseudoEl.innerHTML = `Le profil du joueur <strong class="text-emerald-400">${escapeHtml(pseudo)}</strong> a été modifié et mis à jour avec succès par l'administrateur.`;
      } else {
        successPseudoEl.innerHTML = `Les données du joueur <strong class="text-emerald-400">${escapeHtml(pseudo)}</strong> ont été enregistrées avec succès.`;
      }
    }

    // Réinitialiser le mode édition une fois terminé
    state.editingPlayerId = null;
    const banner = document.getElementById('admin-editing-banner');
    if (banner) banner.classList.add('hidden');

    goToStep(6);
    if (!isEditingAsAdmin) {
      setConnectedPlayer(pseudo);
    }
    showToast(isEditingAsAdmin ? `Profil de ${pseudo} mis à jour !` : `Scores enregistrés pour ${pseudo} !`, "success");

    // Recharger la liste en tâche de fond
    await loadData(false);

  } catch (err) {
    console.error("Erreur enregistrement:", err);
    showToast(`Erreur lors de l'enregistrement : ${err.message || 'Problème de connexion'}`, "error");
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = originalHtml;
    initLucide();
  }
}

// =============================================================================
// GESTION DES CLASSEMENTS DYNAMIQUES
// =============================================================================
function initRankingViews() {
  // Sous-onglets de classement (Général, Avancement, Ordre)
  document.querySelectorAll('.ranking-subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ranking-subtab-btn').forEach(b => {
        b.className = 'ranking-subtab-btn px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700';
      });
      btn.className = 'ranking-subtab-btn active px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-brand-600 text-white shadow-md shadow-brand-600/30';

      state.rankingView = btn.dataset.view;
      updateCategorySelectorBar();
      renderRankings();
    });
  });

  // Recherche de pseudo
  const searchInput = document.getElementById('ranking-search-input');
  const clearSearchBtn = document.getElementById('clear-search-btn');

  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim().toLowerCase();
    if (state.searchQuery.length > 0) {
      clearSearchBtn.classList.remove('hidden');
    } else {
      clearSearchBtn.classList.add('hidden');
    }
    renderRankings();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.searchQuery = '';
    clearSearchBtn.classList.add('hidden');
    renderRankings();
  });

  updateCategorySelectorBar();
}

/**
 * Met à jour la barre de sélection des catégories secondaires (Compétences, Œufs, Monture, Forge)
 */
function updateCategorySelectorBar() {
  const container = document.getElementById('category-selector-bar');
  if (!container) return;

  if (state.rankingView === 'general-real' || state.rankingView === 'general-raw') {
    container.classList.add('hidden');
    container.innerHTML = '';
    updateCriteriaDescription();
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = '';

  let categories = [];
  if (state.rankingView === 'avancement') {
    categories = [
      { id: 'skills', label: 'Compétences', icon: './Tickets FM.png' },
      { id: 'eggs', label: 'Œufs', icon: './oeufs FM.png' },
      { id: 'mount', label: 'Monture', icon: './Monture FM.png' },
      { id: 'forge', label: 'Forge', icon: './Forge FM.png' }
    ];
  } else if (state.rankingView === 'ordre') {
    // 3 catégories pour l'ordre d'ascension : compétences, œufs, monture
    categories = [
      { id: 'skills', label: 'Compétences', icon: './Tickets FM.png' },
      { id: 'eggs', label: 'Œufs', icon: './oeufs FM.png' },
      { id: 'mount', label: 'Monture', icon: './Monture FM.png' }
    ];
    if (state.rankingCategory === 'forge') {
      state.rankingCategory = 'skills';
    }
  }

  categories.forEach(cat => {
    const btn = document.createElement('button');
    const isActive = state.rankingCategory === cat.id;
    btn.type = 'button';
    btn.className = `cat-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shrink-0 ${
      isActive ? 'bg-indigo-600 text-white shadow' : 'bg-slate-800/90 text-slate-400 hover:text-white'
    }`;
    btn.innerHTML = `<img src="${cat.icon}" alt="" class="w-4 h-4 object-contain"> <span>${cat.label}</span>`;
    btn.addEventListener('click', () => {
      state.rankingCategory = cat.id;
      updateCategorySelectorBar();
      renderRankings();
    });
    container.appendChild(btn);
  });

  updateCriteriaDescription();
}

function updateCriteriaDescription() {
  const criteriaText = document.getElementById('ranking-criteria-text');
  if (!criteriaText) return;

  if (state.rankingView === 'general-real') {
    criteriaText.innerHTML = `<strong>Classement Réel (Simulé) :</strong> Somme des rangs réels après simulation complète de la dépense des ressources (Compétences, Œufs, Monture) selon la technologie. Le plus petit score est 1er !`;
  } else if (state.rankingView === 'general-raw') {
    criteriaText.innerHTML = `<strong>Classement Hors Ressources :</strong> Basé uniquement sur les valeurs actuelles saisies. Somme des rangs bruts dans les 4 catégories.`;
  } else if (state.rankingView === 'avancement') {
    criteriaText.innerHTML = `<strong>Classement d'Avancement Réel :</strong> Progression simulée après dépense des ressources (100 niveaux/palier) : 1) Ascension simulée &rarr; 2) Niveau atteint &rarr; 3) Ressources résiduelles &rarr; 4) Tech. Plafond maximal : Ascension 3 Niv. 100.`;
  } else if (state.rankingView === 'ordre') {
    criteriaText.innerHTML = `<strong>Ordre d'Ascension :</strong> Priorité 1 aux joueurs ayant coché <em>« Je veux faire mon ascension »</em> (<strong>Les Élus</strong>, en jaune doré). Classés par <strong>Points de Guerre prévisionnels</strong> (simulation multi-ascensions avec seuil minimal de 30/100 pour entamer l'ascension suivante + fusions). Les joueurs n'ayant pas coché l'ascension suivent en 2ème partie, et les joueurs au palier max (Asc. 3 Niv. 100) sont relégués en fin de tableau. Le badge <em>⚡ Rush</em> indique la disponibilité au rush nocturne (01h00 - 02h00).`;
  }
}

/**
 * Rendu visuel complet des classements (Podiums, 4 Élus + Lignes Top 50)
 */
function renderRankings() {
  const rowsContainer = document.getElementById('ranking-rows-container');
  const listCountEl = document.getElementById('ranking-list-count');
  const elusRushContainer = document.getElementById('elus-rush-container');
  const elusCardsGrid = document.getElementById('elus-cards-grid');
  const podiumContainer = document.getElementById('ranking-podium-container');

  if (!rowsContainer) return;

  if (state.players.length === 0) {
    if (elusRushContainer) elusRushContainer.classList.add('hidden');
    if (podiumContainer) podiumContainer.classList.remove('hidden');
    rowsContainer.innerHTML = `
      <div class="p-8 text-center text-slate-500 space-y-2">
        <i data-lucide="inbox" class="w-8 h-8 mx-auto text-slate-600"></i>
        <p class="text-sm font-semibold text-slate-400">Aucun joueur enregistré pour le moment.</p>
        <p class="text-xs">Soyez le premier à inscrire vos scores dans l'onglet Inscription !</p>
      </div>
    `;
    updatePodiums([]);
    if (listCountEl) listCountEl.textContent = '0 joueur';
    initLucide();
    return;
  }

  // Cas spécifique de l'Ordre d'Ascension (Les Élus de l'Ascension + Suite)
  if (state.rankingView === 'ordre') {
    if (podiumContainer) podiumContainer.classList.add('hidden');
    if (elusRushContainer) elusRushContainer.classList.remove('hidden');

    const { elus, suite, allSorted } = getOrdreAscensionWithElus(state.players, state.rankingCategory);

    // Rendu des cartes d'Élus en haut de section
    if (elusCardsGrid) {
      if (elus.length === 0) {
        elusCardsGrid.innerHTML = `
          <div class="col-span-full p-4 text-center text-slate-500 text-xs">
            Aucun joueur n'a coché le souhait d'ascension pour cette ressource pour le moment.
          </div>
        `;
      } else {
        elusCardsGrid.innerHTML = elus.map(elu => renderEluCard(elu, state.rankingCategory)).join('');
      }
    }

    // Filtrage complet par recherche de pseudo
    let displayList = allSorted;
    if (state.searchQuery) {
      displayList = allSorted.filter(p => p.pseudo.toLowerCase().includes(state.searchQuery));
    }

    if (listCountEl) {
      listCountEl.textContent = `${displayList.length} joueur${displayList.length > 1 ? 's' : ''}`;
    }

    if (displayList.length === 0) {
      rowsContainer.innerHTML = `
        <div class="p-6 text-center text-slate-500 text-xs">
          ${allSorted.length === 0 ? 'Aucun joueur enregistré pour le moment.' : `Aucun joueur ne correspond à la recherche "${escapeHtml(state.searchQuery)}".`}
        </div>
      `;
    } else {
      rowsContainer.innerHTML = displayList.map(player => renderPlayerRow(player)).join('');
    }

    initLucide();
    attachAdminListeners();
    return;
  }

  // Autres vues : Général Réel, Général Brut, Avancement
  if (elusRushContainer) elusRushContainer.classList.add('hidden');
  if (podiumContainer) podiumContainer.classList.remove('hidden');

  let rankedPlayers = [];
  if (state.rankingView === 'general-real') {
    rankedPlayers = getGeneralRealRanking(state.players, 50);
  } else if (state.rankingView === 'general-raw') {
    rankedPlayers = getGeneralRawRanking(state.players, 50);
  } else if (state.rankingView === 'avancement') {
    rankedPlayers = getAvancementRanking(state.players, state.rankingCategory, true, 50);
  }

  // Filtrage par recherche de pseudo si renseigné
  let displayList = rankedPlayers;
  if (state.searchQuery) {
    displayList = rankedPlayers.filter(p => p.pseudo.toLowerCase().includes(state.searchQuery));
  }

  if (listCountEl) {
    listCountEl.textContent = `${displayList.length} joueur${displayList.length > 1 ? 's' : ''}`;
  }

  // Mettre à jour les podiums (Top 3)
  updatePodiums(rankedPlayers);

  // Rendu de la liste
  if (displayList.length === 0) {
    rowsContainer.innerHTML = `
      <div class="p-8 text-center text-slate-500 space-y-2">
        <i data-lucide="search-x" class="w-8 h-8 mx-auto text-slate-600"></i>
        <p class="text-sm">Aucun joueur ne correspond à la recherche "${escapeHtml(state.searchQuery)}".</p>
      </div>
    `;
    initLucide();
    return;
  }

  rowsContainer.innerHTML = displayList.map(player => renderPlayerRow(player)).join('');
  initLucide();
  attachAdminListeners();
}

/**
 * Lance le mode édition pour l'administrateur
 * Charge l'ensemble des données d'un joueur dans le formulaire et bascule sur l'onglet d'inscription
 */
function startAdminEdit(playerId) {
  if (!state.isAdmin) return;
  const player = state.players.find(p => String(p.id) === String(playerId));
  if (!player) {
    showToast("Profil joueur introuvable", "error");
    return;
  }

  state.editingPlayerId = player.id;

  // Pré-remplir le pseudo
  const inputPseudo = document.getElementById('input-pseudo');
  if (inputPseudo) inputPseudo.value = player.pseudo;

  // Pré-remplir l'intégralité des 6 étapes
  fillFormWithPlayerData(player);

  // Afficher la bannière d'édition admin
  const banner = document.getElementById('admin-editing-banner');
  const pseudoDisplay = document.getElementById('admin-editing-pseudo-display');
  if (banner) banner.classList.remove('hidden');
  if (pseudoDisplay) pseudoDisplay.textContent = player.pseudo;

  // Cacher le message d'info standard du pseudo
  const statusMsg = document.getElementById('pseudo-status-msg');
  if (statusMsg) statusMsg.classList.add('hidden');

  // Basculer sur l'onglet formulaire
  switchTab('inscription');

  // Aller à l'étape 0 pour afficher le pseudo et permettre la navigation libre sur les 6 étapes
  goToStep(0);
  window.scrollTo({ top: 0, behavior: 'smooth' });

  showToast(`Profil de ${player.pseudo} chargé pour modification`, "info");
}

/**
 * Annule le mode édition administrateur et réinitialise le formulaire
 */
function cancelAdminEdit() {
  state.editingPlayerId = null;

  const banner = document.getElementById('admin-editing-banner');
  if (banner) banner.classList.add('hidden');

  const inputPseudo = document.getElementById('input-pseudo');
  if (inputPseudo) inputPseudo.value = '';

  const statusMsg = document.getElementById('pseudo-status-msg');
  if (statusMsg) {
    statusMsg.classList.add('hidden');
    statusMsg.innerHTML = '';
  }

  // Réinitialiser les champs à zéro
  fillFormWithPlayerData({
    skills_tickets: 0,
    skills_ascension: 0,
    skills_ascension_level: 0,
    skills_tech_level: 0,
    eggs_count: 0,
    eggs_ascension: 0,
    eggs_ascension_level: 0,
    eggs_tech_level: 0,
    eggs_fusions: 0,
    mount_keys: 0,
    mount_ascension: 0,
    mount_ascension_level: 0,
    mount_tech_level: 0,
    mount_fusions: 0,
    forge_hammers: 0,
    forge_ascension: 0,
    forge_ascension_level: 0,
    forge_tech_level: 0,
    clan_vials: 0,
    available_slots: []
  });

  goToStep(0);
  showToast("Mode édition quitté", "info");
}

/**
 * Attache les écouteurs d'édition et suppression admin
 */
function attachAdminListeners() {
  if (!state.isAdmin) return;

  // 1. Boutons d'édition admin
  document.querySelectorAll('.btn-admin-edit-row').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const playerId = btn.dataset.playerId;
      if (playerId) startAdminEdit(playerId);
    });
  });

  // 2. Clic direct sur une ligne, carte ou podium modifiable
  document.querySelectorAll('.admin-editable-row').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.btn-admin-delete-row')) return;
      if (e.target.closest('.btn-admin-edit-row')) return;
      if (e.target.closest('.btn-admin-complete-ascension')) return;
      const playerId = el.dataset.playerId;
      if (playerId) startAdminEdit(playerId);
    });
  });

  // 3. Boutons de suppression admin
  document.querySelectorAll('.btn-admin-delete-row').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const playerId = btn.dataset.playerId;
      const playerPseudo = btn.dataset.playerPseudo;
      confirmDeletePlayer(playerId, playerPseudo);
    });
  });

  // 4. Boutons validation rapide de l'ascension effectuée (Admin)
  document.querySelectorAll('.btn-admin-complete-ascension').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const playerId = btn.dataset.playerId;
      const category = btn.dataset.category || state.rankingCategory;
      if (playerId) openAscensionConfirmModal(playerId, category);
    });
  });
}

/**
 * Génère le HTML pour les badges de créneaux horaires (Rush nocturne)
 */
function renderSlotBadgesHtml(slots) {
  if (!slots || !Array.isArray(slots)) return '';
  if (slots.includes('rush')) {
    return '<span class="slot-badge slot-badge-rush font-semibold text-[11px] inline-flex items-center gap-1" title="Disponible pour le rush nocturne 01h00 - 02h00">⚡ Rush 01h-02h</span>';
  }
  return '';
}

/**
 * Rendu d'une carte d'Élu de l'Ascension (ayant coché le souhait d'ascension)
 */
function renderEluCard(elu, category) {
  let resCount = 0;
  let iconUrl = '';
  let ascLvl = 0;
  let ascStage = 0;
  let techLvl = 0;
  let fusionsCount = 0;

  if (category === 'skills') {
    resCount = elu.skills_tickets;
    iconUrl = './Tickets FM.png';
    ascLvl = elu.skills_ascension;
    ascStage = elu.skills_ascension_level;
    techLvl = elu.skills_tech_level;
  } else if (category === 'eggs') {
    resCount = elu.eggs_count;
    iconUrl = './oeufs FM.png';
    ascLvl = elu.eggs_ascension;
    ascStage = elu.eggs_ascension_level;
    techLvl = elu.eggs_tech_level;
    fusionsCount = elu.eggs_fusions || 0;
  } else if (category === 'mount') {
    resCount = elu.mount_keys;
    iconUrl = './Monture FM.png';
    ascLvl = elu.mount_ascension;
    ascStage = elu.mount_ascension_level;
    techLvl = elu.mount_tech_level;
    fusionsCount = elu.mount_fusions || 0;
  }

  const sim = elu.sim || {};
  const warPoints = elu.warPoints || 0;
  const rushBadge = (elu.isRushAvailable || (Array.isArray(elu.available_slots) && elu.available_slots.includes('rush')))
    ? '<span class="slot-badge slot-badge-rush font-semibold text-[10px] inline-flex items-center gap-1" title="Disponible pour le rush nocturne 01h00 - 02h00">⚡ Rush 01h-02h</span>'
    : '';

  const clanVialsBadge = (elu.clan_vials > 0)
    ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1" title="Fioles de clan : ${formatNumber(elu.clan_vials)}">
        <img src="./Fioles.png" alt="Fioles" class="w-3.5 h-3.5 object-contain">
        <span>${formatNumber(elu.clan_vials)}</span>
       </span>`
    : '';

  const adminBtns = state.isAdmin ? `
    <div class="flex items-center gap-0.5">
      <button type="button" class="btn-admin-complete-ascension p-1 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition"
        data-player-id="${elu.id}" data-category="${category}" title="Valider l'ascension effectuée (Admin)">
        <i data-lucide="check-check" class="w-3.5 h-3.5"></i>
      </button>
      <button type="button" class="btn-admin-edit-row p-1 text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 rounded transition"
        data-player-id="${elu.id}" data-player-pseudo="${escapeHtml(elu.pseudo)}" title="Modifier ce profil (Admin)">
        <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
      </button>
      <button type="button" class="btn-admin-delete-row p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition"
        data-player-id="${elu.id}" data-player-pseudo="${escapeHtml(elu.pseudo)}" title="Supprimer ce joueur (Admin)">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>
    </div>
  ` : '';

  const adminCardClass = state.isAdmin ? 'admin-editable-row' : '';
  const adminCardTitle = state.isAdmin ? 'title="Cliquer pour modifier ce profil (Admin)"' : '';

  return `
    <div class="elu-card flex flex-col justify-between space-y-3 ${adminCardClass}" data-player-id="${elu.id}" ${adminCardTitle}>
      <div>
        <div class="flex items-center justify-between gap-1 pb-2 border-b border-amber-500/20">
          <div class="flex items-center gap-1.5 font-bold text-xs text-amber-300">
            <i data-lucide="crown" class="w-3.5 h-3.5 text-amber-400"></i>
            <span class="uppercase tracking-wider">ÉLU #${elu.rank}</span>
          </div>
          <div class="flex items-center gap-1.5">
            ${rushBadge}
            ${clanVialsBadge}
            ${adminBtns}
          </div>
        </div>

        <div class="pt-2">
          <h4 class="font-black text-base text-white truncate">${escapeHtml(elu.pseudo)}</h4>
          <span class="text-[10px] text-amber-400/90 font-semibold block">Souhaite faire son ascension</span>
        </div>

        <div class="mt-2 space-y-1.5 text-xs text-slate-300">
          <div class="flex items-center justify-between font-bold">
            <span class="flex items-center gap-1 text-amber-300">
              <img src="${iconUrl}" alt="" class="w-4 h-4 object-contain">
              ${formatNumber(resCount)}
            </span>
            <span class="text-slate-300">Asc. ${ascLvl} (Niv. ${ascStage})</span>
          </div>
          <div class="flex items-center justify-between text-[11px] text-slate-400">
            <span>Tech: <strong class="text-purple-300">${techLvl}</strong></span>
            <span>Niv. franchis : <strong class="text-emerald-400">+${sim.levelsGained || 0}</strong></span>
          </div>
          ${(category === 'eggs' || category === 'mount') ? `
            <div class="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
              <span>Fusions saisies :</span>
              <strong class="text-purple-300">${fusionsCount}</strong>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between">
        <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Pts de Guerre :</span>
        <span class="war-points-badge">
          <i data-lucide="swords" class="w-3.5 h-3.5 text-red-400"></i>
          <span>${formatNumber(warPoints)}</span>
        </span>
      </div>
    </div>
  `;
}

/**
 * Rendu d'une ligne de joueur dans le classement
 */
function renderPlayerRow(player) {
  const isPodium = state.rankingView !== 'ordre' && player.rank <= 3;
  let rankClass = "bg-slate-800 text-slate-400";
  let rankIcon = "";

  if (state.rankingView !== 'ordre') {
    if (player.rank === 1) {
      rankClass = "bg-amber-500/20 text-amber-300 border border-amber-500/40";
      rankIcon = "🥇";
    } else if (player.rank === 2) {
      rankClass = "bg-slate-400/20 text-slate-200 border border-slate-400/40";
      rankIcon = "🥈";
    } else if (player.rank === 3) {
      rankClass = "bg-amber-700/20 text-amber-500 border border-amber-700/40";
      rankIcon = "🥉";
    }
  }

  // Tags et habillage spécifiques selon la vue
  let statusBadgeHtml = '';
  let rowHighlightClass = 'hover:bg-slate-800/40';

  if (state.rankingView === 'ordre') {
    if (player.isMaxed) {
      statusBadgeHtml = `
        <span class="px-2 py-0.5 rounded-full text-[10px] md:text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700 inline-flex items-center gap-1 shadow-sm">
          <i data-lucide="lock" class="w-3 h-3 text-slate-400"></i>
          Ascension Max
        </span>
      `;
      rankClass = "bg-slate-800/60 text-slate-500 border border-slate-700/60";
      rowHighlightClass = 'opacity-65 hover:bg-slate-800/40';
    } else if (player.isElu) {
      statusBadgeHtml = `
        <span class="px-2 py-0.5 rounded-full text-[10px] md:text-[11px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 inline-flex items-center gap-1 shadow-sm">
          <i data-lucide="crown" class="w-3 h-3 text-amber-400"></i>
          Élu #${player.rank}
        </span>
      `;
      rankClass = "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-black";
      rowHighlightClass = 'row-elu';
    } else {
      statusBadgeHtml = `
        <span class="px-2 py-0.5 rounded-full text-[10px] md:text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700 inline-flex items-center gap-1 shadow-sm">
          <i data-lucide="user" class="w-3 h-3 text-slate-500"></i>
          Suite #${player.rank}
        </span>
      `;
      rankClass = "bg-slate-800 text-slate-400 border border-slate-700";
      rowHighlightClass = 'hover:bg-slate-800/40';
    }
  } else if (isPodium) {
    rowHighlightClass = 'bg-slate-900/40 hover:bg-slate-800/40';
  }

  // Badges de créneaux
  const slotBadgesHtml = renderSlotBadgesHtml(player.available_slots);

  // Badge Fioles de Clan (Informatif)
  const clanVialsBadge = (player.clan_vials > 0)
    ? `<span class="px-2 py-0.5 rounded-full text-[10px] md:text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1 shadow-sm" title="Fioles de clan : ${formatNumber(player.clan_vials)}">
        <img src="./Fioles.png" alt="Fioles" class="w-3.5 h-3.5 object-contain">
        <span>${formatNumber(player.clan_vials)}</span>
       </span>`
    : '';

  // Contenu spécifique selon le type de classement
  let detailsHtml = '';

  if (state.rankingView === 'general-real') {
    const simSkills = player.simSkills || simulateRealProgression('skills', player.skills_ascension, player.skills_ascension_level, player.skills_tech_level, player.skills_tickets);
    const simEggs = player.simEggs || simulateRealProgression('eggs', player.eggs_ascension, player.eggs_ascension_level, player.eggs_tech_level, player.eggs_count);
    const simMount = player.simMount || simulateRealProgression('mount', player.mount_ascension, player.mount_ascension_level, player.mount_tech_level, player.mount_keys);

    detailsHtml = `
      <div class="flex flex-wrap items-center gap-1.5 md:gap-3 text-[11px] text-slate-400">
        <span class="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 font-semibold border border-blue-500/20" title="Tickets réels">
          Tickets: #${player.rankSkills} (Asc. ${simSkills.finalAscension ?? '-'} Niv. ${simSkills.finalLevel ?? '-'})
        </span>
        <span class="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 font-semibold border border-amber-500/20" title="Œufs réels">
          Œufs: #${player.rankEggs} (Asc. ${simEggs.finalAscension ?? '-'} Niv. ${simEggs.finalLevel ?? '-'})
        </span>
        <span class="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-semibold border border-cyan-500/20" title="Monture réelle">
          Monture: #${player.rankMount} (Asc. ${simMount.finalAscension ?? '-'} Niv. ${simMount.finalLevel ?? '-'})
        </span>
        <span class="px-2 py-0.5 rounded bg-orange-500/10 text-orange-300 font-semibold border border-orange-500/20" title="Forge">
          Forge: #${player.rankForge} (Asc. ${player.forge_ascension} Niv. ${player.forge_ascension_level})
        </span>
      </div>
    `;
  } else if (state.rankingView === 'general-raw') {
    detailsHtml = `
      <div class="flex flex-wrap items-center gap-1.5 md:gap-3 text-[11px] text-slate-400">
        <span class="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 font-semibold border border-blue-500/20" title="Rang Compétences">Tickets: #${player.rankSkills}</span>
        <span class="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 font-semibold border border-amber-500/20" title="Rang Œufs">Œufs: #${player.rankEggs}</span>
        <span class="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-semibold border border-cyan-500/20" title="Rang Montures">Monture: #${player.rankMount}</span>
        <span class="px-2 py-0.5 rounded bg-orange-500/10 text-orange-300 font-semibold border border-orange-500/20" title="Rang Forge">Forge: #${player.rankForge}</span>
      </div>
    `;
  } else if (state.rankingView === 'ordre') {
    let resCount = 0;
    let iconUrl = '';
    let ascLvl = 0;
    let ascStage = 0;
    let techLvl = 0;
    let fusionsCount = 0;

    if (state.rankingCategory === 'skills') {
      resCount = player.skills_tickets;
      iconUrl = './Tickets FM.png';
      ascLvl = player.skills_ascension;
      ascStage = player.skills_ascension_level;
      techLvl = player.skills_tech_level;
    } else if (state.rankingCategory === 'eggs') {
      resCount = player.eggs_count;
      iconUrl = './oeufs FM.png';
      ascLvl = player.eggs_ascension;
      ascStage = player.eggs_ascension_level;
      techLvl = player.eggs_tech_level;
      fusionsCount = player.eggs_fusions || 0;
    } else if (state.rankingCategory === 'mount') {
      resCount = player.mount_keys;
      iconUrl = './Monture FM.png';
      ascLvl = player.mount_ascension;
      ascStage = player.mount_ascension_level;
      techLvl = player.mount_tech_level;
      fusionsCount = player.mount_fusions || 0;
    }

    const sim = player.sim || {};
    const warPoints = player.warPoints || 0;

    if (player.isMaxed) {
      detailsHtml = `
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="font-bold text-slate-400 flex items-center gap-1">
            <img src="${iconUrl}" alt="" class="w-4 h-4 object-contain opacity-70">
            ${formatNumber(resCount)}
          </span>
          <span class="text-slate-500">•</span>
          <span class="text-amber-400 font-bold">Asc. 3 (Niv. 100)</span>
          <span class="text-slate-500">•</span>
          <span class="text-purple-300">Tech: ${techLvl}</span>
          <span class="text-slate-500">•</span>
          <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-semibold border border-slate-700">
            Niveau Max Atteint (aucune ascension possible)
          </span>
        </div>
      `;
    } else {
      detailsHtml = `
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="font-bold text-slate-200 flex items-center gap-1">
            <img src="${iconUrl}" alt="" class="w-4 h-4 object-contain">
            ${formatNumber(resCount)}
          </span>
          <span class="text-slate-500">•</span>
          <span class="text-amber-300 font-semibold">Asc: ${ascLvl} (Niv: ${ascStage})</span>
          <span class="text-slate-500">•</span>
          <span class="text-purple-300">Tech: ${techLvl}</span>
          ${(state.rankingCategory === 'eggs' || state.rankingCategory === 'mount') ? `
            <span class="text-slate-500">•</span>
            <span class="text-slate-300">Fusions: <strong class="text-purple-300">${fusionsCount}</strong></span>
          ` : ''}
          <span class="text-slate-500">•</span>
          <span class="text-emerald-400 font-semibold">+${sim.levelsGained || 0} niv.</span>
          <span class="text-slate-500">•</span>
          <span class="war-points-badge !py-0.5 !px-2 !text-[10px]">
            <i data-lucide="swords" class="w-3 h-3 text-red-400"></i>
            <span>${formatNumber(warPoints)} pts</span>
          </span>
        </div>
      `;
    }
  } else if (state.rankingView === 'avancement') {
    let resCount = 0;
    let iconUrl = '';
    let techLvl = 0;

    if (state.rankingCategory === 'skills') {
      resCount = player.skills_tickets;
      techLvl = player.skills_tech_level;
      iconUrl = './Tickets FM.png';
    } else if (state.rankingCategory === 'eggs') {
      resCount = player.eggs_count;
      techLvl = player.eggs_tech_level;
      iconUrl = './oeufs FM.png';
    } else if (state.rankingCategory === 'mount') {
      resCount = player.mount_keys;
      techLvl = player.mount_tech_level;
      iconUrl = './Monture FM.png';
    } else if (state.rankingCategory === 'forge') {
      resCount = player.forge_hammers;
      techLvl = player.forge_tech_level || 0;
      iconUrl = './Forge FM.png';
    }

    const sim = player.sim || {};

    if (state.rankingCategory === 'forge') {
      detailsHtml = `
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="font-bold text-amber-300">Asc. ${player.forge_ascension}</span>
          <span class="text-slate-500">•</span>
          <span class="text-sky-300">Niv. ${player.forge_ascension_level} / 35</span>
          <span class="text-slate-500">•</span>
          <span class="text-slate-400 flex items-center gap-1">
            <img src="${iconUrl}" alt="" class="w-4 h-4 object-contain">
            ${formatNumber(player.forge_hammers)}
          </span>
        </div>
      `;
    } else {
      detailsHtml = `
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
            Asc. Simulée : ${sim.finalAscension} (Niv. ${sim.finalLevel})
          </span>
          <span class="text-emerald-400 font-semibold">+${sim.levelsGained} niv.</span>
          <span class="text-slate-500">•</span>
          <span class="text-slate-400 flex items-center gap-1">
            <img src="${iconUrl}" alt="" class="w-3.5 h-3.5 object-contain">
            Reste: ${formatNumber(sim.remainingResources)}
          </span>
          <span class="text-slate-500">•</span>
          <span class="text-purple-300">Tech: ${techLvl}</span>
        </div>
      `;
    }
  }

  // Boutons d'action admin si session active
  let adminAscensionBtn = '';
  if (state.rankingView === 'ordre' && state.rankingCategory !== 'forge' && !player.isMaxed) {
    adminAscensionBtn = `
      <button type="button" class="btn-admin-complete-ascension p-1.5 md:p-2 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition"
        data-player-id="${player.id}" data-category="${state.rankingCategory}" title="Valider l'ascension effectuée (Admin)">
        <i data-lucide="check-check" class="w-4 h-4"></i>
      </button>
    `;
  }

  const adminActionBtns = state.isAdmin ? `
    <div class="flex items-center gap-1">
      ${adminAscensionBtn}
      <button type="button" class="btn-admin-edit-row p-1.5 md:p-2 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 transition"
        data-player-id="${player.id}" data-player-pseudo="${escapeHtml(player.pseudo)}" title="Modifier ce profil (Admin)">
        <i data-lucide="edit-3" class="w-4 h-4"></i>
      </button>
      <button type="button" class="btn-admin-delete-row p-1.5 md:p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
        data-player-id="${player.id}" data-player-pseudo="${escapeHtml(player.pseudo)}" title="Supprimer ce joueur (Admin)">
        <i data-lucide="trash-2" class="w-4 h-4"></i>
      </button>
    </div>
  ` : '';

  const adminRowClass = state.isAdmin ? 'admin-editable-row' : '';
  const adminRowTitle = state.isAdmin ? 'title="Cliquer pour modifier ce profil (Admin)"' : '';

  return `
    <div class="p-3 md:p-4 transition flex items-center justify-between gap-3 ${rowHighlightClass} ${adminRowClass}" data-player-id="${player.id}" ${adminRowTitle}>
      <div class="flex items-center gap-3 min-w-0">
        <div class="rank-badge ${rankClass} shrink-0 text-xs font-black">
          ${rankIcon ? rankIcon : '#' + player.rank}
        </div>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-black text-sm md:text-base text-white truncate">${escapeHtml(player.pseudo)}</span>
            ${statusBadgeHtml}
            ${slotBadgesHtml}
            ${clanVialsBadge}
            ${(state.rankingView === 'general-real' || state.rankingView === 'general-raw') ? `
              <span class="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-extrabold border border-indigo-500/30">
                Score: ${player.totalScore}
              </span>
            ` : ''}
          </div>
          <div class="mt-1">${detailsHtml}</div>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        ${adminActionBtns}
      </div>
    </div>
  `;
}

/**
 * Mise à jour visuelle des Podiums Top 3
 */
function updatePodiums(players) {
  const p1 = players[0] || null;
  const p2 = players[1] || null;
  const p3 = players[2] || null;

  setPodiumData(1, p1);
  setPodiumData(2, p2);
  setPodiumData(3, p3);
}

function setPodiumData(rank, player) {
  const cardEl = document.getElementById(`podium-item-${rank}`);
  const nameEl = document.getElementById(`podium-name-${rank}`);
  const scoreEl = document.getElementById(`podium-score-${rank}`);
  if (!nameEl || !scoreEl) return;

  if (!player) {
    nameEl.textContent = "-";
    scoreEl.textContent = "-";
    if (cardEl) {
      cardEl.classList.remove('admin-editable-row');
      cardEl.removeAttribute('data-player-id');
      cardEl.removeAttribute('title');
    }
    return;
  }

  nameEl.textContent = player.pseudo;

  if (cardEl && state.isAdmin) {
    cardEl.classList.add('admin-editable-row');
    cardEl.dataset.playerId = player.id;
    cardEl.setAttribute('title', `Cliquer pour modifier ${player.pseudo} (Admin)`);
  } else if (cardEl) {
    cardEl.classList.remove('admin-editable-row');
    cardEl.removeAttribute('data-player-id');
    cardEl.removeAttribute('title');
  }

  if (state.rankingView === 'general-real') {
    scoreEl.textContent = `Score: ${player.totalScore} pts (Simulé)`;
  } else if (state.rankingView === 'general-raw') {
    scoreEl.textContent = `Score: ${player.totalScore} pts (Brut)`;
  } else if (state.rankingView === 'avancement') {
    if (state.rankingCategory === 'forge') {
      scoreEl.textContent = `Asc. ${player.forge_ascension} • Niv. ${player.forge_ascension_level}`;
    } else {
      const sim = player.sim || {};
      scoreEl.textContent = `Asc. ${sim.finalAscension ?? 0} (Niv. ${sim.finalLevel ?? 0})`;
    }
  } else {
    scoreEl.textContent = `Rang #${player.rank}`;
  }
}

// =============================================================================
// FONCTIONNALITÉS ADMINISTRATEUR & SÉCURITÉ
// =============================================================================
function initAdminFeatures() {
  const triggerBtn = document.getElementById('secret-admin-trigger-btn');
  const modal = document.getElementById('admin-modal');
  const closeBtn = document.getElementById('btn-close-admin-modal');
  const closePanelBtn = document.getElementById('btn-close-admin-panel');
  const loginBtn = document.getElementById('btn-submit-admin-login');
  const logoutBtn = document.getElementById('btn-admin-logout');
  const headerLogoutBtn = document.getElementById('admin-logout-btn');

  // Ouvrir la modale admin
  triggerBtn.addEventListener('click', () => {
    updateAdminModalView();
    modal.classList.remove('hidden');
  });

  // Fermer la modale
  closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
  closePanelBtn.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  // Connexion Admin
  loginBtn.addEventListener('click', handleAdminLogin);
  document.getElementById('admin-password-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAdminLogin();
  });

  // Déconnexion Admin
  logoutBtn.addEventListener('click', handleAdminLogout);
  headerLogoutBtn.addEventListener('click', handleAdminLogout);

  // Annuler le mode édition admin depuis la bannière
  document.getElementById('btn-cancel-admin-edit')?.addEventListener('click', cancelAdminEdit);

  // Modale de confirmation de suppression
  const deleteModal = document.getElementById('delete-confirm-modal');
  document.getElementById('btn-cancel-delete').addEventListener('click', () => {
    deleteModal.classList.add('hidden');
    state.deleteTarget = null;
  });
  document.getElementById('btn-confirm-delete').addEventListener('click', executeDeletePlayer);

  // Modale de confirmation de validation d'ascension
  const ascensionModal = document.getElementById('ascension-confirm-modal');
  if (ascensionModal) {
    document.getElementById('btn-cancel-ascension')?.addEventListener('click', () => {
      ascensionModal.classList.add('hidden');
      state.ascensionTarget = null;
    });
    document.getElementById('btn-confirm-ascension')?.addEventListener('click', executeConfirmAscension);
    ascensionModal.addEventListener('click', (e) => {
      if (e.target === ascensionModal) {
        ascensionModal.classList.add('hidden');
        state.ascensionTarget = null;
      }
    });
  }
}

function updateAdminModalView() {
  const loginView = document.getElementById('admin-login-view');
  const panelView = document.getElementById('admin-panel-view');

  if (state.isAdmin) {
    loginView.classList.add('hidden');
    panelView.classList.remove('hidden');
  } else {
    loginView.classList.remove('hidden');
    panelView.classList.add('hidden');
  }
}

function setAdminState(isAdmin, session = null) {
  state.isAdmin = isAdmin;
  state.adminSession = session;

  const adminBadge = document.getElementById('admin-badge');
  if (adminBadge) {
    if (isAdmin) {
      adminBadge.classList.remove('hidden');
      adminBadge.classList.add('flex');
    } else {
      adminBadge.classList.add('hidden');
      adminBadge.classList.remove('flex');
    }
  }

  updateAdminModalView();
  updatePollsNavVisibility();
  renderRankings();
  if (state.currentTab === 'sondages') {
    renderCurrentPollDetail();
  }
}

async function handleAdminLogin() {
  const emailInput = document.getElementById('admin-email-input');
  const passwordInput = document.getElementById('admin-password-input');
  const loginBtn = document.getElementById('btn-submit-admin-login');

  const password = passwordInput.value;
  if (!password) {
    showToast("Veuillez saisir votre mot de passe", "warning");
    passwordInput.focus();
    return;
  }

  const originalHtml = loginBtn.innerHTML;
  loginBtn.disabled = true;
  loginBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Connexion...`;
  initLucide();

  try {
    const data = await loginAdmin(emailInput.value, password);
    showToast("Connexion administrateur réussie !", "success");
    setAdminState(true, data.session);
    passwordInput.value = '';
  } catch (err) {
    console.error("Échec connexion:", err);
    showToast("Identifiants incorrects ou utilisateur non trouvé", "error");
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = originalHtml;
    initLucide();
  }
}

async function handleAdminLogout() {
  try {
    await logoutAdmin();
    cancelAdminEdit();
    setAdminState(false, null);
    showToast("Déconnexion administrateur effectuée", "info");
    document.getElementById('admin-modal').classList.add('hidden');
  } catch (err) {
    console.warn("Erreur déconnexion:", err);
  }
}

function confirmDeletePlayer(playerId, pseudo) {
  state.deleteTarget = { id: playerId, pseudo };
  const modal = document.getElementById('delete-confirm-modal');
  const pseudoSpan = document.getElementById('delete-target-pseudo');
  if (pseudoSpan) pseudoSpan.textContent = pseudo;
  modal.classList.remove('hidden');
}

async function executeDeletePlayer() {
  if (!state.deleteTarget) return;

  const { id, pseudo } = state.deleteTarget;
  const modal = document.getElementById('delete-confirm-modal');
  const confirmBtn = document.getElementById('btn-confirm-delete');

  confirmBtn.disabled = true;
  confirmBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>`;
  initLucide();

  try {
    await deletePlayer(id);
    showToast(`Le joueur ${pseudo} a été supprimé`, "success");
    modal.classList.add('hidden');
    state.deleteTarget = null;
    await loadData(false);
  } catch (err) {
    console.error("Erreur suppression:", err);
    showToast(`Impossible de supprimer le joueur : ${err.message}`, "error");
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Supprimer";
  }
}

function openAscensionConfirmModal(playerId, category) {
  const player = state.players.find(p => String(p.id) === String(playerId));
  if (!player) {
    showToast("Joueur non trouvé", "error");
    return;
  }

  category = category || state.rankingCategory || 'skills';
  if (category === 'forge') {
    showToast("L'ascension rapide n'est pas applicable à la forge", "warning");
    return;
  }

  let currentAsc = 0;
  let currentLvl = 0;
  let techLevel = 0;
  let currentRes = 0;
  let catLabel = '';

  if (category === 'skills') {
    currentAsc = Number(player.skills_ascension) || 0;
    currentLvl = Number(player.skills_ascension_level) || 0;
    techLevel = Number(player.skills_tech_level) || 0;
    currentRes = Number(player.skills_tickets) || 0;
    catLabel = 'Compétences (Tickets)';
  } else if (category === 'eggs') {
    currentAsc = Number(player.eggs_ascension) || 0;
    currentLvl = Number(player.eggs_ascension_level) || 0;
    techLevel = Number(player.eggs_tech_level) || 0;
    currentRes = Number(player.eggs_count) || 0;
    catLabel = "Œufs d'Épée";
  } else if (category === 'mount') {
    currentAsc = Number(player.mount_ascension) || 0;
    currentLvl = Number(player.mount_ascension_level) || 0;
    techLevel = Number(player.mount_tech_level) || 0;
    currentRes = Number(player.mount_keys) || 0;
    catLabel = 'Monture (Clés)';
  }

  if (currentAsc >= 3 && currentLvl >= 100) {
    showToast(`${player.pseudo} est déjà au palier maximum absolu (Ascension 3, Niveau 100)`, "info");
    return;
  }

  // Simulation pour calculer le niveau atteint après dépense des ressources (règle rush / ordre d'ascension)
  const sim = simulateRealProgression(category, currentAsc, currentLvl, techLevel, currentRes, true);

  // L'ascension avance d'au moins +1 (ou sim.finalAscension), plafonnée à 3
  const targetAsc = Math.min(3, Math.max(currentAsc + 1, sim.finalAscension));

  // Niveau atteint dans la nouvelle ascension
  let defaultNewLevel = 0;
  if (sim.finalAscension > currentAsc) {
    defaultNewLevel = Math.min(100, Math.max(0, sim.finalLevel));
  } else {
    // Si la quantité de ressources ne permettait pas de franchir 100 niveaux, mais que l'ascension est marquée faite
    defaultNewLevel = 0;
  }

  if (targetAsc >= 3 && defaultNewLevel > 100) {
    defaultNewLevel = 100;
  }

  state.ascensionTarget = {
    playerId: player.id,
    category,
    currentAsc,
    targetAsc,
    currentLvl,
    currentRes,
    defaultNewLevel
  };

  const modal = document.getElementById('ascension-confirm-modal');
  const pseudoSpan = document.getElementById('ascension-modal-pseudo');
  const catSpan = document.getElementById('ascension-modal-category');
  const oldAscSpan = document.getElementById('ascension-modal-old-asc');
  const newAscSpan = document.getElementById('ascension-modal-new-asc');
  const newLvlInput = document.getElementById('ascension-modal-new-level');
  const oldResSpan = document.getElementById('ascension-modal-old-res');

  if (pseudoSpan) pseudoSpan.textContent = player.pseudo;
  if (catSpan) catSpan.textContent = catLabel;
  if (oldAscSpan) oldAscSpan.textContent = `Asc. ${currentAsc} (Niv. ${currentLvl})`;
  if (newAscSpan) newAscSpan.textContent = `Asc. ${targetAsc}`;
  if (newLvlInput) newLvlInput.value = defaultNewLevel;
  if (oldResSpan) oldResSpan.textContent = formatNumber(currentRes);

  modal.classList.remove('hidden');
  initLucide();
}

async function executeConfirmAscension() {
  if (!state.ascensionTarget) return;

  const { playerId, category, targetAsc } = state.ascensionTarget;
  const existingPlayer = state.players.find(p => String(p.id) === String(playerId));
  if (!existingPlayer) {
    showToast("Joueur introuvable", "error");
    return;
  }

  const modal = document.getElementById('ascension-confirm-modal');
  const confirmBtn = document.getElementById('btn-confirm-ascension');
  const newLvlInput = document.getElementById('ascension-modal-new-level');

  let newLevel = parseInt(newLvlInput ? newLvlInput.value : 0, 10);
  if (isNaN(newLevel) || newLevel < 0) newLevel = 0;
  if (newLevel > 100) newLevel = 100;
  if (targetAsc >= 3 && newLevel > 100) newLevel = 100;

  const originalContent = confirmBtn.innerHTML;
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Validation...`;
  initLucide();

  try {
    const updatedData = { ...existingPlayer };
    let cleanSlots = Array.isArray(existingPlayer.available_slots) ? [...existingPlayer.available_slots] : [];

    if (category === 'skills') {
      updatedData.skills_ascension = targetAsc;
      updatedData.skills_ascension_level = newLevel;
      updatedData.skills_tickets = 0;
      updatedData.want_skills_ascension = false;
      cleanSlots = cleanSlots.filter(s => s !== 'asc_skills' && s !== 'skills');
    } else if (category === 'eggs') {
      updatedData.eggs_ascension = targetAsc;
      updatedData.eggs_ascension_level = newLevel;
      updatedData.eggs_count = 0;
      updatedData.want_eggs_ascension = false;
      cleanSlots = cleanSlots.filter(s => s !== 'asc_eggs' && s !== 'eggs');
    } else if (category === 'mount') {
      updatedData.mount_ascension = targetAsc;
      updatedData.mount_ascension_level = newLevel;
      updatedData.mount_keys = 0;
      updatedData.want_mount_ascension = false;
      cleanSlots = cleanSlots.filter(s => s !== 'asc_mount' && s !== 'mount');
    }

    updatedData.available_slots = cleanSlots;

    await upsertPlayer(updatedData);

    modal.classList.add('hidden');
    state.ascensionTarget = null;
    showToast(`Ascension validée pour ${existingPlayer.pseudo} (Asc. ${targetAsc}, Niv. ${newLevel}) !`, "success");
    triggerConfetti();

    // Rechargement des données pour recalculer les classements et mettre à jour la vue
    await loadData(false);
  } catch (err) {
    console.error("Erreur validation ascension:", err);
    showToast(`Erreur lors de la validation : ${err.message || 'Erreur inconnue'}`, "error");
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = originalContent;
    initLucide();
  }
}

// =============================================================================
// NOTIFICATIONS TOAST & ANIMATIONS
// =============================================================================
function showToast(message, type = "info") {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  let bgClass = "bg-slate-900 border-slate-700 text-slate-100";
  let iconName = "info";

  if (type === "success") {
    bgClass = "bg-slate-900 border-emerald-500/40 text-emerald-200";
    iconName = "check-circle";
  } else if (type === "error") {
    bgClass = "bg-slate-900 border-red-500/40 text-red-200";
    iconName = "alert-circle";
  } else if (type === "warning") {
    bgClass = "bg-slate-900 border-amber-500/40 text-amber-200";
    iconName = "alert-triangle";
  }

  toast.className = `p-3.5 rounded-2xl border shadow-xl flex items-center gap-2.5 text-xs font-semibold backdrop-blur pointer-events-auto transition-all duration-300 transform translate-y-2 opacity-0 ${bgClass}`;
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-4 h-4 shrink-0"></i>
    <span class="flex-1">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  initLucide();

  // Animation d'apparition
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  // Disparition automatique après 3.5s
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-x-4');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function triggerConfetti() {
  if (typeof window.confetti === 'function') {
    window.confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
  }
}

// =============================================================================
// FONCTIONS UTILITAIRES
// =============================================================================
function formatNumber(num) {
  return new Intl.NumberFormat('fr-FR').format(num || 0);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// =============================================================================
// MODULE SONDAGES & VOTES DE POPULARITÉ
// =============================================================================

/**
 * Initialisation de l'identité joueur (connexion par son pseudo inscrit)
 */
function initPlayerIdentity() {
  updatePlayerBadge();

  // Bouton profil dans le header : renvoie directement à la première page (Étape 0) pour renseigner/modifier son nom
  document.getElementById('header-player-btn')?.addEventListener('click', () => {
    switchTab('inscription');
    goToStep(0);
    document.getElementById('input-pseudo')?.focus();
  });
}

function setConnectedPlayer(pseudo) {
  if (!pseudo || !pseudo.trim()) return;
  const clean = pseudo.trim();
  state.connectedPseudo = clean;
  try {
    localStorage.setItem('fas_connected_pseudo', clean);
  } catch (e) {}

  // Synchroniser le champ de l'Étape 0 si nécessaire
  const pseudoInput = document.getElementById('input-pseudo');
  if (pseudoInput && pseudoInput.value.trim() !== clean) {
    pseudoInput.value = clean;
  }

  updatePlayerBadge();
  updatePollsNavVisibility();
  if (state.currentTab === 'sondages') {
    renderCurrentPollDetail();
  }
}

function clearConnectedPlayer() {
  state.connectedPseudo = null;
  try {
    localStorage.removeItem('fas_connected_pseudo');
  } catch (e) {}
  updatePlayerBadge();
  updatePollsNavVisibility();
  if (state.currentTab === 'sondages') {
    switchTab('resultat');
  }
}

function updatePlayerBadge() {
  const badgeText = document.getElementById('header-player-pseudo');
  const voterDisplay = document.getElementById('voter-connected-pseudo');
  const voterHint = document.getElementById('voter-identity-hint');
  const voterAvatar = document.getElementById('voter-avatar-icon');

  if (state.connectedPseudo) {
    if (badgeText) badgeText.textContent = state.connectedPseudo;
    if (voterDisplay) {
      voterDisplay.textContent = state.connectedPseudo;
      voterDisplay.className = 'font-black text-emerald-400 text-sm';
    }
    if (voterHint) voterHint.textContent = "Identité définie sur la première page (Étape 0 : Identité du Joueur). Vos votes sont comptabilisés sous ce pseudo.";
    if (voterAvatar) {
      voterAvatar.className = 'w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0';
    }
  } else {
    if (badgeText) badgeText.textContent = "Non identifié";
    if (voterDisplay) {
      voterDisplay.textContent = "Non identifié";
      voterDisplay.className = 'font-bold text-slate-400 text-sm';
    }
    if (voterHint) voterHint.textContent = "Renseignez votre nom sur la première page pour pouvoir voter.";
    if (voterAvatar) {
      voterAvatar.className = 'w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 shrink-0';
    }
  }
}

function openPlayerModal() {
  switchTab('inscription');
  goToStep(0);
  document.getElementById('input-pseudo')?.focus();
}

/**
 * Initialisation des écouteurs globaux pour les sondages et votes
 */
function initPollsEvents() {
  // Toggle administrateur pour activer/désactiver le module
  const togglePolls = document.getElementById('admin-polls-enable-toggle');
  togglePolls?.addEventListener('change', async (e) => {
    await toggleGlobalVotes(e.target.checked);
  });

  // Bouton rapide dans la notice admin si désactivé
  document.getElementById('btn-quick-toggle-polls-active')?.addEventListener('click', async () => {
    await toggleGlobalVotes(true);
  });

  // Bouton retour aux résultats depuis la notice publique
  document.getElementById('btn-back-to-rankings-from-polls')?.addEventListener('click', () => {
    switchTab('resultat');
  });

  // Boutons d'ouverture de la modale de création de sondage
  const openCreatePollModal = () => {
    const modal = document.getElementById('poll-create-modal');
    const titleInput = document.getElementById('poll-form-title');
    const descInput = document.getElementById('poll-form-desc');
    const catInput = document.getElementById('poll-form-cat');
    const activeInput = document.getElementById('poll-form-active');
    const selfInput = document.getElementById('poll-form-allow-self');

    if (titleInput) titleInput.value = '';
    if (descInput) descInput.value = '';
    if (catInput) catInput.value = 'chef';
    if (activeInput) activeInput.value = 'true';
    if (selfInput) selfInput.checked = false;

    modal?.classList.remove('hidden');
    initLucide();
  };

  document.getElementById('btn-admin-create-poll-open')?.addEventListener('click', openCreatePollModal);
  document.getElementById('btn-admin-modal-new-poll')?.addEventListener('click', () => {
    document.getElementById('admin-modal')?.classList.add('hidden');
    openCreatePollModal();
  });

  document.getElementById('btn-admin-modal-goto-polls')?.addEventListener('click', () => {
    document.getElementById('admin-modal')?.classList.add('hidden');
    if (!state.polls || state.polls.length === 0) {
      showToast("Aucun sondage créé pour le moment. Créez-en un !", "info");
      openCreatePollModal();
    } else if (!state.connectedPseudo) {
      showToast("Veuillez d'abord renseigner votre pseudo sur la première page (Étape 0)", "warning");
      switchTab('inscription');
      goToStep(0);
      document.getElementById('input-pseudo')?.focus();
    } else {
      switchTab('sondages');
    }
  });

  // Modèles rapides dans la modale de création
  document.querySelectorAll('.poll-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const titleInput = document.getElementById('poll-form-title');
      const descInput = document.getElementById('poll-form-desc');
      const catInput = document.getElementById('poll-form-cat');
      if (titleInput && btn.dataset.title) titleInput.value = btn.dataset.title;
      if (descInput && btn.dataset.desc) descInput.value = btn.dataset.desc;
      if (catInput && btn.dataset.cat) catInput.value = btn.dataset.cat;
    });
  });

  // Fermeture modale création sondage
  document.getElementById('btn-close-poll-create-modal')?.addEventListener('click', () => {
    document.getElementById('poll-create-modal')?.classList.add('hidden');
  });
  document.getElementById('btn-cancel-poll-create')?.addEventListener('click', () => {
    document.getElementById('poll-create-modal')?.classList.add('hidden');
  });
  document.getElementById('btn-submit-poll-create')?.addEventListener('click', handleCreatePollSubmit);

  // Modale détail des votants
  document.getElementById('btn-close-poll-voters-modal')?.addEventListener('click', closePollVotersModal);
  document.getElementById('btn-close-poll-voters-bottom')?.addEventListener('click', closePollVotersModal);
}

/**
 * Charge la configuration générale des votes
 */
async function loadVotesConfig() {
  try {
    const settings = await fetchVotesSettings();
    state.votesEnabled = Boolean(settings.enabled);
    updatePollsNavVisibility();
  } catch (err) {
    console.warn("Erreur chargement config votes:", err);
  }
}

/**
 * Met à jour la visibilité du module selon les droits admin et l'activation
 */
function updatePollsNavVisibility() {
  const tabBtn = document.getElementById('tab-btn-sondages');
  const navBar = document.getElementById('main-nav-bar');
  const adminNotice = document.getElementById('polls-disabled-admin-notice');
  const publicNotice = document.getElementById('polls-disabled-public-view');
  const pollsActiveContainer = document.getElementById('polls-active-container');
  const toggleInput = document.getElementById('admin-polls-enable-toggle');
  const adminToolbar = document.getElementById('admin-polls-toolbar');

  const pseudoInput = document.getElementById('input-pseudo');
  const inputVal = pseudoInput ? pseudoInput.value.trim() : '';
  const hasName = Boolean((state.connectedPseudo && state.connectedPseudo.trim().length > 0) || inputVal.length >= 2);

  const hasPolls = Array.isArray(state.polls) && state.polls.length > 0;
  // L'onglet ne doit être visible que si :
  // 1. Il y a des sondages
  // 2. Le module est actif (ou admin)
  // 3. La personne a renseigné son nom sur la 1ère page (Étape 0)
  const shouldShowTab = hasPolls && (state.votesEnabled || state.isAdmin) && hasName;

  if (tabBtn) {
    if (shouldShowTab) {
      tabBtn.classList.remove('hidden');
    } else {
      tabBtn.classList.add('hidden');
    }
  }

  if (navBar) {
    if (shouldShowTab) {
      navBar.className = 'grid grid-cols-3 p-1 bg-slate-900/90 rounded-2xl border border-slate-800 transition-all duration-200';
    } else {
      navBar.className = 'grid grid-cols-2 p-1 bg-slate-900/90 rounded-2xl border border-slate-800 transition-all duration-200';
    }
  }

  // Redirection automatique si l'onglet est masqué et que l'utilisateur est actuellement dessus
  if (!shouldShowTab && state.currentTab === 'sondages') {
    switchTab('resultat');
  }

  if (toggleInput) {
    toggleInput.checked = state.votesEnabled;
  }

  if (adminNotice) {
    if (state.isAdmin && !state.votesEnabled) {
      adminNotice.classList.remove('hidden');
    } else {
      adminNotice.classList.add('hidden');
    }
  }

  if (adminToolbar) {
    if (state.isAdmin) {
      adminToolbar.classList.remove('hidden');
    } else {
      adminToolbar.classList.add('hidden');
    }
  }

  if (publicNotice && pollsActiveContainer) {
    if (!state.votesEnabled && !state.isAdmin) {
      publicNotice.classList.remove('hidden');
      pollsActiveContainer.classList.add('hidden');
    } else {
      publicNotice.classList.add('hidden');
      pollsActiveContainer.classList.remove('hidden');
    }
  }
}

/**
 * Charge la liste des sondages
 */
async function loadPollsData() {
  try {
    const polls = await fetchPolls();
    state.polls = polls || [];

    const badge = document.getElementById('polls-total-badge');
    const headerCount = document.getElementById('header-polls-count');
    const activePollsCount = state.polls.filter(p => p.is_active).length;

    if (badge) badge.textContent = `${state.polls.length} sondage${state.polls.length > 1 ? 's' : ''}`;
    if (headerCount) {
      headerCount.textContent = activePollsCount;
      if (activePollsCount > 0) {
        headerCount.classList.remove('hidden');
      } else {
        headerCount.classList.add('hidden');
      }
    }

    if (!state.currentPollId || !state.polls.find(p => p.id === state.currentPollId)) {
      state.currentPollId = state.polls[0]?.id || null;
    }

    // Actualiser l'affichage de l'onglet Sondages dans la barre de navigation
    updatePollsNavVisibility();

    renderPollTabs();
    await loadVotesForCurrentPoll();
  } catch (err) {
    console.error("Erreur chargement sondages:", err);
  }
}

/**
 * Rendu des onglets horizontaux pour basculer entre les sondages
 */
function renderPollTabs() {
  const container = document.getElementById('polls-tabs-list');
  if (!container) return;

  if (state.polls.length === 0) {
    container.innerHTML = `
      <div class="p-3 text-xs text-slate-500">
        ${state.isAdmin ? 'Aucun sondage pour le moment. Cliquez sur "Nouveau Sondage" pour en créer un !' : 'Aucun sondage disponible pour le moment.'}
      </div>
    `;
    return;
  }

  let html = '';
  state.polls.forEach(poll => {
    const isActive = poll.id === state.currentPollId;
    const statusIcon = poll.is_active ? '🟢' : '🔴';
    const activeClass = isActive ? 'active' : 'bg-slate-800/90 text-slate-400 hover:text-white border-slate-700/80';
    html += `
      <button type="button" class="poll-tab-btn ${activeClass} px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-2 shrink-0" data-poll-id="${poll.id}">
        <span>${statusIcon}</span>
        <span class="truncate max-w-[180px]">${escapeHtml(poll.title)}</span>
      </button>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll('.poll-tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.currentPollId = btn.dataset.pollId;
      state.selectedCandidate = null;
      state.isChangingVote = false;
      renderPollTabs();
      await loadVotesForCurrentPoll();
    });
  });
}

/**
 * Charge les votes du sondage actif
 */
async function loadVotesForCurrentPoll() {
  const detailContainer = document.getElementById('poll-detail-container');
  if (!detailContainer) return;

  if (!state.currentPollId) {
    detailContainer.innerHTML = `
      <div class="glass-card rounded-3xl p-8 text-center text-slate-500 space-y-2">
        <i data-lucide="inbox" class="w-8 h-8 mx-auto text-slate-600"></i>
        <p class="text-sm font-semibold text-slate-400">Aucun sondage disponible.</p>
        ${state.isAdmin ? '<p class="text-xs">Utilisez le bouton ci-dessus pour créer le premier sondage.</p>' : ''}
      </div>
    `;
    initLucide();
    return;
  }

  const poll = state.polls.find(p => p.id === state.currentPollId);
  if (!poll) return;

  try {
    const votes = await fetchVotesForPoll(state.currentPollId);
    state.pollVotes = votes || [];
    renderCurrentPollDetail();
  } catch (err) {
    console.error("Erreur chargement votes:", err);
  }
}

/**
 * Rendu complet du sondage en cours (Zone de vote + Résultats en direct)
 */
function renderCurrentPollDetail() {
  const container = document.getElementById('poll-detail-container');
  if (!container || !state.currentPollId) return;

  const poll = state.polls.find(p => p.id === state.currentPollId);
  if (!poll) return;

  const maxVotes = Number(poll.max_votes) || 5;

  // Calcul du Classement Réel FAS pour tous les joueurs
  const realRankedPlayers = getGeneralRealRanking(state.players, 999);
  const realRankMap = new Map();
  realRankedPlayers.forEach(p => realRankMap.set(p.pseudo.toLowerCase(), p.rank));

  // Décompte des votes par candidat avec distinction des rôles (Dirigeant vs R5)
  const candidateStats = {};
  state.pollVotes.forEach(v => {
    const key = v.candidate_pseudo;
    if (!candidateStats[key]) {
      candidateStats[key] = {
        candidatePseudo: key,
        countTotal: 0,
        countDirigeant: 0,
        countR5: 0,
        realRank: realRankMap.get(key.toLowerCase()) || 999
      };
    }
    candidateStats[key].countTotal += 1;
    if (v.vote_role === 'Dirigeant') {
      candidateStats[key].countDirigeant += 1;
    } else {
      candidateStats[key].countR5 += 1;
    }
  });

  const totalVotes = state.pollVotes.length;
  const distinctVotersSet = new Set(state.pollVotes.map(v => v.voter_pseudo_normalized));
  const distinctVotersCount = distinctVotersSet.size;

  // Tri des candidats pour les résultats :
  // 1. Total des votes DESC
  // 2. Votes Dirigeant DESC
  // 3. Départage par le Classement Réel FAS ASC (le rang 1 bat le rang 2)
  // 4. Ordre alphabétique
  const sortedCandidates = Object.values(candidateStats).map(c => {
    c.percentage = totalVotes > 0 ? Math.round((c.countTotal / totalVotes) * 100) : 0;
    return c;
  }).sort((a, b) => {
    if (b.countTotal !== a.countTotal) return b.countTotal - a.countTotal;
    if (b.countDirigeant !== a.countDirigeant) return b.countDirigeant - a.countDirigeant;
    if (a.realRank !== b.realRank) return a.realRank - b.realRank;
    return a.candidatePseudo.localeCompare(b.candidatePseudo);
  });

  // Votes du joueur connecté dans ce sondage
  const userVotes = state.connectedPseudo
    ? state.pollVotes.filter(v => v.voter_pseudo_normalized === state.connectedPseudo.toLowerCase())
    : [];
  const userVotesCount = userVotes.length;
  const maxVotesReached = userVotesCount >= maxVotes;
  const votesRemaining = Math.max(0, maxVotes - userVotesCount);
  const userVotedCandidatesMap = new Map();
  userVotes.forEach(v => userVotedCandidatesMap.set(v.candidate_pseudo.toLowerCase(), v));

  // Badges de catégorie
  const catBadges = {
    chef: '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1">👑 Chef de Clan</span>',
    rangs: '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 inline-flex items-center gap-1">⚔️ Rangs & Officiers</span>',
    popularite: '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 inline-flex items-center gap-1">🌟 Popularité</span>',
    autre: '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700 inline-flex items-center gap-1">📌 Sondage</span>'
  };

  const statusBadge = poll.is_active
    ? `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Ouvert (${maxVotes} votes max/joueur)</span>`
    : '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30 inline-flex items-center gap-1.5">🔴 Clôturé (Résultats Définitifs)</span>';

  // Barre d'administration pour ce sondage spécifique
  const adminPollToolbar = state.isAdmin ? `
    <div class="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <button type="button" class="btn-toggle-poll-active px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${poll.is_active ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30'}" data-poll-id="${poll.id}">
          <i data-lucide="${poll.is_active ? 'lock' : 'unlock'}" class="w-3.5 h-3.5"></i>
          <span>${poll.is_active ? 'Clôturer ce sondage' : 'Rouvrir ce sondage'}</span>
        </button>
        <button type="button" class="btn-view-poll-voters px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/30 transition flex items-center gap-1.5" data-poll-id="${poll.id}">
          <i data-lucide="eye" class="w-3.5 h-3.5"></i>
          <span>Détail des votes (${totalVotes})</span>
        </button>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" class="btn-reset-poll-votes px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-red-950/40 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/40 transition flex items-center gap-1.5" data-poll-id="${poll.id}">
          <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
          <span>Remettre à 0</span>
        </button>
        <button type="button" class="btn-delete-poll px-3 py-1.5 rounded-xl text-xs font-bold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition flex items-center gap-1.5" data-poll-id="${poll.id}">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          <span>Supprimer</span>
        </button>
      </div>
    </div>
  ` : '';

  // Espace de vote (gauche)
  let voteAreaHtml = '';

  if (!poll.is_active) {
    // Sondage CLÔTURÉ : Les votes sont verrouillés mais les résultats restent visibles
    voteAreaHtml = `
      <div class="glass-card rounded-2xl p-6 text-center space-y-4 border border-red-500/30 bg-gradient-to-br from-red-950/20 to-slate-900/90">
        <div class="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/40 text-red-400 mx-auto flex items-center justify-center shadow-lg shadow-red-500/10">
          <i data-lucide="lock" class="w-6 h-6"></i>
        </div>
        <div>
          <h4 class="font-bold text-white text-base">Ce sondage est clôturé</h4>
          <p class="text-xs text-slate-400 max-w-xs mx-auto mt-1">
            Les votes sont terminés pour cette élection. Les résultats finaux et podiums sont consultables ci-contre.
          </p>
        </div>
        ${userVotesCount > 0 ? `
          <div class="pt-3 border-t border-slate-800 text-left space-y-2">
            <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400 block text-center">Vos votes enregistrés (${userVotesCount}) :</span>
            <div class="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
              ${userVotes.map(v => `
                <div class="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="text-sm">${v.vote_role === 'Dirigeant' ? '👑' : '🛡️'}</span>
                    <span class="font-bold text-xs text-white">${escapeHtml(v.candidate_pseudo)}</span>
                  </div>
                  <span class="px-2.5 py-0.5 rounded-lg text-[10px] font-black ${v.vote_role === 'Dirigeant' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'}">
                    ${v.vote_role === 'Dirigeant' ? '👑 Dirigeant' : '🛡️ R5'}
                  </span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : `
          <p class="text-[11px] text-slate-500 italic pt-1">Vous n'avez pas pris part à ce vote avant sa clôture.</p>
        `}
      </div>
    `;
  } else if (!state.connectedPseudo) {
    // Non connecté (redirection vers page 1)
    voteAreaHtml = `
      <div class="glass-card rounded-2xl p-6 text-center space-y-4 border border-indigo-500/30 bg-gradient-to-br from-indigo-950/20 to-slate-900/90">
        <div class="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 mx-auto flex items-center justify-center shadow-lg shadow-indigo-500/10">
          <i data-lucide="user-x" class="w-6 h-6"></i>
        </div>
        <div class="space-y-1">
          <h4 class="font-bold text-white text-base">Identité non renseignée</h4>
          <p class="text-xs text-slate-400 max-w-xs mx-auto">
            Veuillez renseigner votre pseudo sur la première page (Étape 0 : Identité du Joueur) pour pouvoir participer au vote.
          </p>
        </div>
        <button type="button" id="btn-goto-step0-from-polls" class="px-6 py-2.5 rounded-xl font-bold bg-brand-600 hover:bg-brand-500 text-white shadow-md shadow-brand-600/30 text-xs transition active:scale-95 flex items-center justify-center gap-2 mx-auto">
          <i data-lucide="arrow-left" class="w-4 h-4"></i>
          <span>Renseigner mon nom (page 1)</span>
        </button>
      </div>
    `;
  } else {
    // Votant connecté et sondage ouvert
    // Liste des candidats ordonnée par Classement Réel FAS
    let candidatesList = [...realRankedPlayers];
    if (state.candidateSearchQuery) {
      candidatesList = candidatesList.filter(p => p.pseudo.toLowerCase().includes(state.candidateSearchQuery));
    }

    const candidateCardsHtml = candidatesList.map(c => {
      const isSelf = Boolean(state.connectedPseudo && state.connectedPseudo.toLowerCase() === c.pseudo.toLowerCase());
      const isSelfForbidden = isSelf && !poll.allow_self_vote;
      const userVoteForC = userVotedCandidatesMap.get(c.pseudo.toLowerCase());
      const isVoted = Boolean(userVoteForC);
      const isVotedDirigeant = userVoteForC && userVoteForC.vote_role === 'Dirigeant';
      const isVotedR5 = userVoteForC && userVoteForC.vote_role === 'R5';

      let cardClasses = 'candidate-card';
      if (isSelfForbidden) cardClasses += ' candidate-disabled';
      if (isVoted) cardClasses += isVotedDirigeant ? ' voted voted-dirigeant' : ' voted voted-r5';

      return `
        <div class="${cardClasses}" data-candidate-id="${c.id}" data-candidate-pseudo="${escapeHtml(c.pseudo)}" data-candidate-rank="${c.rank}">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-8 h-8 rounded-xl ${isVoted ? 'bg-emerald-500/25 border border-emerald-500/50 text-emerald-300' : 'bg-slate-800 border border-slate-700 text-slate-200'} font-black flex items-center justify-center text-xs shrink-0">
                ${isVoted ? '<i data-lucide="check" class="w-4 h-4 text-emerald-400"></i>' : c.pseudo.charAt(0).toUpperCase()}
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-bold text-sm text-white truncate">${escapeHtml(c.pseudo)}</span>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">#${c.rank} Réel</span>
                  ${isSelf ? '<span class="text-[10px] text-amber-400 font-semibold">(Vous)</span>' : ''}
                </div>
                ${isVoted ? `
                  <div class="text-[11px] font-black mt-0.5 flex items-center gap-1.5 text-emerald-300">
                    <span class="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>✓ Voté (${isVotedDirigeant ? '👑 Dirigeant' : '🛡️ R5'})</span>
                  </div>
                ` : ''}
              </div>
            </div>

            <!-- Actions de vote -->
            <div class="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
              ${isSelfForbidden ? `
                <span class="text-[10px] text-slate-500 italic">Vote pour soi interdit</span>
              ` : isVoted ? `
                <!-- Bouton pour basculer de rôle en 1 clic direct -->
                <button type="button" class="btn-switch-candidate-role px-2.5 py-1 rounded-lg text-[11px] font-black transition flex items-center gap-1 ${isVotedDirigeant ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40' : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'}"
                  data-candidate-id="${c.id}" data-candidate-pseudo="${escapeHtml(c.pseudo)}" data-new-role="${isVotedDirigeant ? 'R5' : 'Dirigeant'}" title="Basculer vers ${isVotedDirigeant ? 'R5' : 'Dirigeant'}">
                  <span>${isVotedDirigeant ? '🛡️ Passer en R5' : '👑 Passer en Dirigeant'}</span>
                </button>
                <!-- Bouton pour retirer ce vote en 1 clic direct -->
                <button type="button" class="btn-remove-single-vote p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition"
                  data-candidate-pseudo="${escapeHtml(c.pseudo)}" title="Retirer ce vote">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              ` : maxVotesReached ? `
                <span class="text-[10px] text-slate-500 font-medium italic">Quota atteint (${maxVotes}/${maxVotes})</span>
              ` : `
                <!-- Boutons pour voter avec rôle en 1 SEUL CLIC DIRECT (sans modale de confirmation) -->
                <button type="button" class="btn-vote-candidate-role px-2.5 py-1.5 rounded-xl text-xs font-black bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition active:scale-95 flex items-center gap-1 shadow-sm"
                  data-candidate-id="${c.id}" data-candidate-pseudo="${escapeHtml(c.pseudo)}" data-role="Dirigeant" title="Voter pour ${escapeHtml(c.pseudo)} en tant que Dirigeant">
                  <span>👑 Dirigeant</span>
                </button>
                <button type="button" class="btn-vote-candidate-role px-2.5 py-1.5 rounded-xl text-xs font-black bg-purple-500/15 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 transition active:scale-95 flex items-center gap-1 shadow-sm"
                  data-candidate-id="${c.id}" data-candidate-pseudo="${escapeHtml(c.pseudo)}" data-role="R5" title="Voter pour ${escapeHtml(c.pseudo)} en tant que R5">
                  <span>🛡️ R5</span>
                </button>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');

    voteAreaHtml = `
      <div class="glass-card rounded-2xl p-4 md:p-5 space-y-4 border border-slate-800">
        <!-- Bandeau récapitulatif des votes du joueur -->
        <div class="p-3.5 rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-slate-900 to-slate-900 space-y-2.5">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-black text-xs flex items-center justify-center">
                ${userVotesCount}/${maxVotes}
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-bold text-xs text-white">Vos votes enregistrés</span>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-black ${maxVotesReached ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}">
                    ${maxVotesReached ? `Complet (${maxVotes}/${maxVotes})` : `${votesRemaining} voix restante${votesRemaining > 1 ? 's' : ''}`}
                  </span>
                </div>
                <p class="text-[11px] text-slate-400">Jusqu'à ${maxVotes} personnes distinctes (R5 ou Dirigeant)</p>
              </div>
            </div>
            ${userVotesCount > 0 ? `
              <button type="button" id="btn-cancel-my-all-votes" class="text-[11px] text-slate-400 hover:text-red-400 transition underline">
                Tout annuler
              </button>
            ` : ''}
          </div>

          <!-- Puces des personnes déjà votées -->
          ${userVotesCount > 0 ? `
            <div class="flex flex-wrap gap-1.5 pt-1 border-t border-slate-800/80">
              ${userVotes.map(v => `
                <div class="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-xl text-xs font-bold border ${v.vote_role === 'Dirigeant' ? 'bg-amber-950/40 text-amber-200 border-amber-500/40' : 'bg-purple-950/40 text-purple-200 border-purple-500/40'}">
                  <span>${v.vote_role === 'Dirigeant' ? '👑' : '🛡️'}</span>
                  <span>${escapeHtml(v.candidate_pseudo)}</span>
                  <span class="text-[10px] opacity-75 font-normal">(${v.vote_role})</span>
                  <button type="button" class="btn-remove-single-vote w-4 h-4 rounded-full hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition ml-0.5" data-candidate-pseudo="${escapeHtml(v.candidate_pseudo)}" title="Retirer ce vote">
                    <i data-lucide="x" class="w-3 h-3"></i>
                  </button>
                </div>
              `).join('')}
            </div>
          ` : `
            <p class="text-[11px] text-slate-400 italic">
              Vous n'avez pas encore voté. Cliquez directement sur le rôle de votre choix ci-dessous !
            </p>
          `}
        </div>

        <!-- Recherche de candidat -->
        <div class="relative">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
            <i data-lucide="search" class="w-4 h-4"></i>
          </div>
          <input type="text" id="candidate-search-input" value="${escapeHtml(state.candidateSearchQuery || '')}" placeholder="Rechercher un membre par son pseudo..."
            class="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500">
        </div>

        <!-- Grille des candidats défilable pré-triée par Classement Réel -->
        <div class="space-y-2 max-h-[380px] overflow-y-auto pr-1">
          ${candidatesList.length === 0 ? `
            <div class="p-6 text-center text-slate-500 text-xs">
              Aucun joueur ne correspond à votre recherche.
            </div>
          ` : candidateCardsHtml}
        </div>
      </div>
    `;
  }

  // Zone des résultats (droite)
  let resultsAreaHtml = '';

  if (totalVotes === 0) {
    resultsAreaHtml = `
      <div class="glass-card rounded-2xl p-8 text-center space-y-3 border border-slate-800">
        <div class="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-400 mx-auto flex items-center justify-center">
          <i data-lucide="pie-chart" class="w-6 h-6"></i>
        </div>
        <h4 class="font-bold text-white text-base">Aucun vote enregistré</h4>
        <p class="text-xs text-slate-400 max-w-xs mx-auto">
          Soyez le premier à voter pour ce sondage et ouvrir le classement de popularité !
        </p>
      </div>
    `;
  } else {
    // 1. Détermination des 2 Dirigeants sélectionnés :
    // Tri : votes Dirigeant DESC, puis départage par Classement Réel FAS ASC
    const candidatesForDirigeant = Object.values(candidateStats)
      .filter(c => c.countDirigeant > 0)
      .sort((a, b) => {
        if (b.countDirigeant !== a.countDirigeant) return b.countDirigeant - a.countDirigeant;
        if (a.realRank !== b.realRank) return a.realRank - b.realRank;
        return a.candidatePseudo.localeCompare(b.candidatePseudo);
      });

    const electedCommandant = candidatesForDirigeant[0] || null; // 1er Dirigeant : Commandant
    const electedCapitaine = candidatesForDirigeant[1] || null;  // 2ème Dirigeant : Capitaine

    const electedDirigeantSet = new Set(
      [electedCommandant?.candidatePseudo.toLowerCase(), electedCapitaine?.candidatePseudo.toLowerCase()].filter(Boolean)
    );

    // 2. Détermination des 10 R5 sélectionnés :
    // Tri : votes R5 DESC (en excluant les 2 dirigeants déjà élus), puis départage par Classement Réel FAS ASC
    const candidatesForR5 = Object.values(candidateStats)
      .filter(c => c.countR5 > 0 && !electedDirigeantSet.has(c.candidatePseudo.toLowerCase()))
      .sort((a, b) => {
        if (b.countR5 !== a.countR5) return b.countR5 - a.countR5;
        if (a.realRank !== b.realRank) return a.realRank - b.realRank;
        return a.candidatePseudo.localeCompare(b.candidatePseudo);
      });

    const electedR5List = candidatesForR5.slice(0, 10);
    const r5Slots = Array.from({ length: 10 }, (_, i) => electedR5List[i] || null);

    const leadersHtml = `
      <!-- 1. LES 2 DIRIGEANTS SÉLECTIONNÉS -->
      <div class="space-y-2 mb-4">
        <div class="flex items-center justify-between">
          <h5 class="font-black text-xs uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <span>👑</span>
            <span>Les 2 Dirigeants Sélectionnés</span>
          </h5>
          <span class="text-[10px] font-bold text-slate-400">Commandement</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <!-- 1er Dirigeant : Commandant -->
          <div class="card-commandant rounded-2xl p-3.5 border flex flex-col justify-between">
            <div class="flex items-center justify-between gap-2">
              <span class="px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 shadow-sm">
                <span>🎖️</span>
                <span>1er : Commandant</span>
              </span>
              ${electedCommandant ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">#${electedCommandant.realRank} Réel</span>` : ''}
            </div>

            <div class="py-2.5">
              ${electedCommandant ? `
                <p class="text-base font-black text-white truncate">${escapeHtml(electedCommandant.candidatePseudo)}</p>
                <div class="flex items-center gap-2 mt-0.5">
                  <span class="font-black text-xs text-amber-300">${electedCommandant.countDirigeant} vote${electedCommandant.countDirigeant > 1 ? 's' : ''} 👑</span>
                  <span class="text-[10px] text-slate-400">(${electedCommandant.countTotal} total)</span>
                </div>
              ` : `
                <p class="text-xs text-slate-500 italic">En attente de votes Dirigeant...</p>
              `}
            </div>

            <div class="pt-1.5 border-t border-amber-500/20 flex items-center justify-between text-[10px] text-slate-400">
              <span>Rôle suprême</span>
              <span class="font-bold text-amber-400">Commandant en chef</span>
            </div>
          </div>

          <!-- 2ème Dirigeant : Capitaine -->
          <div class="card-capitaine rounded-2xl p-3.5 border flex flex-col justify-between">
            <div class="flex items-center justify-between gap-2">
              <span class="px-2 py-0.5 rounded-lg text-[10px] font-black bg-sky-500/20 text-sky-300 border border-sky-500/40 flex items-center gap-1 shadow-sm">
                <span>⚓</span>
                <span>2ème : Capitaine</span>
              </span>
              ${electedCapitaine ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-500/20 text-sky-300 border border-sky-500/30">#${electedCapitaine.realRank} Réel</span>` : ''}
            </div>

            <div class="py-2.5">
              ${electedCapitaine ? `
                <p class="text-base font-black text-white truncate">${escapeHtml(electedCapitaine.candidatePseudo)}</p>
                <div class="flex items-center gap-2 mt-0.5">
                  <span class="font-black text-xs text-sky-300">${electedCapitaine.countDirigeant} vote${electedCapitaine.countDirigeant > 1 ? 's' : ''} 👑</span>
                  <span class="text-[10px] text-slate-400">(${electedCapitaine.countTotal} total)</span>
                </div>
              ` : `
                <p class="text-xs text-slate-500 italic">En attente de votes Dirigeant...</p>
              `}
            </div>

            <div class="pt-1.5 border-t border-sky-500/20 flex items-center justify-between text-[10px] text-slate-400">
              <span>Second de clan</span>
              <span class="font-bold text-sky-400">Capitaine en second</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. LES 10 R5 SÉLECTIONNÉS -->
      <div class="space-y-2 mb-4">
        <div class="flex items-center justify-between">
          <h5 class="font-black text-xs uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
            <span>🛡️</span>
            <span>Les 10 R5 Sélectionnés</span>
          </h5>
          <span class="text-[10px] font-bold text-purple-300">${electedR5List.length} / 10 élu${electedR5List.length > 1 ? 's' : ''}</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[260px] overflow-y-auto pr-1">
          ${r5Slots.map((r5, i) => {
            if (r5) {
              return `
                <div class="p-2 rounded-xl bg-slate-900/90 border border-purple-500/30 flex items-center justify-between gap-2 hover:border-purple-500/60 transition shadow-sm">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="w-5 h-5 rounded-lg bg-purple-500/20 text-purple-300 font-black text-[10px] flex items-center justify-center border border-purple-500/40 shrink-0">
                      ${i + 1}
                    </span>
                    <div class="min-w-0">
                      <span class="font-bold text-xs text-white truncate block">${escapeHtml(r5.candidatePseudo)}</span>
                      <span class="px-1 py-0.2 rounded text-[8px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">#${r5.realRank} Réel</span>
                    </div>
                  </div>
                  <span class="px-2 py-0.5 rounded-md text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
                    ${r5.countR5} vote${r5.countR5 > 1 ? 's' : ''} 🛡️
                  </span>
                </div>
              `;
            } else {
              return `
                <div class="p-2 rounded-xl bg-slate-950/40 border border-dashed border-slate-800 flex items-center gap-2 opacity-40">
                  <span class="w-5 h-5 rounded-lg bg-slate-800 text-slate-500 font-bold text-[10px] flex items-center justify-center shrink-0">
                    ${i + 1}
                  </span>
                  <span class="text-[11px] text-slate-500 italic">Place vacante...</span>
                </div>
              `;
            }
          }).join('')}
        </div>
      </div>
    `;

    // Liste des barres de progression empilées (Dirigeant en or / R5 en violet)
    const progressBarsHtml = sortedCandidates.map((c, index) => {
      const isLeader = index === 0;
      const dirigeantPct = totalVotes > 0 ? (c.countDirigeant / totalVotes) * 100 : 0;
      const r5Pct = totalVotes > 0 ? (c.countR5 / totalVotes) * 100 : 0;

      return `
        <div class="space-y-1.5 p-2 rounded-xl hover:bg-slate-800/40 transition">
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center gap-2">
              <span class="w-5 h-5 rounded-full ${isLeader ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-black' : 'bg-slate-800 text-slate-400 font-bold'} text-[10px] flex items-center justify-center shrink-0">
                ${index + 1}
              </span>
              <span class="font-bold ${isLeader ? 'text-amber-200' : 'text-white'}">${escapeHtml(c.candidatePseudo)}</span>
              <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">#${c.realRank} Réel</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="flex items-center gap-1.5 text-[11px]">
                ${c.countDirigeant > 0 ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">👑 ${c.countDirigeant}</span>` : ''}
                ${c.countR5 > 0 ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">🛡️ ${c.countR5}</span>` : ''}
              </div>
              <span class="font-black ${isLeader ? 'text-amber-400' : 'text-indigo-300'}">${c.countTotal} vote${c.countTotal > 1 ? 's' : ''}</span>
              <span class="text-slate-500 font-semibold">(${c.percentage}%)</span>
            </div>
          </div>
          <!-- Barre empilée Dirigeant + R5 -->
          <div class="vote-progress-stacked" title="${c.countDirigeant} vote(s) Dirigeant, ${c.countR5} vote(s) R5">
            <div class="vote-progress-fill-dirigeant" style="width: ${dirigeantPct}%"></div>
            <div class="vote-progress-fill-r5" style="width: ${r5Pct}%"></div>
          </div>
        </div>
      `;
    }).join('');

    resultsAreaHtml = `
      <div class="glass-card rounded-2xl p-4 md:p-5 space-y-4 border border-slate-800">
        <div class="flex items-center justify-between pb-2 border-b border-slate-800">
          <h4 class="font-black text-white text-base flex items-center gap-2">
            <i data-lucide="bar-chart-3" class="w-4 h-4 text-amber-400"></i>
            <span>${poll.is_active ? 'Sélection & Résultats' : 'Sélection Définitive'}</span>
          </h4>
          <span class="text-xs font-bold text-slate-400">${totalVotes} vote${totalVotes > 1 ? 's' : ''} (${distinctVotersCount} votant${distinctVotersCount > 1 ? 's' : ''})</span>
        </div>

        ${leadersHtml}

        <!-- Détail de tous les votes exprimés -->
        <div class="space-y-2 pt-2 border-t border-slate-800">
          <div class="flex items-center justify-between text-xs text-slate-400 font-bold">
            <span>Tous les votes exprimés</span>
            <span>${sortedCandidates.length} membre${sortedCandidates.length > 1 ? 's' : ''}</span>
          </div>
          <div class="space-y-1 divide-y divide-slate-800/60 max-h-[220px] overflow-y-auto pr-1">
            ${progressBarsHtml}
          </div>
        </div>
      </div>
    `;
  }

  // Assemblage complet
  container.innerHTML = `
    <!-- En-tête du sondage -->
    <div class="glass-card rounded-2xl p-5 space-y-3 border border-slate-800">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
        <div class="flex flex-wrap items-center gap-2">
          ${catBadges[poll.category] || catBadges.autre}
          ${statusBadge}
          <span class="text-xs text-slate-400 font-semibold flex items-center gap-1">
            <i data-lucide="users" class="w-3.5 h-3.5 text-slate-500"></i>
            <span>${totalVotes} vote${totalVotes > 1 ? 's' : ''} (${distinctVotersCount} votant${distinctVotersCount > 1 ? 's' : ''})</span>
          </span>
        </div>
        <div class="text-[11px] text-slate-500 font-medium">
          Créé le ${new Date(poll.created_at).toLocaleDateString('fr-FR')}
        </div>
      </div>

      <div>
        <h3 class="text-xl md:text-2xl font-black font-heading text-white">${escapeHtml(poll.title)}</h3>
        ${poll.description ? `<p class="text-xs md:text-sm text-slate-300 mt-1">${escapeHtml(poll.description)}</p>` : ''}
      </div>

      ${adminPollToolbar}
    </div>

    <!-- Double colonne : Espace de Vote + Résultats -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div>${voteAreaHtml}</div>
      <div>${resultsAreaHtml}</div>
    </div>
  `;

  initLucide();
  attachPollEventListeners(poll);
}

/**
 * Attache les écouteurs sur le sondage affiché
 */
function attachPollEventListeners(poll) {
  // Clic sur redirection vers la page 1 si pseudo non renseigné
  document.getElementById('btn-goto-step0-from-polls')?.addEventListener('click', () => {
    switchTab('inscription');
    goToStep(0);
    document.getElementById('input-pseudo')?.focus();
  });

  // Clic sur "Tout annuler" mes votes
  document.getElementById('btn-cancel-my-all-votes')?.addEventListener('click', async () => {
    if (confirm("Confirmez-vous l'annulation de TOUS vos votes pour ce sondage ?")) {
      await executeCancelAllVotes();
    }
  });

  // Clic sur suppression d'un vote candidat individuel (1 clic direct)
  document.querySelectorAll('.btn-remove-single-vote').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const candidatePseudo = btn.dataset.candidatePseudo;
      if (candidatePseudo) {
        await executeDeleteCandidateVote(candidatePseudo);
      }
    });
  });

  // Clic sur bouton pour changer le rôle d'un candidat déjà voté (Passer en R5 / Passer en Dirigeant en 1 clic)
  document.querySelectorAll('.btn-switch-candidate-role').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const candidateId = btn.dataset.candidateId;
      const candidatePseudo = btn.dataset.candidatePseudo;
      const newRole = btn.dataset.newRole;
      await executeQuickRoleSwitch(candidateId, candidatePseudo, newRole);
    });
  });

  // Recherche de candidat
  const searchInput = document.getElementById('candidate-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.candidateSearchQuery = e.target.value.trim().toLowerCase();
      renderCurrentPollDetail();
      const updatedInput = document.getElementById('candidate-search-input');
      if (updatedInput) {
        updatedInput.focus();
        updatedInput.setSelectionRange(updatedInput.value.length, updatedInput.value.length);
      }
    });
  }

  // Clic sur un bouton de vote de rôle direct (👑 Dirigeant ou 🛡️ R5) : 1 SEUL CLIC SANS CONFIRMATION
  document.querySelectorAll('.btn-vote-candidate-role').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const candidateId = btn.dataset.candidateId;
      const candidatePseudo = btn.dataset.candidatePseudo;
      const role = btn.dataset.role || 'Dirigeant';
      await executeDirectVote(candidateId, candidatePseudo, role);
    });
  });

  // Actions Admin pour ce sondage
  if (state.isAdmin) {
    document.querySelector('.btn-toggle-poll-active')?.addEventListener('click', () => {
      handleTogglePollActive(poll.id);
    });

    document.querySelectorAll('.btn-view-poll-voters').forEach(btn => {
      btn.addEventListener('click', () => {
        openPollVotersModal(btn.dataset.pollId || poll.id);
      });
    });

    document.querySelector('.btn-reset-poll-votes')?.addEventListener('click', () => {
      handleResetPollVotes(poll.id);
    });

    document.querySelector('.btn-delete-poll')?.addEventListener('click', () => {
      handleDeletePoll(poll.id);
    });
  }
}

/**
 * Enregistrement instantané du vote en 1 clic (sans aucune modale de confirmation)
 * La carte s'affiche immédiatement en vert
 */
async function executeDirectVote(candidateId, candidatePseudo, role) {
  if (!state.connectedPseudo) {
    showToast("Veuillez d'abord renseigner votre pseudo sur la première page", "warning");
    switchTab('inscription');
    goToStep(0);
    document.getElementById('input-pseudo')?.focus();
    return;
  }

  const poll = state.polls.find(p => p.id === state.currentPollId);
  if (!poll || !poll.is_active) {
    showToast("Ce sondage est actuellement clôturé", "warning");
    return;
  }

  if (!poll.allow_self_vote && candidatePseudo.trim().toLowerCase() === state.connectedPseudo.trim().toLowerCase()) {
    showToast("Le vote pour soi-même n'est pas autorisé dans ce sondage", "warning");
    return;
  }

  const maxVotes = Number(poll.max_votes) || 5;
  const userVotes = state.pollVotes.filter(v => v.voter_pseudo_normalized === state.connectedPseudo.toLowerCase());
  const isUpdatingExisting = userVotes.some(v => v.candidate_pseudo.toLowerCase() === candidatePseudo.toLowerCase());

  if (!isUpdatingExisting && userVotes.length >= maxVotes) {
    showToast(`Vous avez déjà utilisé vos ${maxVotes} votes autorisés pour ce sondage`, "warning");
    return;
  }

  try {
    await castVote(
      state.currentPollId,
      state.connectedPseudo,
      candidateId,
      candidatePseudo,
      role
    );

    triggerConfetti();
    showToast(`✓ Vote enregistré : ${candidatePseudo} (${role})`, "success");

    // Rechargement immédiat : la carte passe instantanément en vert !
    await loadVotesForCurrentPoll();
  } catch (err) {
    console.error("Erreur vote direct:", err);
    showToast(`Erreur lors du vote : ${err.message || 'Problème de connexion'}`, "error");
  }
}

/**
 * Bascule instantanément le rôle d'un candidat déjà voté
 */
async function executeQuickRoleSwitch(candidateId, candidatePseudo, newRole) {
  if (!state.currentPollId || !state.connectedPseudo) return;

  try {
    await castVote(
      state.currentPollId,
      state.connectedPseudo,
      candidateId,
      candidatePseudo,
      newRole
    );
    showToast(`Rôle de ${candidatePseudo} modifié en ${newRole} !`, "success");
    await loadVotesForCurrentPoll();
  } catch (err) {
    console.error("Erreur switch rôle:", err);
    showToast("Impossible de changer le rôle", "error");
  }
}

/**
 * Supprime le vote pour un candidat spécifique
 */
async function executeDeleteCandidateVote(candidatePseudo) {
  if (!state.currentPollId || !state.connectedPseudo) return;

  try {
    await deleteCandidateVote(state.currentPollId, state.connectedPseudo, candidatePseudo);
    showToast(`Votre vote pour ${candidatePseudo} a été retiré`, "info");
    await loadVotesForCurrentPoll();
  } catch (err) {
    console.error("Erreur suppression vote candidat:", err);
    showToast("Impossible de retirer ce vote", "error");
  }
}

/**
 * Annule tous les votes du joueur pour le sondage courant
 */
async function executeCancelAllVotes() {
  if (!state.currentPollId || !state.connectedPseudo) return;

  try {
    await cancelVote(state.currentPollId, state.connectedPseudo);
    showToast("Tous vos votes pour ce sondage ont été annulés", "info");
    await loadVotesForCurrentPoll();
  } catch (err) {
    console.error("Erreur annulation complète votes:", err);
    showToast("Impossible d'annuler vos votes", "error");
  }
}

/**
 * Active / Désactive globalement le module de sondages (Admin)
 */
async function toggleGlobalVotes(enabled) {
  if (!state.isAdmin) return;
  try {
    await updateVotesSettings({ enabled });
    state.votesEnabled = enabled;
    updatePollsNavVisibility();
    showToast(enabled ? "Module Sondages & Votes activé pour les membres !" : "Module Sondages & Votes désactivé", "success");
    await loadPollsData();
  } catch (err) {
    console.error("Erreur modification paramètres votes:", err);
    showToast(`Erreur : ${err.message || 'Impossible de mettre à jour'}`, "error");
  }
}

/**
 * Création d'un sondage par l'admin
 */
async function handleCreatePollSubmit() {
  if (!state.isAdmin) return;
  const title = document.getElementById('poll-form-title')?.value.trim();
  const desc = document.getElementById('poll-form-desc')?.value.trim();
  const cat = document.getElementById('poll-form-cat')?.value || 'chef';
  const isActive = document.getElementById('poll-form-active')?.value === 'true';
  const allowSelf = document.getElementById('poll-form-allow-self')?.checked || false;
  const maxVotes = parseInt(document.getElementById('poll-form-max-votes')?.value, 10) || 5;

  if (!title) {
    showToast("Le titre du sondage est requis", "warning");
    return;
  }

  const submitBtn = document.getElementById('btn-submit-poll-create');
  const originalHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Création...`;
  initLucide();

  try {
    const newPoll = await createPoll({
      title,
      description: desc,
      category: cat,
      is_active: isActive,
      allow_self_vote: allowSelf,
      max_votes: maxVotes,
      role_options: ['Dirigeant', 'R5']
    });

    showToast(`Sondage "${title}" créé avec succès !`, "success");
    document.getElementById('poll-create-modal')?.classList.add('hidden');
    state.currentPollId = newPoll.id;
    await loadPollsData();
    switchTab('sondages');
  } catch (err) {
    console.error("Erreur création sondage:", err);
    showToast(`Erreur création sondage : ${err.message || 'Problème réseau'}`, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHtml;
    initLucide();
  }
}

/**
 * Clôturer ou rouvrir un sondage (Admin)
 */
async function handleTogglePollActive(pollId) {
  if (!state.isAdmin) return;
  const poll = state.polls.find(p => p.id === pollId);
  if (!poll) return;

  try {
    const updated = await updatePoll(pollId, { is_active: !poll.is_active });
    showToast(updated.is_active ? "Sondage rouvert aux votes !" : "Sondage clôturé (résultats consultables) !", "info");
    await loadPollsData();
  } catch (err) {
    console.error("Erreur changement statut sondage:", err);
    showToast("Impossible de modifier le statut", "error");
  }
}

/**
 * Supprimer un sondage (Admin)
 */
async function handleDeletePoll(pollId) {
  if (!state.isAdmin) return;
  const poll = state.polls.find(p => p.id === pollId);
  if (!poll) return;

  if (!confirm(`Supprimer définitivement le sondage "${poll.title}" et tous ses votes associés ?`)) {
    return;
  }

  try {
    await deletePoll(pollId);
    showToast(`Sondage "${poll.title}" supprimé`, "success");
    state.currentPollId = null;
    await loadPollsData();
  } catch (err) {
    console.error("Erreur suppression sondage:", err);
    showToast("Impossible de supprimer le sondage", "error");
  }
}

/**
 * Réinitialiser les votes d'un sondage à 0 (Admin)
 */
async function handleResetPollVotes(pollId) {
  if (!state.isAdmin) return;
  const poll = state.polls.find(p => p.id === pollId);
  if (!poll) return;

  if (!confirm(`Réinitialiser tous les votes du sondage "${poll.title}" à 0 ?`)) {
    return;
  }

  try {
    await resetPollVotes(pollId);
    showToast("Tous les votes de ce sondage ont été réinitialisés à 0", "success");
    await loadVotesForCurrentPoll();
  } catch (err) {
    console.error("Erreur réinitialisation votes:", err);
    showToast("Impossible de réinitialiser les votes", "error");
  }
}

/**
 * État et gestion du panneau d'audit des votes
 */
const votersModalState = {
  pollId: null,
  searchQuery: '',
  activeFilter: 'all', // 'all' | 'suspect' | 'dirigeant' | 'r5'
  viewMode: 'list',    // 'list' | 'grouped'
  listenersAttached: false
};

/**
 * Initialise les écouteurs d'événements du panneau d'audit des votants
 */
function initPollVotersModalEvents() {
  if (votersModalState.listenersAttached) return;
  votersModalState.listenersAttached = true;

  const modal = document.getElementById('poll-voters-modal');
  const searchInput = document.getElementById('poll-voters-search-input');
  const clearBtn = document.getElementById('btn-clear-poll-voters-search');
  const btnCloseTop = document.getElementById('btn-close-poll-voters-modal');
  const btnCloseBottom = document.getElementById('btn-close-poll-voters-bottom');
  const btnExport = document.getElementById('btn-export-poll-voters');
  const btnViewList = document.getElementById('btn-voters-view-list');
  const btnViewGrouped = document.getElementById('btn-voters-view-grouped');

  // Recherche textuelle
  searchInput?.addEventListener('input', (e) => {
    votersModalState.searchQuery = e.target.value.trim().toLowerCase();
    if (clearBtn) {
      clearBtn.classList.toggle('hidden', !votersModalState.searchQuery);
    }
    renderPollVotersModalContent();
  });

  clearBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    votersModalState.searchQuery = '';
    clearBtn.classList.add('hidden');
    renderPollVotersModalContent();
    searchInput?.focus();
  });

  // Filtres rapides
  document.querySelectorAll('.btn-filter-voters').forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter || 'all';
      votersModalState.activeFilter = filter;

      // Mise à jour visuelle des boutons de filtre
      document.querySelectorAll('.btn-filter-voters').forEach(b => {
        const isActive = (b.dataset.filter || 'all') === filter;
        if (isActive) {
          b.className = 'btn-filter-voters px-2.5 py-1 rounded-lg font-bold text-xs transition bg-purple-500/30 text-purple-200 border border-purple-500/60 shadow-sm';
        } else {
          b.className = 'btn-filter-voters px-2.5 py-1 rounded-lg font-semibold text-xs transition bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/60';
        }
      });

      renderPollVotersModalContent();
    });
  });

  // Bascule du mode d'affichage
  btnViewList?.addEventListener('click', () => {
    votersModalState.viewMode = 'list';
    btnViewList.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 bg-purple-600 text-white shadow-sm';
    btnViewGrouped.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition flex items-center gap-1.5 bg-transparent';
    renderPollVotersModalContent();
  });

  btnViewGrouped?.addEventListener('click', () => {
    votersModalState.viewMode = 'grouped';
    btnViewGrouped.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 bg-purple-600 text-white shadow-sm';
    btnViewList.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition flex items-center gap-1.5 bg-transparent';
    renderPollVotersModalContent();
  });

  // Bouton d'export / copie
  btnExport?.addEventListener('click', exportPollVotesAudit);

  // Fermeture modale
  btnCloseTop?.addEventListener('click', closePollVotersModal);
  btnCloseBottom?.addEventListener('click', closePollVotersModal);

  // Fermeture au clic sur le fond sombre
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closePollVotersModal();
  });

  // Fermeture touche Echap
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
      closePollVotersModal();
    }
  });
}

/**
 * Ferme la modale d'audit des votes et débloque le défilement de l'écran principal
 */
function closePollVotersModal() {
  const modal = document.getElementById('poll-voters-modal');
  modal?.classList.add('hidden');
  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';
}

/**
 * Modale de contrôle administratif des votants (Audit de régularité)
 */
async function openPollVotersModal(pollId) {
  if (!state.isAdmin) return;
  const poll = state.polls.find(p => p.id === pollId);
  if (!poll) return;

  votersModalState.pollId = pollId;
  initPollVotersModalEvents();

  const modal = document.getElementById('poll-voters-modal');
  const subtitle = document.getElementById('poll-voters-modal-subtitle');
  if (subtitle) {
    subtitle.textContent = `Sondage : "${poll.title}" (${poll.is_active ? 'En cours' : 'Clôturé'})`;
  }

  // Chargement des données fraîches des votes
  try {
    const votes = await fetchVotesForPoll(pollId);
    state.pollVotes = votes || [];
  } catch (err) {
    console.warn("Erreur chargement frais des votes:", err);
  }

  renderPollVotersModalContent();
  modal?.classList.remove('hidden');

  // Bloque le défilement de l'écran derrière
  document.body.classList.add('modal-open');
  document.body.style.overflow = 'hidden';

  initLucide();
}

/**
 * Rendu du contenu dynamique de la modale de contrôle des votants
 */
function renderPollVotersModalContent() {
  const container = document.getElementById('poll-voters-list-container');
  if (!container || !votersModalState.pollId) return;

  const poll = state.polls.find(p => p.id === votersModalState.pollId);
  if (!poll) return;

  const maxVotes = Number(poll.max_votes) || 5;

  // Répertoire des joueurs officiellement inscrits dans la base de données
  const registeredPlayersMap = new Map();
  (state.players || []).forEach(p => {
    if (p && p.pseudo) {
      registeredPlayersMap.set(p.pseudo.trim().toLowerCase(), p);
    }
  });

  // Classement Réel FAS pour afficher le rang officiel
  const realRankedPlayers = getGeneralRealRanking(state.players || [], 999);
  const realRankMap = new Map();
  realRankedPlayers.forEach(p => {
    if (p && p.pseudo) {
      realRankMap.set(p.pseudo.trim().toLowerCase(), p.rank);
    }
  });

  // Analyse de chaque bulletin de vote et détection des anomalies
  const processedVotes = (state.pollVotes || []).map(v => {
    const voterNorm = (v.voter_pseudo_normalized || v.voter_pseudo || '').trim().toLowerCase();
    const candNorm = (v.candidate_pseudo || '').trim().toLowerCase();

    const isVoterRegistered = registeredPlayersMap.has(voterNorm);
    const voterRank = realRankMap.get(voterNorm);

    const isCandidateRegistered = registeredPlayersMap.has(candNorm);
    const candidateRank = realRankMap.get(candNorm);

    const isSelfVoteForbidden = !poll.allow_self_vote && voterNorm === candNorm;

    // Anomalie : votant non inscrit OU auto-vote interdit OU candidat non répertorié
    const isSuspect = !isVoterRegistered || !isCandidateRegistered || isSelfVoteForbidden;

    let suspectBadge = '';
    if (!isVoterRegistered) {
      suspectBadge = '⚠️ Nom inconnu / Non inscrit';
    } else if (isSelfVoteForbidden) {
      suspectBadge = '⚠️ Auto-vote non autorisé';
    } else if (!isCandidateRegistered) {
      suspectBadge = '⚠️ Candidat non inscrit';
    }

    return {
      ...v,
      voterNorm,
      candNorm,
      isVoterRegistered,
      voterRank,
      isCandidateRegistered,
      candidateRank,
      isSelfVoteForbidden,
      isSuspect,
      suspectBadge
    };
  });

  // Regroupement par votant unique
  const distinctVotersMap = new Map();
  processedVotes.forEach(v => {
    if (!distinctVotersMap.has(v.voterNorm)) {
      distinctVotersMap.set(v.voterNorm, {
        pseudo: v.voter_pseudo,
        voterNorm: v.voterNorm,
        isRegistered: v.isVoterRegistered,
        voterRank: v.voterRank,
        votes: []
      });
    }
    distinctVotersMap.get(v.voterNorm).votes.push(v);
  });

  const totalVotesCount = processedVotes.length;
  const distinctVotersCount = distinctVotersMap.size;
  const suspectVotesCount = processedVotes.filter(v => v.isSuspect).length;
  const suspectVotersCount = Array.from(distinctVotersMap.values()).filter(v => !v.isRegistered).length;
  const dirigeantVotesCount = processedVotes.filter(v => v.vote_role === 'Dirigeant').length;
  const r5VotesCount = processedVotes.filter(v => v.vote_role === 'R5').length;

  // Mise à jour des compteurs sur les boutons de filtre
  const elCountAll = document.getElementById('filter-count-all');
  const elCountSuspect = document.getElementById('filter-count-suspect');
  const elCountDirigeant = document.getElementById('filter-count-dirigeant');
  const elCountR5 = document.getElementById('filter-count-r5');
  if (elCountAll) elCountAll.textContent = totalVotesCount;
  if (elCountSuspect) elCountSuspect.textContent = suspectVotesCount;
  if (elCountDirigeant) elCountDirigeant.textContent = dirigeantVotesCount;
  if (elCountR5) elCountR5.textContent = r5VotesCount;

  // Mise à jour du résumé statistique rapide (Cartes en haut)
  const statsBar = document.getElementById('poll-voters-stats-bar');
  if (statsBar) {
    statsBar.innerHTML = `
      <div class="p-2.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
          <i data-lucide="inbox" class="w-4 h-4"></i>
        </div>
        <div class="min-w-0">
          <span class="text-[10px] text-slate-400 block font-semibold uppercase tracking-wider">Bulletins</span>
          <span class="text-sm font-black text-white">${totalVotesCount} vote${totalVotesCount > 1 ? 's' : ''}</span>
        </div>
      </div>

      <div class="p-2.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
          <i data-lucide="users" class="w-4 h-4"></i>
        </div>
        <div class="min-w-0">
          <span class="text-[10px] text-slate-400 block font-semibold uppercase tracking-wider">Votants</span>
          <span class="text-sm font-black text-white">${distinctVotersCount} joueur${distinctVotersCount > 1 ? 's' : ''}</span>
        </div>
      </div>

      <div class="p-2.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
          <i data-lucide="check-circle" class="w-4 h-4"></i>
        </div>
        <div class="min-w-0">
          <span class="text-[10px] text-slate-400 block font-semibold uppercase tracking-wider">Inscrits FAS</span>
          <span class="text-sm font-black text-emerald-300">${distinctVotersCount - suspectVotersCount} vérifié${(distinctVotersCount - suspectVotersCount) > 1 ? 's' : ''}</span>
        </div>
      </div>

      <div class="p-2.5 rounded-2xl ${suspectVotesCount > 0 ? 'bg-rose-950/40 border-rose-500/50' : 'bg-slate-950/70 border-slate-800'} border flex items-center gap-2.5 transition">
        <div class="w-8 h-8 rounded-xl ${suspectVotesCount > 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-400'} flex items-center justify-center shrink-0">
          <i data-lucide="${suspectVotesCount > 0 ? 'alert-triangle' : 'shield'}" class="w-4 h-4"></i>
        </div>
        <div class="min-w-0">
          <span class="text-[10px] text-slate-400 block font-semibold uppercase tracking-wider">Anomalies</span>
          <span class="text-sm font-black ${suspectVotesCount > 0 ? 'text-rose-400 font-black animate-pulse' : 'text-slate-400'}">${suspectVotesCount} suspect${suspectVotesCount > 1 ? 's' : ''}</span>
        </div>
      </div>
    `;
  }

  // Filtrage des bulletins selon le filtre actif
  let filteredVotes = processedVotes;
  if (votersModalState.activeFilter === 'suspect') {
    filteredVotes = filteredVotes.filter(v => v.isSuspect);
  } else if (votersModalState.activeFilter === 'dirigeant') {
    filteredVotes = filteredVotes.filter(v => v.vote_role === 'Dirigeant');
  } else if (votersModalState.activeFilter === 'r5') {
    filteredVotes = filteredVotes.filter(v => v.vote_role === 'R5');
  }

  // Filtrage par texte de recherche
  if (votersModalState.searchQuery) {
    const q = votersModalState.searchQuery;
    filteredVotes = filteredVotes.filter(v =>
      v.voter_pseudo.toLowerCase().includes(q) ||
      v.candidate_pseudo.toLowerCase().includes(q)
    );
  }

  // Badge du bas
  const countBadge = document.getElementById('poll-voters-count-badge');
  if (countBadge) {
    countBadge.textContent = `Affichage de ${filteredVotes.length} sur ${totalVotesCount} vote${totalVotesCount > 1 ? 's' : ''} (${distinctVotersCount} votants)`;
  }

  // Aucun résultat
  if (totalVotesCount === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-slate-500 space-y-2">
        <i data-lucide="inbox" class="w-8 h-8 mx-auto text-slate-600"></i>
        <p class="text-xs">Aucun vote n'a encore été enregistré pour ce sondage.</p>
      </div>
    `;
    initLucide();
    return;
  }

  if (filteredVotes.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-slate-400 space-y-2 bg-slate-950/40 rounded-2xl border border-slate-800 my-2">
        <i data-lucide="search-x" class="w-8 h-8 mx-auto text-slate-500"></i>
        <p class="text-xs font-semibold">Aucun vote ne correspond à vos critères de recherche ou de filtre.</p>
        <button type="button" id="btn-reset-voters-filters" class="text-xs text-purple-400 hover:text-purple-300 font-bold underline mt-1">
          Réinitialiser la recherche et afficher tous les votes
        </button>
      </div>
    `;
    document.getElementById('btn-reset-voters-filters')?.addEventListener('click', () => {
      votersModalState.searchQuery = '';
      votersModalState.activeFilter = 'all';
      const searchInput = document.getElementById('poll-voters-search-input');
      if (searchInput) searchInput.value = '';
      document.getElementById('btn-clear-poll-voters-search')?.classList.add('hidden');
      document.querySelectorAll('.btn-filter-voters').forEach(b => {
        const isActive = (b.dataset.filter || 'all') === 'all';
        b.className = isActive
          ? 'btn-filter-voters px-2.5 py-1 rounded-lg font-bold text-xs transition bg-purple-500/30 text-purple-200 border border-purple-500/60 shadow-sm'
          : 'btn-filter-voters px-2.5 py-1 rounded-lg font-semibold text-xs transition bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/60';
      });
      renderPollVotersModalContent();
    });
    initLucide();
    return;
  }

  // =========================================================================
  // RENDU MODE 1 : VUE DÉTAILLÉE PAR VOTE (BULLETIN PAR BULLETIN)
  // =========================================================================
  if (votersModalState.viewMode === 'list') {
    container.innerHTML = filteredVotes.map((v, i) => {
      const dateStr = v.created_at ? new Date(v.created_at).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : '-';
      const isDirigeant = v.vote_role === 'Dirigeant';

      // Badge conformité votant
      let voterBadgeHtml = '';
      if (v.isVoterRegistered) {
        voterBadgeHtml = `
          <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1">
            <i data-lucide="check" class="w-3 h-3 text-emerald-400"></i>
            <span>Inscrit ${v.voterRank ? `(#${v.voterRank})` : ''}</span>
          </span>
        `;
      } else {
        voterBadgeHtml = `
          <span class="px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 inline-flex items-center gap-1 animate-pulse" title="Ce pseudo ne figure pas parmi les membres inscrits du clan">
            <i data-lucide="alert-triangle" class="w-3 h-3 text-rose-400"></i>
            <span>Nom inconnu / Non inscrit</span>
          </span>
        `;
      }

      // Alerte auto-vote
      const selfVoteBadge = v.isSelfVoteForbidden
        ? `<span class="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 inline-flex items-center gap-1">⚠️ Auto-vote interdit</span>`
        : '';

      // Alerte candidat non inscrit
      const candBadge = !v.isCandidateRegistered
        ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">⚠️ Candidat non répertorié</span>`
        : '';

      const rowBorderClass = v.isSuspect
        ? 'border-rose-500/30 bg-rose-950/15 hover:bg-rose-950/25'
        : 'border-slate-800/80 hover:bg-slate-800/40';

      return `
        <div class="py-2.5 px-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border ${rowBorderClass} transition my-1">
          <!-- Côté Votant -->
          <div class="flex items-center gap-3 min-w-0">
            <span class="w-7 h-7 rounded-xl bg-slate-800/90 text-slate-400 font-bold flex items-center justify-center text-[10px] shrink-0 border border-slate-700/60">
              ${i + 1}
            </span>
            <div class="min-w-0 space-y-0.5">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-black text-xs text-white truncate">${escapeHtml(v.voter_pseudo)}</span>
                ${voterBadgeHtml}
                ${selfVoteBadge}
              </div>
              <div class="flex items-center gap-2 text-[10px] text-slate-500">
                <i data-lucide="clock" class="w-3 h-3"></i>
                <span>${dateStr}</span>
              </div>
            </div>
          </div>

          <!-- Côté Choix & Candidat -->
          <div class="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60">
            <div class="text-left sm:text-right">
              <div class="flex items-center gap-1.5 justify-start sm:justify-end">
                <span class="text-[10px] uppercase font-bold text-slate-400">Pour :</span>
                <span class="font-black text-xs text-white">${escapeHtml(v.candidate_pseudo)}</span>
                ${candBadge}
              </div>
            </div>

            <span class="px-2.5 py-1 rounded-xl text-[10px] font-black ${isDirigeant ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm shadow-amber-500/10' : 'bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-sm shadow-purple-500/10'} shrink-0">
              ${isDirigeant ? '👑 Dirigeant' : '🛡️ R5'}
            </span>

            <button type="button" class="btn-admin-delete-vote p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/15 border border-transparent hover:border-rose-500/30 transition shrink-0"
              data-voter="${escapeHtml(v.voter_pseudo)}" data-candidate="${escapeHtml(v.candidate_pseudo)}" title="Supprimer ce vote">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // =========================================================================
  // RENDU MODE 2 : VUE GROUPÉE PAR VOTANT
  // =========================================================================
  else if (votersModalState.viewMode === 'grouped') {
    // Regroupement à partir des bulletins filtrés
    const filteredVotersMap = new Map();
    filteredVotes.forEach(v => {
      if (!filteredVotersMap.has(v.voterNorm)) {
        filteredVotersMap.set(v.voterNorm, {
          pseudo: v.voter_pseudo,
          voterNorm: v.voterNorm,
          isRegistered: v.isVoterRegistered,
          voterRank: v.voterRank,
          votes: []
        });
      }
      filteredVotersMap.get(v.voterNorm).votes.push(v);
    });

    container.innerHTML = Array.from(filteredVotersMap.values()).map((voterGroup, i) => {
      const isSuspect = !voterGroup.isRegistered;
      const votesCount = voterGroup.votes.length;

      const cardBorder = isSuspect
        ? 'border-rose-500/40 bg-rose-950/20'
        : 'border-slate-800 bg-slate-950/50';

      const statusBadge = voterGroup.isRegistered
        ? `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1"><i data-lucide="check" class="w-3 h-3 text-emerald-400"></i> Membre Inscrit ${voterGroup.voterRank ? `(#${voterGroup.voterRank})` : ''}</span>`
        : `<span class="px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 inline-flex items-center gap-1 animate-pulse"><i data-lucide="alert-triangle" class="w-3 h-3 text-rose-400"></i> Non répertorié dans le clan</span>`;

      return `
        <div class="p-3.5 rounded-2xl border ${cardBorder} space-y-2.5 my-2 transition">
          <!-- En-tête de la fiche votant -->
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2.5">
              <span class="w-7 h-7 rounded-xl bg-slate-800 text-slate-300 font-bold flex items-center justify-center text-xs shrink-0 border border-slate-700/60">
                ${i + 1}
              </span>
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-black text-sm text-white">${escapeHtml(voterGroup.pseudo)}</span>
                  ${statusBadge}
                </div>
                <span class="text-[10px] text-slate-400">${votesCount} / ${maxVotes} votes exprimés</span>
              </div>
            </div>

            <!-- Bouton pour supprimer TOUS les votes de ce votant en un clic -->
            <button type="button" class="btn-admin-cancel-all-voter-votes px-2.5 py-1.5 rounded-xl text-xs font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 transition flex items-center gap-1.5 active:scale-95"
              data-voter="${escapeHtml(voterGroup.pseudo)}" title="Supprimer tous les votes de ce joueur">
              <i data-lucide="trash" class="w-3.5 h-3.5"></i>
              <span>Tout supprimer (${votesCount})</span>
            </button>
          </div>

          <!-- Liste des choix de ce votant -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 border-t border-slate-800/60">
            ${voterGroup.votes.map(v => {
              const isDirigeant = v.vote_role === 'Dirigeant';
              return `
                <div class="p-2 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="text-sm">${isDirigeant ? '👑' : '🛡️'}</span>
                    <span class="font-bold text-xs text-white truncate">${escapeHtml(v.candidate_pseudo)}</span>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0">
                    <span class="px-2 py-0.5 rounded-lg text-[9px] font-black ${isDirigeant ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'}">
                      ${isDirigeant ? 'Dirigeant' : 'R5'}
                    </span>
                    <button type="button" class="btn-admin-delete-vote p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/15 transition"
                      data-voter="${escapeHtml(v.voter_pseudo)}" data-candidate="${escapeHtml(v.candidate_pseudo)}" title="Supprimer ce vote">
                      <i data-lucide="x" class="w-3 h-3"></i>
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  // =========================================================================
  // ÉCOUTEURS D'ACTIONS DE SUPPRESSION (UNITAIRE & GROUPÉE)
  // =========================================================================
  // Suppression unitaire
  container.querySelectorAll('.btn-admin-delete-vote').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const voter = btn.dataset.voter;
      const candidate = btn.dataset.candidate;
      if (confirm(`Supprimer le vote de "${voter}" pour "${candidate}" ?`)) {
        try {
          await deleteCandidateVote(poll.id, voter, candidate);
          showToast(`Vote de "${voter}" pour "${candidate}" supprimé`, "info");
          await loadVotesForCurrentPoll();
          renderPollVotersModalContent();
        } catch (err) {
          console.error("Erreur suppression vote:", err);
          showToast("Erreur lors de la suppression", "error");
        }
      }
    });
  });

  // Suppression groupée de tous les votes d'un votant
  container.querySelectorAll('.btn-admin-cancel-all-voter-votes').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const voter = btn.dataset.voter;
      if (confirm(`Supprimer TOUS les votes émis par "${voter}" ? Cette action est irréversible.`)) {
        try {
          await cancelVote(poll.id, voter);
          showToast(`Tous les votes de "${voter}" ont été supprimés`, "info");
          await loadVotesForCurrentPoll();
          renderPollVotersModalContent();
        } catch (err) {
          console.error("Erreur suppression globale votes joueur:", err);
          showToast("Impossible d'annuler les votes de ce joueur", "error");
        }
      }
    });
  });

  initLucide();
}

/**
 * Exporte l'audit complet des votes au format texte / CSV dans le presse-papier
 */
function exportPollVotesAudit() {
  const poll = state.polls.find(p => p.id === votersModalState.pollId);
  if (!poll) return;

  const realRankedPlayers = getGeneralRealRanking(state.players || [], 999);
  const realRankMap = new Map();
  realRankedPlayers.forEach(p => {
    if (p && p.pseudo) {
      realRankMap.set(p.pseudo.trim().toLowerCase(), p.rank);
    }
  });

  const registeredSet = new Set((state.players || []).map(p => (p?.pseudo || '').trim().toLowerCase()));

  let text = `=== AUDIT DES VOTES - SONDAGE : ${poll.title} ===\n`;
  text += `Date de l'audit : ${new Date().toLocaleString('fr-FR')}\n`;
  text += `Statut du sondage : ${poll.is_active ? 'Ouvert' : 'Clôturé'}\n`;
  text += `Total de bulletins : ${state.pollVotes.length}\n`;
  text += `--------------------------------------------------------------------------------\n`;
  text += `N°\tVOTANT\tCONFORMITÉ\tRANG_RÉEL\tPOUR_CANDIDAT\TRÔLE\tDATE_VOTE\n`;

  state.pollVotes.forEach((v, idx) => {
    const voterNorm = (v.voter_pseudo_normalized || v.voter_pseudo || '').trim().toLowerCase();
    const isReg = registeredSet.has(voterNorm);
    const rank = realRankMap.get(voterNorm) || '-';
    const dateStr = v.created_at ? new Date(v.created_at).toLocaleString('fr-FR') : '-';
    text += `${idx + 1}\t${v.voter_pseudo}\t${isReg ? 'Inscrit' : 'NON_INSCRIT_SUSPECT'}\t${rank}\t${v.candidate_pseudo}\t${v.vote_role}\t${dateStr}\n`;
  });

  navigator.clipboard.writeText(text).then(() => {
    showToast("✓ Données d'audit copiées dans le presse-papier !", "success");
  }).catch(() => {
    showToast("Impossible de copier dans le presse-papier", "error");
  });
}


