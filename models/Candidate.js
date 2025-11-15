import mongoose from "mongoose";

const candidateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    telephone: { type: String },
    wilaya: { type: String },

    cvs: [
      {
        url: { type: String, required: true },
        dateDepot: { type: Date, default: Date.now },
        score: { type: Number, default: 0 }, // Score calculé automatiquement
      },
    ],

    historique: [
      {
        offreId: { type: mongoose.Schema.Types.ObjectId, ref: "Offer" },
        entreprise: { type: String },
        statut: {
          type: String,
          enum: ["en attente", "acceptée", "rejetée"],
          default: "en attente",
        },
        date: { type: Date, default: Date.now },
        changements: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Candidate", candidateSchema);
