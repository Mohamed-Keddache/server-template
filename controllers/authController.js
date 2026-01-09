// controllers/authController.js -
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Candidate from "../models/Candidate.js";
import Recruiter from "../models/Recruiter.js";
import Company from "../models/Company.js";

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      emailVerified: user.emailVerified,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
};

export const register = async (req, res) => {
  try {
    const {
      nom,
      email,
      motDePasse,
      role,
      companyId,
      nouveauNomEntreprise,
      nouveauSiteWeb,
    } = req.body;

    const exist = await User.findOne({ email });
    if (exist) return res.status(400).json({ msg: "Email déjà utilisé" });

    const hash = await bcrypt.hash(motDePasse, 10);

    // Création de l'utilisateur (accountStatus: active par défaut)
    const user = await User.create({
      nom,
      email,
      motDePasse: hash,
      role,
      emailVerified: false,
      accountStatus: "active",
    });

    if (role === "recruteur") {
      let finalCompanyId;

      if (companyId) {
        const comp = await Company.findById(companyId);
        if (!comp) {
          await User.findByIdAndDelete(user._id);
          return res.status(400).json({ msg: "Entreprise introuvable" });
        }
        finalCompanyId = comp._id;
      } else if (nouveauNomEntreprise) {
        const newComp = await Company.create({
          name: nouveauNomEntreprise,
          website: nouveauSiteWeb,
          status: "pending",
        });
        finalCompanyId = newComp._id;
      } else {
        await User.findByIdAndDelete(user._id);
        return res
          .status(400)
          .json({ msg: "Vous devez sélectionner ou créer une entreprise." });
      }

      // Le recruteur commence en "pending_validation"
      await Recruiter.create({
        userId: user._id,
        companyId: finalCompanyId,
        position: "Recruteur",
        status: "pending_validation",
        isAdmin: !companyId,
      });
    } else if (role === "candidat") {
      await Candidate.create({ userId: user._id });
    }

    const token = generateToken(user);
    res.status(201).json({ msg: "Inscription réussie", token, user });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, motDePasse } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ msg: "Utilisateur non trouvé" });
    }

    const ok = await bcrypt.compare(motDePasse, user.motDePasse);
    if (!ok) {
      return res.status(401).json({ msg: "Mot de passe incorrect" });
    }

    // Vérifier le statut du compte (sécurité)
    if (!user.canLogin()) {
      if (user.accountStatus === "banned") {
        return res.status(403).json({
          msg: "Votre compte a été banni. Veuillez contacter l'administrateur.",
          code: "ACCOUNT_BANNED",
        });
      }
      if (user.accountStatus === "suspended") {
        return res.status(403).json({
          msg: `Votre compte est suspendu${
            user.suspendedUntil
              ? ` jusqu'au ${user.suspendedUntil.toLocaleDateString()}`
              : ""
          }.`,
          code: "ACCOUNT_SUSPENDED",
          reason: user.suspensionReason,
        });
      }
    }

    // Pour les recruteurs : vérifications spécifiques
    if (user.role === "recruteur") {
      // 1. Email non vérifié
      if (!user.emailVerified) {
        return res.status(403).json({
          msg: "Veuillez confirmer votre email avant de vous connecter.",
          code: "EMAIL_NOT_VERIFIED",
          needEmailVerification: true,
        });
      }

      // 2. Vérifier le statut métier du recruteur
      const recruiter = await Recruiter.findOne({ userId: user._id });
      if (recruiter) {
        if (recruiter.status === "rejected") {
          return res.status(403).json({
            msg: "Votre compte recruteur a été refusé.",
            code: "RECRUITER_REJECTED",
            reason: recruiter.rejectionReason,
          });
        }

        if (recruiter.status !== "validated") {
          // Connexion autorisée mais avec accès limité
          const token = generateToken(user);
          user.derniereConnexion = new Date();
          await user.save();

          return res.json({
            msg: "Connexion réussie (accès limité)",
            token,
            user: {
              id: user._id,
              email: user.email,
              role: user.role,
              emailVerified: user.emailVerified,
            },
            recruiterStatus: recruiter.status,
            limitedAccess: true,
            statusMessage: getRecruiterStatusMessage(recruiter.status),
          });
        }
      }
    }

    const token = generateToken(user);
    user.derniereConnexion = new Date();
    await user.save();

    res.json({
      msg: "Connexion réussie ✅",
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
      },
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// Helper pour les messages de statut recruteur
function getRecruiterStatusMessage(status) {
  const messages = {
    pending_validation:
      "Votre compte est en attente de validation par un administrateur.",
    pending_documents:
      "Des documents vous ont été demandés. Veuillez les fournir.",
    pending_info: "Des informations complémentaires vous ont été demandées.",
    pending_info_and_documents:
      "Des informations et des documents vous ont été demandés.",
    pending_revalidation: "Vos réponses sont en cours d'examen.",
  };
  return messages[status] || "Statut en attente.";
}

export const resendConfirmationCode = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "Utilisateur introuvable" });

    if (user.emailVerified)
      return res.status(400).json({ msg: "Email déjà vérifié" });

    console.log(
      `📨 [FAKE API] Code de confirmation envoyé à ${user.email} : 123456`
    );

    res.json({
      msg: "Code de confirmation envoyé (Regardez la console serveur pour le code Fake) 📨",
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "Utilisateur introuvable" });

    if (user.emailVerified)
      return res.status(400).json({ msg: "Email déjà vérifié" });

    if (code === "123456") {
      user.emailVerified = true;
      await user.save();

      const newToken = generateToken(user);

      return res.json({
        msg: "E-mail confirmé avec succès ! 🎉",
        token: newToken,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          emailVerified: true,
        },
      });
    } else {
      return res.status(400).json({ msg: "Code incorrect. Essayez 123456." });
    }
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

export const changeEmail = async (req, res) => {
  try {
    const { newEmail } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "Utilisateur introuvable" });

    if (user.emailVerified) {
      return res.status(400).json({
        msg: "Impossible de changer l'email car il est déjà vérifié.",
      });
    }

    const exist = await User.findOne({ email: newEmail });
    if (exist)
      return res.status(400).json({ msg: "Cet email est déjà utilisé." });

    user.email = newEmail;
    await user.save();

    res.json({
      msg: `Email mis à jour vers ${newEmail}. Veuillez confirmer ce nouvel email.`,
      email: newEmail,
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

export const getCompanies = async (req, res) => {
  try {
    const companies = await Company.find({ status: "active" }).select(
      "_id name"
    );
    res.json(companies);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
