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
    domaine: { type: String },
    niveau: { type: String },
    experience: { type: String },
    salaire: { type: Number },
    datePublication: { type: Date, default: Date.now },

    candidatures: [
      {
        candidatId: { type: mongoose.Schema.Types.ObjectId, ref: "Candidate" },
        cvUrl: { type: String },
        statut: {
          type: String,
          enum: ["en attente", "accepté", "rejeté"],
          default: "en attente",
        },
        datePostulation: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Offer", offerSchema);
