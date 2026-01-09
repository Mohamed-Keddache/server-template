import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    logo: { type: String }, // URL de l'image
    website: { type: String },
    description: { type: String },
    industry: { type: String }, // Secteur d'activité
    location: { type: String }, // Siège social
    size: { type: String }, // ex: "10-50 employés"

    // Statut de l'entreprise elle-même (vérifiée par admin ?)
    status: {
      type: String,
      enum: ["pending", "active", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);
companySchema.index({ status: 1 });
companySchema.index({ name: "text" });
export default mongoose.model("Company", companySchema);
