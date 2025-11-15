import mongoose from "mongoose";

const recruiterSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    entrepriseNom: { type: String, required: true },
    registreCommerce: { type: String, required: true },
    description: { type: String },
    statutValidation: {
      type: String,
      enum: ["en attente", "validé", "rejeté"],
      default: "en attente",
    },
    offres: [{ type: mongoose.Schema.Types.ObjectId, ref: "Offer" }],

    notifications: [
      {
        message: { type: String },
        date: { type: Date, default: Date.now },
        lu: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Recruiter", recruiterSchema);
