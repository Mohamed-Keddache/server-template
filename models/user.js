import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    nom: { type: String },
    email: { type: String, required: true, unique: true },
    motDePasse: { type: String, required: true },
    role: {
      type: String,
      enum: ["candidat", "recruteur", "admin"],
      required: true,
    },
    statutValidation: {
      type: String,
      enum: ["en attente", "validé", "rejeté"],
      default: "validé",
    },
    derniereConnexion: Date,
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
