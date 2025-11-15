import express from "express";
const router = express.Router();

router.get("/", (req, res) => {
  res.send("✅ API Offres d'emploi prête");
});

export default router;
