# IPC / Design – Projet Flip 7 (Node.js CLI)

## 1. Objectif du projet
Le projet implémente une version **fonctionnelle** du jeu de cartes **Flip 7** en JavaScript (Node.js) dans un environnement **CLI**.
Le but principal est de garantir un jeu jouable : création du deck, tours, actions, scoring, fin de partie.

Le projet inclut une extension : une **IA probabiliste conseillère** (en mode interactif).

---

## 2. Architecture et découpage du code

### 2.1 Modules
- `src/Card.js`
  - Représente une carte générique : `type` ∈ {number, action, modifier} et `value`.
  - Fournit `toString()` pour un affichage/log clair.

- `src/Deck.js`
  - Construit le deck **spécifique Flip 7** (quantités non uniformes).
  - Mélange avec Fisher-Yates.
  - Fournit `draw()`.

- `src/Player.js`
  - Stocke l’état d’un joueur :
    - `numbers` (nombres distincts du tour)
    - `hasX2`, `plusBonus`
    - `secondChance`
    - `active`, `eliminated`
    - `totalScore`
  - Fournit `computeRoundScore()`.

- `src/Logger.js`
  - Log console + fichier `logs/game_history.txt`.

- `src/Game.js`
  - Orchestrateur : déroule les tours, gère les actions, applique les cartes, calcule les scores.
  - Contient la logique de l’IA conseillère.

### 2.2 Pourquoi cette architecture
- **Lisibilité / maintenabilité** : chaque fichier a une responsabilité simple.
- **Testabilité** : la logique du deck et du scoring est isolée et peut être vérifiée facilement.
- **Évolutivité** : les extensions (IA, réseau TCP, GUI) peuvent se brancher sur `Game` sans tout réécrire.

---

## 3. Choix d’implémentation : CLI avant UI
Le choix d’une interface CLI permet :
- une exécution rapide (`node index.js`)
- des logs lisibles
- une mise au point sans dépendance graphique

Une GUI peut être ajoutée ensuite, mais le MVP CLI garantit déjà la conformité aux règles.

---

## 4. Extension : IA probabiliste conseillère

### 4.1 Objectif
En mode interactif, à chaque tour, un joueur peut demander un conseil en tapant `a` :
- l’IA affiche une recommandation : **HIT** ou **STAY**
- l’IA affiche des détails : probabilité de bust, score stay, espérance du hit.

L’IA **ne joue pas à la place du joueur** : elle est un outil d’aide à la décision.

### 4.2 Pourquoi une IA probabiliste
Flip 7 est fortement basé sur le **risque de doublon**.
Comme le deck n’a pas une distribution uniforme (12 est très fréquent, 1 est rare), une approche probabiliste est pertinente :
- le risque de bust dépend des nombres déjà présents ET des cartes restantes.

### 4.3 Modèle utilisé (simple et testable)
- On considère le prochain tirage comme un tirage uniforme parmi les cartes restantes dans `this.deck.cards`.
- On calcule :
  - `scoreStay`: score si on s’arrête maintenant.
  - `E(hit)`: espérance de score si on tire UNE carte maintenant puis qu’on s’arrête.
- On simule virtuellement l’effet de chaque type de carte :
  - Nombre :
    - nouveau nombre → augmente la somme
    - doublon → bust (=0) sauf si `secondChance` (consommée)
  - Modificateur :
    - `x2` double uniquement la somme des nombres
    - `+v` ajoute au bonus
  - Actions :
    - conservées dans le jeu réel, mais leur "valeur stratégique" est ignorée dans l’espérance
    - (Freeze/FlipThree affectent d’autres joueurs, difficile à quantifier proprement dans un MVP)

Bonus Flip7 :
- si le tirage amène le 7e nombre distinct → +15 dans le score virtuel.

### 4.4 Limites assumées
- "One-step lookahead" : l’IA ne prévoit qu’un coup à l’avance, ce qui rend le modèle simple et robuste.
- Les actions sont neutres dans le calcul (score inchangé).
Ces limites sont documentées car elles rendent l’IA **testable** et **compréhensible**.

---

## 5. Pourquoi faire l’IA avant le TCP multi-machines
### 5.1 IA : facile à implémenter et tester
- 100% local : aucun problème réseau.
- Test immédiat : on lance des parties et on compare le conseil à l’issue.
- Peu de code : une fonction de calcul + un input utilisateur (`a`).

### 5.2 TCP : plus risqué et plus long
- Il faut définir une architecture serveur/clients (qui est maître du jeu).
- Il faut un protocole (messages JSON, tours, ACK, etc.).
- Il faut gérer pare-feu, ports, IP, latence, désynchronisation.
Le debug réseau est plus long et peut échouer pour des raisons non liées au code (environnement).

Conclusion : faire l’IA d’abord maximise la probabilité d’avoir une extension réussie et démontrable.

---

## 6. GUI vs TCP : lequel est plus facile ?
### GUI (sur une machine)
- Plus simple que TCP si l’objectif est seulement de rendre le jeu plus agréable visuellement.
- Pas de synchronisation réseau.
- Mais demande une refonte de l’IO (event-loop, boutons, affichage, etc.).

### TCP (deux machines)
- Plus complexe car il faut synchroniser un même état de partie entre deux programmes.
- Requiert un protocole et une robustesse réseau.

Conclusion :
- Une GUI locale est **souvent plus simple** qu’un TCP multi-machines.
- Le TCP est plus “impressionnant”, mais plus coûteux et fragile à tester.

---

## 7. Pistes d’amélioration
- IA multi-steps (simuler plusieurs hits en avance)
- Ajouter une valeur aux actions dans l’espérance (ex: SecondChance = réduction de risque)
- Interface graphique (Electron / Web / terminal enrichi)
- Mode réseau TCP : serveur maître + clients affichage/entrée
