import mongoose from "mongoose";

// models/Admin.js - Refonte complète
const adminSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    // Étiquette / Type d'admin
    label: {
      type: String,
      enum: [
        "super_admin", // Tous les droits
        "support", // Support utilisateur
        "technical", // Problèmes techniques
        "operational", // Comptes et profils
        "recruitment", // Entreprises et offres
        "moderation", // Documents et vérifications
        "product", // Feedback et suggestions
      ],
      default: "support",
    },

    // Permissions granulaires
    permissions: {
      // Gestion admins
      createAdmin: { type: Boolean, default: false },
      deleteAdmin: { type: Boolean, default: false },
      editAdminPermissions: { type: Boolean, default: false },
      assignAdminLabels: { type: Boolean, default: false },

      // Validation
      validateOffers: { type: Boolean, default: false },
      validateRecruiters: { type: Boolean, default: false },
      validateCompanies: { type: Boolean, default: false },

      // Gestion utilisateurs
      banUsers: { type: Boolean, default: false },
      suspendUsers: { type: Boolean, default: false },

      // Matching
      proposeCandidates: { type: Boolean, default: false },

      // Contenu
      manageAnnouncements: { type: Boolean, default: false },
      sendNotifications: { type: Boolean, default: false },

      // Support
      handleSupportTickets: { type: Boolean, default: false },

      // Stats
      viewStats: { type: Boolean, default: true },
      viewLogs: { type: Boolean, default: false },
    },

    // Statut
    status: {
      type: String,
      enum: ["active", "suspended", "revoked"],
      default: "active",
    },
    suspensionReason: String,
    suspendedUntil: Date,

    // Qui a créé cet admin
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Méthode pour vérifier une permission
adminSchema.methods.hasPermission = function (permission) {
  if (this.label === "super_admin") return true;
  return this.permissions[permission] === true;
};

export default mongoose.model("Admin", adminSchema);
