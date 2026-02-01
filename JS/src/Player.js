// src/Player.js
// =======================================================
// Représente un joueur et son état pendant un tour.
//
// IMPORTANT (Flip7):
// - "rangée" du joueur = cartes nombres + cartes au-dessus (actions/modifiers)
// - doublon de nombre => éliminé du tour (sauf si SecondChance utilisée)
//
// Ici on stocke séparément :
// - numbers : nombres distincts obtenus ce tour
// - modifiers : liste des modificateurs obtenus ce tour (x2, +2 etc.)
// - secondChance : bool indiquant si le joueur possède une carte seconde chance
//
// totalScore : score total sur la partie (accumulé sur les tours)
// =======================================================

class Player {
  constructor(name) {
    this.name = name;

    // Score total (partie)
    this.totalScore = 0;

    // Reset à chaque tour :
    this.resetRoundState();
  }

  resetRoundState() {
    // Le joueur peut "stay" ou perdre (éliminé) => active=false
    this.active = true;

    // Indique si le joueur est éliminé (par doublon ou Freeze) => score tour = 0
    this.eliminated = false;

    // Nombres distincts du tour
    this.numbers = []; // ex: [12, 7, 2]

    // Modificateurs du tour
    this.hasX2 = false;
    this.plusBonus = 0; // somme des +2/+4/+6... tirés ce tour

    // Seconde chance (au plus 1 devant soi)
    this.secondChance = false;
  }

  // Vérifie si un nombre est déjà présent => doublon
  hasNumber(n) {
    return this.numbers.includes(n);
  }

  // Ajoute un nombre (supposé non doublon)
  addNumber(n) {
    this.numbers.push(n);
  }

  // Applique un modificateur
  applyModifier(modValue) {
    if (modValue === "x2") this.hasX2 = true;
    else this.plusBonus += Number(modValue);
  }

  // Nombre de cartes "nombres" distinctes => pour vérifier Flip7
  countDistinctNumbers() {
    return this.numbers.length;
  }

  // Calcule score du tour (si pas éliminé)
  computeRoundScore(flip7Bonus = false) {
    if (this.eliminated) return 0;

    const sumNumbers = this.numbers.reduce((a, b) => a + b, 0);
    const doubled = this.hasX2 ? sumNumbers * 2 : sumNumbers;
    const base = doubled + this.plusBonus;
    const bonus = flip7Bonus ? 15 : 0;
    return base + bonus;
  }
}

module.exports = Player;
