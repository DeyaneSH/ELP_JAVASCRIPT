// net/server.js
// ============================================================================
// Serveur TCP "autoritaire" Flip7
// - Le serveur garde l'état du jeu (deck, score, etc.)
// - Les clients sont des terminaux (un par joueur)
// - Chaque prompt est envoyé UNIQUEMENT au joueur concerné
// - Tous les logs sont broadcast à tous (pour voir les cartes des autres)
// ============================================================================

// net/server.js
const net = require("net");
const { sendJSON, makeLineParser } = require("./protocol");
const Game = require("../src/Game");

const HOST = "0.0.0.0";
const PORT = 5050;
const EXPECTED_PLAYERS = 2;

const clients = []; // { socket, name, pendingResolve }

function broadcast(text) {
  for (const c of clients) sendJSON(c.socket, { type: "print", text });
}

function getClientByName(name) {
  return clients.find((c) => c.name === name);
}

function askClient(name, question) {
  const c = getClientByName(name);
  if (!c) return Promise.resolve("s");

  return new Promise((resolve) => {
    c.pendingResolve = resolve;
    sendJSON(c.socket, { type: "prompt", text: question });
  });
}

const server = net.createServer((socket) => {
  socket.setNoDelay(true);

  const client = { socket, name: null, pendingResolve: null };
  clients.push(client);

  sendJSON(socket, { type: "print", text: "✅ Connecté au serveur Flip7.\n" });

  socket.on(
    "data",
    makeLineParser((msg) => {
      if (msg.type === "join" && typeof msg.name === "string") {
        const n = msg.name.trim();
        if (clients.some((c) => c.name === n)) {
          sendJSON(socket, { type: "print", text: `❌ Nom déjà pris: ${n}\n` });
          socket.end();
          return;
        }
        client.name = n;
        broadcast(`👤 ${n} a rejoint (${clients.filter((c) => c.name).length}/${EXPECTED_PLAYERS})\n`);
        tryStartGame();
        return;
      }

      if (msg.type === "input" && typeof msg.value === "string") {
        if (client.pendingResolve) {
          const r = client.pendingResolve;
          client.pendingResolve = null;
          r(msg.value.trim().toLowerCase());
        }
        return;
      }
    })
  );

  socket.on("close", () => {
    const i = clients.indexOf(client);
    if (i >= 0) clients.splice(i, 1);
    broadcast("❌ Un joueur s'est déconnecté.\n");
  });

  socket.on("error", () => {});
});

server.listen(PORT, HOST, () => {
  console.log(`✅ Serveur Flip7 TCP lancé sur ${HOST}:${PORT}`);
  console.log(`➡️ Attente de ${EXPECTED_PLAYERS} joueurs...`);
});

let started = false;

async function tryStartGame() {
  if (started) return;

  const ready = clients.filter((c) => c.name);
  if (ready.length < EXPECTED_PLAYERS) return;

  started = true;
  const names = ready.slice(0, EXPECTED_PLAYERS).map((c) => c.name);

  broadcast("\n=== Tous les joueurs sont connectés. Démarrage ! ===\n\n");

  const io = {
    log: (text) => broadcast(text + "\n"),
    ask: (playerName, question) => askClient(playerName, question),
    close: () => broadcast("\n=== Partie terminée ===\n"),
  };

  // ✅ DEBUG IMPORTANT : on affiche si io est bien injecté
  console.log("DEBUG server: launching Game with io =", !!io, "ask=", typeof io.ask, "log=", typeof io.log);

  const game = new Game(names, { mode: "interactive", io });

  // ✅ DEBUG IMPORTANT : si ton Game n’a pas this.io, ça va se voir ici
  console.log("DEBUG server: Game created. game.io exists =", !!game.io);

  await game.start();

  io.close();
  process.exit(0);
}
