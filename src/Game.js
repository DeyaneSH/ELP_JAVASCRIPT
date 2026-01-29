// src/Game.js
// ============================================================================
// Flip 7 - Game Engine (CLI Node.js)
// ============================================================================
//
// Objectifs de ce fichier :
// - Implémenter la logique principale du jeu Flip 7 (tours, actions, scoring)
// - Supporter 2 modes :
//     * interactive : le joueur choisit hit/stay ; peut demander un CONSEIL IA
//     * auto        : stratégie simple (déjà existante) - utile pour tests rapides
// - Ajouter une IA probabiliste "conseillère" :
//     * En mode interactif, le joueur peut taper "a" pour afficher une recommandation
//     * L'IA estime l'espérance de score si HIT vs STAY, à partir du deck restant
//
// ----------------------------------------------------------------------------
// IMPORTANT : L'IA ne joue pas à la place du joueur.
// Elle calcule un conseil à la demande.
//
// Modèle probabiliste (simple et testable) :
// - On considère le prochain tirage comme un tirage uniforme parmi les cartes restantes.
// - On simule l'impact immédiat d'une carte sur le score du tour, puis on calcule E[score].
// - On ignore volontairement la "valeur stratégique" des actions sur les autres joueurs
//   (Freeze/FlipThree/SecondChance peuvent changer le tour, mais c'est complexe à quantifier).
//   -> Le conseil est donc surtout fiable sur la partie "risque de doublon" et "gain en points".
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
    // --- Joueurs ---
    this.players = playerNames.map((n) => new Player(n));

    // --- Logger (fichier + console en local) ---
    this.logger = new Logger();

    // --- Options de jeu ---
    this.mode = options.mode || "interactive"; // "interactive" | "auto"
    this.autoTarget = typeof options.autoTarget === "number" ? options.autoTarget : 4;

    // --- Deck + défausse ---
    this.deck = new Deck();
    this.discardPile = [];

    // --- Donneur ---
    this.dealerIndex = 0;

    // ------------------------------------------------------------------------
    // 🔌 IO TCP (optionnelle)
    // ------------------------------------------------------------------------
    // Si options.io est fourni (serveur TCP), on utilise :
    //   this.io.log(...) et this.io.ask(...)
    // et on NE crée PAS de readline local.
    this.io = options.io || null;

    if (!this.io) {
      // Mode local CLI : on lit au clavier
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
    } else {
      // Mode TCP : pas de clavier serveur !
      this.rl = null;
    }
  }

  // ==========================================================================
  // LOG CENTRALISÉ
  // ==========================================================================
  // Objectif : un seul point d'entrée pour afficher du texte
  // - En TCP : broadcast via io.log
  // - En local : logger classique
  log(text) {
    if (this.io && typeof this.io.log === "function") {
      this.io.log(text);
    } else {
      this.logger.log(text);
    }
  }

  separator() {
    this.log("------------------------------------------------------------");
  }

  // ==========================================================================
  // ASK CENTRALISÉ
  // ==========================================================================
  // - En TCP : ask(playerName, question) -> le serveur envoie au bon client
  // - En local : readline
  ask(question, playerName = null) {
    if (this.io && typeof this.io.ask === "function") {
      return this.io.ask(playerName, question);
    }
    return new Promise((resolve) => this.rl.question(question, resolve));
  }

  // ==========================================================================
  // Pioche / défausse
  // ==========================================================================
  drawCard() {
    let card = this.deck.draw();
    if (card) return card;

    // Si la pioche est vide, on remélange la défausse
    if (this.discardPile.length === 0) return null;

    this.log("[DECK] Pioche vide → mélange de la défausse.");
    this.deck.cards = this.discardPile;
    this.discardPile = [];
    this.deck.shuffle();

    return this.deck.draw();
  }

  discard(card) {
    this.discardPile.push(card);
  }

  // ==========================================================================
  // Affichage état joueur (nettoyé)
  // ==========================================================================
  // On n'affiche PAS active=true (inutile pour l'utilisateur)
  roundStateString(p) {
    return `${p.name} | nombres=[${p.numbers.join(", ")}] | x2=${p.hasX2} | +bonus=${p.plusBonus} | secondChance=${p.secondChance}`;
  }

  // ==========================================================================
  // Choix d'une cible (pour actions)
  // ==========================================================================
  // actorName = joueur qui doit répondre au prompt (important en TCP)
  async chooseTargetPlayer(actorName, activeOnly = true) {
    const candidates = this.players.filter((p) => (activeOnly ? p.active : true));
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    this.log(`[CHOICE] ${actorName} doit choisir une cible :`);
    candidates.forEach((p, idx) => this.log(`  ${idx + 1}) ${p.name}`));

    while (true) {
      const ans = await this.ask("> Numéro du joueur : ", actorName);
      const k = parseInt(ans, 10);
      if (!Number.isNaN(k) && k >= 1 && k <= candidates.length) return candidates[k - 1];
      this.log("Choix invalide, réessaie.");
    }
  }

  // ==========================================================================
  // IA PROBABILISTE (conseil)
  // ==========================================================================
  computeAdviceForPlayer(p) {
    if (p.eliminated || !p.active) {
      return { suggestion: "STAY", reason: "Joueur inactif/éliminé.", details: null };
    }

    const remaining = this.deck.cards.length;
    if (remaining <= 0) {
      return { suggestion: "STAY", reason: "Plus de cartes restantes dans la pioche.", details: { remainingCards: 0 } };
    }

    const scoreStay = p.computeRoundScore(false);

    const counts = {
      total: remaining,
      numberByValue: new Map(),
      modifierX2: 0,
      modifierPlus: new Map(),
      actionTotal: 0,
    };

    for (const c of this.deck.cards) {
      if (c.type === "number") {
        counts.numberByValue.set(c.value, (counts.numberByValue.get(c.value) || 0) + 1);
      } else if (c.type === "modifier") {
        if (c.value === "x2") counts.modifierX2++;
        else counts.modifierPlus.set(c.value, (counts.modifierPlus.get(c.value) || 0) + 1);
      } else if (c.type === "action") {
        counts.actionTotal++;
      }
    }

    // P(bust) brute = proba de tirer un nombre déjà présent
    let duplicateRemainingCount = 0;
    for (const n of p.numbers) duplicateRemainingCount += counts.numberByValue.get(n) || 0;
    const pBustRaw = duplicateRemainingCount / counts.total;

    const scoreAfterVirtualDraw = (cardType, cardValue) => {
      const virtual = {
        numbers: [...p.numbers],
        hasX2: p.hasX2,
        plusBonus: p.plusBonus,
        secondChance: p.secondChance,
      };

      if (cardType === "number") {
        const v = cardValue;
        const isDup = virtual.numbers.includes(v);

        if (isDup) {
          if (virtual.secondChance) {
            virtual.secondChance = false; // annule le doublon
          } else {
            return 0; // bust
          }
        } else {
          virtual.numbers.push(v);
        }
      }

      if (cardType === "modifier") {
        if (cardValue === "x2") virtual.hasX2 = true;
        else virtual.plusBonus += Number(cardValue);
      }

      // action : score inchangé (modèle simple)

      const sumNumbers = virtual.numbers.reduce((a, b) => a + b, 0);
      const doubled = virtual.hasX2 ? sumNumbers * 2 : sumNumbers;
      let score = doubled + virtual.plusBonus;

      if (virtual.numbers.length >= 7) score += 15;
      return score;
    };

    // Espérance E(hit)
    let expectedHitScore = 0;

    for (const [val, cnt] of counts.numberByValue.entries()) {
      expectedHitScore += (cnt / counts.total) * scoreAfterVirtualDraw("number", val);
    }

    if (counts.modifierX2 > 0) {
      expectedHitScore += (counts.modifierX2 / counts.total) * scoreAfterVirtualDraw("modifier", "x2");
    }

    for (const [plusVal, cnt] of counts.modifierPlus.entries()) {
      expectedHitScore += (cnt / counts.total) * scoreAfterVirtualDraw("modifier", plusVal);
    }

    if (counts.actionTotal > 0) {
      expectedHitScore += (counts.actionTotal / counts.total) * scoreStay;
    }

    const suggestion = expectedHitScore > scoreStay ? "HIT" : "STAY";
    const reason = suggestion === "HIT"
      ? "Espérance de score > score actuel."
      : "Risque / espérance : rester est mieux ou égal.";

    return {
      suggestion,
      reason,
      details: {
        remainingCards: counts.total,
        pBustRaw: Number(pBustRaw.toFixed(3)),
        scoreStay,
        expectedHitScore: Number(expectedHitScore.toFixed(2)),
        numbersAlready: p.numbers.length,
      },
    };
  }

  // ==========================================================================
  // Application d'une carte (logique réelle)
  // actorName = joueur qui doit répondre si prompt (TCP)
  // ==========================================================================
  async applyCardToPlayer(player, card, context = "normal", actorName = null) {
    this.log(`[CARD] ${player.name} reçoit ${card.toString()} (${context})`);

    // -------------------- NUMBER --------------------
    if (card.type === "number") {
      if (player.hasNumber(card.value)) {
        // doublon
        if (player.secondChance) {
          let use = true;
          if (this.mode === "interactive") {
            const ans = await this.ask(
              `${player.name} a un doublon (${card.value}). Utiliser SecondChance ? (y/n) `,
              actorName || player.name
            );
            use = ans.trim().toLowerCase().startsWith("y");
          }

          if (use) {
            player.secondChance = false;
            this.log(`[SECOND CHANCE] ${player.name} annule le doublon. Carte défaussée.`);
            this.discard(card);
            return { alive: true, flip7: false };
          }
        }

        // élimination
        player.active = false;
        player.eliminated = true;
        this.log(`[ELIM] ${player.name} est éliminé du tour (doublon ${card.value}).`);
        this.discard(card);
        return { alive: false, flip7: false };
      }

      player.addNumber(card.value);
      this.discard(card);

      const flip7 = player.countDistinctNumbers() >= 7;
      if (flip7) this.log(`[FLIP7] ${player.name} a 7 nombres distincts ! +15 et fin du tour.`);
      return { alive: true, flip7 };
    }

    // -------------------- MODIFIER --------------------
    if (card.type === "modifier") {
      player.applyModifier(card.value);
      this.discard(card);
      return { alive: true, flip7: false };
    }

    // -------------------- ACTION --------------------
    if (card.type === "action") {
      const action = card.value;
      this.discard(card);

      if (action === "Freeze") {
        const target = await this.chooseTargetPlayer(actorName || player.name, true);
        if (!target) return { alive: true, flip7: false };

        target.active = false;
        target.eliminated = true;
        target.numbers = [];
        target.hasX2 = false;
        target.plusBonus = 0;
        target.secondChance = false;

        this.log(`[FREEZE] ${target.name} est gelé : éliminé du tour, score tour = 0.`);
        return { alive: true, flip7: false };
      }

      if (action === "SecondChance") {
        if (!player.secondChance) {
          player.secondChance = true;
          this.log(`[SECOND CHANCE] ${player.name} garde une SecondChance.`);

          const extra = this.drawCard();
          if (extra) {
            return await this.applyCardToPlayer(player, extra, "secondChance-extraDraw", actorName || player.name);
          }
          return { alive: true, flip7: false };
        } else {
          const other = this.players.find((p) => p.active && !p.secondChance);
          if (other) {
            other.secondChance = true;
            this.log(`[SECOND CHANCE] ${player.name} en avait déjà : donnée à ${other.name}.`);
          } else {
            this.log(`[SECOND CHANCE] Personne ne peut la recevoir : défaussée.`);
          }
          return { alive: true, flip7: false };
        }
      }

      if (action === "FlipThree") {
        const target = await this.chooseTargetPlayer(actorName || player.name, true);
        if (!target) return { alive: true, flip7: false };

        this.log(`[FLIP THREE] ${target.name} doit retourner 3 cartes.`);
        const pendingActions = [];

        for (let i = 1; i <= 3; i++) {
          if (!target.active) break;

          const c = this.drawCard();
          if (!c) break;

          this.log(`[FLIP THREE] Pioche ${i}/3 pour ${target.name}: ${c.toString()}`);

          if (c.type === "action") {
            pendingActions.push(c);
            this.discard(c);
          } else {
            const res = await this.applyCardToPlayer(target, c, "flipThree", actorName || player.name);
            if (!res.alive) break;
            if (res.flip7) return { alive: true, flip7: true };
          }
        }

        for (const actCard of pendingActions) {
          this.log(`[PENDING ACTION] Résolution de ${actCard.toString()} après FlipThree.`);
          const carrier = this.players.find((p) => p.active);
          if (!carrier) break;

          const res = await this.applyCardToPlayer(carrier, actCard, "flipThree-pendingAction", actorName || player.name);
          if (res.flip7) return { alive: true, flip7: true };
        }

        return { alive: true, flip7: false };
      }

      return { alive: true, flip7: false };
    }

    return { alive: true, flip7: false };
  }

  // ==========================================================================
  // Distribution initiale
  // ==========================================================================
  async initialDeal() {
    this.log("[ROUND] Distribution initiale : 1 carte par joueur.");

    for (const p of this.players) {
      if (!p.active) continue;

      const card = this.drawCard();
      if (!card) continue;

      const res = await this.applyCardToPlayer(p, card, "initialDeal", p.name);
      if (res.flip7) return true;
    }

    return false;
  }

  // ==========================================================================
  // Un tour complet
  // ==========================================================================
  async playRound(roundNumber) {
    this.separator();
    this.log(`[ROUND ${roundNumber}] Début du tour. Donneur = ${this.players[this.dealerIndex].name}`);

    // Reset de tour
    this.players.forEach((p) => p.resetRoundState());

    let roundEndedByFlip7 = await this.initialDeal();
    let flip7Winner = null;

    while (!roundEndedByFlip7) {
      const activePlayers = this.players.filter((p) => p.active);
      if (activePlayers.length === 0) break;

      for (const p of activePlayers) {
        if (!p.active) continue;

        this.log("");
        this.log(`[TURN] ${p.name} joue. État: ${this.roundStateString(p)}`);

        // ------------------ MODE INTERACTIF ------------------
        if (this.mode === "interactive") {
          while (true) {
            // IMPORTANT TCP : on passe p.name pour router le prompt au bon client
            const ans = await this.ask(`${p.name} : (h)it / (s)tay / (a)dvice ? `, p.name);
            const choice = ans.trim().toLowerCase();

            if (choice.startsWith("a")) {
              const adv = this.computeAdviceForPlayer(p);
              if (!adv.details) {
                this.log(`[IA] Conseil: ${adv.suggestion} | ${adv.reason}`);
              } else {
                this.log(
                  `[IA] Conseil: ${adv.suggestion} | ${adv.reason}\n` +
                    `     P(bust)≈${adv.details.pBustRaw} | stay=${adv.details.scoreStay} | E(hit)≈${adv.details.expectedHitScore} | deck=${adv.details.remainingCards}`
                );
              }
              continue; // redemande hit/stay
            }

            if (choice.startsWith("s")) {
              p.active = false;
              this.log(`[STAY] ${p.name} reste. Il ne piochera plus ce tour.`);
              break;
            }

            // HIT par défaut
            const card = this.drawCard();
            if (!card) {
              this.log("[DECK] Plus de cartes disponibles. Fin du tour forcée.");
              p.active = false;
              break;
            }

            const res = await this.applyCardToPlayer(p, card, "hit", p.name);
            if (res.flip7) {
              roundEndedByFlip7 = true;
              flip7Winner = p;
            }
            break;
          }

          if (roundEndedByFlip7) break;
          continue;
        }

        // ------------------ MODE AUTO ------------------
        let choice = "h";
        if (p.countDistinctNumbers() >= this.autoTarget) {
          choice = "s";
          this.log(`[AUTO] ${p.name} atteint ${p.countDistinctNumbers()} nombres (>=${this.autoTarget}) => STAY`);
        } else {
          this.log(`[AUTO] ${p.name} a ${p.countDistinctNumbers()} nombres (<${this.autoTarget}) => HIT`);
        }

        if (choice === "s") {
          p.active = false;
          continue;
        }

        const card = this.drawCard();
        if (!card) {
          p.active = false;
          continue;
        }

        const res = await this.applyCardToPlayer(p, card, "hit", p.name);
        if (res.flip7) {
          roundEndedByFlip7 = true;
          flip7Winner = p;
          break;
        }
      }
    }

    // ==========================================================================
    // Scoring
    // ==========================================================================
    this.log("");
    this.log(`[ROUND ${roundNumber}] Scoring...`);

    for (const p of this.players) {
      const flip7Bonus = flip7Winner && flip7Winner.name === p.name;
      const roundScore = p.computeRoundScore(flip7Bonus);
      p.totalScore += roundScore;

      this.log(
        `[SCORE] ${p.name} : scoreTour=${roundScore} | total=${p.totalScore} | eliminated=${p.eliminated} | nombres=[${p.numbers.join(
          ", "
        )}] | x2=${p.hasX2} | +bonus=${p.plusBonus}`
      );

      // SecondChance perdue fin de tour
      p.secondChance = false;
    }

    // Donneur suivant
    this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
  }

  // ==========================================================================
  // Start
  // ==========================================================================
  async start() {
    this.separator();
    this.log("[GAME] Démarrage Flip 7.");
    this.log(`[GAME] Joueurs: ${this.players.map((p) => p.name).join(", ")}`);

    if (this.mode === "interactive") {
      this.log("[GAME] Mode interactif : tape 'a' pour demander un conseil IA à ton tour.");
    } else {
      this.log(`[GAME] Mode auto : seuil=${this.autoTarget}`);
    }

    let roundNumber = 1;

    while (true) {
      await this.playRound(roundNumber);
      if (this.players.some((p) => p.totalScore >= 200)) break;
      roundNumber++;
    }

    // Winner
    this.separator();
    this.log("[GAME] Fin de partie : un joueur a atteint 200+.");
    const sorted = [...this.players].sort((a, b) => b.totalScore - a.totalScore);
    const winner = sorted[0];

    this.log(`[WINNER] ${winner.name} avec ${winner.totalScore} points.`);
    this.log("[RANKING] Classement final :");
    sorted.forEach((p, i) => this.log(`  ${i + 1}) ${p.name} - ${p.totalScore}`));
    this.separator();

    // Fermetures propres
    if (this.io && typeof this.io.close === "function") {
      this.io.close();
    }
    if (this.rl) {
      this.rl.close();
    }
  }
}

module.exports = Game;
