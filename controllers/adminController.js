import User from "../models/User.js";
import Recruiter from "../models/Recruiter.js";
import Candidate from "../models/Candidate.js";
import Offer from "../models/Offer.js";
import Admin from "../models/Admin.js";
import Notification from "../models/Notification.js";
import bcrypt from "bcryptjs";

// 1️⃣ GESTION DES RECRUTEURS

// 📄 Liste des recruteurs en attente
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

// ✅ Valider un recruteur
export const validateRecruiter = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user || user.role !== "recruteur")
      return res.status(404).json({ msg: "Recruteur introuvable" });

    user.statutValidation = "validé";
    await user.save();

    await Notification.create({
      userId: user._id,
      message: "Félicitations ! Votre compte recruteur a été validé.",
      type: "validation",
    });
    res.json({ msg: "Recruteur validé avec succès ✅" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ❌ Rejeter un recruteur
export const rejectRecruiter = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    const recruiter = await User.findById(id);
    if (!recruiter || recruiter.role !== "recruteur")
      return res.status(404).json({ msg: "Recruteur introuvable" });

    recruiter.statutValidation = "rejeté";
    await recruiter.save();

    const raison = message || "Non spécifiée";
    await Notification.create({
      userId: recruiter._id,
      message: `Votre compte recruteur a été rejeté. Raison : ${raison}`,
      type: "alerte",
    });

    res.json({ msg: "Recruteur rejeté ❌" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// 2️⃣ GESTION DES ADMINS

export const createAdmin = async (req, res) => {
  try {
    const { nom, email, motDePasse } = req.body;

    const exist = await User.findOne({ email });
    if (exist) return res.status(400).json({ msg: "Email déjà utilisé" });

    const hash = await bcrypt.hash(motDePasse, 10);
    const user = await User.create({
      nom,
      email,
      motDePasse: hash,
      role: "admin",
      statutValidation: "validé",
    });

    await Admin.create({ userId: user._id });

    res.status(201).json({ msg: "Nouvel administrateur créé ✅", admin: user });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

export const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.id)
      return res
        .status(400)
        .json({ msg: "Vous ne pouvez pas vous supprimer vous-même." });

    const adminUser = await User.findById(id);
    if (!adminUser || adminUser.role !== "admin")
      return res.status(404).json({ msg: "Admin introuvable" });

    await User.findByIdAndDelete(id);
    await Admin.findOneAndDelete({ userId: id });

    res.json({ msg: "Administrateur supprimé 🗑️" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// 3️⃣ BANNIR UTILISATEUR

export const banUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { raison } = req.body;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ msg: "Utilisateur introuvable" });
    if (user.role === "admin")
      return res.status(403).json({ msg: "Impossible de bannir un admin." });

    user.statutValidation = "rejeté";
    await user.save();

    await Notification.create({
      userId: user._id,
      message: `Votre compte a été désactivé. Raison : ${
        raison || "Non respect des conditions."
      }`,
      type: "alerte",
    });

    res.json({ msg: `Utilisateur ${user.nom} a été banni ⛔` });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

export const unBanUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ msg: "Utilisateur introuvable" });

    // Vérification de sécurité
    if (user.role === "admin") {
      return res.status(400).json({ msg: "Action inutile sur un admin." });
    }

    if (user.statutValidation === "validé") {
      return res.status(400).json({ msg: "Cet utilisateur n'est pas banni." });
    }

    // On remet le statut à "validé" (Accès rétabli)
    user.statutValidation = "validé";
    await user.save();

    // Notification de bon retour
    await Notification.create({
      userId: user._id,
      message:
        "Bonne nouvelle ! Votre compte a été réactivé par l'administration. Vous pouvez à nouveau vous connecter.",
      type: "info", // ou "validation"
    });

    res.json({ msg: `L'utilisateur ${user.nom} a été débanni et réactivé ✅` });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// 4️⃣ LISTE DES UTILISATEURS AVANCÉE

export const getAllUsers = async (req, res) => {
  try {
    const { role, wilaya, proposable } = req.query;
    let query = {};

    if (role) query.role = role;

    // 1. Récupération des utilisateurs
    let users = await User.find(query)
      .select("-motDePasse")
      .sort({ createdAt: -1 });

    // 2. Enrichissement
    const enriched = await Promise.all(
      users.map(async (u) => {
        let details = {};

        if (u.role === "candidat") {
          const cand = await Candidate.findOne({ userId: u._id });
          if (cand)
            details = {
              wilaya: cand.wilaya,
              telephone: cand.telephone,
              autoriserProposition: cand.autoriserProposition,
            };
        } else if (u.role === "recruteur") {
          const rec = await Recruiter.findOne({ userId: u._id });
          if (rec)
            details = {
              entreprise: rec.entrepriseNom,
              offres: rec.offres.length,
            };
        }

        return { ...u.toObject(), ...details };
      })
    );

    let finalUsers = enriched;

    // 3. Filtre wilaya
    if (wilaya) {
      finalUsers = finalUsers.filter(
        (u) => u.wilaya && u.wilaya.toLowerCase() === wilaya.toLowerCase()
      );
    }

    // 4. Nouveau filtre : proposable=true
    if (proposable === "true") {
      finalUsers = finalUsers.filter((u) => {
        if (u.role === "candidat") {
          return u.autoriserProposition === true;
        }
        return false; // exclut recruteurs & admins
      });
    }

    res.json(finalUsers);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// 5️⃣ ADMIN ENVOIE MESSAGE À UN USER

export const sendMessageToUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    await Notification.create({
      userId: id,
      message: `Message de l'administration : ${message}`,
      type: "info",
    });

    res.json({ msg: "Notification envoyée ✅" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// 6️⃣ SUPPRESSION D'UNE OFFRE + NOTIFICATION

export const deleteOfferAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { motif } = req.body;

    const offer = await Offer.findById(id).populate("recruteurId");
    if (!offer) return res.status(404).json({ msg: "Offre introuvable" });

    // Notifier le recruteur
    if (offer.recruteurId && offer.recruteurId.userId) {
      await Notification.create({
        userId: offer.recruteurId.userId,
        message: `Votre offre "${offer.titre}" a été supprimée. Motif : ${
          motif || "Non conforme"
        }`,
        type: "alerte",
      });
    }

    await Offer.findByIdAndDelete(id);
    await Recruiter.updateOne(
      { _id: offer.recruteurId._id },
      { $pull: { offres: id } }
    );

    res.json({ msg: "Offre supprimée et recruteur notifié 🗑️" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// 7️⃣ STATS GLOBALES

export const getGlobalStats = async (req, res) => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const onlineUsers = await User.countDocuments({
      derniereConnexion: { $gt: fifteenMinutesAgo },
    });

    const candidatesStats = await Candidate.aggregate([
      { $unwind: "$historique" },
      { $group: { _id: "$historique.statut", total: { $sum: 1 } } },
    ]);

    const recruitersStats = await Offer.aggregate([
      { $unwind: "$candidatures" },
      { $group: { _id: "$candidatures.statut", total: { $sum: 1 } } },
    ]);

    const totalOffres = await Offer.countDocuments();
    const offresActives = await Offer.countDocuments({ actif: true });

    const format = (arr) => {
      const r = { en_attente: 0, acceptee: 0, rejetee: 0 };
      arr.forEach((i) => {
        if (i._id === "en attente") r.en_attente = i.total;
        if (i._id.startsWith("accept")) r.acceptee = i.total;
        if (i._id.startsWith("rejet")) r.rejetee = i.total;
      });
      return r;
    };

    res.json({
      online_users: onlineUsers,
      offres: { total: totalOffres, actives: offresActives },
      candidatures_envoyees: format(candidatesStats),
      candidatures_recues: format(recruitersStats),
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
// 1. Lister les offres nécessitant une intervention manuelle
export const getManualSelectionOffers = async (req, res) => {
  try {
    const offers = await Offer.find({
      actif: true,
      typeSelection: "manuelle",
    })
      .populate("recruteurId", "entrepriseNom email")
      .sort({ datePublication: -1 });

    res.json(offers);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// 2. PROPOSER UN CANDIDAT (L'Admin "postule" à la place du candidat)
export const proposeCandidateToOffer = async (req, res) => {
  try {
    const { candidatId, offreId } = req.body;

    // A. Vérifications
    const offer = await Offer.findById(offreId).populate("recruteurId");
    if (!offer) return res.status(404).json({ msg: "Offre introuvable" });
    // you can use user_id or candidat_id for that
    let candidate = await Candidate.findById(candidatId).populate("userId");
    if (!candidate) {
      candidate = await Candidate.findOne({ userId: candidatId }).populate(
        "userId"
      );
    }

    if (candidate.autoriserProposition === false) {
      return res.status(403).json({
        msg: `Impossible : Le candidat ${candidate.userId.nom} refuse d'être proposé manuellement aux recruteurs.`,
      });
    }

    // Vérifier si déjà postulé/proposé
    const dejaPresent = offer.candidatures.some(
      (c) => c.candidatId.toString() === candidatId
    );
    if (dejaPresent)
      return res
        .status(400)
        .json({ msg: "Ce candidat est déjà dans la liste." });

    // Récupérer le dernier CV du candidat (Important !)
    if (candidate.cvs.length === 0) {
      return res
        .status(400)
        .json({ msg: "Ce candidat n'a pas de CV disponible." });
    }
    const lastCv = candidate.cvs[candidate.cvs.length - 1].url;

    // B. Ajouter à l'offre (Marqué comme Admin Choice)
    offer.candidatures.push({
      candidatId: candidate._id,
      cvUrl: lastCv,
      statut: "proposé", // Statut spécial
      recommandeParAdmin: true, // <--- LE FLAG IMPORTANT
      datePostulation: new Date(),
    });

    // C. Mettre à jour l'historique du candidat
    candidate.historique.push({
      offreId: offer._id,
      entreprise: offer.recruteurId.entrepriseNom,
      statut: "en attente", // Pour le candidat, c'est "en attente"
      date: new Date(),
      changements: 0,
    });

    await offer.save();
    await candidate.save();

    // D. Notifications
    // 1. Au Recruteur
    if (offer.recruteurId && offer.recruteurId.userId) {
      await Notification.create({
        userId: offer.recruteurId.userId,
        message: `L'administrateur vous propose un candidat idéal (${candidate.userId.nom}) pour votre offre "${offer.titre}".`,
        type: "validation",
      });
    }

    // 2. Au Candidat (Optionnel : on peut le prévenir qu'on l'a recommandé)
    await Notification.create({
      userId: candidate.userId._id,
      message: `Bonne nouvelle ! Votre profil a été recommandé par un administrateur pour l'offre "${offer.titre}" chez ${offer.recruteurId.entrepriseNom}.`,
      type: "info",
    });

    res.json({ msg: "Candidat proposé avec succès ✅" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
