const jwt = require("jsonwebtoken");
require("dotenv").config();

// C'est notre "garde"
module.exports = function (req, res, next) {
  // 1. Récupérer le token de l'en-tête (header)
  const token = req.header("Authorization");

  // 2. Vérifier si le token n'existe pas
  if (!token) {
    return res
      .status(401)
      .json({ error: "Aucun token, autorisation refusée." });
  }

  // 3. Vérifier la validité du token
  try {
    // Le token est souvent envoyé avec "Bearer " au début, on le retire
    const cleanToken = token.split(" ")[1]; // "Bearer TOKEN" -> "TOKEN"

    // Si le token n'a pas le bon format (pas de "Bearer")
    if (!cleanToken) {
      return res.status(401).json({ error: "Format du token invalide." });
    }

    // Décoder le token en utilisant notre clé secrète
    const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET);

    // 4. Attacher l'utilisateur à la requête
    // Le "payload" de notre token contenait { user: { id: ... } }
    req.user = decoded.user;

    // 5. Passer à la suite (à la vraie route)
    next();
  } catch (err) {
    res.status(401).json({ error: "Token non valide." });
  }
};
