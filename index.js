// index.js
// =======================================================
// Point d'entrée du programme Flip 7 (CLI).
//
// Objectif : permettre au prof de tester facilement :
// - lancement simple : node index.js
// - demande du nombre de joueurs
// - demande des noms
// - choix du mode :
//    1) interactif : chaque joueur choisit hit/stay
//    2) auto       : les joueurs jouent automatiquement (pratique pour tester vite)
//
// Important : on utilise readline (natif Node.js), donc pas besoin de dépendances.
// =======================================================

const readline = require("readline");
const Game = require("./src/Game");

// Utilitaire prompt async (évite callback hell)
function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("=====================================================");
  console.log("                 FLIP 7 - CLI (Node)                 ");
  console.log("=====================================================\n");

  // ------------------------------------------------------
  // 1) Nombre de joueurs
  // ------------------------------------------------------
  let nPlayers = 0;
  while (true) {
    const ans = await ask(rl, "Nombre de joueurs (2 à 8 recommandé) : ");
    nPlayers = parseInt(ans, 10);

    // On autorise 2..10 pour rester safe, mais tu peux ajuster
    if (!Number.isNaN(nPlayers) && nPlayers >= 2 && nPlayers <= 10) break;
    console.log("❌ Entrée invalide. Mets un nombre entre 2 et 10.\n");
  }

  // ------------------------------------------------------
  // 2) Noms des joueurs
  // ------------------------------------------------------
  const names = [];
  for (let i = 0; i < nPlayers; i++) {
    let name = "";
    while (true) {
      name = (await ask(rl, `Nom du joueur ${i + 1} : `)).trim();

      if (name.length < 1) {
        console.log("❌ Le nom ne peut pas être vide.\n");
        continue;
      }
      if (names.includes(name)) {
        console.log("❌ Nom déjà utilisé. Mets un nom unique.\n");
        continue;
      }
      break;
    }
    names.push(name);
  }

  // ------------------------------------------------------
  // 3) Choix du mode
  // ------------------------------------------------------
  console.log("\nModes disponibles :");
  console.log("  1) Interactif : chaque joueur choisit hit/stay");
  console.log("  2) Auto       : les joueurs jouent automatiquement (test rapide)\n");

  let mode = "interactive";
  while (true) {
    const ans = (await ask(rl, "Choisis un mode (1 ou 2) : ")).trim();
    if (ans === "1") {
      mode = "interactive";
      break;
    }
    if (ans === "2") {
      mode = "auto";
      break;
    }
    console.log("❌ Choix invalide. Réponds 1 ou 2.\n");
  }

  // ------------------------------------------------------
  // 4) Paramètres mode auto (si choisi)
  // ------------------------------------------------------
  let autoTarget = 4; // par défaut : hit jusqu'à 4 nombres distincts puis stay
  if (mode === "auto") {
    console.log("\nMode AUTO : on va définir un comportement simple.");
    console.log("Exemple : '4' = chaque joueur tire jusqu'à 4 nombres distincts, puis stay.\n");

    while (true) {
      const ans = await ask(rl, "Seuil AUTO (3 à 6 conseillé) : ");
      const v = parseInt(ans, 10);
      if (!Number.isNaN(v) && v >= 1 && v <= 7) {
        autoTarget = v;
        break;
      }
      console.log("❌ Entrée invalide. Mets un nombre entre 1 et 7.\n");
    }
  }

  // IMPORTANT : on ferme ce readline ici.
  // Le Game possède déjà son propre readline interne pour gérer les tours.
  rl.close();

  // ------------------------------------------------------
  // 5) Lancement du jeu
  // ------------------------------------------------------
  // On passe un objet options au Game :
  // - mode : "interactive" ou "auto"
  // - autoTarget : seuil de stop en auto
  const game = new Game(names, { mode, autoTarget });

  await game.start();
}

// Lancement sécurisé (si erreur => affiche)
main().catch((err) => {
  console.error("💥 Erreur fatale :", err);
  process.exit(1);
});
