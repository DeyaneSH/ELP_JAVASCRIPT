// net/protocol.js
// Petit protocole "JSON par ligne".
// Chaque message = un objet JSON stringify + "\n"

function sendJSON(socket, obj) {
  socket.write(JSON.stringify(obj) + "\n");
}

// Découpe un flux TCP en lignes JSON
function makeLineParser(onMessage) {
  let buf = "";
  return (chunk) => {
    buf += chunk.toString("utf8");
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        onMessage(JSON.parse(line));
      } catch (e) {
        // ignore ligne invalide
      }
    }
  };
}

module.exports = { sendJSON, makeLineParser };
