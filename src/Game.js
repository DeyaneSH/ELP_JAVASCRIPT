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
  constructor(playerNames, options = {}) {
    this.players = playerNames.map((n) => new Player(n));
    this.logger = new Logger();

    // Options de jeu
    this.mode = options.mode || "interactive"; // "interactive" | "auto"
    this.autoTarget = typeof options.autoTarget === "number" ? options.autoTarget : 4;

    // Deck + défausse
    this.deck = new Deck();
    this.discardPile = [];

    // Donneur
    this.dealerIndex = 0;

    // CLI
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  // --------------------------------------------------------------------------
  // Prompt async
  // --------------------------------------------------------------------------
  ask(question) {
    return new Promise((resolve) => this.rl.question(question, resolve));
  }

  // --------------------------------------------------------------------------
  // Pioche / défausse
  // --------------------------------------------------------------------------
  drawCard() {
    let card = this.deck.draw();
    if (card) return card;

    // Rebuild deck from discard pile if empty
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

  // --------------------------------------------------------------------------
  // Affichage état joueur (nettoyé)
  // - Tu voulais enlever "active=true" : on ne l'affiche plus.
  // --------------------------------------------------------------------------
  roundStateString(p) {
    return `${p.name} | nombres=[${p.numbers.join(", ")}] | x2=${p.hasX2} | +bonus=${p.plusBonus} | secondChance=${p.secondChance}`;
  }

  // --------------------------------------------------------------------------
  // Choix d'une cible (pour actions)
  // --------------------------------------------------------------------------
  async chooseTargetPlayer(activeOnly = true) {
    const candidates = this.players.filter((p) => (activeOnly ? p.active : true));
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    this.logger.log("Choisis un joueur cible :");
    candidates.forEach((p, idx) => this.logger.log(`  ${idx + 1}) ${p.name}`));

    while (true) {
      const ans = await this.ask("> Numéro du joueur : ");
      const k = parseInt(ans, 10);
      if (!Number.isNaN(k) && k >= 1 && k <= candidates.length) return candidates[k - 1];
      console.log("Choix invalide, réessaie.");
    }
  }

  // ==========================================================================
  // ====================== IA PROBABILISTE (CONSEIL) =========================
  // ==========================================================================
  //
  // But : estimer si HIT ou STAY donne une meilleure espérance de score (sur 1 tirage).
  //
  // On calcule :
  // - scoreStay : score actuel du joueur s'il STAY maintenant
  // - expectedHitScore : E[score] si on tire UNE carte maintenant, puis on s'arrête
  //
  // Simulations par type de carte :
  // - number :
  //    * si nouveau nombre => score augmente (+valeur)
  //    * si doublon => score devient 0 (bust) SAUF si secondChance :
  //         - si secondChance=true, on suppose qu'il l'utilise => score inchangé, secondChance consommée
  // - modifier :
  //    * x2 => double la somme des nombres
  //    * +2/+4... => ajoute au bonus
  // - action :
  //    * score inchangé (on ignore la valeur stratégique)
  //
  // Bonus Flip7 :
  // - si le joueur a déjà 6 nombres distincts et tire un nouveau nombre distinct => +15
  //
  // --------------------------------------------------------------------------
  // Limites assumées (normal pour un projet) :
  // - ignore les effets stratégiques des actions (Freeze/FlipThree)
  // - ignore le fait qu'après un hit on peut continuer à jouer
  // => c'est un "one-step lookahead" (un coup d'avance), simple et testable.
  //
  // ==========================================================================
  computeAdviceForPlayer(p) {
    // Si joueur déjà éliminé ou plus actif, pas utile
    if (p.eliminated || !p.active) {
      return {
        suggestion: "STAY",
        reason: "Joueur inactif/éliminé.",
        details: null,
      };
    }

    // Si plus de cartes dans le deck (très rare car on remélange la défausse)
    const remaining = this.deck.cards.length;
    if (remaining <= 0) {
      return {
        suggestion: "STAY",
        reason: "Plus de cartes restantes dans la pioche.",
        details: { remaining },
      };
    }

    // Score actuel si on stay maintenant
    const scoreStay = p.computeRoundScore(false);

    // Comptage des cartes restantes (dans la pioche uniquement)
    // NB : le deck restant est this.deck.cards (la défausse n'est pas dans la pioche)
    // On calcule le nombre de cartes par :
    // - type=number : valeur 0..12
    // - type=modifier : "x2" ou number 2/4/...
    // - type=action : Freeze/FlipThree/SecondChance
    const counts = {
      total: remaining,
      numberTotal: 0,
      actionTotal: 0,
      modifierTotal: 0,
      numberByValue: new Map(), // value -> count
      modifierX2: 0,
      modifierPlus: new Map(), // +v -> count
      actionByName: new Map(), // name -> count
    };

    for (const c of this.deck.cards) {
      if (c.type === "number") {
        counts.numberTotal++;
        counts.numberByValue.set(c.value, (counts.numberByValue.get(c.value) || 0) + 1);
      } else if (c.type === "modifier") {
        counts.modifierTotal++;
        if (c.value === "x2") counts.modifierX2++;
        else counts.modifierPlus.set(c.value, (counts.modifierPlus.get(c.value) || 0) + 1);
      } else if (c.type === "action") {
        counts.actionTotal++;
        counts.actionByName.set(c.value, (counts.actionByName.get(c.value) || 0) + 1);
      }
    }

    // Probabilité de bust (tirer un doublon de nombre) :
    // bust si la carte est un NUMBER qui est déjà présent dans p.numbers.
    let duplicateRemainingCount = 0;
    for (const n of p.numbers) {
      duplicateRemainingCount += counts.numberByValue.get(n) || 0;
    }
    const pBustRaw = duplicateRemainingCount / counts.total;

    // Pour l'espérance, on simule l'effet immédiat de chaque carte possible.
    // expectedHitScore = (1/total) * somme(score_apres_carte)
    let expectedHitScore = 0;

    // Fonction locale : calcule score du joueur si on lui applique "virtuellement" une carte
    // sans modifier l'état réel du joueur.
    const scoreAfterVirtualDraw = (cardType, cardValue) => {
      // Copie virtuelle minimale de l'état du joueur
      // (on ne copie que ce qui influence le score)
      const virtual = {
        numbers: [...p.numbers],
        hasX2: p.hasX2,
        plusBonus: p.plusBonus,
        secondChance: p.secondChance,
      };

      // Appliquer la carte
      if (cardType === "number") {
        const v = cardValue;

        const isDup = virtual.numbers.includes(v);
        if (isDup) {
          // doublon
          if (virtual.secondChance) {
            // on suppose qu'il utilise la seconde chance => pas de bust, mais consomme SC
            virtual.secondChance = false;
            // score inchangé
          } else {
            // bust => 0
            return 0;
          }
        } else {
          // nouveau nombre
          virtual.numbers.push(v);
        }
      }

      if (cardType === "modifier") {
        if (cardValue === "x2") virtual.hasX2 = true;
        else virtual.plusBonus += Number(cardValue);
      }

      if (cardType === "action") {
        // On ignore l'impact stratégique => score inchangé
        // (On pourrait modéliser SecondChance comme utile, mais elle est gérée par applyCard réelle)
      }

      // Calcul du score de tour virtuel (sans flip7 par défaut)
      const sumNumbers = virtual.numbers.reduce((a, b) => a + b, 0);
      const doubled = virtual.hasX2 ? sumNumbers * 2 : sumNumbers;
      let score = doubled + virtual.plusBonus;

      // Bonus Flip7 si on atteint 7 nombres distincts
      if (virtual.numbers.length >= 7) score += 15;

      return score;
    };

    // Contribution des cartes NUMBER
    for (const [val, cnt] of counts.numberByValue.entries()) {
      const score = scoreAfterVirtualDraw("number", val);
      expectedHitScore += (cnt / counts.total) * score;
    }

    // Contribution des MODIFIERS
    if (counts.modifierX2 > 0) {
      const score = scoreAfterVirtualDraw("modifier", "x2");
      expectedHitScore += (counts.modifierX2 / counts.total) * score;
    }
    for (const [plusVal, cnt] of counts.modifierPlus.entries()) {
      const score = scoreAfterVirtualDraw("modifier", plusVal);
      expectedHitScore += (cnt / counts.total) * score;
    }

    // Contribution des ACTIONS (score inchangé = scoreStay virtuel)
    // => on ajoute scoreStay pondéré par P(action)
    // Note : Si tu veux raffiner, tu pourrais donner une petite valeur à SecondChance.
    if (counts.actionTotal > 0) {
      expectedHitScore += (counts.actionTotal / counts.total) * scoreStay;
    }

    // Comparaison HIT vs STAY
    const suggestion = expectedHitScore > scoreStay ? "HIT" : "STAY";

    // Détails utiles pour expliquer au joueur
    const details = {
      remainingCards: counts.total,
      pBustRaw: Number(pBustRaw.toFixed(3)),
      scoreStay,
      expectedHitScore: Number(expectedHitScore.toFixed(2)),
      numbersAlready: p.numbers.length,
    };

    const reason =
      suggestion === "HIT"
        ? "Espérance de score > score actuel."
        : "Risque / espérance : rester est mieux ou égal.";

    return { suggestion, reason, details };
  }

  // ==========================================================================
  // =========================== LOGIQUE DU JEU ===============================
  // ==========================================================================
  async applyCardToPlayer(player, card, context = "normal") {
    this.logger.log(`[CARD] ${player.name} reçoit ${card.toString()} (${context})`);

    // -------------------- NUMBER --------------------
    if (card.type === "number") {
      if (player.hasNumber(card.value)) {
        // doublon
        if (player.secondChance) {
          // En interactif, on laisse le joueur choisir ; en auto on suppose qu'il l'utilise
          let use = true;
          if (this.mode === "interactive") {
            const ans = await this.ask(
              `${player.name} a un doublon (${card.value}). Utiliser SecondChance ? (y/n) `
            );
            use = ans.trim().toLowerCase().startsWith("y");
          }

          if (use) {
            player.secondChance = false;
            this.logger.log(`[SECOND CHANCE] ${player.name} annule le doublon. Carte défaussée.`);
            this.discard(card);
            return { alive: true, flip7: false };
          }
        }

        // élimination
        player.active = false;
        player.eliminated = true;
        this.logger.log(`[ELIM] ${player.name} est éliminé du tour (doublon ${card.value}).`);
        this.discard(card);
        return { alive: false, flip7: false };
      }

      // nouveau nombre
      player.addNumber(card.value);
      this.discard(card);

      const flip7 = player.countDistinctNumbers() >= 7;
      if (flip7) this.logger.log(`[FLIP7] ${player.name} a 7 nombres distincts ! +15 et fin du tour.`);
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
        const target = await this.chooseTargetPlayer(true);
        if (!target) return { alive: true, flip7: false };

        target.active = false;
        target.eliminated = true;
        target.numbers = [];
        target.hasX2 = false;
        target.plusBonus = 0;
        target.secondChance = false;

        this.logger.log(`[FREEZE] ${target.name} est gelé : éliminé du tour, score tour = 0.`);
        return { alive: true, flip7: false };
      }

      if (action === "SecondChance") {
        if (!player.secondChance) {
          player.secondChance = true;
          this.logger.log(`[SECOND CHANCE] ${player.name} garde une SecondChance.`);

          // Pioche immédiate
          const extra = this.drawCard();
          if (extra) return await this.applyCardToPlayer(player, extra, "secondChance-extraDraw");
          return { alive: true, flip7: false };
        } else {
          // Donne à un autre joueur actif sans SC, sinon défausse
          const other = this.players.find((p) => p.active && !p.secondChance);
          if (other) {
            other.secondChance = true;
            this.logger.log(`[SECOND CHANCE] ${player.name} en avait déjà : donnée à ${other.name}.`);
          } else {
            this.logger.log(`[SECOND CHANCE] Personne ne peut la recevoir : défaussée.`);
          }
          return { alive: true, flip7: false };
        }
      }

      if (action === "FlipThree") {
        const target = await this.chooseTargetPlayer(true);
        if (!target) return { alive: true, flip7: false };

        this.logger.log(`[FLIP THREE] ${target.name} doit retourner 3 cartes.`);
        const pendingActions = [];

        for (let i = 1; i <= 3; i++) {
          if (!target.active) break;

          const c = this.drawCard();
          if (!c) break;

          this.logger.log(`[FLIP THREE] Pioche ${i}/3 pour ${target.name}: ${c.toString()}`);

          if (c.type === "action") {
            pendingActions.push(c);
            this.discard(c);
          } else {
            const res = await this.applyCardToPlayer(target, c, "flipThree");
            if (!res.alive) break;
            if (res.flip7) return { alive: true, flip7: true };
          }
        }

        // Résolution actions en attente
        for (const actCard of pendingActions) {
          this.logger.log(`[PENDING ACTION] Résolution de ${actCard.toString()} après FlipThree.`);
          const carrier = this.players.find((p) => p.active);
          if (!carrier) break;

          const res = await this.applyCardToPlayer(carrier, actCard, "flipThree-pendingAction");
          if (res.flip7) return { alive: true, flip7: true };
        }

        return { alive: true, flip7: false };
      }

      return { alive: true, flip7: false };
    }

    return { alive: true, flip7: false };
  }

  // --------------------------------------------------------------------------
  // Distribution initiale
  // --------------------------------------------------------------------------
  async initialDeal() {
    this.logger.log("[ROUND] Distribution initiale : 1 carte par joueur.");

    for (const p of this.players) {
      if (!p.active) continue;
      const card = this.drawCard();
      if (!card) continue;

      // Si action pendant deal => résoudre immédiatement
      const res = await this.applyCardToPlayer(p, card, "initialDeal");
      if (res.flip7) return true;
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // Un tour complet
  // --------------------------------------------------------------------------
  async playRound(roundNumber) {
    this.logger.separator();
    this.logger.log(`[ROUND ${roundNumber}] Début du tour. Donneur = ${this.players[this.dealerIndex].name}`);

    // reset round state
    this.players.forEach((p) => p.resetRoundState());

    // initial deal
    let roundEndedByFlip7 = await this.initialDeal();
    let flip7Winner = null;

    while (!roundEndedByFlip7) {
      const activePlayers = this.players.filter((p) => p.active);
      if (activePlayers.length === 0) break;

      for (const p of activePlayers) {
        if (!p.active) continue;

        this.logger.log("");
        this.logger.log(`[TURN] ${p.name} joue. État: ${this.roundStateString(p)}`);

        // ------------------ MODE INTERACTIF ------------------
        if (this.mode === "interactive") {
          // On autorise :
          // - h : hit (tirer)
          // - s : stay (s'arrêter)
          // - a : demander conseil à l'IA (ne joue pas à la place)
          while (true) {
            const ans = await this.ask(`${p.name} : (h)it / (s)tay / (a)dvice ? `);
            const choice = ans.trim().toLowerCase();

            if (choice.startsWith("a")) {
              const adv = this.computeAdviceForPlayer(p);
              this.logger.log(
                `[IA] Conseil: ${adv.suggestion} | ${adv.reason}\n` +
                  `    P(bust)≈${adv.details.pBustRaw} | stay=${adv.details.scoreStay} | E(hit)≈${adv.details.expectedHitScore} | deck=${adv.details.remainingCards}\n` 
                  
              );
              // Après l'avis, on redemande une action
              continue;
            }

            if (choice.startsWith("s")) {
              p.active = false;
              this.logger.log(`[STAY] ${p.name} reste. Il ne piochera plus ce tour.`);
              break;
            }

            // Par défaut : hit
            const card = this.drawCard();
            if (!card) {
              this.logger.log("[DECK] Plus de cartes disponibles. Fin du tour forcée.");
              p.active = false;
              break;
            }

            const res = await this.applyCardToPlayer(p, card, "hit");
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
        // (utile pour tester rapidement sans entrer d'inputs)
        let choice = "h";
        if (p.countDistinctNumbers() >= this.autoTarget) {
          choice = "s";
          this.logger.log(`[AUTO] ${p.name} atteint ${p.countDistinctNumbers()} nombres (>=${this.autoTarget}) => STAY`);
        } else {
          this.logger.log(`[AUTO] ${p.name} a ${p.countDistinctNumbers()} nombres (<${this.autoTarget}) => HIT`);
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

        const res = await this.applyCardToPlayer(p, card, "hit");
        if (res.flip7) {
          roundEndedByFlip7 = true;
          flip7Winner = p;
          break;
        }
      }
    }

    // scoring
    this.logger.log("");
    this.logger.log(`[ROUND ${roundNumber}] Scoring...`);

    for (const p of this.players) {
      const flip7Bonus = flip7Winner && flip7Winner.name === p.name;
      const roundScore = p.computeRoundScore(flip7Bonus);
      p.totalScore += roundScore;

      this.logger.log(
        `[SCORE] ${p.name} : scoreTour=${roundScore} | total=${p.totalScore} | eliminated=${p.eliminated} | nombres=[${p.numbers.join(
          ", "
        )}] | x2=${p.hasX2} | +bonus=${p.plusBonus}`
      );

      // SecondChance non utilisée est perdue en fin de tour
      p.secondChance = false;
    }

    // dealer next
    this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
  }

  // --------------------------------------------------------------------------
  // Start game loop
  // --------------------------------------------------------------------------
  async start() {
    this.logger.separator();
    this.logger.log("[GAME] Démarrage Flip 7 (CLI).");
    this.logger.log(`[GAME] Joueurs: ${this.players.map((p) => p.name).join(", ")}`);
    if (this.mode === "interactive") {
      this.logger.log("[GAME] Mode interactif : tape 'a' pour demander un conseil IA à ton tour.");
    } else {
      this.logger.log(`[GAME] Mode auto : seuil=${this.autoTarget}`);
    }

    let roundNumber = 1;

    while (true) {
      await this.playRound(roundNumber);

      // Fin de partie si >= 200 à la fin d'un tour
      if (this.players.some((p) => p.totalScore >= 200)) break;
      roundNumber++;
    }

    // winner
    this.logger.separator();
    this.logger.log("[GAME] Fin de partie : un joueur a atteint 200+.");
    const sorted = [...this.players].sort((a, b) => b.totalScore - a.totalScore);
    const winner = sorted[0];

    this.logger.log(`[WINNER] ${winner.name} avec ${winner.totalScore} points.`);
    this.logger.log("[RANKING] Classement final :");
    sorted.forEach((p, i) => this.logger.log(`  ${i + 1}) ${p.name} - ${p.totalScore}`));

    this.logger.separator();
    this.rl.close();
  }
}

module.exports = Game;
