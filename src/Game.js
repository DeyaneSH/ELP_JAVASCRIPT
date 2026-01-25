// src/Game.js
// ============================================================================
// GAME.JS – CŒUR DU JEU FLIP 7 (CLI Node.js)
//
// Ce fichier contient toute la logique du jeu :
// - gestion des tours
// - pioche et défausse
// - règles Flip 7 (doublons, Freeze, FlipThree, SecondChance)
// - scoring
// - mode interactif OU automatique
//
// Le jeu est volontairement en CLI pour garantir un MVP FONCTIONNEL,
// compréhensible, et facilement testable par un professeur.
//
// ============================================================================

const Deck = require("./Deck");
const Player = require("./Player");
const Logger = require("./Logger");
const readline = require("readline");

class Game {
  // ==========================================================================
  // CONSTRUCTEUR
  // ==========================================================================
  constructor(playerNames, options = {}) {
    // Création des joueurs
    this.players = playerNames.map((n) => new Player(n));

    // Logger (console + fichier)
    this.logger = new Logger();

    // Options de jeu
    // - mode : "interactive" | "auto"
    // - autoTarget : seuil de nombres distincts à partir duquel un joueur auto fait STAY
    this.mode = options.mode || "interactive";
    this.autoTarget =
      typeof options.autoTarget === "number" ? options.autoTarget : 4;

    // Deck + défausse
    this.deck = new Deck();
    this.discardPile = [];

    // Index du donneur
    this.dealerIndex = 0;

    // Interface CLI
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  // ==========================================================================
  // UTILITAIRE PROMPT ASYNC
  // ==========================================================================
  ask(question) {
    return new Promise((resolve) => this.rl.question(question, resolve));
  }

  // ==========================================================================
  // GESTION PIOCHE / DÉFAUSSE
  // ==========================================================================
  drawCard() {
    let card = this.deck.draw();
    if (card) return card;

    // Si la pioche est vide, on reconstitue avec la défausse
    if (this.discardPile.length === 0) return null;

    this.logger.log("[DECK] Pioche vide → mélange de la défausse.");
    this.deck.cards = this.discardPile;
    this.discardPile = [];
    this.deck.shuffle();

    return this.deck.draw();
  }

  discard(card) {
    this.discardPile.push(card);
  }

  // ==========================================================================
  // AFFICHAGE ÉTAT JOUEUR (debug / logs)
  // ==========================================================================
  roundState(player) {
    return `${player.name} | nombres=[${player.numbers.join(
      ", "
    )}] | x2=${player.hasX2} | +bonus=${player.plusBonus} | secondChance=${
      player.secondChance
    } | active=${player.active}`;
  }

  // ==========================================================================
  // CHOIX D’UN JOUEUR CIBLE (pour actions)
  // ==========================================================================
  async chooseTarget(activeOnly = true) {
    const candidates = this.players.filter((p) =>
      activeOnly ? p.active : true
    );

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    this.logger.log("Choisis un joueur cible :");
    candidates.forEach((p, i) =>
      this.logger.log(`  ${i + 1}) ${p.name}`)
    );

    while (true) {
      const ans = await this.ask("> Numéro : ");
      const idx = parseInt(ans, 10);
      if (!Number.isNaN(idx) && idx >= 1 && idx <= candidates.length)
        return candidates[idx - 1];
      console.log("Choix invalide.");
    }
  }

  // ==========================================================================
  // APPLICATION D’UNE CARTE À UN JOUEUR
  // ==========================================================================
  async applyCard(player, card, context = "normal") {
    this.logger.log(
      `[CARD] ${player.name} reçoit ${card.toString()} (${context})`
    );

    // ------------------------------------------------------------------------
    // CARTE NOMBRE
    // ------------------------------------------------------------------------
    if (card.type === "number") {
      // Doublon → élimination sauf si SecondChance
      if (player.hasNumber(card.value)) {
        if (player.secondChance) {
          const ans =
            this.mode === "interactive"
              ? await this.ask(
                  `${player.name} a un doublon (${card.value}). Utiliser SecondChance ? (y/n) `
                )
              : "y";

          if (ans.toLowerCase().startsWith("y")) {
            player.secondChance = false;
            this.logger.log(
              `[SECOND CHANCE] ${player.name} annule le doublon.`
            );
            this.discard(card);
            return { alive: true, flip7: false };
          }
        }

        // Élimination
        player.active = false;
        player.eliminated = true;
        this.logger.log(
          `[ELIM] ${player.name} est éliminé du tour (doublon).`
        );
        this.discard(card);
        return { alive: false, flip7: false };
      }

      // Nombre valide
      player.addNumber(card.value);
      this.discard(card);

      // Vérification Flip7
      if (player.countDistinctNumbers() >= 7) {
        this.logger.log(
          `[FLIP7] ${player.name} atteint 7 nombres distincts !`
        );
        return { alive: true, flip7: true };
      }

      return { alive: true, flip7: false };
    }

    // ------------------------------------------------------------------------
    // MODIFICATEUR
    // ------------------------------------------------------------------------
    if (card.type === "modifier") {
      player.applyModifier(card.value);
      this.discard(card);
      return { alive: true, flip7: false };
    }

    // ------------------------------------------------------------------------
    // ACTIONS
    // ------------------------------------------------------------------------
    if (card.type === "action") {
      this.discard(card);

      // ================== FREEZE ==================
      if (card.value === "Freeze") {
        const target = await this.chooseTarget(true);
        if (!target) return { alive: true, flip7: false };

        target.active = false;
        target.eliminated = true;
        target.numbers = [];
        target.plusBonus = 0;
        target.hasX2 = false;
        target.secondChance = false;

        this.logger.log(`[FREEZE] ${target.name} est gelé.`);
        return { alive: true, flip7: false };
      }

      // ================== SECOND CHANCE ==================
      if (card.value === "SecondChance") {
        if (!player.secondChance) {
          player.secondChance = true;
          this.logger.log(
            `[SECOND CHANCE] ${player.name} conserve une SecondChance.`
          );

          // Pioche immédiate
          const extra = this.drawCard();
          if (extra) return await this.applyCard(player, extra, "secondChance");
        } else {
          const other = this.players.find(
            (p) => p.active && !p.secondChance
          );
          if (other) {
            other.secondChance = true;
            this.logger.log(
              `[SECOND CHANCE] Donnée à ${other.name}.`
            );
          }
        }
        return { alive: true, flip7: false };
      }

      // ================== FLIP THREE ==================
      if (card.value === "FlipThree") {
        const target = await this.chooseTarget(true);
        if (!target) return { alive: true, flip7: false };

        this.logger.log(`[FLIP THREE] ${target.name} doit piocher 3 cartes.`);

        const pendingActions = [];

        for (let i = 0; i < 3; i++) {
          if (!target.active) break;
          const c = this.drawCard();
          if (!c) break;

          if (c.type === "action") {
            pendingActions.push(c);
            this.discard(c);
          } else {
            const res = await this.applyCard(
              target,
              c,
              "flipThree"
            );
            if (res.flip7) return res;
          }
        }

        // Résolution actions en attente
        for (const act of pendingActions) {
          const carrier = this.players.find((p) => p.active);
          if (!carrier) break;
          const res = await this.applyCard(
            carrier,
            act,
            "flipThree-pending"
          );
          if (res.flip7) return res;
        }
      }
    }

    return { alive: true, flip7: false };
  }

  // ==========================================================================
  // DISTRIBUTION INITIALE
  // ==========================================================================
  async initialDeal() {
    this.logger.log("[ROUND] Distribution initiale.");

    for (const p of this.players) {
      const c = this.drawCard();
      if (!c) continue;

      const res = await this.applyCard(p, c, "initial");
      if (res.flip7) return true;
    }
    return false;
  }

  // ==========================================================================
  // TOUR COMPLET
  // ==========================================================================
  async playRound(roundNumber) {
    this.logger.log(`\n========== TOUR ${roundNumber} ==========`);

    this.players.forEach((p) => p.resetRoundState());

    let flip7End = await this.initialDeal();
    let flip7Winner = null;

    while (!flip7End) {
      const actives = this.players.filter((p) => p.active);
      if (actives.length === 0) break;

      for (const p of actives) {
        if (!p.active) continue;

        this.logger.log(this.roundState(p));

        let choice = "h";
        if (this.mode === "interactive") {
          const ans = await this.ask(`${p.name} : (h)it / (s)tay ? `);
          choice = ans.toLowerCase();
        } else {
          choice =
            p.countDistinctNumbers() >= this.autoTarget ? "s" : "h";
          this.logger.log(
            `[AUTO] ${p.name} choisit ${choice.toUpperCase()}`
          );
        }

        if (choice.startsWith("s")) {
          p.active = false;
          this.logger.log(`[STAY] ${p.name} reste.`);
          continue;
        }

        const card = this.drawCard();
        if (!card) break;

        const res = await this.applyCard(p, card, "hit");
        if (res.flip7) {
          flip7End = true;
          flip7Winner = p;
          break;
        }
      }
    }

    // ------------------- SCORING -------------------
    this.logger.log("\n[SCORE] Fin du tour.");
    for (const p of this.players) {
      const bonus = flip7Winner && flip7Winner.name === p.name;
      const roundScore = p.computeRoundScore(bonus);
      p.totalScore += roundScore;

      this.logger.log(
        `${p.name} → +${roundScore} | total=${p.totalScore}`
      );

      p.secondChance = false;
    }

    this.dealerIndex =
      (this.dealerIndex + 1) % this.players.length;
  }

  // ==========================================================================
  // LANCEMENT DE LA PARTIE
  // ==========================================================================
  async start() {
    this.logger.log("[GAME] Démarrage de Flip 7.");
    let round = 1;

    while (true) {
      await this.playRound(round);

      if (this.players.some((p) => p.totalScore >= 200)) break;
      round++;
    }

    // ------------------- FIN -------------------
    this.logger.log("\n[GAME] Fin de partie !");
    const ranking = [...this.players].sort(
      (a, b) => b.totalScore - a.totalScore
    );

    ranking.forEach((p, i) =>
      this.logger.log(`${i + 1}) ${p.name} - ${p.totalScore}`)
    );

    this.rl.close();
  }
}

module.exports = Game;
