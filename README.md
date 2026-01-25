# Flip 7 (CLI) – Projet JavaScript / Node.js

Implémentation **fonctionnelle** du jeu de cartes **Flip 7** en **ligne de commande** (terminal).  
Le projet permet de jouer en **mode interactif** (hit/stay) ou en **mode automatique** (pour tester rapidement).

---

## Sommaire
- [Règles du jeu](#règles-du-jeu)
- [Cartes du jeu](#cartes-du-jeu)
- [Déroulé d’un tour](#déroulé-dun-tour)
- [Scoring](#scoring)
- [Installation et lancement](#installation-et-lancement)
- [Structure du projet](#structure-du-projet)
- [Logs](#logs)
- [Notes d’implémentation](#notes-dimplémentation)

---

## Règles du jeu

### Objectif
Le but est d’être le premier à **atteindre 200 points** pour déclencher le **scoring final** (la partie s’arrête à la fin du tour), puis le **joueur avec le plus de points gagne**.
### Points importants
- Les points proviennent principalement de la **somme des cartes Nombres** devant le joueur.
- Si un joueur parvient à retourner **7 cartes numérotées distinctes** (Flip 7), le tour se termine immédiatement et ce joueur gagne **+15 points** de bonus.
- Si un joueur retourne une **carte Nombre déjà présente** dans sa rangée, il est **éliminé du tour** et marque **0 point** pour ce tour (sauf s’il utilise une **Seconde chance**).
- La carte **0** ne vaut aucun point.

---

## Cartes du jeu

### Cartes Nombres (deck spécial)
Le deck contient :
- douze **12**, onze **11**, dix **10**, … jusqu’à **1**, et même un **0**.
(Plus un nombre est élevé, plus il y a d’exemplaires de ce nombre dans le jeu.)

### Cartes Action
- **Freeze (GEL)** : le joueur ciblé perd ses points accumulés et est **éliminé pour le reste du tour**.
- **Flip Three (TROIS)** : le joueur ciblé doit accepter **3 nouvelles cartes**. Le jeu s’arrête si ce joueur atteint Flip 7 pendant cette séquence.
- Si des actions apparaissent pendant ces 3 cartes, elles sont **résolues après** la pioche de la séquence (ou après la perte du joueur).
- **Second Chance (Seconde chance)** : le joueur **conserve** cette carte, pioche immédiatement une autre carte, et peut l’utiliser pour **annuler un doublon** en défaussant le doublon + la seconde chance. Un joueur ne peut en avoir **qu’une seule** à la fois. Toutes les secondes chances non utilisées sont **défaussées en fin de tour**.
### Cartes Modificateur (score)
- **+2, +4, +6, +8, +10** : ajoute la valeur indiquée au total du joueur.
- **x2** : double uniquement la somme des **cartes Nombres** (ne double pas les bonus +2/+4/…).

---

## Déroulé d’un tour

1. On mélange le jeu et on choisit un **donneur**.
2. Le donneur distribue **1 carte face visible** à chaque joueur, y compris lui-même. 
   - Si une carte **Action** sort pendant la distribution : on **interrompt immédiatement** pour la résoudre, puis on reprend.
3. Ensuite, chaque joueur (à tour de rôle) choisit :
   - **Hit** : recevoir une nouvelle carte
   - **Stay** : s’arrêter et “banquer” ses points du tour.
4. Le tour se termine si :
   - Il n’y a plus de joueurs actifs (tous éliminés ou tous ont stay), **ou**
   - Un joueur réalise un **Flip 7** (fin immédiate du tour).

---

## Scoring
Pour un joueur non éliminé :
1. somme des **cartes Nombres**
2. appliquer **x2** si présent (uniquement sur la somme des nombres)
3. ajouter les bonus **+2…+10**
4. si Flip 7 : ajouter **+15** 

---

## Installation et lancement

### Prérequis
- **Node.js** installé (ex: `node -v` doit répondre)

### Lancer le jeu
Depuis la racine du projet :

```bash
node index.js
