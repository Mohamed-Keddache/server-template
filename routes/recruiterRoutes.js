import express from "express";
import auth from "../middleware/auth.js";
import { authRole } from "../middleware/roles.js";
import { uploadImage } from "../config/multer.js";
import {
  createOffer,
  getMyOffers,
  updateOffer,
  deactivateOffer,
  getOfferApplications,
  updateApplicationStatus,
  updateRecruiterProfile,
} from "../controllers/recruiterController.js";

const router = express.Router();

// Appliquer l'authentification et la restriction de rôle à toutes les routes
router.use(auth, authRole(["recruteur"]));

// Gestion du profil entreprise
router.put("/profile", updateRecruiterProfile);

// Gestion des offres (CRUD)
router.post("/offers", uploadImage.single("photo"), createOffer);
router.get("/my-offers", getMyOffers);
router.put("/offers/:id", updateOffer);
router.put("/offers/:id/deactivate", deactivateOffer);

// Gestion des candidatures
router.get("/offers/:offerId/applications", getOfferApplications);
router.put("/applications/:appId/status", updateApplicationStatus);

export default router;
