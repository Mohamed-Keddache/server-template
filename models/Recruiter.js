// models/Recruiter.js - VERSION CORRIGÉE
import mongoose from "mongoose";

const recruiterSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    telephone: { type: String },
    position: { type: String },

    // === NOUVEL ÉTAT MÉTIER UNIFIÉ ===
    status: {
      type: String,
      enum: [
        "pending_validation", // En attente de validation initiale
        "pending_documents", // En attente de documents demandés
        "pending_info", // En attente d'informations demandées
        "pending_info_and_documents",
        "pending_revalidation", // A répondu, en attente de revalidation
        "validated", // Validé et actif
        "rejected", // Refusé définitivement
      ],
      default: "pending_validation",
    },

    rejectionReason: String,

    // Demandes de validation (documents/infos)
    validationRequests: [
      {
        type: {
          type: String,
          enum: ["document", "information", "clarification"],
        },
        message: String,
        requiredFields: [String],
        requiredDocuments: Number,
        response: {
          text: String,
          documents: [String],
          submittedAt: Date,
        },
        status: {
          type: String,
          enum: ["pending", "submitted", "approved", "rejected"],
          default: "pending",
        },
        createdAt: { type: Date, default: Date.now },
        reviewedAt: Date,
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],

    // Permissions au sein de l'entreprise
    permissions: {
      postJobs: { type: Boolean, default: true },
      reviewCandidates: { type: Boolean, default: true },
      scheduleInterviews: { type: Boolean, default: true },
      manageTeam: { type: Boolean, default: false },
      editCompany: { type: Boolean, default: false },
    },

    isAdmin: { type: Boolean, default: false },

    favoriteCandidates: [
      {
        candidateId: { type: mongoose.Schema.Types.ObjectId, ref: "Candidate" },
        savedAt: { type: Date, default: Date.now },
        notes: String,
      },
    ],

    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Recruiter" },
    invitedAt: Date,
  },
  { timestamps: true }
);

recruiterSchema.index({ userId: 1 });
recruiterSchema.index({ companyId: 1 });
recruiterSchema.index({ status: 1 });

// Méthode utilitaire pour vérifier si le recruteur peut agir
recruiterSchema.methods.canPerformActions = function () {
  return this.status === "validated";
};

// Méthode pour vérifier s'il y a des demandes en attente
recruiterSchema.methods.hasPendingRequests = function () {
  return this.validationRequests.some((r) => r.status === "pending");
};

export default mongoose.model("Recruiter", recruiterSchema);
