// src/Logger.js
// =======================================================
// Logger simple : écrit des événements dans logs/game_history.txt
// + affiche aussi dans la console.
//
// - On crée le dossier logs/ si besoin
// - On timestamp chaque ligne
// =======================================================

const fs = require("fs");
const path = require("path");

class Logger {
  constructor(logFilePath = path.join(__dirname, "..", "logs", "game_history.txt")) {
    this.logFilePath = logFilePath;

    const dir = path.dirname(this.logFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  log(message) {
    const now = new Date().toISOString();
    const line = `[${now}] ${message}\n`;

    // Console
    console.log(message);

    // Fichier
    fs.appendFileSync(this.logFilePath, line, "utf-8");
  }

  separator() {
    this.log("------------------------------------------------------------");
  }
}

module.exports = Logger;
