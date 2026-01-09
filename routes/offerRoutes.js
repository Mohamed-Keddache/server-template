import express from "express";
import {
  getAllActiveOffers,
  getOfferDetails,
} from "../controllers/offerController.js";

const router = express.Router();

// Récupérer toutes les offres (avec filtres et recherche)
router.get("/", getAllActiveOffers);

// Récupérer les détails d'une offre spécifique
router.get("/:id", getOfferDetails);

export default router;
