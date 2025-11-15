import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Candidate from "../models/Candidate.js";
import Recruiter from "../models/Recruiter.js";

export const register = async (req, res) => {
  try {
    const { nom, email, motDePasse, role, entrepriseNom, registreCommerce } =
      req.body;

    const exist = await User.findOne({ email });
    if (exist) return res.status(400).json({ msg: "Email déjà utilisé" });

    const hash = await bcrypt.hash(motDePasse, 10);
    const statutValidation = role === "recruteur" ? "en attente" : "validé";

    const user = await User.create({
      nom,
      email,
      motDePasse: hash,
      role,
      statutValidation,
    });

    if (role === "candidat") {
      await Candidate.create({ userId: user._id });
    } else if (role === "recruteur") {
      if (!entrepriseNom || !registreCommerce) {
        await User.findByIdAndDelete(user._id);
        return res.status(400).json({
          msg: "Nom de l'entreprise et registre de commerce sont requis.",
        });
      }

      await Recruiter.create({
        userId: user._id,
        entrepriseNom,
        registreCommerce,
      });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(201).json({
      msg: "Inscription réussie ✅",
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        statutValidation: user.statutValidation,
      },
    });
  } catch (err) {
    if (err.name === "ValidationError" && user && user._id) {
      await User.findByIdAndDelete(user._id);
    }
    res.status(500).json({ msg: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, motDePasse } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: "Utilisateur non trouvé" });

    const ok = await bcrypt.compare(motDePasse, user.motDePasse);
    if (!ok) return res.status(401).json({ msg: "Mot de passe incorrect" });

    if (user.role === "recruteur") {
      if (user.statutValidation === "en attente") {
        return res.status(403).json({
          msg: "Votre compte recruteur est en attente de validation par un administrateur.",
        });
      }

      if (user.statutValidation === "rejeté") {
        return res.status(403).json({
          msg: "Votre compte recruteur a été refusé par un administrateur.",
        });
      }
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    user.derniereConnexion = new Date();
    await user.save();

    res.json({
      msg: "Connexion réussie ✅",
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
