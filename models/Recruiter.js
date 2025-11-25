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
    offres: [{ type: mongoose.Schema.Types.ObjectId, ref: "Offer" }],
  },
  { timestamps: true }
);

export default mongoose.model("Recruiter", recruiterSchema);
