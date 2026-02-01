// src/Deck.js
// =======================================================
// Deck Flip 7 conforme aux règles :
// - Nombres : 12x12, 11x11, ..., 1x1, et 0x1
// - Actions : Freeze x3, FlipThree x3, SecondChance x3
// - Modifiers : x2 x1, +2/+4/+6/+8/+10 (1 chacun)
// Total = 94 cartes.
//
// Méthodes:
// - shuffle() : Fisher-Yates
// - draw()    : pioche en haut (fin du tableau ici)
// =======================================================

const Card = require("./Card");

class Deck {
  constructor() {
    this.cards = [];
    this.build();
    this.shuffle();
  }

  build() {
    // --- Cartes nombres (quantités spéciales Flip7) ---
    for (let i = 12; i >= 1; i--) {
      for (let k = 0; k < i; k++) {
        this.cards.push(new Card("number", i));
      }
    }
    // Une seule carte 0
    this.cards.push(new Card("number", 0));

    // --- Cartes actions (3 de chaque) ---
    ["Freeze", "FlipThree", "SecondChance"].forEach((a) => {
      for (let i = 0; i < 3; i++) this.cards.push(new Card("action", a));
    });

    // --- Modificateurs ---
    this.cards.push(new Card("modifier", "x2"));
    [2, 4, 6, 8, 10].forEach((v) => this.cards.push(new Card("modifier", v)));
  }

  shuffle() {
    // Fisher-Yates shuffle (uniforme)
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  draw() {
    // Si le deck est vide, on renvoie null (Game gère la reconstitution)
    if (this.cards.length === 0) return null;
    return this.cards.pop();
  }

  size() {
    return this.cards.length;
  }
}

module.exports = Deck;
