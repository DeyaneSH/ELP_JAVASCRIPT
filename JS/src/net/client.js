// net/client.js
// =======================================================
// Client TCP : se connecte au serveur et affiche tout.
// Quand le serveur envoie "prompt", on lit clavier et on répond.
//
// Usage :
//   node net/client.js <SERVER_IP> <NAME>
//
// Ex :
//   node net/client.js 192.168.1.10 Alice
// =======================================================

const net = require("net");
const readline = require("readline");
const { sendJSON, makeLineParser } = require("./protocol");

const host = process.argv[2];
const name = process.argv[3];

if (!host || !name) {
  console.log("Usage: node net/client.js <SERVER_IP> <NAME>");
  process.exit(1);
}

const PORT = 5050;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askLocal(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

const socket = net.createConnection({ host, port: PORT }, () => {
  console.log(`✅ Connecté à ${host}:${PORT}`);
  // join auto
  sendJSON(socket, { type: "join", name });
});

socket.on(
  "data",
  makeLineParser(async (msg) => {
    if (msg.type === "print") {
      process.stdout.write(msg.text);
      return;
    }

    if (msg.type === "prompt") {
      // On affiche la question du serveur, et on répond
      const ans = await askLocal(msg.text);
      sendJSON(socket, { type: "input", value: ans });
      return;
    }
  })
);

socket.on("close", () => {
  console.log("\n❌ Déconnecté du serveur.");
  rl.close();
});

socket.on("error", (e) => {
  console.log("Erreur socket:", e.message);
  rl.close();
});
