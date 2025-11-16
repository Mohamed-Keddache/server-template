import Offer from "../models/Offer.js";
import Recruiter from "../models/Recruiter.js";
import User from "../models/User.js";
import Candidate from "../models/Candidate.js";
import Notification from "../models/Notification.js";

// Fonction utilitaire pour trouver le profil Recruteur via l'ID User
const getRecruiterProfile = async (userId) => {
  const recruiter = await Recruiter.findOne({ userId });
  if (!recruiter) throw new Error("Profil recruteur non trouvé");
  return recruiter;
};

// @route   POST /api/recruiters/offers
// @desc    Créer une nouvelle offre
export const createOffer = async (req, res) => {
  try {
    const recruiter = await getRecruiterProfile(req.user.id);

    const {
      titre,
      description,
      domaine,
      niveau,
      experience,
      salaire,
      wilaya,
      typeSelection,
    } = req.body;

    const newOffer = new Offer({
      recruteurId: recruiter._id,
      titre,
      description,
      domaine,
      niveau,
      experience,
      salaire,
      wilaya,
      typeSelection,
    });

    const savedOffer = await newOffer.save(); // Lier l'offre au profil du recruteur

    recruiter.offres.push(savedOffer._id);
    await recruiter.save();

    res
      .status(201)
      .json({ msg: "Offre créée avec succès ✅", offer: savedOffer });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// @route   GET /api/recruiters/my-offers
// @desc    Voir toutes les offres créées par le recruteur
export const getMyOffers = async (req, res) => {
  try {
    const recruiter = await getRecruiterProfile(req.user.id);
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
    const recruiter = await getRecruiterProfile(req.user.id);
    const offer = await Offer.findById(req.params.offerId).populate({
      path: "candidatures.candidatId",
      select: "userId telephone wilaya", // Sélectionner les champs du profil Candidat
      populate: {
        path: "userId",
        select: "nom email", // Sélectionner les champs du profil User
      },
    });

    if (!offer) return res.status(404).json({ msg: "Offre introuvable" });
    if (offer.recruteurId.toString() !== recruiter._id.toString()) {
      return res.status(403).json({ msg: "Action non autorisée" });
    }

    res.json(offer.candidatures);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// @route   PUT /api/recruiters/applications/:appId/status
// @desc    Accepter ou rejeter une candidature
export const updateApplicationStatus = async (req, res) => {
  try {
    const { statut } = req.body; // "accepté" ou "rejeté"
    if (!["accepté", "rejeté"].includes(statut)) {
      return res.status(400).json({ msg: "Statut invalide" });
    }

    const recruiter = await getRecruiterProfile(req.user.id);
    const { appId } = req.params;

    const offer = await Offer.findOne({
      "candidatures._id": appId,
      recruteurId: recruiter._id,
    });

    if (!offer)
      return res.status(404).json({ msg: "Candidature ou offre introuvable" });

    const application = offer.candidatures.id(appId); // Éviter les mises à jour inutiles si le statut est déjà défini
    if (application.statut === statut) {
      return res
        .status(400)
        .json({ msg: `La candidature est déjà ${statut}e.` });
    }
    application.statut = statut;
    await offer.save(); // --- DÉBUT LOGIQUE PRIORITÉ 2 ---

    const candidate = await Candidate.findById(application.candidatId);
    if (candidate) {
      // 1. Mettre à jour l'historique du candidat
      const historyEntry = candidate.historique.find(
        (h) => h.offreId.toString() === offer._id.toString()
      ); // Harmonisation (CdC) : "accepté" (recruteur) -> "acceptée" (candidat)

      const candidateStatut = statut === "accepté" ? "acceptée" : "rejetée";

      if (historyEntry) {
        historyEntry.statut = candidateStatut;
        historyEntry.changements += 1; // Pour l'indicateur rouge
        await candidate.save();
      } // 2. Envoyer une notification interne au candidat

      await Notification.create({
        userId: candidate.userId,
        message: `Votre candidature pour l'offre "${offer.titre}" a été ${candidateStatut}.`,
        type: "info",
      });
    } // --- FIN LOGIQUE PRIORITÉ 2 ---
    res.json({ msg: `Candidature ${statut}e`, application });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// @route   PUT /api/recruiters/profile
// @desc    Mettre à jour le profil de l'entreprise
export const updateRecruiterProfile = async (req, res) => {
  try {
    const { entrepriseNom, description } = req.body;
    const recruiter = await Recruiter.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { entrepriseNom, description } },
      { new: true }
    );

    if (!recruiter)
      return res.status(404).json({ msg: "Profil recruteur introuvable" });

    res.json({ msg: "Profil entreprise mis à jour ✅", recruiter });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
