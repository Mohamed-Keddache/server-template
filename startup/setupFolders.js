import fs from "fs";

export default function setupFolders() {
  // Added "uploads/images"
  const folders = ["uploads", "uploads/cv", "uploads/images"];
  folders.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Dossier créé : ${dir}`);
    }
  });
}
