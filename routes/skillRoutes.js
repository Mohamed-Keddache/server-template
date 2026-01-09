// Dans un fichier routes/skillRoutes.js (à créer) ou ajouté à offerRoutes
import express from "express";
import { getSkills } from "../controllers/skillController.js"; // Fonction définie plus haut
import auth from "../middleware/auth.js";

const router = express.Router();

// Tout le monde connecté peut chercher des skills pour remplir son profil/offre
router.get("/", auth, getSkills);

export default router;
