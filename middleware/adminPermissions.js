// middleware/adminPermissions.js - CORRIGÉ
import Admin from "../models/Admin.js"; // AJOUT DE L'IMPORT

export const requireAdminPermission = (permission) => {
  return async (req, res, next) => {
    try {
      const admin = await Admin.findOne({ userId: req.user.id });

      if (!admin) {
        return res.status(403).json({ msg: "Accès administrateur requis." });
      }

      if (admin.status !== "active") {
        return res
          .status(403)
          .json({ msg: "Votre compte administrateur est suspendu." });
      }

      if (!admin.hasPermission(permission)) {
        return res.status(403).json({
          msg: `Permission "${permission}" requise.`,
          code: "PERMISSION_DENIED",
        });
      }

      req.admin = admin;
      next();
    } catch (err) {
      res.status(500).json({ msg: err.message });
    }
  };
};

export const requireActiveAdmin = async (req, res, next) => {
  try {
    const admin = await Admin.findOne({ userId: req.user.id });

    if (!admin || admin.status !== "active") {
      return res
        .status(403)
        .json({ msg: "Accès administrateur actif requis." });
    }

    req.admin = admin;
    next();
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
