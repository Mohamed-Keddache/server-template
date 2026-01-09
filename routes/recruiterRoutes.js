import express from "express";
import auth from "../middleware/auth.js";
import { optionalAuth } from "../middleware/optionalAuth.js";
import { authRole } from "../middleware/roles.js";
import { requireEmailVerification } from "../middleware/requireEmailVerification.js";
import { uploadImage, uploadAttachments } from "../config/multer.js";
import {
  getRecruiterById,
  createOffer,
  getMyOffers,
  updateOffer,
  deactivateOffer,
  getOfferApplications,
  updateApplicationStatus,
  updateRecruiterProfile,
  updateCompanyDetails,
  getRecruiterDashboard,
  getRecruiterProfileEndpoint,
  getCompanyTeam,
  getOfferStats,
  scheduleInterview,
  submitValidationResponse,
  getCandidateFullProfile,
} from "../controllers/recruiterController.js";

const router = express.Router();
router.get("/public/:id", optionalAuth, getRecruiterById);

router.use(auth, authRole(["recruteur"]));

// Profil
router.get("/profile", getRecruiterProfileEndpoint);
router.put("/profile", updateRecruiterProfile);
router.get("/candidates/:candidateId", getCandidateFullProfile);

// Dashboard
router.get("/dashboard", getRecruiterDashboard);

// Validation - réponse aux demandes admin
router.post(
  "/validation-response",
  uploadAttachments.array("documents", 5),
  submitValidationResponse
);

// Offres
router.post("/offers", requireEmailVerification, createOffer);
router.get("/my-offers", getMyOffers);
router.put("/offers/:id", updateOffer);
router.put("/offers/:id/deactivate", deactivateOffer);
router.get("/offers/:offerId/stats", getOfferStats);

// Candidatures
router.get("/offers/:offerId/applications", getOfferApplications);
router.put("/applications/:appId/status", updateApplicationStatus);
router.post("/applications/:appId/schedule-interview", scheduleInterview);

// Entreprise
router.put("/company", updateCompanyDetails);
router.get("/company/team", getCompanyTeam);

export default router;
