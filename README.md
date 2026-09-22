# FM BIG 6 - Suivi d'Avancement & Classements de Guilde

Application web mobile-first responsive conçue pour le suivi d'avancement et les classements de guilde (Compétences, Œufs, Montures, Forge). Directement prête à être hébergée sur **GitHub Pages** avec une base de données temps réel **Supabase**.

---

## 🚀 1. Configuration Supabase (Indispensable)

Votre base de données Supabase existante est prête à accueillir la table sans aucun impact sur vos autres tables. Suivez ces 2 étapes simples :

### Étape 1 : Exécuter le script SQL dans Supabase
1. Rendez-vous sur votre console Supabase : [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Sélectionnez votre projet.
3. Dans le menu latéral gauche, cliquez sur **SQL Editor** (icône `>_`).
4. Cliquez sur **New query**.
5. Copiez et collez l'intégralité du contenu du fichier [`sql/create_tables.sql`](./sql/create_tables.sql) :
   *(Le script crée la table `fm_big6_players`, configure les contraintes, les index et les politiques de sécurité RLS sans toucher aux données existantes).*
6. Cliquez sur le bouton vert **Run** en bas à droite pour exécuter le script.

### Étape 2 : Créer le compte Administrateur (`admin@admin.fr`)
1. Dans le menu latéral de Supabase, cliquez sur **Authentication** (icône utilisateur).
2. Cliquez sur l'onglet **Users**, puis sur le bouton vert **Add user** > **Create user**.
3. Renseignez :
   - **Email** : `admin@admin.fr`
   - **Password** : *(définissez le mot de passe de votre choix)*
   - Cochez impérativement **Auto Confirm User?** pour valider immédiatement le compte.
4. Cliquez sur **Create user**.

---

## 🔒 2. Utilisation du Portail Administrateur

- Un bouton discret en forme de cadenas se trouve tout en bas à droite de l'écran.
- Cliquez dessus pour ouvrir la fenêtre d'administration.
- Saisissez le mot de passe configuré à l'étape précédente pour vous connecter avec `admin@admin.fr`.
- Une fois connecté :
  - Un badge vert/doré **Admin** apparaît dans la barre supérieure.
  - Des boutons rouges de suppression <kbd>🗑️</kbd> s'affichent à côté de chaque joueur dans les tableaux de classement.
  - Vous pouvez supprimer un joueur ayant démissionné de la guilde ou ayant fait une fausse manipulation (avec confirmation préalable).
  - Vous pouvez vous déconnecter à tout moment.

---

## 📱 3. Fonctionnalités de l'Application

### Onglet Inscription (Wizard mobile par étapes)
- **Étape 1 : Pseudo**
  - Si le pseudo existe déjà dans la base, ses anciennes données sont automatiquement détectées et pré-remplies.
  - Aucune ligne en double n'est créée : les scores sont mis à jour proprement.
- **Étape 2 : Compétences** (Icône `Tickets FM.png`)
  - Tickets (0 à 500 000) avec raccourcis rapides (+5k, +25k, Max).
  - Niveau d'ascension (0 à 3).
  - Niveau atteint dans l'ascension (0 à 100).
  - Niveau de technologie débloqué (0 à 5).
- **Étape 3 : Œufs** (Icône `oeufs FM.png`)
  - Œufs (0 à 200 000).
  - Niveau d'ascension (0 à 3), Niveau atteint (0 à 100), Technologie (0 à 5).
- **Étape 4 : Monture** (Icône `Monture FM.png`)
  - Clés de monture (0 à 200 000).
  - Niveau d'ascension (0 à 3), Niveau atteint (0 à 100), Technologie (0 à 5).
- **Étape 5 : Forge** (Icône `Forge FM.png`)
  - Marteaux (0 à 500 000).
  - Niveau d'ascension (0 à 3), Niveau atteint (0 à 35).
- **Bouton Terminer** : Enregistrement instantané, pluie de confettis et accès direct aux résultats.

### Onglet Résultats (Classements Top 50)
1. **Classement Général d'avancement** :
   - Calcule le score global basé sur la somme des rangs obtenus dans les 4 catégories d'avancement (le plus petit score est classé 1er).
2. **Classements d'avancement (Top 50)** pour les 4 catégories :
   - Critères : 1) Ascension &rarr; 2) Technologie &rarr; 3) Niveau d'ascension &rarr; 4) Ressources.
3. **Ordre d'ascension (Rush Top 50)** (Compétences & Montures) :
   - Critères : 1) Nombre de ressources &rarr; 2) Technologie &rarr; 3) Ascension.
4. **Outils intégrés** :
   - Podiums visuels Top 3 (Or 🥇, Argent 🥈, Bronze 🥉).
   - Barre de recherche instantanée par pseudo.
   - Bouton d'actualisation en temps réel.

---

## 🌐 4. Déploiement sur GitHub Pages (1 minute)

1. Créez un dépôt sur GitHub (par exemple `fm-big-6`) et poussez l'ensemble des fichiers du projet à la racine.
2. Sur la page de votre dépôt GitHub, allez dans **Settings** (Paramètres).
3. Dans le menu de gauche, cliquez sur **Pages**.
4. Sous la section **Build and deployment** :
   - Source : sélectionnez **Deploy from a branch**.
   - Branch : sélectionnez **main** (ou **master**) et le dossier **/(root)**.
   - Cliquez sur **Save**.
5. Votre application sera disponible en moins de 60 secondes à l'adresse fournie par GitHub (ex: `https://votre-pseudo.github.io/fm-big-6/`).

---

## 📂 5. Arborescence du Projet

```
FM BIG 6/
├── index.html                 # Application SPA complète responsive
├── style.css                  # Styles graphiques, thèmes et micro-interactions
├── app.js                     # Logique du formulaire, vues et interface
├── supabaseClient.js          # Client Supabase v2 (CRUD, RLS & Auth)
├── rankingEngine.js           # Moteur de tri et calcul des classements
├── sql/
│   └── create_tables.sql      # Requête SQL pour initialiser la table Supabase
├── README.md                  # Documentation et guide de démarrage
├── Forge FM.png               # Icône Marteaux de forge
├── Monture FM.png             # Icône Clés de monture
├── Tickets FM.png             # Icône Tickets de compétences
└── oeufs FM.png               # Icône Œufs de compagnon
```
