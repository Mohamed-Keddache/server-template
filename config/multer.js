import multer from "multer";
import path from "path";

// --- Storage for CVs ---
const storageCV = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/cv");
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const fileFilterCV = (req, file, cb) => {
  const allowed = [".pdf", ".doc", ".docx"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowed.includes(ext)) {
    return cb(new Error("Seulement PDF, DOC ou DOCX !"));
  }
  cb(null, true);
};

export const uploadCV = multer({
  storage: storageCV,
  fileFilter: fileFilterCV,
});

// --- Storage for Images ---
const storageImage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/images");
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const fileFilterImage = (req, file, cb) => {
  const allowed = [".jpg", ".jpeg", ".png", ".webp"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowed.includes(ext)) {
    return cb(new Error("Seulement JPG, JPEG, PNG ou WEBP !"));
  }
  cb(null, true);
};

export const uploadImage = multer({
  storage: storageImage,
  fileFilter: fileFilterImage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit 5MB
});
