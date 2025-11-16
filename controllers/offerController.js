import Offer from "../models/Offer.js";

// @route   GET /api/offers
// @desc    Voir toutes les offres ACTIVES (pour candidats et recruteurs)
export const getAllActiveOffers = async (req, res) => {
  try {
    const offers = await Offer.find({ actif: true })
      .populate("recruteurId", "entrepriseNom") // Ajoute le nom de l'entreprise
      .sort({ datePublication: -1 });
    res.json(offers);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// @route   GET /api/offers/:id
// @desc    Voir le détail d'une offre
export const getOfferDetails = async (req, res) => {
  try {
    const offer = await Offer.findOne({
      _id: req.params.id,
      actif: true,
    }).populate("recruteurId", "entrepriseNom");

    if (!offer) return res.status(404).json({ msg: "Offre introuvable" });

    res.json(offer);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
