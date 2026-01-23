function multiple(a,b){
    return a*b
}

console.log(multiple(4,6))

console.log("fin du calcul de la multiplication\n")

console.log("Résultat attendu : " + 24 )

console.log("fin du calcul de la multiplication\n")

function multplieur(a) {
    return function(b) {
        return b*a
    }
}
test = multplieur(4)

console.log(test(6))

console.log("fin du calcul de la multiplication\n")

console.log("OU UTILISATION DIRECTE DE LA FONCTION\n")

console.log((multplieur(4))(6))