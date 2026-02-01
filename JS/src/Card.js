// src/Card.js
// =======================================================
// Carte générique du jeu Flip 7.
//
// type:
//  - "number"    : cartes 0..12 (avec les quantités spéciales)
//  - "action"    : "Freeze", "FlipThree", "SecondChance"
//  - "modifier"  : "x2" ou +2/+4/+6/+8/+10 (ici value = nombre)
// =======================================================

class Card {
  constructor(type, value = null) {
    this.type = type;
    this.value = value;
  }

  // Représentation lisible pour affichage / logs
  toString() {
    if (this.type === "number") return `${this.value}`;
    if (this.type === "action") return `[ACTION: ${this.value}]`;
    if (this.type === "modifier") {
      if (this.value === "x2") return `[MOD: x2]`;
      return `[MOD: +${this.value}]`;
    }
    return `[UNKNOWN]`;
  }
}

module.exports = Card;
