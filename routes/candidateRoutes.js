import express from "express";
import auth from "../middleware/auth.js";
import { authRole } from "../middleware/roles.js";
import { uploadCV } from "../config/multer.js";

import {
  updateProfile,
  uploadCandidateCV,
  deleteCV,
  applyToOffer,
  getHistorique,
  updateAccount,
  getProfile,
  addToFavorites,
  removeFromFavorites,
  getFavorites,
} from "../controllers/candidateController.js";

const router = express.Router();

//Appliquer middleware global pour sécuriser toutes les routes
router.use(auth, authRole(["candidat"]));

//Compléter ou mettre à jour le profil du candidat
router.put("/profil", updateProfile);

//Upload / suppression des CV
router.post("/upload-cv", uploadCV.single("cv"), uploadCandidateCV);
router.delete("/delete-cv/:cvId", deleteCV);

//Postuler à une offre
router.post("/postuler", applyToOffer);

//Historique des candidatures
router.get("/historique", getHistorique);

//Modifier les infos de compte
router.put("/compte", updateAccount);

// Voir son profil
router.get("/profil", getProfile);

// gestion des favoris
router.get("/favorites", getFavorites);
router.post("/favorites/:offerId", addToFavorites);
router.delete("/favorites/:offerId", removeFromFavorites);

export default router;
