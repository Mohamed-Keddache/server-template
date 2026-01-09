import express from "express";
import auth from "../middleware/auth.js";
import {
  getActiveAnnouncements,
  dismissAnnouncement,
} from "../controllers/announcementController.js";

const router = express.Router();

router.use(auth);

// Récupérer les annonces actives pour l'utilisateur connecté
router.get("/active", getActiveAnnouncements);

// Masquer une annonce
router.post("/:announcementId/dismiss", dismissAnnouncement);

export default router;
