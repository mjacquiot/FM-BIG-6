# FAS - Suivi d'Avancement & Simulation Réelle de Guilde

Application web mobile-first responsive conçue pour le suivi d'avancement, la simulation de dépense réelle des ressources et les classements de guilde (**Compétences**, **Œufs**, **Montures**, **Forge**). Directement hébergeable sur **GitHub Pages** avec une base de données temps réel **Supabase**.

---

## 🚀 1. Mise à jour ou Installation Supabase

Votre base de données Supabase existante est prête. Aucune table ni donnée existante n'est écrasée ou supprimée.

### Option A : Si vous avez déjà la table `fm_big6_players` (Mise à jour rapide)
1. Allez sur votre console Supabase : [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Cliquez sur **SQL Editor** dans le menu de gauche.
3. Collez et exécutez la commande suivante :

```sql
-- Ajout des créneaux horaires souhaités (matin, midi, soir, rush)
ALTER TABLE public.fm_big6_players 
ADD COLUMN IF NOT EXISTS available_slots TEXT[] DEFAULT '{}';

-- Ajout des fusions disponibles tout de suite pour les Œufs (0 à 10 000)
ALTER TABLE public.fm_big6_players 
ADD COLUMN IF NOT EXISTS eggs_fusions INTEGER NOT NULL DEFAULT 0 
CHECK (eggs_fusions >= 0 AND eggs_fusions <= 10000);

-- Ajout des fusions disponibles tout de suite pour les Montures (0 à 2 000)
ALTER TABLE public.fm_big6_players 
ADD COLUMN IF NOT EXISTS mount_fusions INTEGER NOT NULL DEFAULT 0 
CHECK (mount_fusions >= 0 AND mount_fusions <= 2000);
```

### Option B : Si vous partez de zéro (Nouvelle base)
Exécutez le script complet disponible dans [`sql/create_tables.sql`](./sql/create_tables.sql).

### Compte Administrateur (`admin@admin.fr`)
1. Dans le menu de gauche Supabase, cliquez sur **Authentication** > **Users** > **Add user** > **Create user**.
2. Renseignez `admin@admin.fr`, votre mot de passe, et cochez **Auto Confirm User?**.

---

## 🧮 2. Moteur de Simulation Réelle & Barème

Pour simuler le franchissement des niveaux d'ascension (100 niveaux par palier d'ascension), le jeu applique une réduction du coût selon le niveau de technologie débloqué (Tech 0 à 5) :

| Tech | Monture (clés pour 100 niv.) | Compétence (tickets pour 100 niv.) | Œufs (œufs pour 100 niv.) |
| :---: | :---: | :---: | :---: |
| **0** | 99 000 | 379 800 | 191 400 |
| **1** | 86 400 | 360 810 | 174 000 |
| **2** | 74 250 | 341 820 | 159 500 |
| **3** | 65 532 | 322 830 | 147 300 |
| **4** | 56 600 | 303 840 | 136 800 |
| **5** | 50 160 | 284 850 | 127 600 |

*Remarque pour la Forge :* L'avancement (0 à 35 par palier) ne fait pas l'objet d'un barème de dépense par tech et reste calculé directement sur les valeurs saisies.

---

## ⚔️ 3. Formules des Points de Guerre (War Points)

Dans la vue **Ordre d'Ascension**, les points de guerre sont calculés en direct pour chaque joueur sur les **niveaux gagnés/franchis grâce aux ressources dépensées pendant le rush** :

1. **Compétence :**
   $$\text{Points} = \text{niveaux\_gagnés} \times 110 \times 175$$
2. **Œufs :**
   $$\text{Points} = (\text{fusions\_œufs} \times 2250) + (\text{niveaux\_gagnés} \times 23 \times 2250)$$
3. **Monture :**
   $$\text{Points} = (\text{fusions\_monture} \times 1080) + (\text{niveaux\_gagnés} \times 20 \times 1080 \times 2)$$

---

## 🏆 4. Les 4 Vues de Classements

L'onglet **Résultats** propose 4 vues dynamiques :

1. **🏆 Classement Réel (Vue par défaut)** :
   - Combine les classements simulés des 4 catégories (Compétence simulée, Œufs simulés, Monture simulée, Forge).
   - Somme des rangs réels : le joueur avec le score le plus faible est classé 1er.
2. **📊 Classement Hors Ressources** :
   - Ancien classement général basé uniquement sur les valeurs actuelles brutes saisies (sans simulation de dépense).
3. **⚡ Classement d'Avancement Réel** :
   - Disponible pour les 4 catégories (Compétences, Œufs, Montures, Forge).
   - Affiche l'Ascension Finale simulée, le niveau atteint, les niveaux franchis et les ressources résiduelles.
4. **🚀 Ordre d'Ascension (Rush)** :
   - Disponible pour **Compétences**, **Œufs** et **Montures**.
   - **Simulation limitée à 1 seule ascension** : Contrairement au classement réel où plusieurs ascensions peuvent s'enchaîner, la simulation du rush s'arrête à 1 seul passage d'ascension maximum (`initialAscension + 1, Niv. 100`).
   - **Plafond maximal du jeu** : L'Ascension 4 n'existe pas ; le palier maximal est fixé à **Ascension 3, Niveau 100**.
   - **Relégation des joueurs maxés** : Tout joueur ayant atteint l'Ascension 3 Niveau 100 est relégué en toute fin de liste (avec badge `🔒 Ascension Max`), car il ne peut plus réaliser d'ascension pour ce rush.
   - **Les 4 Élus du Rush** : Sélectionne 1 Élu pour chaque créneau horaire (**Matin 2h-9h**, **Midi 9h-15h**, **Soir 15h-01h**, **Rush 01h-02h**) parmi les joueurs non-maxés ayant le plus de ressources.
   - **Suite du classement (5ème au 50ème)** : Joueurs restants classés par ressources décroissantes avec macarons de passage (**Priorité 1**, **Priorité 2**, etc.).
   - Affichage en direct des **Points de Guerre** calculés sur les niveaux franchis.

---

## 📱 5. Formulaire d'Inscription (Wizard Mobile)

- **Étape 0 (Identité & Disponibilités)** :
  - Saisie du pseudo (détection et pré-remplissage automatique des données existantes).
  - Choix multiple des créneaux de connexion habituelles et souhaitées :
    - 🌅 **Matin** (2h - 9h)
    - ☀️ **Midi** (9h - 15h00)
    - 🌙 **Soir** (15h00 - 01h00)
    - ⚡ **Rush** (01h00 - 02h00)
- **Étape 1 (Compétences)** : Tickets (0 à 500k), Ascension (0 à 3), Niveau (0 à 100), Tech (0 à 5).
- **Étape 2 (Œufs)** : Œufs (0 à 200k), Ascension (0 à 3), Niveau (0 à 100), Tech (0 à 5) + **Fusions disponibles tout de suite** (0 à 10k).
- **Étape 3 (Montures)** : Clés (0 à 200k), Ascension (0 à 3), Niveau (0 à 100), Tech (0 à 5) + **Fusions disponibles tout de suite** (0 à 2k).
- **Étape 4 (Forge)** : Marteaux (0 à 500k), Ascension (0 à 3), Niveau (0 à 35).

---

## 🔒 6. Portail Administrateur Sécurisé

- Bouton secret en forme de cadenas tout en bas à droite de l'écran.
- Connexion via Supabase Auth (`admin@admin.fr`).
- Permet la suppression définitive de joueurs (démission, fausse manipulation) avec confirmation.
- La session est isolée en `sessionStorage` pour qu'aucun utilisateur lambda ne soit connecté en administrateur par défaut.

---

## 🌐 7. Déploiement sur GitHub Pages

1. Créez un dépôt GitHub et poussez tous les fichiers à la racine.
2. Allez dans **Settings** > **Pages** de votre dépôt.
3. Dans **Build and deployment**, sélectionnez **Deploy from a branch**, branche `main`, dossier `/(root)`.
4. Cliquez sur **Save**. L'application est en ligne !

---

## 📂 8. Arborescence du Projet

```
FAS/
├── index.html                 # Application SPA complète responsive
├── style.css                  # Thème dark gaming, cartes des 4 Élus, badges
├── app.js                     # Logique applicative, formulaires et affichage
├── supabaseClient.js          # Client Supabase v2 (Auth, CRUD, RLS)
├── rankingEngine.js           # Moteur de simulation réelle, points de guerre et 4 élus
├── sql/
│   └── create_tables.sql      # Script SQL complet et non destructif pour Supabase
├── README.md                  # Documentation complète
├── Forge FM.png               # Icône Marteaux de forge
├── Monture FM.png             # Icône Clés de monture
├── Tickets FM.png             # Icône Tickets de compétences
└── oeufs FM.png               # Icône Œufs de compagnon
```
