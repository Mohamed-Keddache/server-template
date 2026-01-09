import User from "../models/User.js";
import Recruiter from "../models/Recruiter.js";
import Candidate from "../models/Candidate.js";
import Offer from "../models/Offer.js";
import Admin from "../models/Admin.js";
import Notification from "../models/Notification.js";
import Application from "../models/Application.js";
import Company from "../models/Company.js";
import bcrypt from "bcryptjs";
import SupportTicket from "../models/SupportTicket.js";
import AdminLog, { logAdminAction } from "../models/AdminLog.js";

export const getRecruiters = async (req, res) => {
  try {
    const {
      status, // "pending", "requests_sent", "decision_made", ou un statut spécifique
      page = 1,
      limit = 20,
      search,
    } = req.query;

    let query = {};

    // Gestion des filtres d'onglets
    if (status === "pending") {
      query.status = { $in: ["pending_validation", "pending_revalidation"] };
    } else if (status === "requests_sent") {
      query.status = {
        $in: [
          "pending_info",
          "pending_documents",
          "pending_info_and_documents",
        ],
      };
    } else if (status === "decision_made") {
      query.status = { $in: ["validated", "rejected"] };
    } else if (status) {
      // Filtrage précis (ex: juste "pending_info")
      query.status = status;
    }

    // Pour la recherche, on doit d'abord trouver les Users correspondants
    if (search) {
      const users = await User.find({
        $or: [
          { nom: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }).select("_id");

      const userIds = users.map((u) => u._id);

      // On cherche aussi les entreprises correspondantes
      const companies = await Company.find({
        name: { $regex: search, $options: "i" },
      }).select("_id");
      const companyIds = companies.map((c) => c._id);

      query.$or = [
        { userId: { $in: userIds } },
        { companyId: { $in: companyIds } },
      ];
    }

    const skip = (page - 1) * limit;

    const recruiters = await Recruiter.find(query)
      .populate({
        path: "userId",
        select: "nom email createdAt",
      })
      .populate("companyId", "name status logo")
      .sort({ createdAt: -1 }) // Tri par défaut
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Recruiter.countDocuments(query);

    // Enrichissement des données pour le frontend
    const enriched = recruiters
      .filter((r) => r.userId !== null)
      .map((r) => ({
        _id: r._id,
        userId: r.userId._id,
        nom: r.userId.nom,
        email: r.userId.email,
        createdAt: r.userId.createdAt, // Date d'inscription

        // Info Entreprise
        entrepriseId: r.companyId?._id,
        entreprise: r.companyId?.name || "Inconnue",
        entrepriseStatus: r.companyId?.status,
        entrepriseLogo: r.companyId?.logo,
        entrepriseDetails: r.companyId,

        position: r.position,
        telephone: r.telephone || "Non renseigné", // AJOUTÉ
        recruiterStatus: r.status,
        isAdmin: r.isAdmin,
        rejectionReason: r.rejectionReason,

        // Important pour l'historique et les réponses
        validationRequests: r.validationRequests,

        // Pour calculer "Il y a X jours" dans l'onglet 2
        lastRequestDate:
          r.validationRequests.length > 0
            ? r.validationRequests[r.validationRequests.length - 1].createdAt
            : null,
      }));

    res.json({
      data: enriched,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// 2. AJOUTER cette fonction pour l'onglet 2 "Annuler la demande"
export const cancelValidationRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const recruiter = await Recruiter.findById(id);
    if (!recruiter) {
      return res.status(404).json({ msg: "Recruteur introuvable" });
    }

    // On remet le statut à pending_validation
    recruiter.status = "pending_validation";

    // On marque les demandes en attente comme annulées (optionnel, ou on les supprime)
    // Ici on vide les demandes non traitées pour nettoyer
    recruiter.validationRequests = recruiter.validationRequests.filter(
      (req) => req.status !== "pending"
    );

    await recruiter.save();

    await logAdminAction(
      req.user.id,
      "recruiter_request_canceled",
      { type: "recruiter", id: recruiter._id },
      {},
      req
    );

    res.json({ msg: "Demande annulée, recruteur replacé en attente ✅" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// 3. AJOUTER cette fonction pour récupérer une entreprise spécifique (Détail)
export const getCompanyDetailsAdmin = async (req, res) => {
  try {
    const { companyId } = req.params;
    const company = await Company.findById(companyId);

    if (!company)
      return res.status(404).json({ msg: "Entreprise introuvable" });

    // Statistiques rapides
    const recruiterCount = await Recruiter.countDocuments({ companyId });
    const offerCount = await Offer.countDocuments({ companyId });

    res.json({
      ...company.toObject(),
      stats: {
        recruiters: recruiterCount,
        offers: offerCount,
      },
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ✅ Valider un recruteur
export const validateRecruiter = async (req, res) => {
  try {
    const { id } = req.params;

    // Trouver le recruteur
    let recruiter = await Recruiter.findById(id).populate("companyId");
    if (!recruiter) {
      recruiter = await Recruiter.findOne({ userId: id }).populate("companyId");
    }

    if (!recruiter) {
      return res.status(404).json({ msg: "Recruteur introuvable" });
    }

    const user = await User.findById(recruiter.userId);
    if (!user) {
      return res.status(404).json({ msg: "Utilisateur introuvable" });
    }

    // Valider le recruteur
    recruiter.status = "validated";

    // ✨ NOUVEAU : Vérifier si c'est le premier recruteur validé de l'entreprise
    const existingAdmins = await Recruiter.countDocuments({
      companyId: recruiter.companyId._id,
      status: "validated",
      isAdmin: true,
    });

    // Si aucun admin n'existe ET que l'entreprise a été créée par un admin (statut "active" dès la création)
    if (existingAdmins === 0 && recruiter.companyId.status === "active") {
      recruiter.isAdmin = true;
      recruiter.permissions.editCompany = true;
      recruiter.permissions.manageTeam = true;

      // Notifier le recruteur qu'il est admin d'entreprise
      await Notification.create({
        userId: user._id,
        message: `Félicitations ! Vous êtes le premier recruteur validé de "${recruiter.companyId.name}" et devenez automatiquement administrateur de l'entreprise.`,
        type: "validation",
      });
    }

    await recruiter.save();

    // Notification standard
    await Notification.create({
      userId: user._id,
      message:
        "Félicitations ! Votre compte recruteur a été validé. Vous pouvez maintenant publier des offres.",
      type: "validation",
    });

    await logAdminAction(
      req.user.id,
      "recruiter_validated",
      { type: "recruiter", id: recruiter._id },
      { isFirstAdmin: recruiter.isAdmin },
      req
    );

    res.json({
      msg: "Recruteur validé avec succès ✅",
      isCompanyAdmin: recruiter.isAdmin,
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// Rejeter un recruteur
export const rejectRecruiter = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    let recruiter = await Recruiter.findById(id);
    if (!recruiter) {
      recruiter = await Recruiter.findOne({ userId: id });
    }

    if (!recruiter) {
      return res.status(404).json({ msg: "Recruteur introuvable" });
    }

    // CORRECTION : mettre à jour uniquement Recruiter.status
    recruiter.status = "rejected";
    recruiter.rejectionReason = message || "Non spécifiée";
    await recruiter.save();

    await Notification.create({
      userId: recruiter.userId,
      message: `Votre compte recruteur a été rejeté. Raison : ${
        message || "Non spécifiée"
      }`,
      type: "alerte",
    });

    await logAdminAction(
      req.user.id,
      "recruiter_rejected",
      { type: "recruiter", id: recruiter._id },
      { reason: message },
      req
    );

    res.json({ msg: "Recruteur rejeté ❌" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

export const getAllAdmins = async (req, res) => {
  try {
    const admins = await Admin.find()
      .populate("userId", "nom email createdAt")
      .populate("createdBy", "nom")
      .sort({ createdAt: -1 });

    res.json(admins);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
export const suspendAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, until } = req.body;

    if (id === req.user.id) {
      return res
        .status(400)
        .json({ msg: "Vous ne pouvez pas vous suspendre vous-même." });
    }

    const targetAdmin = await Admin.findOne({ userId: id });
    if (!targetAdmin) {
      return res.status(404).json({ msg: "Admin introuvable" });
    }

    if (targetAdmin.label === "super_admin") {
      return res
        .status(403)
        .json({ msg: "Impossible de suspendre un super admin" });
    }

    targetAdmin.status = "suspended";
    targetAdmin.suspensionReason = reason;
    targetAdmin.suspendedUntil = until ? new Date(until) : null;
    await targetAdmin.save();

    await logAdminAction(
      req.user.id,
      "admin_suspended",
      { type: "admin", id: targetAdmin._id },
      { reason, until },
      req
    );

    res.json({ msg: "Administrateur suspendu ⛔" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

export const getPendingCompanies = async (req, res) => {
  try {
    const companies = await Company.find({ status: "pending" }).sort({
      createdAt: -1,
    });
    res.json(companies);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

export const validateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const company = await Company.findByIdAndUpdate(
      id,
      { status: "active" },
      { new: true }
    );

    if (!company)
      return res.status(404).json({ msg: "Entreprise introuvable" });

    res.json({ msg: "Entreprise validée avec succès ✅", company });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

export const rejectCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const company = await Company.findByIdAndUpdate(
      id,
      { status: "rejected" },
      { new: true }
    );

    if (!company)
      return res.status(404).json({ msg: "Entreprise introuvable" });

    res.json({ msg: "Entreprise rejetée ❌", company });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// GESTION DES ADMINS

export const createAdmin = async (req, res) => {
  try {
    const { nom, email, motDePasse, forceVerify } = req.body; // Ajout de forceVerify

    const exist = await User.findOne({ email });
    if (exist) return res.status(400).json({ msg: "Email déjà utilisé" });

    const hash = await bcrypt.hash(motDePasse, 10);

    // Par défaut, un admin créé par un autre admin est vérifié, sauf si spécifié autrement
    const emailVerified = forceVerify !== undefined ? forceVerify : true;

    const user = await User.create({
      nom,
      email,
      motDePasse: hash,
      role: "admin",
      statutValidation: "validé",
      emailVerified: emailVerified,
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

    // CORRECTION : utiliser accountStatus
    user.accountStatus = "banned";
    user.suspensionReason = raison || "Non respect des conditions.";
    await user.save();

    await Notification.create({
      userId: user._id,
      message: `Votre compte a été désactivé. Raison : ${
        raison || "Non respect des conditions."
      }`,
      type: "alerte",
    });

    await logAdminAction(
      req.user.id,
      "user_banned",
      { type: "user", id: user._id },
      { reason: raison },
      req
    );

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

    if (user.role === "admin") {
      return res.status(400).json({ msg: "Action inutile sur un admin." });
    }

    // CORRECTION : utiliser accountStatus
    if (user.accountStatus === "active") {
      return res.status(400).json({ msg: "Cet utilisateur n'est pas banni." });
    }

    user.accountStatus = "active";
    user.suspensionReason = undefined;
    user.suspendedUntil = undefined;
    await user.save();

    await Notification.create({
      userId: user._id,
      message:
        "Bonne nouvelle ! Votre compte a été réactivé par l'administration. Vous pouvez à nouveau vous connecter.",
      type: "info",
    });

    await logAdminAction(
      req.user.id,
      "user_unbanned",
      { type: "user", id: user._id },
      {},
      req
    );

    res.json({ msg: `L'utilisateur ${user.nom} a été débanni et réactivé ✅` });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// getAllUsers()
export const getAllUsers = async (req, res) => {
  try {
    const {
      role,
      status,
      search,
      wilaya,
      proposable,
      emailVerified,
      page = 1,
      limit = 20,
    } = req.query;

    /* =========================
       1. Construction de la requête User
    ========================== */
    let query = {};
    if (role) query.role = role;
    if (status) query.accountStatus = status;
    if (emailVerified) query.emailVerified = emailVerified === "true";

    if (search) {
      query.$or = [
        { nom: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    /* =========================
       2. Récupération des users
    ========================== */
    const [users, total] = await Promise.all([
      User.find(query)
        .select("-motDePasse")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(query),
    ]);

    const userIds = users.map((u) => u._id);

    /* =========================
       3. Récupération candidats & recruteurs
    ========================== */
    const [candidates, recruiters] = await Promise.all([
      Candidate.find({ userId: { $in: userIds } })
        .select(
          "userId telephone residence autoriserProposition desiredPosition"
        )
        .lean(),
      Recruiter.find({ userId: { $in: userIds } })
        .populate("companyId", "name")
        .select("userId status companyId")
        .lean(),
    ]);

    const candidateMap = new Map(
      candidates.map((c) => [c.userId.toString(), c])
    );
    const recruiterMap = new Map(
      recruiters.map((r) => [r.userId.toString(), r])
    );

    /* =========================
       4. Comptage des offres par recruteur
    ========================== */
    const recruiterIds = recruiters.map((r) => r._id);
    const offerCounts = await Offer.aggregate([
      { $match: { recruteurId: { $in: recruiterIds } } },
      { $group: { _id: "$recruteurId", count: { $sum: 1 } } },
    ]);

    const offerCountMap = new Map(
      offerCounts.map((o) => [o._id.toString(), o.count])
    );

    /* =========================
       5. Enrichissement des users
    ========================== */
    let enriched = users.map((u) => {
      const userId = u._id.toString();
      let details = {};

      if (u.role === "candidat") {
        const cand = candidateMap.get(userId);
        if (cand) {
          details = {
            telephone: cand.telephone,
            wilaya: cand.residence?.wilaya || null,
            autoriserProposition: cand.autoriserProposition,
            poste: cand.desiredPosition,
          };
        }
      }

      if (u.role === "recruteur") {
        const rec = recruiterMap.get(userId);
        if (rec) {
          details = {
            entreprise: rec.companyId?.name || "Inconnue",
            recruiterStatus: rec.status,
            offres: offerCountMap.get(rec._id.toString()) || 0,
          };
        }
      }

      return {
        ...u,
        accountStatus: u.accountStatus,
        details,
      };
    });

    /* =========================
       6. Filtres avancés (post-enrichissement)
    ========================== */
    if (wilaya) {
      enriched = enriched.filter(
        (u) =>
          u.details?.wilaya &&
          u.details.wilaya.toLowerCase() === wilaya.toLowerCase()
      );
    }

    if (proposable === "true") {
      enriched = enriched.filter(
        (u) => u.details?.autoriserProposition === true
      );
    }

    /* =========================
       7. Réponse finale
    ========================== */
    res.json({
      data: enriched,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// ADMIN ENVOIE MESSAGE À UN USER

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

// SUPPRESSION D'UNE OFFRE

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

// getGlobalStats adapté
export const getGlobalStats = async (req, res) => {
  try {
    const now = new Date();
    const fifteenMinutesAgo = new Date(now - 15 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
      onlineUsers,
      totalUsers,
      newUsersThisMonth,
      usersByRole,
      totalOffres,
      offresActives,
      pendingOffers,
      newOffersThisMonth,
      applicationStats,
      pendingRecruiters,
      pendingCompanies,
      openTickets,
      recentAdminActions,
    ] = await Promise.all([
      User.countDocuments({ derniereConnexion: { $gt: fifteenMinutesAgo } }),
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
      Offer.countDocuments(),
      Offer.countDocuments({ actif: true, validationStatus: "approved" }),
      Offer.countDocuments({ validationStatus: "pending" }),
      Offer.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Application.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      // CORRECTION : compter par Recruiter.status
      Recruiter.countDocuments({
        status: { $in: ["pending_validation", "pending_revalidation"] },
      }),
      Company.countDocuments({ status: "pending" }),
      SupportTicket.countDocuments({
        status: { $in: ["open", "in_progress"] },
      }),
      AdminLog.find()
        .populate("adminId", "nom")
        .sort({ createdAt: -1 })
        .limit(10),
    ]);

    const roleMap = {};
    usersByRole.forEach((r) => {
      roleMap[r._id] = r.count;
    });

    const statsCandidatures = {};
    applicationStats.forEach((s) => {
      statsCandidatures[s._id] = s.count;
    });

    const pendingTasks = {
      recruiters: pendingRecruiters,
      companies: 0, // also remove pendingCompanies from total,
      offers: pendingOffers,
      tickets: openTickets,
      total: pendingRecruiters + pendingOffers + openTickets,
    };

    res.json({
      users: {
        online: onlineUsers,
        total: totalUsers,
        newThisMonth: newUsersThisMonth,
        byRole: roleMap,
      },
      offres: {
        total: totalOffres,
        actives: offresActives,
        pending: pendingOffers,
        newThisMonth: newOffersThisMonth,
      },
      candidatures: statsCandidatures,
      pendingTasks,
      recentAdminActions,
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

export const getTrends = async (req, res) => {
  try {
    const { period = "30" } = req.query;
    const days = parseInt(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [rawUsers, rawOffers, rawApplications] = await Promise.all([
      // 1. Users : On garde le format brut MongoDB
      User.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: {
              date: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),

      // 2. Offers
      Offer.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
      ]),

      // 3. Applications
      Application.aggregate([
        { $match: { datePostulation: { $gte: startDate } } },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$datePostulation" },
            },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    // --- TRANSFORMATION DES DONNÉES POUR LE FRONTEND ---

    // 1. Initialiser une Map pour toutes les dates de la période (pour éviter les trous)
    const statsMap = new Map();
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0]; // Format YYYY-MM-DD

      statsMap.set(dateStr, {
        date: dateStr,
        users: 0,
        offers: 0,
        applications: 0,
      });
    }

    // 2. Remplir avec les données Users
    rawUsers.forEach((u) => {
      // u._id.date car c'est un objet dans votre agrégation user
      const date = u._id.date;
      if (statsMap.has(date)) {
        statsMap.get(date).users += u.count;
      }
    });

    // 3. Remplir avec les données Offers
    rawOffers.forEach((o) => {
      const date = o._id; // String directe
      if (statsMap.has(date)) {
        statsMap.get(date).offers += o.count;
      }
    });

    // 4. Remplir avec les données Applications
    rawApplications.forEach((a) => {
      const date = a._id; // String directe
      if (statsMap.has(date)) {
        statsMap.get(date).applications += a.count;
      }
    });

    // 5. Convertir la Map en tableau et trier par date croissante
    const chartData = Array.from(statsMap.values()).sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    res.json({
      data: chartData, // C'est ce tableau que le graph va utiliser
      period: days,
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// 1. Lister les offres nécessitant une intervention manuelle
export const getManualSelectionOffers = async (req, res) => {
  try {
    const {
      minProposals,
      maxProposals,
      startDate,
      endDate,
      sortBy = "datePublication", // ou 'lastModified'
    } = req.query;

    // 1. Pipeline d'agrégation initial
    const pipeline = [
      {
        $match: {
          actif: true,
          candidateSearchMode: "manual", // Correction du nom du champ
          validationStatus: "approved",
        },
      },
    ];

    // 2. Filtre par date (Publication)
    if (startDate || endDate) {
      const dateFilter = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) dateFilter.$lte = new Date(endDate);
      pipeline[0].$match.datePublication = dateFilter;
    }

    // 3. Jointure avec les applications pour compter les propositions admin
    pipeline.push({
      $lookup: {
        from: "applications",
        let: { offerId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$offerId", "$$offerId"] },
                  { $eq: ["$recommandeParAdmin", true] }, // On compte SEULEMENT les propositions admin
                ],
              },
            },
          },
          { $count: "count" },
        ],
        as: "adminProposals",
      },
    });

    // 4. Transformer le résultat du lookup en un nombre utilisable
    pipeline.push({
      $addFields: {
        proposalCount: {
          $ifNull: [{ $arrayElemAt: ["$adminProposals.count", 0] }, 0],
        },
      },
    });

    // 5. Filtre par nombre de candidats proposés (0, 1-5, >5, range)
    if (minProposals !== undefined || maxProposals !== undefined) {
      const countMatch = {};
      if (minProposals !== undefined) countMatch.$gte = parseInt(minProposals);
      if (maxProposals !== undefined) countMatch.$lte = parseInt(maxProposals);
      pipeline.push({ $match: { proposalCount: countMatch } });
    }

    // 6. Jointure pour récupérer les infos Recruteur et Entreprise (Populate like)
    pipeline.push(
      {
        $lookup: {
          from: "recruiters",
          localField: "recruteurId",
          foreignField: "_id",
          as: "recruteur",
        },
      },
      { $unwind: "$recruteur" },
      {
        $lookup: {
          from: "companies",
          localField: "companyId",
          foreignField: "_id",
          as: "company",
        },
      },
      { $unwind: "$company" }
    );

    // 7. Tri
    let sortStage = {};
    if (sortBy === "lastModified") {
      sortStage = { updatedAt: -1 };
    } else {
      sortStage = { datePublication: -1 };
    }
    pipeline.push({ $sort: sortStage });

    // 8. Exécution
    const offers = await Offer.aggregate(pipeline);

    res.json(offers);
  } catch (err) {
    console.error("Erreur Manual Matching:", err);
    res.status(500).json({ msg: err.message });
  }
};

// 2. PROPOSER UN CANDIDAT (L'Admin "postule" à la place du candidat)
export const proposeCandidateToOffer = async (req, res) => {
  try {
    const { candidatId, offreId } = req.body;

    const offer = await Offer.findById(offreId).populate("recruteurId");
    if (!offer) return res.status(404).json({ msg: "Offre introuvable" });

    // On cherche le candidat
    let candidate = await Candidate.findById(candidatId).populate("userId");
    if (!candidate)
      candidate = await Candidate.findOne({ userId: candidatId }).populate(
        "userId"
      );
    if (!candidate)
      return res.status(404).json({ msg: "Candidat introuvable" });

    if (!candidate.userId.emailVerified)
      return res.status(400).json({ msg: "Email candidat non vérifié." });
    if (!candidate.autoriserProposition)
      return res
        .status(403)
        .json({ msg: "Ce candidat refuse les propositions." });

    // Vérification existence application
    const existingApp = await Application.findOne({
      offerId: offreId,
      candidateId: candidate._id,
    });
    if (existingApp) return res.status(400).json({ msg: "Déjà positionné." });

    const lastCv =
      candidate.cvs.length > 0
        ? candidate.cvs[candidate.cvs.length - 1].url
        : "No CV";

    // Création Application
    await Application.create({
      offerId: offreId,
      candidateId: candidate._id,
      cvUrl: lastCv,
      status: "proposé",
      recommandeParAdmin: true,
      coverLetter: "Recommandation Admin",
    });

    offer.nombreCandidatures += 1;
    await offer.save();

    // 7. Notifications
    if (offer.recruteurId && offer.recruteurId.userId) {
      await Notification.create({
        userId: offer.recruteurId.userId,
        message: `L'administrateur vous propose un candidat idéal (${candidate.userId.nom}) pour votre offre "${offer.titre}".`,
        type: "validation",
      });
    }

    await Notification.create({
      userId: candidate.userId._id,
      message: `Bonne nouvelle ! Votre profil a été recommandé par un administrateur pour l'offre "${offer.titre}".`,
      type: "info",
    });

    res.json({ msg: "Candidat proposé avec succès ✅" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: err.message });
  }
};
export const getAdminLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      adminId,
      action,
      startDate,
      endDate,
    } = req.query;

    let query = {};
    if (adminId) query.adminId = adminId;
    if (action) query.action = action;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const logs = await AdminLog.find(query)
      .populate("adminId", "nom email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await AdminLog.countDocuments(query);

    res.json({
      data: logs,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

export const getPendingOffers = async (req, res) => {
  try {
    const { page = 1, limit = 20, sortBy = "createdAt" } = req.query;

    const offers = await Offer.find({ validationStatus: "pending" })
      .populate("companyId", "name logo")
      .populate({
        path: "recruteurId",
        select: "userId position",
        populate: { path: "userId", select: "nom email" },
      })
      .sort({ [sortBy]: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Offer.countDocuments({ validationStatus: "pending" });

    res.json({
      data: offers,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

export const approveOffer = async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await Offer.findById(id).populate("recruteurId");
    if (!offer) return res.status(404).json({ msg: "Offre introuvable." });

    offer.validationStatus = "approved";
    offer.actif = true;
    offer.datePublication = new Date();
    offer.validationHistory.push({
      status: "approved",
      adminId: req.user.id,
    });
    await offer.save();

    // Notifier le recruteur
    if (offer.recruteurId && offer.recruteurId.userId) {
      await Notification.create({
        userId: offer.recruteurId.userId,
        message: `Votre offre "${offer.titre}" a été approuvée et est maintenant visible.`,
        type: "validation",
      });
    }

    await logAdminAction(
      req.user.id,
      "offer_approved",
      { type: "offer", id: offer._id },
      {},
      req
    );

    res.json({ msg: "Offre approuvée ✅", offer });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

export const rejectOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, requestChanges } = req.body;

    const offer = await Offer.findById(id).populate("recruteurId");
    if (!offer) return res.status(404).json({ msg: "Offre introuvable." });

    offer.validationStatus = requestChanges ? "changes_requested" : "rejected";
    offer.rejectionReason = reason;
    offer.validationHistory.push({
      status: offer.validationStatus,
      message: reason,
      adminId: req.user.id,
    });
    await offer.save();

    const msgType = requestChanges
      ? `Des modifications sont demandées pour votre offre "${offer.titre}": ${reason}`
      : `Votre offre "${offer.titre}" a été refusée: ${reason}`;

    if (offer.recruteurId && offer.recruteurId.userId) {
      await Notification.create({
        userId: offer.recruteurId.userId,
        message: msgType,
        type: "alerte",
      });
    }

    await logAdminAction(
      req.user.id,
      requestChanges ? "offer_changes_requested" : "offer_rejected",
      { type: "offer", id: offer._id },
      { reason },
      req
    );

    res.json({
      msg: requestChanges ? "Modifications demandées." : "Offre refusée.",
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

export const requestRecruiterDocuments = async (req, res) => {
  try {
    const { recruiterId } = req.params;
    const { type, message, requiredDocuments, requiredFields } = req.body;

    const recruiter = await Recruiter.findById(recruiterId).populate("userId");
    if (!recruiter) {
      return res.status(404).json({ msg: "Recruteur introuvable." });
    }

    // CORRECTION : mettre à jour le status correctement
    recruiter.status =
      type === "document" ? "pending_documents" : "pending_info";
    recruiter.validationRequests.push({
      type,
      message,
      requiredDocuments,
      requiredFields,
      status: "pending",
    });
    await recruiter.save();

    await Notification.create({
      userId: recruiter.userId._id,
      message: `Action requise : ${message}`,
      type: "alerte",
    });

    await logAdminAction(
      req.user.id,
      "recruiter_documents_requested",
      { type: "recruiter", id: recruiter._id },
      { requestType: type, message },
      req
    );

    res.json({ msg: "Demande envoyée au recruteur ✅" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

export const updateAdminPermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;

    const targetAdmin = await Admin.findOne({ userId: id });
    if (!targetAdmin) {
      return res.status(404).json({ msg: "Admin introuvable" });
    }

    // Empêcher la modification du super_admin
    if (targetAdmin.label === "super_admin") {
      return res.status(403).json({
        msg: "Impossible de modifier les permissions d'un super admin",
      });
    }

    targetAdmin.permissions = { ...targetAdmin.permissions, ...permissions };
    await targetAdmin.save();

    await logAdminAction(
      req.user.id,
      "admin_permissions_updated",
      { type: "admin", id: targetAdmin._id },
      { newPermissions: permissions },
      req
    );

    res.json({ msg: "Permissions mises à jour ✅", admin: targetAdmin });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

export const updateAdminLabel = async (req, res) => {
  try {
    const { id } = req.params;
    const { label } = req.body;

    const validLabels = [
      "super_admin",
      "support",
      "technical",
      "operational",
      "recruitment",
      "moderation",
      "product",
    ];

    if (!validLabels.includes(label)) {
      return res.status(400).json({ msg: "Label invalide" });
    }

    const targetAdmin = await Admin.findOne({ userId: id });
    if (!targetAdmin) {
      return res.status(404).json({ msg: "Admin introuvable" });
    }

    const oldLabel = targetAdmin.label;
    targetAdmin.label = label;
    await targetAdmin.save();

    await logAdminAction(
      req.user.id,
      "admin_label_changed",
      { type: "admin", id: targetAdmin._id },
      { oldLabel, newLabel: label },
      req
    );

    res.json({ msg: "Label mis à jour ✅", admin: targetAdmin });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

/**
 * Créer une entreprise directement (admin)
 */
export const createCompanyByAdmin = async (req, res) => {
  try {
    const { name, website, description, industry, location, size, logo } =
      req.body;

    if (!name) {
      return res
        .status(400)
        .json({ msg: "Le nom de l'entreprise est obligatoire." });
    }

    // Vérifier si l'entreprise existe déjà
    const existingCompany = await Company.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
    });

    if (existingCompany) {
      return res
        .status(400)
        .json({ msg: "Une entreprise avec ce nom existe déjà." });
    }

    // Créer l'entreprise avec le statut "active" (pré-validée)
    const company = await Company.create({
      name,
      website,
      description,
      industry,
      location,
      size,
      logo,
      status: "active", // Déjà validée par l'admin
    });

    await logAdminAction(
      req.user.id,
      "company_created_by_admin",
      { type: "company", id: company._id },
      { name },
      req
    );

    res.status(201).json({
      msg: "Entreprise créée avec succès ✅",
      company,
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

/**
 * Voir tous les recruteurs d'une entreprise (admin)
 */
export const getCompanyRecruiters = async (req, res) => {
  try {
    const { companyId } = req.params;

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ msg: "Entreprise introuvable." });
    }

    const recruiters = await Recruiter.find({ companyId })
      .populate("userId", "nom email createdAt")
      .sort({ isAdmin: -1, createdAt: 1 }); // Admins en premier

    res.json({
      company: {
        _id: company._id,
        name: company.name,
        status: company.status,
      },
      recruiters,
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

/**
 * Assigner un administrateur d'entreprise (admin)
 */
export const assignCompanyAdmin = async (req, res) => {
  try {
    const { companyId, recruiterId } = req.body;

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ msg: "Entreprise introuvable." });
    }

    const recruiter = await Recruiter.findById(recruiterId).populate("userId");
    if (!recruiter) {
      return res.status(404).json({ msg: "Recruteur introuvable." });
    }

    // Vérifier que le recruteur appartient à cette entreprise
    if (recruiter.companyId.toString() !== companyId) {
      return res.status(400).json({
        msg: "Ce recruteur n'appartient pas à cette entreprise.",
      });
    }

    // Vérifier que le recruteur est validé
    if (recruiter.status !== "validated") {
      return res.status(400).json({
        msg: "Le recruteur doit être validé avant de devenir administrateur.",
      });
    }

    // Assigner le statut d'admin
    recruiter.isAdmin = true;
    recruiter.permissions.editCompany = true;
    recruiter.permissions.manageTeam = true;
    await recruiter.save();

    // Notifier le recruteur
    await Notification.create({
      userId: recruiter.userId._id,
      message: `Vous êtes maintenant administrateur de l'entreprise "${company.name}".`,
      type: "validation",
    });

    await logAdminAction(
      req.user.id,
      "company_admin_assigned",
      { type: "recruiter", id: recruiter._id },
      { companyId, companyName: company.name },
      req
    );

    res.json({
      msg: `${recruiter.userId.nom} est maintenant administrateur de ${company.name} ✅`,
      recruiter,
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

/**
 * Retirer le statut d'administrateur d'entreprise (admin)
 */
export const removeCompanyAdmin = async (req, res) => {
  try {
    const { recruiterId } = req.params;

    const recruiter = await Recruiter.findById(recruiterId)
      .populate("userId")
      .populate("companyId");

    if (!recruiter) {
      return res.status(404).json({ msg: "Recruteur introuvable." });
    }

    if (!recruiter.isAdmin) {
      return res.status(400).json({
        msg: "Ce recruteur n'est pas administrateur d'entreprise.",
      });
    }

    // Retirer le statut d'admin
    recruiter.isAdmin = false;
    recruiter.permissions.editCompany = false;
    recruiter.permissions.manageTeam = false;
    await recruiter.save();

    // Notifier le recruteur
    await Notification.create({
      userId: recruiter.userId._id,
      message: `Vous n'êtes plus administrateur de l'entreprise "${recruiter.companyId.name}".`,
      type: "info",
    });

    await logAdminAction(
      req.user.id,
      "company_admin_removed",
      { type: "recruiter", id: recruiter._id },
      {
        companyId: recruiter.companyId._id,
        companyName: recruiter.companyId.name,
      },
      req
    );

    res.json({
      msg: `${recruiter.userId.nom} n'est plus administrateur ⚠️`,
      recruiter,
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

/**
 * Modifier une entreprise (admin)
 */
export const updateCompanyByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, website, description, industry, location, size, logo } =
      req.body;

    const company = await Company.findByIdAndUpdate(
      id,
      { name, website, description, industry, location, size, logo },
      { new: true }
    );

    if (!company) {
      return res.status(404).json({ msg: "Entreprise introuvable." });
    }

    await logAdminAction(
      req.user.id,
      "company_updated_by_admin",
      { type: "company", id: company._id },
      { updates: req.body },
      req
    );

    res.json({ msg: "Entreprise mise à jour ✅", company });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// === controllers/adminController.js ===

export const requestMultipleValidationItems = async (req, res) => {
  try {
    const { recruiterId } = req.params;
    const { requests } = req.body;

    const recruiter = await Recruiter.findById(recruiterId).populate("userId");
    if (!recruiter) {
      return res.status(404).json({ msg: "Recruteur introuvable." });
    }

    // Ajouter les demandes à l'historique
    requests.forEach((request) => {
      recruiter.validationRequests.push({
        type: request.type,
        message: request.message,
        requiredDocuments: request.requiredDocuments || 0,
        requiredFields: request.requiredFields || [],
        status: "pending",
      });
    });

    // --- LOGIQUE DE DÉTECTION DU STATUT ---
    const hasDocRequest = requests.some((r) => r.type === "document");
    const hasInfoRequest = requests.some((r) => r.type === "information");

    if (hasDocRequest && hasInfoRequest) {
      recruiter.status = "pending_info_and_documents"; // Cas Mixte
    } else if (hasDocRequest) {
      recruiter.status = "pending_documents"; // Cas Documents seulement
    } else if (hasInfoRequest) {
      recruiter.status = "pending_info"; // Cas Info seulement
    } else {
      // Sécurité, ne devrait pas arriver si le frontend envoie bien des requêtes
      return res.status(400).json({ msg: "Aucune demande valide reçue." });
    }
    // --------------------------------------

    await recruiter.save();

    await Notification.create({
      userId: recruiter.userId._id,
      message: `Action requise : Des informations ou documents vous sont demandés.`,
      type: "alerte",
    });

    await logAdminAction(
      req.user.id,
      "recruiter_multiple_requests",
      { type: "recruiter", id: recruiter._id },
      { requestCount: requests.length, newStatus: recruiter.status },
      req
    );

    res.json({
      msg: `Demandes envoyées. Statut mis à jour vers : ${recruiter.status} ✅`,
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
// === controllers/adminController.js ===

export const getAllCompanies = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;

    let query = {};

    // 1. Filtre par statut (ex: ne voir que les 'active')
    if (status) {
      query.status = status;
    }

    // 2. Recherche intelligente (Nom OU Industrie)
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } }, // "i" pour ignorer majuscules/minuscules
        { industry: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    const companies = await Company.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Company.countDocuments(query);

    // Ajout du nombre de recruteurs pour l'affichage (optionnel)
    const enrichedCompanies = await Promise.all(
      companies.map(async (company) => {
        const recruitersCount = await Recruiter.countDocuments({
          companyId: company._id,
        });
        return {
          ...company.toObject(),
          recruitersCount,
        };
      })
    );

    res.json({
      data: enrichedCompanies,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
export const getOfferDetailsAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    // On ne filtre PAS sur actif: true, car l'admin doit tout voir
    const offer = await Offer.findById(id)
      .populate("companyId", "name logo status website location")
      .populate({
        path: "recruteurId",
        select: "userId position status telephone",
        populate: { path: "userId", select: "nom email" },
      });

    if (!offer) return res.status(404).json({ msg: "Offre introuvable." });

    res.json(offer);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
export const updateOfferByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    // On met à jour sans vérifier si c'est le créateur de l'offre
    const offer = await Offer.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true }
    );

    if (!offer) return res.status(404).json({ msg: "Offre introuvable" });

    // Log de l'action
    await logAdminAction(
      req.user.id,
      "offer_updated_by_admin",
      { type: "offer", id: offer._id },
      { updates: req.body },
      req
    );

    res.json({ msg: "Offre modifiée par l'admin ✅", offer });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
export const toggleOfferVisibility = async (req, res) => {
  try {
    const { id } = req.params;
    const { actif } = req.body; // true ou false

    const offer = await Offer.findByIdAndUpdate(
      id,
      { actif: actif },
      { new: true }
    );

    if (!offer) return res.status(404).json({ msg: "Offre introuvable" });

    await logAdminAction(
      req.user.id,
      actif ? "offer_activated_admin" : "offer_deactivated_admin",
      { type: "offer", id: offer._id },
      {},
      req
    );

    res.json({
      msg: `Offre ${actif ? "activée" : "désactivée"} avec succès`,
      offer,
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
// Dans adminController.js
export const getCandidateDetailsAdmin = async (req, res) => {
  const candidate = await Candidate.findById(req.params.id).populate("userId");
  res.json(candidate);
};
