import express from "express";
import auth from "../middleware/auth.js";
import { authRole } from "../middleware/roles.js";
import {
  getPendingRecruiters,
  validateRecruiter,
  rejectRecruiter,
} from "../controllers/adminController.js";

const router = express.Router();

router.use(auth, authRole(["admin"]));

router.get("/recruteurs/en-attente", getPendingRecruiters);
router.put("/recruteurs/valider/:id", validateRecruiter);
router.put("/recruteurs/rejeter/:id", rejectRecruiter);

export default router;
