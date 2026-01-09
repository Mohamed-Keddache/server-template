import express from "express";
import auth from "../middleware/auth.js";
import { authRole } from "../middleware/roles.js";
import Admin from "../models/Admin.js";
import {
  // Recruteurs
  getRecruiters,
  validateRecruiter,
  rejectRecruiter,
  requestRecruiterDocuments,
  requestMultipleValidationItems,
  cancelValidationRequest,

  // Utilisateurs
  getAllUsers,
  banUser,
  unBanUser,
  sendMessageToUser,
  getCandidateDetailsAdmin,

  // Admins
  createAdmin,
  deleteAdmin,
  getAllAdmins,
  suspendAdmin,
  updateAdminPermissions,
  updateAdminLabel,

  // Entreprises
  getPendingCompanies,
  validateCompany,
  rejectCompany,
  getCompanyDetailsAdmin,
  getAllCompanies,

  // Offres
  getPendingOffers,
  approveOffer,
  rejectOffer,
  deleteOfferAdmin,
  getManualSelectionOffers,
  proposeCandidateToOffer,
  toggleOfferVisibility,

  // Stats
  getGlobalStats,
  getTrends,
  getAdminLogs,

  // entreprise et admin assignement
  createCompanyByAdmin,
  getCompanyRecruiters,
  assignCompanyAdmin,
  removeCompanyAdmin,
  updateCompanyByAdmin,
  getOfferDetailsAdmin,
  updateOfferByAdmin,
} from "../controllers/adminController.js";

import { createSkill, deleteSkill } from "../controllers/skillController.js";

import {
  createAnnouncement,
  getAllAnnouncements,
  updateAnnouncement,
  deleteAnnouncement,
} from "../controllers/announcementController.js";

import {
  getTicketsByLabel,
  getTicketById,
  respondToTicket,
  reassignTicket,
  closeTicket,
} from "../controllers/adminSupportController.js";

import { uploadAttachments } from "../config/multer.js";

const router = express.Router();

// Middleware global
router.use(auth, authRole(["admin"]));

// Middleware de vérification de permission
const requirePermission = (permission) => async (req, res, next) => {
  try {
    const admin = await Admin.findOne({ userId: req.user.id });

    if (!admin) {
      return res.status(403).json({ msg: "Admin introuvable" });
    }

    if (admin.status !== "active") {
      return res.status(403).json({ msg: "Compte admin suspendu" });
    }

    if (!admin.hasPermission(permission)) {
      return res.status(403).json({
        msg: `Permission "${permission}" requise`,
        code: "PERMISSION_DENIED",
      });
    }

    req.admin = admin;
    next();
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ========== STATISTIQUES ==========
router.get("/stats/global", requirePermission("viewStats"), getGlobalStats);
router.get("/stats/trends", requirePermission("viewStats"), getTrends);

// ========== RECRUTEURS ==========
router.get(
  "/recruteurs",
  requirePermission("validateRecruiters"),
  getRecruiters
);
router.put(
  "/recruteurs/valider/:id",
  requirePermission("validateRecruiters"),
  validateRecruiter
);
router.put(
  "/recruteurs/rejeter/:id",
  requirePermission("validateRecruiters"),
  rejectRecruiter
);
router.post(
  "/recruteurs/:recruiterId/request-documents",
  requirePermission("validateRecruiters"),
  requestRecruiterDocuments
);
router.post(
  "/recruteurs/:recruiterId/request-multiple",
  requirePermission("validateRecruiters"),
  requestMultipleValidationItems
);

router.put(
  "/recruteurs/:id/cancel-request",
  requirePermission("validateRecruiters"),
  cancelValidationRequest
);

// ========== UTILISATEURS ==========
router.get("/users", getAllUsers);
router.put("/users/ban/:id", requirePermission("banUsers"), banUser);
router.put("/users/unban/:id", requirePermission("banUsers"), unBanUser);
router.post(
  "/users/message/:id",
  requirePermission("sendNotifications"),
  sendMessageToUser
);

// ========== ADMINS ==========
router.get("/admins", requirePermission("viewStats"), getAllAdmins);
router.post("/admins", requirePermission("createAdmin"), createAdmin);
router.delete("/admins/:id", requirePermission("deleteAdmin"), deleteAdmin);
router.put(
  "/admins/:id/suspend",
  requirePermission("deleteAdmin"),
  suspendAdmin
);
router.put(
  "/admins/:id/permissions",
  requirePermission("editAdminPermissions"),
  updateAdminPermissions
);
router.put(
  "/admins/:id/label",
  requirePermission("assignAdminLabels"),
  updateAdminLabel
);

// ========== ENTREPRISES ==========
router.get(
  "/entreprises/all",
  requirePermission("validateCompanies"),
  getAllCompanies
);

router.get(
  "/entreprises/en-attente",
  requirePermission("validateCompanies"),
  getPendingCompanies
);
router.put(
  "/entreprises/valider/:id",
  requirePermission("validateCompanies"),
  validateCompany
);
router.put(
  "/entreprises/rejeter/:id",
  requirePermission("validateCompanies"),
  rejectCompany
);

router.get(
  "/entreprises/:companyId",
  requirePermission("validateCompanies"),
  getCompanyDetailsAdmin
);

router.put(
  "/entreprises/:id",
  requirePermission("validateCompanies"),
  updateCompanyByAdmin
);
// ========== OFFRES ==========
router.get(
  "/offres/en-attente",
  requirePermission("validateOffers"),
  getPendingOffers
);
router.put(
  "/offres/:id/approve",
  requirePermission("validateOffers"),
  approveOffer
);
router.put(
  "/offres/:id/reject",
  requirePermission("validateOffers"),
  rejectOffer
);
router.delete(
  "/offres/:id",
  requirePermission("validateOffers"),
  deleteOfferAdmin
);
router.get(
  "/offres/manuelles",
  requirePermission("proposeCandidates"),
  getManualSelectionOffers
);
router.post(
  "/offres/proposer",
  requirePermission("proposeCandidates"),
  proposeCandidateToOffer
);

router.get(
  "/offres/:id/details",
  requirePermission("validateOffers"),
  getOfferDetailsAdmin
);
router.put(
  "/offres/:id/update",
  requirePermission("validateOffers"),
  updateOfferByAdmin
);
router.put(
  "/offres/:id/visibility",
  requirePermission("validateOffers"),
  toggleOfferVisibility
);

// Dans adminRoutes.js
router.get(
  "/candidates/:id",
  requirePermission("viewStats"),
  getCandidateDetailsAdmin
);
// ========== ANNONCES ==========
router.get(
  "/announcements",
  requirePermission("manageAnnouncements"),
  getAllAnnouncements
);
router.post(
  "/announcements",
  requirePermission("manageAnnouncements"),
  createAnnouncement
);
router.put(
  "/announcements/:id",
  requirePermission("manageAnnouncements"),
  updateAnnouncement
);
router.delete(
  "/announcements/:id",
  requirePermission("manageAnnouncements"),
  deleteAnnouncement
);

// ========== SUPPORT TICKETS ==========
router.get(
  "/tickets",
  requirePermission("handleSupportTickets"),
  getTicketsByLabel
);
router.get(
  "/tickets/:ticketId",
  requirePermission("handleSupportTickets"),
  getTicketById
);
router.post(
  "/tickets/:ticketId/respond",
  requirePermission("handleSupportTickets"),
  uploadAttachments.array("attachments", 3),
  respondToTicket
);
router.put(
  "/tickets/:ticketId/reassign",
  requirePermission("handleSupportTickets"),
  reassignTicket
);
router.put(
  "/tickets/:ticketId/close",
  requirePermission("handleSupportTickets"),
  closeTicket
);

// ========== LOGS ==========
router.get("/logs", requirePermission("viewLogs"), getAdminLogs);

// ========== SKILLS ==========
router.post("/skills", createSkill);
router.delete("/skills/:id", deleteSkill);

// ==========================================
// GESTION AVANCÉE DES ENTREPRISES
// ==========================================

// Créer une entreprise directement (admin)
router.post(
  "/entreprises/create",
  requirePermission("validateCompanies"),
  createCompanyByAdmin
);

// Voir tous les recruteurs d'une entreprise
router.get(
  "/entreprises/:companyId/recruiters",
  requirePermission("validateCompanies"),
  getCompanyRecruiters
);

// Assigner un administrateur d'entreprise
router.post(
  "/entreprises/assign-admin",
  requirePermission("validateCompanies"),
  assignCompanyAdmin
);

// Retirer un administrateur d'entreprise
router.delete(
  "/entreprises/remove-admin/:recruiterId",
  requirePermission("validateCompanies"),
  removeCompanyAdmin
);

export default router;
