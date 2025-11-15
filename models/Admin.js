import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    permissions: {
      type: [String],
      default: [
        "valider_recruteur",
        "gerer_admins",
        "voir_stats",
        "gerer_signalements",
      ],
    },
  },
  { timestamps: true }
);

export default mongoose.model("Admin", adminSchema);
