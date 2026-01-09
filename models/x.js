// models/User.js - VERSION CORRIGÉE
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

    // === État d'authentification ===
    emailVerified: {
      type: Boolean,
      default: false,
    },

    // === État du compte (sécurité/modération) ===
    accountStatus: {
      type: String,
      enum: ["active", "suspended", "banned"],
      default: "active",
    },
    suspensionReason: String,
    suspendedUntil: Date,

    derniereConnexion: Date,
  },
  { timestamps: true }
);

userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ accountStatus: 1 });

// Méthode pour vérifier si le compte est accessible
userSchema.methods.canLogin = function () {
  if (this.accountStatus === "banned") return false;
  if (this.accountStatus === "suspended") {
    if (this.suspendedUntil && new Date() > this.suspendedUntil) {
      return true; // Suspension expirée
    }
    return false;
  }
  return true;
};

export default mongoose.model("User", userSchema);
