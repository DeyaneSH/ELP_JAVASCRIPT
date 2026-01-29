// net/server.js
// ============================================================================
// Serveur TCP "autoritaire" Flip7
// - Le serveur garde l'état du jeu (deck, score, etc.)
// - Les clients sont des terminaux (un par joueur)
// - Chaque prompt est envoyé UNIQUEMENT au joueur concerné
// - Tous les logs sont broadcast à tous (pour voir les cartes des autres)
// ============================================================================

const net = require("net");
const { sendJSON, makeLineParser } = require("./protocol");
const Game = require("../src/Game");

const HOST = "0.0.0.0";
const PORT = 5050;

// 🔧 Mets le nombre de joueurs attendu ici
const EXPECTED_PLAYERS = 2;

// Liste des clients connectés
// Chaque client : { socket, name, pendingResolve }
const clients = [];

// ---------------------------------------------------------------------------
// Outils d'envoi
// ---------------------------------------------------------------------------
function broadcast(text) {
  for (const c of clients) {
    sendJSON(c.socket, { type: "print", text });
  }
}

function getClientByName(name) {
  return clients.find((c) => c.name === name);
}

// askClient : envoie un prompt à 1 joueur, et attend sa réponse (Promise)
function askClient(name, question) {
  const c = getClientByName(name);
  if (!c) return Promise.resolve("s"); // sécurité : si absent -> stay

  return new Promise((resolve) => {
    // Stocke le resolve => sera appelé à la réception du prochain "input"
    c.pendingResolve = resolve;

    // Envoie la question au BON joueur
    sendJSON(c.socket, { type: "prompt", text: question });
  });
}

// ---------------------------------------------------------------------------
// Serveur TCP
// ---------------------------------------------------------------------------
const server = net.createServer((socket) => {
  socket.setNoDelay(true);

  const client = {
    socket,
    name: null,
    pendingResolve: null,
  };
  clients.push(client);

  sendJSON(socket, {
    type: "print",
    text:
      "✅ Connecté au serveur Flip7.\n" +
      "Attente d'un message join automatique depuis le client...\n\n",
  });

  // Parser JSON lines (un message JSON par ligne)
  const onData = makeLineParser((msg) => {
    // JOIN : {type:"join", name:"Alice"}
    if (msg.type === "join" && typeof msg.name === "string") {
      const wantedName = msg.name.trim();

      // Empêche doublons de noms
      if (clients.some((c) => c.name === wantedName)) {
        sendJSON(socket, { type: "print", text: `❌ Nom déjà pris: ${wantedName}\n` });
        socket.end();
        return;
      }

      client.name = wantedName;
      broadcast(`👤 ${client.name} a rejoint (${clients.filter((c) => c.name).length}/${EXPECTED_PLAYERS})\n`);

      // Dès qu'on a assez de joueurs, on démarre
      tryStartGame();
      return;
    }

    // INPUT : {type:"input", value:"h"}
    if (msg.type === "input" && typeof msg.value === "string") {
      const v = msg.value.trim().toLowerCase();

      // Réponse attendue ?
      if (client.pendingResolve) {
        const r = client.pendingResolve;
        client.pendingResolve = null;
        r(v);
      }
      return;
    }
  });

  socket.on("data", onData);

  socket.on("close", () => {
    const idx = clients.indexOf(client);
    if (idx >= 0) clients.splice(idx, 1);

    broadcast("❌ Un joueur s'est déconnecté.\n");
  });

  socket.on("error", () => {
    // ignore
  });
});

server.listen(PORT, HOST, () => {
  console.log(`✅ Serveur Flip7 TCP lancé sur ${HOST}:${PORT}`);
  console.log(`➡️ Attente de ${EXPECTED_PLAYERS} joueurs...`);
});

// ---------------------------------------------------------------------------
// Démarrage de partie
// ---------------------------------------------------------------------------
let started = false;

async function tryStartGame() {
  if (started) return;

  const ready = clients.filter((c) => c.name);
  if (ready.length < EXPECTED_PLAYERS) return;

  started = true;

  // Ordre des joueurs = ordre de connexion
  const names = ready.slice(0, EXPECTED_PLAYERS).map((c) => c.name);

  broadcast("\n=== Tous les joueurs sont connectés. Démarrage ! ===\n\n");

  // IO injectée dans Game :
  // - log => broadcast vers tous
  // - ask => prompt uniquement au joueur concerné
  const io = {
    log: (text) => broadcast(text + "\n"),
    ask: (playerName, question) => askClient(playerName, question),
    close: () => broadcast("\n=== Partie terminée ===\n"),
  };

  // Lance une partie "interactive" : les humains répondent via leurs clients
  const game = new Game(names, { mode: "interactive", io });

  await game.start();

  io.close();
  process.exit(0);
}
