import express from "express";
import auth from "../middleware/auth.js";
import { authRole } from "../middleware/roles.js";
import {
  getAllActiveOffers,
  getOfferDetails,
} from "../controllers/offerController.js";

const router = express.Router();

// Routes accessibles aux candidats et recruteurs connectés
router.get("/", auth, authRole(["candidat", "recruteur"]), getAllActiveOffers);
router.get("/:id", auth, authRole(["candidat", "recruteur"]), getOfferDetails);

export default router;
