const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  // On cherche le token dans l'en-tête 'Authorization'
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format attendu: "Bearer TOKEN"

  // Si le token n'existe pas, on refuse l'accès
  if (token == null) {
    return res.status(401).json({ message: "Accès non autorisé : Token manquant" });
  }

  // On vérifie la validité du token
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    // Si le token est invalide (expiré, signature incorrecte, etc.)
    if (err) {
      console.log(err); // Affiche l'erreur dans la console du serveur pour le débogage
      return res.status(403).json({ message: "Accès interdit : Token invalide" });
    }

    // Si tout est bon, on attache les infos de l'utilisateur à l'objet `req`
    req.user = user;

    // On passe à la suite (la logique de la route protégée)
    next();
  });
}

module.exports = authenticateToken;