import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Admin from "../models/Admin.js";

export const seedAdmin = async () => {
  const exist = await User.findOne({ role: "admin" });
  if (exist) return console.log("👑 Admin déjà existant.");

  const hash = await bcrypt.hash("admin", 10);

  const user = await User.create({
    nom: "Super Admin",
    email: "admin@recrutement.com",
    motDePasse: hash,
    role: "admin",
  });

  await Admin.create({
    userId: user._id,
  });

  console.log("✅ Admin par défaut créé");
};
