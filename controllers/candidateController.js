import Candidate from "../models/Candidate.js";
import Offer from "../models/Offer.js";
import User from "../models/User.js";
import { uploadCV } from "../config/multer.js";
import Recruiter from "../models/Recruiter.js";
import Notification from "../models/Notification.js";
import fs from "fs";
import path from "path";

/* 🧱 1. Compléter ou mettre à jour le profil du candidat */
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { telephone, wilaya } = req.body;

    let candidate = await Candidate.findOne({ userId });
    if (!candidate) {
      candidate = new Candidate({ userId, telephone, wilaya });
    } else {
      candidate.telephone = telephone;
      candidate.wilaya = wilaya;
    }

    await candidate.save();
    res.json({ msg: "Profil mis à jour ✅", candidate });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

/* 📁 2. Upload d’un CV (max 3 CV) */
export const uploadCandidateCV = async (req, res) => {
  try {
    const userId = req.user.id;
    const candidate = await Candidate.findOne({ userId });

    if (!candidate) return res.status(404).json({ msg: "Profil introuvable." });
    if (candidate.cvs.length >= 3)
      return res
        .status(400)
        .json({ msg: "Vous ne pouvez pas ajouter plus de 3 CV." });

    // Vérification du score basé sur la taille du fichier
    const fileSize = req.file.size;
    let score = 100;
    if (fileSize < 20 * 1024) score = 0;
    else if (fileSize > 5 * 1024 * 1024) score = 50;

    const cvPath = req.file.path.replace(/\\/g, "/");
    candidate.cvs.push({ url: cvPath, score });
    await candidate.save();

    res.json({
      msg: "CV ajouté avec succès ✅",
      cv: { url: cvPath, score },
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

/* 🗑️ 3.Supprimer un CV */
export const deleteCV = async (req, res) => {
  try {
    const userId = req.user.id;
    const { cvId } = req.params;

    const candidate = await Candidate.findOne({ userId });
    if (!candidate) return res.status(404).json({ msg: "Profil introuvable." });

    const cv = candidate.cvs.id(cvId);
    if (!cv) return res.status(404).json({ msg: "CV introuvable." });

    // Supprimer le fichier physiquement s’il existe
    const filePath = path.join(process.cwd(), cv.url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    // Supprimer du tableau MongoDB
    cv.remove();
    await candidate.save();

    res.json({
      msg: "CV supprimé avec succès 🗑️",
      cvs: candidate.cvs,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: err.message });
  }
};

/* 📋 4. Consulter les offres disponibles */
export const getAllOffers = async (req, res) => {
  try {
    const offers = await Offer.find().populate("recruteurId", "entrepriseNom");
    res.json(offers);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

/* ✉️ 5. Postuler à une offre */
export const applyToOffer = async (req, res) => {
  try {
    const userId = req.user.id;
    const { offreId, cvUrl } = req.body;

    const candidate = await Candidate.findOne({ userId });
    if (!candidate) return res.status(404).json({ msg: "Profil introuvable." });

    // Vérifications profil
    if (!candidate.telephone || !candidate.wilaya)
      return res
        .status(400)
        .json({ msg: "Veuillez compléter votre profil avant de postuler." });

    // Vérification CV
    if (candidate.cvs.length === 0)
      return res
        .status(400)
        .json({ msg: "Veuillez ajouter au moins un CV avant de postuler." });

    // --- ✔ CORRECTION : populate complet du recruteur ---
    const offer = await Offer.findById(offreId).populate("recruteurId");
    if (!offer) return res.status(404).json({ msg: "Offre introuvable." });

    // Vérifier si l'offre est active
    if (!offer.actif)
      return res.status(400).json({ msg: "Cette offre est désactivée." });

    if (!offer.recruteurId) {
      return res
        .status(404)
        .json({ msg: "L'entreprise pour cette offre n'existe plus." });
    }

    // Vérifier si déjà postulé
    const dejaPostule = offer.candidatures.some(
      (c) => c.candidatId.toString() === candidate._id.toString()
    );
    if (dejaPostule)
      return res.status(400).json({
        msg: "Vous avez déjà postulé à cette offre.",
      });

    // Ajouter candidature
    offer.candidatures.push({
      candidatId: candidate._id,
      cvUrl,
      statut: "en attente",
    });

    // Historique candidat
    candidate.historique.push({
      offreId: offer._id,
      entreprise: offer.recruteurId?.entrepriseNom || "Entreprise inconnue",
      statut: "en attente",
      date: new Date(),
      changements: 0,
    });

    await offer.save();
    await candidate.save();

    // --- ✔ AJOUT : créer une notification pour le recruteur ---
    if (offer.recruteurId && offer.recruteurId.userId) {
      await Notification.create({
        userId: offer.recruteurId.userId,
        message: `Vous avez reçu une nouvelle candidature pour votre offre "${offer.titre}".`,
        type: "info",
      });
    }

    res.json({ msg: "Votre candidature a bien été envoyée ✅" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

/* 📜 6. Historique des candidatures*/
export const getHistorique = async (req, res) => {
  try {
    const userId = req.user.id;
    const candidate = await Candidate.findOne({ userId });

    if (!candidate) return res.status(404).json({ msg: "Profil introuvable." });

    const sorted = candidate.historique.sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    res.json(sorted);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
/* 👤 7.Obtenir le profil du candidat connecté */
export const getProfile = async (req, res) => {
  try {
    const candidate = await Candidate.findOne({ userId: req.user.id }).populate(
      "userId",
      "nom email"
    );
    if (!candidate) return res.status(404).json({ msg: "Profil introuvable." });

    res.json({
      msg: "Profil du candidat récupéré ✅",
      profil: candidate,
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

/* 🔑 8. Modifier les infos de compte (mot de passe, nom, etc.) */
export const updateAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const { nom, email, motDePasse } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "Utilisateur introuvable." });

    if (nom) user.nom = nom;
    if (email) user.email = email;
    if (motDePasse) {
      const bcrypt = await import("bcryptjs");
      user.motDePasse = await bcrypt.default.hash(motDePasse, 10);
    }

    await user.save();
    res.json({ msg: "Compte mis à jour ✅" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
