// === middleware/optionalAuth.js ===
import jwt from "jsonwebtoken";

export const optionalAuth = (req, res, next) => {
  const token = req.header("Authorization");

  if (!token) {
    req.user = null; // Pas d'utilisateur connecté
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Utilisateur identifié (Admin, Recruteur ou Candidat)
  } catch (err) {
    req.user = null; // Token invalide, on considère comme visiteur public
  }
  next();
};
