 // ============================================================================
// index.js
// ============================================================================
// Point d’entrée du projet Flip 7 (CLI / Node.js)
//
// Rôle de ce fichier :
// - Gérer toute l’interaction UTILISATEUR avant le début de la partie
//   (nombre de joueurs, noms, mode de jeu, paramètres)
// - Créer une instance de Game
// - Lancer la partie
//
// IMPORTANT :
// - index.js NE contient PAS la logique du jeu
// - Toute la logique métier (tours, cartes, scoring, IA, etc.) est dans Game.js
// - index.js est volontairement simple pour séparer I/O et logique
// ============================================================================

// readline : module natif Node.js pour lire des entrées utilisateur en CLI
const readline = require("readline");

// Import du moteur de jeu
const Game = require("./src/Game");

// -----------------------------------------------------------------------------
// Fonction utilitaire : poser une question en mode async/await
// -----------------------------------------------------------------------------
// readline fonctionne par callbacks, ce qui devient vite illisible.
// Cette fonction transforme rl.question(...) en Promise pour utiliser await.
//
// Exemple d’usage :
//   const answer = await ask(rl, "Votre nom ? ");
//
function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

// -----------------------------------------------------------------------------
// Fonction principale du programme
// -----------------------------------------------------------------------------
// On utilise async main() pour pouvoir utiliser await facilement.
//
async function main() {
  console.log("=================================");
  console.log("   Flip 7 - Jeu de cartes (CLI)   ");
  console.log("=================================\n");

  // Création de l’interface readline
  // - input : clavier
  // - output : terminal
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // ---------------------------------------------------------------------------
  // 1) Choix du nombre de joueurs
  // ---------------------------------------------------------------------------
  let nPlayers = 0;

  while (true) {
    const ans = await ask(rl, "Nombre de joueurs (2 à 10) : ");
    nPlayers = parseInt(ans, 10);

    // Validation de l’entrée
    if (!Number.isNaN(nPlayers) && nPlayers >= 2 && nPlayers <= 10) {
      break;
    }

    console.log("❌ Entrée invalide. Veuillez entrer un nombre entre 2 et 10.\n");
  }

  // ---------------------------------------------------------------------------
  // 2) Saisie des noms des joueurs
  // ---------------------------------------------------------------------------
  // On impose :
  // - pas de nom vide
  // - pas de doublons
  //
  const names = [];

  for (let i = 0; i < nPlayers; i++) {
    let name = "";

    while (true) {
      name = (await ask(rl, `Nom du joueur ${i + 1} : `)).trim();

      if (!name) {
        console.log("❌ Le nom ne peut pas être vide.\n");
        continue;
      }

      if (names.includes(name)) {
        console.log("❌ Ce nom est déjà utilisé. Choisissez-en un autre.\n");
        continue;
      }

      break;
    }

    names.push(name);
  }

  // ---------------------------------------------------------------------------
  // 3) Choix du mode de jeu
  // ---------------------------------------------------------------------------
  // Mode 1 : interactif
  //   - Le joueur choisit hit / stay
  //   - Il peut demander un CONSEIL IA avec la touche 'a'
  //
  // Mode 2 : auto
  //   - Les décisions sont automatiques (utile pour tests rapides)
  //
  console.log("\nModes de jeu :");
  console.log("  1) Interactif (hit / stay + conseil IA)");
  console.log("  2) Auto (stratégie simple)\n");

  let mode = "interactive";

  while (true) {
    const ans = (await ask(rl, "Choisir le mode (1 ou 2) : ")).trim();

    if (ans === "1") {
      mode = "interactive";
      break;
    }

    if (ans === "2") {
      mode = "auto";
      break;
    }

    console.log("❌ Choix invalide. Entrez 1 ou 2.\n");
  }

  // ---------------------------------------------------------------------------
  // 4) Paramètre du mode auto (si choisi)
  // ---------------------------------------------------------------------------
  // autoTarget = nombre de cartes distinctes à partir duquel
  // le joueur automatique décide de STAY.
  //
  let autoTarget = 4;

  if (mode === "auto") {
    while (true) {
      const ans = await ask(rl, "Seuil auto (1 à 7) : ");
      const v = parseInt(ans, 10);

      if (!Number.isNaN(v) && v >= 1 && v <= 7) {
        autoTarget = v;
        break;
      }

      console.log("❌ Entrée invalide. Valeur entre 1 et 7.\n");
    }
  }

  // ---------------------------------------------------------------------------
  // IMPORTANT : fermeture de CE readline
  // ---------------------------------------------------------------------------
  // Pourquoi ?
  // - index.js s’occupe UNIQUEMENT du setup initial
  // - Game.js crée sa propre interface readline pour gérer les tours
  //
  rl.close();

  // ---------------------------------------------------------------------------
  // 5) Création et lancement du jeu
  // ---------------------------------------------------------------------------
  console.log("\n=== Lancement de la partie ===\n");

  const game = new Game(names, {
    mode,
    autoTarget,
  });

  // start() est async car le jeu contient des entrées utilisateur
  await game.start();
}

// -----------------------------------------------------------------------------
// Lancement sécurisé du programme
// -----------------------------------------------------------------------------
// Si une erreur non prévue survient, on l’affiche clairement
// et on quitte avec un code d’erreur.
//
main().catch((err) => {
  console.error("❌ Erreur fatale :", err);
  process.exit(1);
});
