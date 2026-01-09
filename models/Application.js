import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema(
  {
    // Référence à l'offre (modèle Offer)
    offerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Offer",
      required: true,
    },

    // Référence au candidat (modèle Candidate)
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      required: true,
    },

    // ✅ SNAPSHOT PATTERN : on fige ici quelques infos importantes de l'offre
    // utile si l'offre change/supprime plus tard — l'historique de la postulation reste cohérent
    offerSnapshot: {
      titre: { type: String }, // titre de l'offre au moment de la postulation
      entrepriseNom: { type: String }, // nom de l'entreprise au moment de la postulation
      companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" }, // optionnel : garder la ref entreprise
      location: { type: String },
      salaryMin: { type: Number },
      salaryMax: { type: Number },
      type: { type: String }, // ex: "Full-time", "Part-time", etc.
    },

    cvUrl: { type: String, required: true },
    coverLetter: { type: String },

    // Le statut peut être "proposé" si c'est l'admin qui l'envoie
    status: {
      type: String,
      enum: [
        "en attente", // Candidature soumise
        "vu", // Recruteur a consulté
        "présélectionné", // Short-listé
        "entretien", // Entretien programmé
        //candidat contacter
        "accepté", // Offre acceptée
        "embauché", // Contrat signé
        "rejeté", // Refusé
        "proposé", // Proposé par admin
        "retiré", // Retiré par le candidat
      ],
      default: "en attente",
    },
    // Ajouter : Détails entretien
    interviewDetails: {
      scheduledAt: Date,
      location: String, // ou "video_call"
      meetingLink: String,
      notes: String,
      confirmedByCandidate: Boolean,
    },

    // Pour ta logique "Manuelle"
    recommandeParAdmin: { type: Boolean, default: false },

    // Date de la postulation (utilisé aussi pour pagination / historique)
    datePostulation: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

applicationSchema.index({ offerId: 1, candidateId: 1 }, { unique: true }); // contrainte d'unicité
applicationSchema.index({ offerId: 1, datePostulation: -1 }); // pagination / recherche par offre
applicationSchema.index({ candidateId: 1, datePostulation: -1 }); // historique candidat

export default mongoose.model("Application", applicationSchema);
