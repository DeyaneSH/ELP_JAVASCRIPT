l = [1,'a',3,'b',5,'c'];
for(i=0;i<l.length;i++){
    console.log("->", l[i] + "\n");
}

console.log("fin du parcours de la liste\n");

l2 = new Array();
l2.push(10);
l2.push('z');
l2.push(30);
l2.push('y');
l2.forEach((element) =>
    console.log("->", element + "\n"))

console.log("fin du parcours de la liste\n");

const _ = require('lodash');
console.log("Utilisation de la librairie Lodash pour le parcours de la liste\n");
_.sortBy(['a', 'd', 'c', 'd'], 4)
    .forEach((element) => console.log("->", element + "\n"));
    console.log("fin du parcours de la liste\n");

array = [5, 3, 8, 1, 4];
const initialValue = 0;
const sumWithInitial = array.reduce(
    (accumulator, currentValue) => accumulator + currentValue,
    initialValue
);
console.log("Moyenne ->", sumWithInitial/array.length + "\n");
console.log("fin du parcours de la liste\n");


prenom = ["alice", "bob", "charlie", "david"];
for (let e of prenom) {
    e = e.toUpperCase();
    console.log("->", e + "\n");
}
console.log("fin du parcours de la liste\n");

const sumWithInitial2 = array.reduce(
    (accumulator, currentValue) => accumulator + (currentValue - 2),
    initialValue
);
console.log("Moyenne - 2 chaque élément ->", (sumWithInitial2)/5+ "\n");
console.log("fin du parcours de la liste\n");

function arguments() {
     return "Vous avez fourni " + arguments.length + " arguments.";
    }
arguments(1, 2, 3, "toto")
console.log(arguments(1, 2, 3, "toto"));