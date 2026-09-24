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
  onAuthStateChange
} from './supabaseClient.js';

import {
  simulateRealProgression,
  calculateWarPoints,
  getAvancementRanking,
  getGeneralRealRanking,
  getGeneralRawRanking,
  getOrdreAscensionWithElus
} from './rankingEngine.js';

// =============================================================================
// ÉTAT DE L'APPLICATION
// =============================================================================
const state = {
  currentTab: 'inscription',  // 'inscription' | 'resultat'
  currentStep: 0,            // 0 à 4 (étapes formulaire) ou 5 (succès)
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
  deleteTarget: null
};

// =============================================================================
// INITIALISATION
// =============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initLucide();
  initTabNavigation();
  initFormControls();
  initAdminFeatures();
  initRankingViews();

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
  const viewInscription = document.getElementById('view-inscription');
  const viewResultat = document.getElementById('view-resultat');

  btnInscription.addEventListener('click', () => switchTab('inscription'));
  btnResultat.addEventListener('click', () => switchTab('resultat'));

  document.getElementById('btn-refresh-data').addEventListener('click', async () => {
    const icon = document.querySelector('.refresh-icon');
    if (icon) icon.classList.add('animate-spin');
    await loadData(true);
    setTimeout(() => {
      if (icon) icon.classList.remove('animate-spin');
    }, 600);
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
  const viewInscription = document.getElementById('view-inscription');
  const viewResultat = document.getElementById('view-resultat');

  if (tab === 'inscription') {
    btnInscription.classList.add('bg-brand-600', 'text-white', 'shadow-md', 'shadow-brand-600/30');
    btnInscription.classList.remove('text-slate-400');
    btnResultat.classList.remove('bg-brand-600', 'text-white', 'shadow-md', 'shadow-brand-600/30');
    btnResultat.classList.add('text-slate-400');

    viewInscription.classList.remove('hidden');
    viewResultat.classList.add('hidden');
  } else {
    btnResultat.classList.add('bg-brand-600', 'text-white', 'shadow-md', 'shadow-brand-600/30');
    btnResultat.classList.remove('text-slate-400');
    btnInscription.classList.remove('bg-brand-600', 'text-white', 'shadow-md', 'shadow-brand-600/30');
    btnInscription.classList.add('text-slate-400');

    viewResultat.classList.remove('hidden');
    viewInscription.classList.add('hidden');

    renderRankings();
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

  // Bouton "Suivant" Étape 0 (Pseudo)
  document.getElementById('btn-next-step-0').addEventListener('click', async () => {
    if (!validatePseudo(true)) return;
    await checkExistingPseudo();
    goToStep(1);
  });

  // Validation à la touche Entrée sur le pseudo
  document.getElementById('input-pseudo').addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!validatePseudo(true)) return;
      await checkExistingPseudo();
      goToStep(1);
    }
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

  // Cacher tous les panneaux d'étapes
  for (let i = 0; i <= 4; i++) {
    const panel = document.getElementById(`step-panel-${i}`);
    if (panel) panel.classList.add('hidden');
  }
  const successPanel = document.getElementById('step-panel-success');
  if (successPanel) successPanel.classList.add('hidden');

  // Afficher le panneau demandé
  if (stepIndex === 5) {
    if (successPanel) successPanel.classList.remove('hidden');
  } else {
    const targetPanel = document.getElementById(`step-panel-${stepIndex}`);
    if (targetPanel) {
      targetPanel.classList.remove('hidden');
      targetPanel.classList.add('step-container');
    }
  }

  // Mettre à jour l'indicateur de progression
  const stepTitles = [
    "Étape 1 sur 5 : Pseudo",
    "Étape 2 sur 5 : Compétences (Tickets)",
    "Étape 3 sur 5 : Œufs de Compagnon",
    "Étape 4 sur 5 : Clés de Monture",
    "Étape 5 sur 5 : Marteaux de Forge",
    "Inscription terminée !"
  ];

  const textEl = document.getElementById('step-indicator-text');
  const percentEl = document.getElementById('step-percentage');
  const fillEl = document.getElementById('progress-bar-fill');

  if (textEl) textEl.textContent = stepTitles[stepIndex] || "";
  
  const percentage = Math.min(100, Math.round(((stepIndex + 1) / 5) * 100));
  if (percentEl) percentEl.textContent = `${percentage}%`;
  if (fillEl) fillEl.style.width = `${percentage}%`;

  // Mettre à jour les puces d'étapes
  document.querySelectorAll('.step-dot').forEach((dot, idx) => {
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
  const pseudo = document.getElementById('input-pseudo').value.trim();
  const statusMsg = document.getElementById('pseudo-status-msg');
  const spinner = document.getElementById('pseudo-check-spinner');

  if (!pseudo) return;

  if (spinner) spinner.classList.remove('hidden');

  try {
    const existingPlayer = await getPlayerByPseudo(pseudo);
    if (existingPlayer) {
      state.editingPlayerId = existingPlayer.id;
      fillFormWithPlayerData(existingPlayer);

      if (statusMsg) {
        statusMsg.className = 'p-3 rounded-xl text-xs flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300';
        statusMsg.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4 shrink-0"></i> <span>Joueur <strong>${escapeHtml(existingPlayer.pseudo)}</strong> trouvé ! Vos données existantes ont été chargées pour mise à jour.</span>`;
        statusMsg.classList.remove('hidden');
        initLucide();
      }
      showToast(`Données de ${existingPlayer.pseudo} pré-chargées`, "info");
    } else {
      state.editingPlayerId = null;
      if (statusMsg) {
        statusMsg.className = 'p-3 rounded-xl text-xs flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300';
        statusMsg.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4 shrink-0"></i> <span>Nouveau joueur ! Vos données seront créées à la fin.</span>`;
        statusMsg.classList.remove('hidden');
        initLucide();
      }
    }
  } catch (err) {
    console.warn("Vérification pseudo:", err);
  } finally {
    if (spinner) spinner.classList.add('hidden');
  }
}

function fillFormWithPlayerData(player) {
  // Créneaux horaires
  const playerSlots = Array.isArray(player.available_slots) ? player.available_slots : [];
  document.querySelectorAll('input[name="slot-choice"]').forEach(cb => {
    cb.checked = playerSlots.includes(cb.value);
  });

  // Compétences
  setFieldValue('input-skills-tickets', 'range-skills-tickets', player.skills_tickets);
  setPillGroupValue('skills-ascension', 'input-skills-ascension', player.skills_ascension);
  setFieldValue('input-skills-ascension-level', 'range-skills-ascension-level', player.skills_ascension_level);
  setPillGroupValue('skills-tech', 'input-skills-tech-level', player.skills_tech_level);

  // Œufs
  setFieldValue('input-eggs-count', 'range-eggs-count', player.eggs_count);
  setPillGroupValue('eggs-ascension', 'input-eggs-ascension', player.eggs_ascension);
  setFieldValue('input-eggs-ascension-level', 'range-eggs-ascension-level', player.eggs_ascension_level);
  setPillGroupValue('eggs-tech', 'input-eggs-tech-level', player.eggs_tech_level);
  setFieldValue('input-eggs-fusions', 'range-eggs-fusions', player.eggs_fusions || 0);

  // Monture
  setFieldValue('input-mount-keys', 'range-mount-keys', player.mount_keys);
  setPillGroupValue('mount-ascension', 'input-mount-ascension', player.mount_ascension);
  setFieldValue('input-mount-ascension-level', 'range-mount-ascension-level', player.mount_ascension_level);
  setPillGroupValue('mount-tech', 'input-mount-tech-level', player.mount_tech_level);
  setFieldValue('input-mount-fusions', 'range-mount-fusions', player.mount_fusions || 0);

  // Forge
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

  const selectedSlots = [];
  document.querySelectorAll('input[name="slot-choice"]:checked').forEach(cb => {
    selectedSlots.push(cb.value);
  });

  const playerData = {
    available_slots: selectedSlots,
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
      successPseudoEl.innerHTML = `Les données du joueur <strong class="text-emerald-400">${escapeHtml(pseudo)}</strong> ont été enregistrées avec succès.`;
    }

    goToStep(5);
    showToast(`Scores enregistrés pour ${pseudo} !`, "success");

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
    criteriaText.innerHTML = `<strong>Ordre d'Ascension (Rush) :</strong> Sélection des <strong>4 Élus</strong> (1 par créneau horaire : Matin, Midi, Soir, Rush) avec simulation plafonnée à <strong>1 seule ascension max</strong>. Les joueurs ayant atteint le palier maximal (Asc. 3 Niv. 100) sont relégués en toute fin de liste. Points de Guerre calculés sur les niveaux franchis.`;
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

  // Cas spécifique de l'Ordre d'Ascension (Les 4 Élus du Rush + Suite)
  if (state.rankingView === 'ordre') {
    if (podiumContainer) podiumContainer.classList.add('hidden');
    if (elusRushContainer) elusRushContainer.classList.remove('hidden');

    const { elus, suite } = getOrdreAscensionWithElus(state.players, state.rankingCategory);

    // Rendu des 4 cartes d'Élus
    if (elusCardsGrid) {
      if (elus.length === 0) {
        elusCardsGrid.innerHTML = `
          <div class="col-span-full p-4 text-center text-slate-500 text-xs">
            Aucun joueur éligible pour les créneaux.
          </div>
        `;
      } else {
        elusCardsGrid.innerHTML = elus.map(elu => renderEluCard(elu, state.rankingCategory)).join('');
      }
    }

    // Filtrage de la suite par recherche de pseudo
    let displaySuite = suite;
    if (state.searchQuery) {
      displaySuite = suite.filter(p => p.pseudo.toLowerCase().includes(state.searchQuery));
    }

    if (listCountEl) {
      const totalCount = elus.length + displaySuite.length;
      listCountEl.textContent = `${totalCount} joueur${totalCount > 1 ? 's' : ''}`;
    }

    if (displaySuite.length === 0) {
      rowsContainer.innerHTML = `
        <div class="p-6 text-center text-slate-500 text-xs">
          ${suite.length === 0 ? 'Aucun autre joueur dans la suite du classement.' : `Aucun joueur ne correspond à la recherche "${escapeHtml(state.searchQuery)}" dans la suite.`}
        </div>
      `;
    } else {
      rowsContainer.innerHTML = displaySuite.map(player => renderPlayerRow(player)).join('');
    }

    initLucide();
    attachAdminDeleteListeners();
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
  attachAdminDeleteListeners();
}

/**
 * Attache les écouteurs de suppression admin
 */
function attachAdminDeleteListeners() {
  if (state.isAdmin) {
    document.querySelectorAll('.btn-admin-delete-row').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const playerId = btn.dataset.playerId;
        const playerPseudo = btn.dataset.playerPseudo;
        confirmDeletePlayer(playerId, playerPseudo);
      });
    });
  }
}

/**
 * Génère le HTML pour les badges de créneaux horaires
 */
function renderSlotBadgesHtml(slots) {
  if (!slots || !Array.isArray(slots) || slots.length === 0) return '';
  const badges = {
    matin: '<span class="slot-badge slot-badge-matin">🌅 Matin</span>',
    midi: '<span class="slot-badge slot-badge-midi">☀️ Midi</span>',
    soir: '<span class="slot-badge slot-badge-soir">🌙 Soir</span>',
    rush: '<span class="slot-badge slot-badge-rush">⚡ Rush</span>'
  };
  return slots.map(s => badges[s] || '').join(' ');
}

/**
 * Rendu d'une carte d'Élu du Rush (Top 4 par créneau)
 */
function renderEluCard(elu, category) {
  const slot = elu.eluSlot || { key: 'rush', label: 'Rush (01h00 - 02h00)' };
  let resCount = 0;
  let iconUrl = '';
  let ascLvl = 0;
  let ascStage = 0;
  let techLvl = 0;

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
  } else if (category === 'mount') {
    resCount = elu.mount_keys;
    iconUrl = './Monture FM.png';
    ascLvl = elu.mount_ascension;
    ascStage = elu.mount_ascension_level;
    techLvl = elu.mount_tech_level;
  }

  const sim = elu.sim || {};
  const warPoints = elu.warPoints || 0;

  const slotIcons = {
    matin: '🌅',
    midi: '☀️',
    soir: '🌙',
    rush: '⚡'
  };

  const adminDeleteBtn = state.isAdmin ? `
    <button type="button" class="btn-admin-delete-row p-1 text-slate-500 hover:text-red-400 transition"
      data-player-id="${elu.id}" data-player-pseudo="${escapeHtml(elu.pseudo)}" title="Supprimer ce joueur (Admin)">
      <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
    </button>
  ` : '';

  return `
    <div class="elu-card flex flex-col justify-between space-y-3">
      <div>
        <div class="flex items-center justify-between gap-1 pb-2 border-b border-amber-500/20">
          <div class="flex items-center gap-1.5 font-bold text-xs text-amber-300">
            <span>${slotIcons[slot.key] || '⭐'}</span>
            <span class="uppercase tracking-wider">${slot.label}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
              ÉLU
            </span>
            ${adminDeleteBtn}
          </div>
        </div>

        <div class="pt-2">
          <h4 class="font-black text-base text-white truncate">${escapeHtml(elu.pseudo)}</h4>
          ${!elu.assignedBySlot ? `
            <span class="text-[10px] text-amber-400/80 italic block">Attribué par ressources (créneau libre)</span>
          ` : ''}
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
        </div>
      </div>

      <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between">
        <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Points Guerre :</span>
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
    // Si le joueur est maxé (Ascension 3, Niveau 100), affichage spécifique
    if (player.isMaxed) {
      statusBadgeHtml = `
        <span class="px-2 py-0.5 rounded-full text-[10px] md:text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700 inline-flex items-center gap-1 shadow-sm">
          <i data-lucide="lock" class="w-3 h-3 text-slate-400"></i>
          Ascension Max
        </span>
      `;
      rowHighlightClass = 'opacity-70 hover:bg-slate-800/40';
    } else {
      statusBadgeHtml = `
        <span class="px-2 py-0.5 rounded-full text-[10px] md:text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 inline-flex items-center gap-1 shadow-sm">
          <i data-lucide="arrow-up-circle" class="w-3 h-3 text-indigo-400"></i>
          Priorité ${player.priorityNumber}
        </span>
      `;
      rowHighlightClass = 'hover:bg-slate-800/40';
    }
  } else if (isPodium) {
    rowHighlightClass = 'bg-slate-900/40 hover:bg-slate-800/40';
  }

  // Badges de créneaux
  const slotBadgesHtml = renderSlotBadgesHtml(player.available_slots);

  // Contenu spécifique selon le type de classement
  let detailsHtml = '';

  if (state.rankingView === 'general-real') {
    const simSkills = player.simSkills || {};
    const simEggs = player.simEggs || {};
    const simMount = player.simMount || {};

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
    } else if (state.rankingCategory === 'mount') {
      resCount = player.mount_keys;
      iconUrl = './Monture FM.png';
      ascLvl = player.mount_ascension;
      ascStage = player.mount_ascension_level;
      techLvl = player.mount_tech_level;
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

  // Bouton de suppression admin si session active
  const adminDeleteBtn = state.isAdmin ? `
    <button type="button" class="btn-admin-delete-row p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
      data-player-id="${player.id}" data-player-pseudo="${escapeHtml(player.pseudo)}" title="Supprimer ce joueur (Admin)">
      <i data-lucide="trash-2" class="w-4 h-4"></i>
    </button>
  ` : '';

  return `
    <div class="p-3 md:p-4 transition flex items-center justify-between gap-3 ${rowHighlightClass}">
      <div class="flex items-center gap-3 min-w-0">
        <div class="rank-badge ${rankClass} shrink-0 text-xs font-black">
          ${rankIcon ? rankIcon : '#' + player.rank}
        </div>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-black text-sm md:text-base text-white truncate">${escapeHtml(player.pseudo)}</span>
            ${statusBadgeHtml}
            ${slotBadgesHtml}
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
        ${adminDeleteBtn}
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
  const nameEl = document.getElementById(`podium-name-${rank}`);
  const scoreEl = document.getElementById(`podium-score-${rank}`);
  if (!nameEl || !scoreEl) return;

  if (!player) {
    nameEl.textContent = "-";
    scoreEl.textContent = "-";
    return;
  }

  nameEl.textContent = player.pseudo;

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

  // Modale de confirmation de suppression
  const deleteModal = document.getElementById('delete-confirm-modal');
  document.getElementById('btn-cancel-delete').addEventListener('click', () => {
    deleteModal.classList.add('hidden');
    state.deleteTarget = null;
  });
  document.getElementById('btn-confirm-delete').addEventListener('click', executeDeletePlayer);
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
  renderRankings();
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
