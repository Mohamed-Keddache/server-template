import Offer from "../models/Offer.js";
import Recruiter from "../models/Recruiter.js";
import User from "../models/User.js";
import Candidate from "../models/Candidate.js";
import Company from "../models/Company.js";
import Notification from "../models/Notification.js";
import Application from "../models/Application.js";
import Admin from "../models/Admin.js";
import bcrypt from "bcryptjs";

// Fonction utilitaire (peut être déplacée dans utils/)
const getRecruiterProfile = async (userId) => {
  const recruiter = await Recruiter.findOne({ userId }).populate("companyId");
  if (!recruiter) throw new Error("Profil recruteur non trouvé");
  return recruiter;
};

// @route   POST /api/recruiters/offers
// @desc    Créer une nouvelle offre
export const createOffer = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const recruiter = await getRecruiterProfile(req.user.id);

    if (!user.emailVerified) {
      return res.status(403).json({
        msg: "Veuillez confirmer votre email.",
        code: "EMAIL_NOT_VERIFIED",
      });
    }

    if (recruiter.status !== "validated") {
      return res.status(403).json({
        msg: "Votre compte recruteur n'est pas validé.",
        code: "RECRUITER_NOT_VALIDATED",
        recruiterStatus: recruiter.status,
      });
    }

    if (recruiter.companyId.status !== "active") {
      return res.status(403).json({
        msg: "Votre entreprise n'est pas encore validée.",
        code: "COMPANY_NOT_VALIDATED",
      });
    }

    if (!recruiter.permissions.postJobs) {
      return res.status(403).json({
        msg: "Vous n'avez pas la permission de publier des offres.",
        code: "PERMISSION_DENIED",
      });
    }

    const {
      titre,
      description,
      requirements,
      domaine,
      type,
      salaryMin,
      salaryMax,
      experienceLevel,
      skills,
      wilaya,
      visibility,
      candidateSearchMode,
    } = req.body;

    if (!titre || !description || !requirements) {
      return res.status(400).json({
        msg: "Titre, description et requirements sont obligatoires.",
      });
    }

    const newOffer = new Offer({
      recruteurId: recruiter._id,
      companyId: recruiter.companyId._id,
      titre,
      description,
      requirements,
      domaine,
      type: type || "full-time",
      salaryMin,
      salaryMax,
      experienceLevel,
      skills: skills || [],
      wilaya,
      visibility: visibility || {
        isPublic: true,
        acceptsDirectApplications: true,
      },
      candidateSearchMode: candidateSearchMode || "disabled",
      validationStatus: "pending",
      actif: false,
      datePublication: null,
    });

    const savedOffer = await newOffer.save();

    // Notifier les admins
    const admins = await User.find({ role: "admin" });
    const notificationPromises = admins.map((admin) =>
      Notification.create({
        userId: admin._id,
        message: `Nouvelle offre à valider : "${savedOffer.titre}" de ${recruiter.companyId.name}`,
        type: "info",
      })
    );
    await Promise.all(notificationPromises);

    res.status(201).json({
      msg: "Offre créée et en attente de validation ✅",
      offer: savedOffer,
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// @route   GET /api/recruiters/my-offers
// @desc    Voir toutes les offres créées par le recruteur
export const getMyOffers = async (req, res) => {
  try {
    const recruiter = await getRecruiterProfile(req.user.id);
    // On récupère les offres de ce recruteur
    const offers = await Offer.find({ recruteurId: recruiter._id }).sort({
      createdAt: -1,
    });
    res.json(offers);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// @route   PUT /api/recruiters/offers/:id
// @desc    Modifier une de ses offres
export const updateOffer = async (req, res) => {
  try {
    const recruiter = await getRecruiterProfile(req.user.id);
    const offer = await Offer.findById(req.params.id);

    if (!offer) return res.status(404).json({ msg: "Offre introuvable" }); // Vérifier que le recruteur est bien le propriétaire de l'offre

    if (offer.recruteurId.toString() !== recruiter._id.toString()) {
      return res.status(403).json({ msg: "Action non autorisée" });
    }

    const updatedOffer = await Offer.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );

    res.json({ msg: "Offre mise à jour ✅", offer: updatedOffer });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// @route   PUT /api/recruiters/offers/:id/deactivate
// @desc    Désactiver une offre (la rend invisible)
export const deactivateOffer = async (req, res) => {
  try {
    const recruiter = await getRecruiterProfile(req.user.id);
    const offer = await Offer.findById(req.params.id);

    if (!offer) return res.status(404).json({ msg: "Offre introuvable" });
    if (offer.recruteurId.toString() !== recruiter._id.toString()) {
      return res.status(403).json({ msg: "Action non autorisée" });
    }

    offer.actif = false;
    await offer.save();

    res.json({ msg: "Offre désactivée ⛔", offer });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// @route   GET /api/recruiters/offers/:offerId/applications
// @desc    Voir les candidatures pour une offre spécifique
export const getOfferApplications = async (req, res) => {
  try {
    // Récupère le recruteur (comme avant)
    const recruiter = await getRecruiterProfile(req.user.id);
    const { offerId } = req.params;

    // Pagination params (par défaut page 1, 20 items)
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    // Vérifier que l'offre appartient bien au recruteur
    // On ne récupère que _id pour être très rapide
    const offerCheck = await Offer.findOne({
      _id: offerId,
      recruteurId: recruiter._id,
    })
      .select("_id")
      .lean();

    if (!offerCheck) {
      return res
        .status(404)
        .json({ msg: "Offre introuvable ou non autorisée" });
    }

    // Requête optimisée :
    // - tri par datePostulation (l'index { offerId:1, datePostulation:-1 } est recommandé)
    // - skip/limit pour la pagination
    // - sélection des champs de Application (exclure les gros champs inutiles en liste)
    // - populate limité (seulement les champs strictement nécessaires)
    // - lean() pour renvoyer du JSON simple (beaucoup plus rapide)
    const applications = await Application.find({ offerId: offerId })
      .sort({ datePostulation: -1 })
      .skip(skip)
      .limit(limit)
      // Exemple : exclure un champ volumineux (ajuste selon ton schéma)
      .select("-coverLetter") // supprime le champ coverLetter de la projection si tu l'as
      .populate({
        path: "candidateId",
        // Ne récupérer que le strict nécessaire du candidat : cvs, userId (pour nom/email), photo, location...
        select: "cvs userId profilePicture location",
        populate: {
          path: "userId",
          select: "nom email",
        },
      })
      .lean();

    const validApplications = applications.filter(
      (app) => app.candidateId !== null
    );
    // const total = validApplications.length; remove this because This is just the current page count!
    const total = await Application.countDocuments({ offerId: offerId });

    return res.json({
      data: validApplications,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    // Log l'erreur côté server si tu veux (console.error ou logger)
    return res.status(500).json({ msg: err.message });
  }
};

// @route   PUT /api/recruiters/applications/:appId/status
// @desc    Accepter ou rejeter une candidature
export const updateApplicationStatus = async (req, res) => {
  try {
    const { statut } = req.body;
    const { appId } = req.params;
    const recruiter = await getRecruiterProfile(req.user.id); // Assure-toi que cette fonction helper est bien en haut du fichier

    const application = await Application.findById(appId).populate("offerId");

    if (!application)
      return res.status(404).json({ msg: "Candidature introuvable" });

    const offer = await Offer.findById(application.offerId);

    // Sécurité : Vérifier que l'offre appartient bien au recruteur
    if (offer.recruteurId.toString() !== recruiter._id.toString()) {
      return res.status(403).json({ msg: "Action non autorisée" });
    }

    // Mise à jour du statut dans Application SEULEMENT
    application.status = statut;
    await application.save();

    // Notification au candidat
    await Notification.create({
      userId: application.candidateId, // On peut prendre l'ID directement depuis l'app
      message: `Votre candidature pour "${offer.titre}" est passée au statut : ${statut}.`,
      type: "info",
    });

    res.json({ msg: `Statut mis à jour : ${statut}`, application });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// @route   PUT /api/recruiters/profile
// @desc    Mettre à jour le profil de l'entreprise
export const updateRecruiterProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    // On extrait UNIQUEMENT les champs autorisés du body
    // Si l'utilisateur envoie "position" ou "isAdmin", ils seront ignorés ici.
    const { nom, motDePasse, telephone } = req.body;

    // 1. Mise à jour des infos de connexion (Collection User)
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "Utilisateur introuvable" });

    if (nom) user.nom = nom;
    if (motDePasse) {
      const hash = await bcrypt.hash(motDePasse, 10);
      user.motDePasse = hash;
    }
    await user.save();

    // 2. Mise à jour des infos professionnelles autorisées (Collection Recruiter)
    const recruiter = await Recruiter.findOne({ userId });
    if (!recruiter)
      return res.status(404).json({ msg: "Profil recruteur introuvable" });

    // On ne touche PAS à recruiter.position ni recruiter.isAdmin
    if (telephone) recruiter.telephone = telephone;

    await recruiter.save();

    // On renvoie les infos sans le mot de passe
    res.json({
      msg: "Profil mis à jour avec succès ✅",
      user: { nom: user.nom, email: user.email },
      recruiter: {
        telephone: recruiter.telephone,
        position: recruiter.position, // On renvoie la position pour confirmation visuelle qu'elle n'a pas changé
        isAdmin: recruiter.isAdmin,
      },
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

function getStatusMessage(status) {
  const messages = {
    pending_validation: "En attente de validation initiale",
    pending_documents: "Documents demandés par l'administration",
    pending_info: "Informations complémentaires demandées",
    pending_revalidation: "Réponse en cours d'examen",
    rejected: "Compte refusé",
  };
  return messages[status] || status;
}

// CORRECTION : updateCompanyDetails avec import direct
export const updateCompanyDetails = async (req, res) => {
  try {
    const recruiter = await getRecruiterProfile(req.user.id);

    if (!recruiter.isAdmin) {
      return res.status(403).json({
        msg: "Accès refusé. Seul l'administrateur de l'entreprise peut modifier ces informations.",
      });
    }

    // CORRECTION : Company est maintenant importé directement en haut
    const { website, description, industry, location, size, logo } = req.body;

    const updatedCompany = await Company.findByIdAndUpdate(
      recruiter.companyId._id,
      {
        $set: {
          website,
          description,
          industry,
          location,
          size,
          logo,
        },
      },
      { new: true }
    );

    res.json({
      msg: "Informations de l'entreprise mises à jour ✅",
      company: updatedCompany,
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

export const getRecruiterDashboard = async (req, res) => {
  try {
    const recruiter = await getRecruiterProfile(req.user.id);

    const now = new Date();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const myOfferIds = await Offer.find({
      recruteurId: recruiter._id,
    }).distinct("_id");

    const [
      activeOffers,
      pendingOffers,
      rejectedOffers,
      totalApplications,
      newApplicationsThisWeek,
      applicationsByStatus,
      topOffers,
      recentApplications,
    ] = await Promise.all([
      Offer.countDocuments({
        recruteurId: recruiter._id,
        actif: true,
        validationStatus: "approved",
      }),
      Offer.countDocuments({
        recruteurId: recruiter._id,
        validationStatus: "pending",
      }),
      Offer.countDocuments({
        recruteurId: recruiter._id,
        validationStatus: { $in: ["rejected", "changes_requested"] },
      }),
      Application.countDocuments({ offerId: { $in: myOfferIds } }),
      Application.countDocuments({
        offerId: { $in: myOfferIds },
        datePostulation: { $gte: sevenDaysAgo },
      }),
      Application.aggregate([
        { $match: { offerId: { $in: myOfferIds } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Offer.find({ recruteurId: recruiter._id, actif: true })
        .sort({ nombreCandidatures: -1 })
        .limit(5)
        .select("titre nombreCandidatures datePublication"),
      Application.find({ offerId: { $in: myOfferIds } })
        .populate({
          path: "candidateId",
          select: "profilePicture",
          populate: { path: "userId", select: "nom" },
        })
        .populate("offerId", "titre")
        .sort({ datePostulation: -1 })
        .limit(10),
    ]);

    const statusMap = {};
    applicationsByStatus.forEach((s) => {
      statusMap[s._id] = s.count;
    });

    // Alertes basées sur le nouveau système
    const alerts = [];
    if (recruiter.companyId.status !== "active") {
      alerts.push({
        type: "warning",
        message: "Votre entreprise est en attente de validation",
      });
    }
    if (recruiter.status !== "validated") {
      alerts.push({
        type: "warning",
        message: `Statut du compte : ${recruiter.status}`,
        statusMessage: getStatusMessage(recruiter.status),
      });
    }
    if (pendingOffers > 0) {
      alerts.push({
        type: "info",
        message: `${pendingOffers} offre(s) en attente de validation`,
      });
    }
    if (rejectedOffers > 0) {
      alerts.push({
        type: "error",
        message: `${rejectedOffers} offre(s) nécessitent des modifications`,
      });
    }

    // Vérifier s'il y a des demandes en attente
    const pendingRequests = recruiter.validationRequests.filter(
      (r) => r.status === "pending"
    );
    if (pendingRequests.length > 0) {
      alerts.push({
        type: "action_required",
        message: "Des documents ou informations sont demandés",
        requests: pendingRequests,
      });
    }

    res.json({
      overview: {
        activeOffers,
        pendingOffers,
        rejectedOffers,
        totalApplications,
        newApplicationsThisWeek,
      },
      applicationsByStatus: statusMap,
      topOffers,
      recentApplications,
      company: {
        name: recruiter.companyId.name,
        status: recruiter.companyId.status,
        logo: recruiter.companyId.logo,
      },
      recruiterStatus: recruiter.status,
      alerts,
      permissions: recruiter.permissions,
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

export const getOfferStats = async (req, res) => {
  try {
    const recruiter = await getRecruiterProfile(req.user.id);
    const { offerId } = req.params;

    const offer = await Offer.findOne({
      _id: offerId,
      recruteurId: recruiter._id,
    });

    if (!offer) {
      return res.status(404).json({ msg: "Offre introuvable" });
    }

    const [applicationsByStatus, applicationsByDay] = await Promise.all([
      Application.aggregate([
        { $match: { offerId: offer._id } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Application.aggregate([
        { $match: { offerId: offer._id } },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$datePostulation" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 30 },
      ]),
    ]);

    const statusMap = {};
    applicationsByStatus.forEach((s) => {
      statusMap[s._id] = s.count;
    });

    res.json({
      offer: {
        _id: offer._id,
        titre: offer.titre,
        actif: offer.actif,
        validationStatus: offer.validationStatus,
        datePublication: offer.datePublication,
        nombreCandidatures: offer.nombreCandidatures,
      },
      applicationsByStatus: statusMap,
      applicationsByDay,
      conversionRate:
        offer.nombreCandidatures > 0
          ? Math.round(
              ((statusMap["accepté"] || 0) / offer.nombreCandidatures) * 100
            )
          : 0,
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

export const scheduleInterview = async (req, res) => {
  try {
    const recruiter = await getRecruiterProfile(req.user.id);
    const { appId } = req.params;
    const { scheduledAt, location, meetingLink, notes } = req.body;

    const application = await Application.findById(appId).populate("offerId");
    if (!application) {
      return res.status(404).json({ msg: "Candidature introuvable." });
    }

    const offer = await Offer.findById(application.offerId);
    if (offer.recruteurId.toString() !== recruiter._id.toString()) {
      return res.status(403).json({ msg: "Non autorisé." });
    }

    // CORRECTION : permissions par défaut sont maintenant true, donc cette vérification fonctionne
    if (!recruiter.permissions.scheduleInterviews && !recruiter.isAdmin) {
      return res.status(403).json({
        msg: "Vous n'avez pas la permission de programmer des entretiens.",
      });
    }

    application.status = "entretien";
    application.interviewDetails = {
      scheduledAt: new Date(scheduledAt),
      location,
      meetingLink,
      notes,
      confirmedByCandidate: false,
    };
    await application.save();

    const candidate = await Candidate.findById(application.candidateId);
    await Notification.create({
      userId: candidate.userId,
      message: `Entretien programmé pour "${offer.titre}" le ${new Date(
        scheduledAt
      ).toLocaleDateString("fr-FR")}`,
      type: "validation",
    });

    // SUPPRESSION de logActivity qui n'existe pas

    res.json({ msg: "Entretien programmé avec succès.", application });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
// NOUVEAU: Endpoint pour récupérer le profil recruteur
export const getRecruiterProfileEndpoint = async (req, res) => {
  try {
    const recruiter = await Recruiter.findOne({ userId: req.user.id })
      .populate("userId", "nom email emailVerified")
      .populate("companyId");

    if (!recruiter) {
      return res.status(404).json({ msg: "Profil recruteur introuvable" });
    }

    const alerts = [];
    const user = await User.findById(req.user.id);

    if (!user.emailVerified) {
      alerts.push({
        type: "critical",
        message: "Email non vérifié",
        action: "verify_email",
      });
    }

    // Utiliser recruiter.status au lieu de user.statutValidation
    if (recruiter.status === "pending_validation") {
      alerts.push({
        type: "warning",
        message: "Compte en attente de validation par un administrateur",
      });
    }

    if (recruiter.status === "rejected") {
      alerts.push({
        type: "error",
        message: "Compte rejeté",
        reason: recruiter.rejectionReason,
      });
    }

    if (recruiter.companyId?.status === "pending") {
      alerts.push({
        type: "warning",
        message: "Entreprise en attente de validation",
      });
    }

    const pendingRequests = recruiter.validationRequests?.filter(
      (r) => r.status === "pending"
    );

    if (pendingRequests?.length > 0) {
      alerts.push({
        type: "action_required",
        message:
          "Des documents ou informations sont demandés par l'administration",
        requests: pendingRequests,
      });
    }

    res.json({
      recruiter,
      alerts,
      canPostOffers:
        user.emailVerified &&
        recruiter.status === "validated" && // Corrigé
        recruiter.companyId?.status === "active" &&
        recruiter.permissions.postJobs,
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// NOUVEAU: Récupérer l'équipe de l'entreprise
export const getCompanyTeam = async (req, res) => {
  try {
    const recruiter = await Recruiter.findOne({ userId: req.user.id });

    if (!recruiter) {
      return res.status(404).json({ msg: "Profil introuvable" });
    }

    const team = await Recruiter.find({ companyId: recruiter.companyId })
      .populate("userId", "nom email")
      .select("position permissions isAdmin status createdAt");

    res.json(team);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
// AJOUT : submitValidationResponse déplacé depuis adminController
export const submitValidationResponse = async (req, res) => {
  try {
    const recruiter = await Recruiter.findOne({ userId: req.user.id });

    if (!recruiter) {
      return res.status(404).json({ msg: "Profil introuvable." });
    }

    const { requestId, text } = req.body;
    const documents = req.files?.map((f) => f.path.replace(/\\/g, "/")) || [];

    const request = recruiter.validationRequests.id(requestId);

    if (!request) {
      return res.status(404).json({ msg: "Demande introuvable." });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ msg: "Cette demande a déjà été traitée." });
    }

    request.response = {
      text,
      documents,
      submittedAt: new Date(),
    };
    request.status = "submitted";

    // CORRECTION : mettre à jour Recruiter.status
    recruiter.status = "pending_revalidation";

    await recruiter.save();

    // Notifier les admins
    const admins = await Admin.find({
      "permissions.validateRecruiters": true,
      status: "active",
    }).populate("userId", "_id");

    const notifPromises = admins.map((admin) =>
      Notification.create({
        userId: admin.userId._id,
        message: `Le recruteur a répondu à une demande de validation.`,
        type: "info",
      })
    );
    await Promise.all(notifPromises);

    res.json({ msg: "Réponse soumise. Vous serez notifié du résultat." });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
export const getRecruiterById = async (req, res) => {
  try {
    const { id } = req.params;

    // On cherche le recruteur par son ID
    // On peuple les infos utilisateur et entreprise
    const recruiter = await Recruiter.findById(id)
      .populate("userId", "nom email role accountStatus createdAt")
      .populate("companyId", "name logo website location description status");

    if (!recruiter) {
      return res.status(404).json({ msg: "Recruteur introuvable" });
    }

    // --- LOGIQUE DE SÉCURITÉ ---

    // Vérifier si c'est un Admin qui regarde
    const isAdmin = req.user && req.user.role === "admin";

    // Si ce n'est PAS un admin...
    if (!isAdmin) {
      // 1. Si le compte n'est pas validé, le public ne doit pas le voir
      if (recruiter.status !== "validated") {
        return res.status(404).json({ msg: "Ce profil n'est pas accessible." });
      }
      // 2. Si l'entreprise n'est pas active, le public ne doit pas le voir
      if (recruiter.companyId?.status !== "active") {
        return res
          .status(404)
          .json({ msg: "L'entreprise de ce recruteur n'est pas active." });
      }
    }

    // --- PRÉPARATION DE LA RÉPONSE ---

    // Données publiques (tout le monde voit ça)
    let responseData = {
      _id: recruiter._id,
      nom: recruiter.userId.nom,
      position: recruiter.position,
      entreprise: {
        _id: recruiter.companyId._id,
        nom: recruiter.companyId.name,
        logo: recruiter.companyId.logo,
        location: recruiter.companyId.location,
        website: recruiter.companyId.website,
        description: recruiter.companyId.description,
      },
      dateCreation: recruiter.createdAt,
    };

    // Données Réservées ADMIN (L'admin voit tout le reste en plus)
    if (isAdmin) {
      responseData.adminDetails = {
        email: recruiter.userId.email, // Email privé
        telephone: recruiter.telephone, // Téléphone direct
        status: recruiter.status, // Validé/Rejeté/Pending
        userStatus: recruiter.userId.accountStatus, // Actif/Banni
        isAdminOfCompany: recruiter.isAdmin,
        permissions: recruiter.permissions,
        validationRequests: recruiter.validationRequests, // Historique des demandes
        rejectionReason: recruiter.rejectionReason,
        userId: recruiter.userId._id, // Utile pour l'action de bannir
      };
    }

    res.json(responseData);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
export const getCandidateFullProfile = async (req, res) => {
  try {
    const { candidateId } = req.params;

    // On récupère tout : experiences, education, skills, etc.
    const candidate = await Candidate.findById(candidateId)
      .populate("userId", "nom email") // On récupère le nom et email
      .select("-favoris"); // On cache les favoris du candidat (privé)

    if (!candidate) {
      return res.status(404).json({ msg: "Candidat introuvable" });
    }

    res.json(candidate);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
