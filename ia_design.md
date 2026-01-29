# IA Design – Flip 7 (IA probabiliste conseillère)

## 1) Objectif de l’IA
Cette IA est une **IA conseillère** (pas un joueur automatique).
En mode interactif, le joueur peut taper `a` pour demander :
- une recommandation **HIT** (tirer) ou **STAY** (s’arrêter)
- des informations quantitatives : probabilité de bust, score actuel si stay, espérance si hit.

L’IA est conçue pour être :
- **simple à expliquer**
- **testable** (résultats reproductibles)
- **basée sur des probabilités réelles du deck** (distribution non uniforme).

---

## 2) Idée principale : comparer STAY vs HIT par espérance
À un tour donné, on calcule deux quantités :

### (A) Score si STAY maintenant
Le joueur s’arrête immédiatement : son score de tour est celui déjà accumulé.
Noté :

**S_stay = scoreTourActuel**

Ce score dépend des cartes actuelles :
- somme des nombres
- multiplicateur x2 sur la somme des nombres
- bonus +2/+4/... ajoutés
- +15 si Flip 7 atteint (rare car déjà fini)

---

### (B) Espérance de score si HIT (un coup à l’avance)
On modélise le prochain tirage comme un tirage uniforme parmi les **cartes restantes** dans la pioche.

Notations :
- Le deck restant contient `N` cartes
- Chaque carte `c` a une probabilité `P(c) = count(c) / N`

On calcule :

**E_hit = Σ_{c ∈ deckRestant} P(c) × S_after(c)**

où `S_after(c)` est le score qu’aurait le joueur **après** avoir tiré cette carte `c`
(en ne regardant que l’impact immédiat d’UNE carte).

---

## 3) Calcul de S_after(c) selon le type de carte

### 3.1) Carte Nombre (0..12)
Cas 1 : nombre **nouveau** (pas déjà dans la rangée du joueur)
- on ajoute ce nombre à la liste
- le score augmente car la somme des nombres augmente
- si ça fait passer à 7 nombres distincts → +15 (Flip 7)

Cas 2 : nombre **doublon**
- normalement => élimination => score = 0
- sauf si le joueur a une `SecondChance`
  - on suppose qu’il l’utilise pour annuler le doublon
  - score inchangé (et SecondChance consommée)

Donc :
- si doublon et pas de SecondChance ⇒ **S_after = 0**
- si doublon et SecondChance ⇒ **S_after ≈ S_stay** (sans la seconde chance)

---

### 3.2) Carte Modificateur
- `x2` : double uniquement la somme des cartes nombres
- `+v` : ajoute au bonus total

Donc `S_after` est recalculé avec ces paramètres modifiés.

---

### 3.3) Carte Action (Freeze / FlipThree / SecondChance)
Dans l’IA, les actions sont traitées comme **ne modifiant pas le score immédiat**
car leur valeur dépend du contexte des autres joueurs (stratégique, difficile à chiffrer simplement).

Donc, pour une action :
- **S_after(c) ≈ S_stay**

Cette simplification est assumée pour garder une IA :
- stable
- explicable
- testable

---

## 4) Probabilité de bust (doublon)
L’IA affiche aussi un indicateur simple : la probabilité brute de bust au prochain tirage.

Le bust survient si on tire un **nombre déjà présent**.
Si le joueur possède l’ensemble `A` de nombres déjà retournés, et que dans le deck restant,
il reste `count(v)` cartes de valeur `v`, alors le nombre total de cartes "dangereuses" est :

**D = Σ_{v ∈ A} count(v)**

La probabilité brute de bust est alors :

**P_bust = D / N**

Remarque :
- si `SecondChance = true`, le bust est “moins grave” car il peut être annulé une fois.
- l’IA le prend en compte dans `S_after` (doublon => pas forcément 0).

---

## 5) Décision finale : HIT ou STAY
La règle de décision est :

- si **E_hit > S_stay** ⇒ conseiller **HIT**
- sinon ⇒ conseiller **STAY**

L’IA affiche :
- `P_bust`
- `S_stay`
- `E_hit`
- `N` (taille du deck restant)

---

## 6) Pourquoi une IA probabiliste est pertinente sur Flip 7
Flip 7 a une particularité : la distribution des nombres est **non uniforme** :
- 12 est très fréquent, 1 est très rare, etc.
Donc le risque de doublon n’est pas constant et dépend :
- des nombres déjà tirés
- des cartes restantes dans la pioche

L’approche probabiliste exploite exactement ce point :
- plus on a déjà de nombres, plus le risque de doublon augmente
- mais si on a surtout des nombres rares, le risque peut rester faible
- l’IA s’adapte à l’état réel du deck (ce qui est mieux qu’une règle fixe).

---

## 7) Limites assumées (et pourquoi c’est OK)
- IA "one-step" : ne simule qu’un seul hit (pas toute la suite du tour)
- ignore la valeur stratégique des actions sur les autres joueurs

Ces limites sont acceptées car :
- elles rendent l’IA simple à expliquer à l’oral
- elles évitent une explosion de complexité
- elles permettent un résultat concret et démontrable (extension réaliste en temps limité)

---

## 8) Tests simples possibles
- Lancer plusieurs parties en mode interactif et comparer :
  - décisions humaines vs conseils
  - fréquence des bust
  - score moyen de tour
- (optionnel) Mode auto “suivre l’IA” pour faire des statistiques rapidement.
