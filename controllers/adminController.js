import User from "../models/User.js";
import Recruiter from "../models/Recruiter.js";

// 📄 1️⃣ Liste des recruteurs en attente
export const getPendingRecruiters = async (req, res) => {
  try {
    const pending = await User.find({
      role: "recruteur",
      statutValidation: "en attente",
    })
      .select("-motDePasse")
      .sort({ createdAt: -1 });
    res.json(pending);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ✅ 2️⃣ Valider un recruteur
export const validateRecruiter = async (req, res) => {
  try {
    const { id } = req.params;
    const recruiter = await User.findById(id);

    if (!recruiter || recruiter.role !== "recruteur")
      return res.status(404).json({ msg: "Recruteur introuvable" });

    recruiter.statutValidation = "validé";
    await recruiter.save();

    res.json({ msg: "Recruteur validé avec succès ✅" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ❌ 3️⃣ Rejeter un recruteur
export const rejectRecruiter = async (req, res) => {
  try {
    const { id } = req.params;
    const recruiter = await User.findById(id);

    if (!recruiter || recruiter.role !== "recruteur")
      return res.status(404).json({ msg: "Recruteur introuvable" });

    recruiter.statutValidation = "rejeté";
    await recruiter.save();

    res.json({ msg: "Recruteur rejeté ❌" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
