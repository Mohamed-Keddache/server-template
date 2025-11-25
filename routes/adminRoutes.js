import express from "express";
import auth from "../middleware/auth.js";
import { authRole } from "../middleware/roles.js";
import {
  getPendingRecruiters,
  validateRecruiter,
  rejectRecruiter,
  createAdmin,
  deleteAdmin,
  banUser,
  unBanUser,
  getAllUsers,
  sendMessageToUser,
  deleteOfferAdmin,
  getGlobalStats,
  getManualSelectionOffers,
  proposeCandidateToOffer,
} from "../controllers/adminController.js";

const router = express.Router();

// Protection globale : Admin uniquement
router.use(auth, authRole(["admin"]));

// --- DASHBOARD & STATS ---
router.get("/stats/global", getGlobalStats);

// --- GESTION RECRUTEURS (Validation) ---
router.get("/recruteurs/en-attente", getPendingRecruiters);
router.put("/recruteurs/valider/:id", validateRecruiter);
router.put("/recruteurs/rejeter/:id", rejectRecruiter);

// --- GESTION UTILISATEURS (Tout type) ---
router.get("/users", getAllUsers);
router.put("/users/ban/:id", banUser);
router.put("/users/unban/:id", unBanUser);
router.post("/users/message/:id", sendMessageToUser);

// --- GESTION ADMINS ---
router.post("/create", createAdmin);
router.delete("/:id", deleteAdmin);

// --- GESTION OFFRES ---
router.delete("/offres/:id", deleteOfferAdmin);
// Consulter les offres qui attendent l'admin
router.get("/offres/manuelles", getManualSelectionOffers);
// Action : Lier un candidat à une offre
router.post("/offres/proposer", proposeCandidateToOffer);

export default router;
