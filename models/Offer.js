import mongoose from "mongoose";

const offerSchema = new mongoose.Schema(
  {
    recruteurId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Recruiter",
      required: true,
    },
    titre: { type: String, required: true },
    description: { type: String, required: true },
    photo: { type: String },
    domaine: { type: String },
    niveau: { type: String },
    experience: { type: String },
    salaire: { type: Number },
    wilaya: { type: String },
    datePublication: { type: Date, default: Date.now },
    actif: { type: Boolean, default: true },

    typeSelection: {
      type: String,
      enum: ["automatique", "manuelle", "ouvert"],
      default: "ouvert",
    },

    candidatures: [
      {
        candidatId: { type: mongoose.Schema.Types.ObjectId, ref: "Candidate" },
        cvUrl: { type: String },
        statut: {
          type: String,
          enum: ["en attente", "accepté", "rejeté", "proposé"],
          default: "en attente",
        },
        recommandeParAdmin: { type: Boolean, default: false },
        datePostulation: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Offer", offerSchema);
