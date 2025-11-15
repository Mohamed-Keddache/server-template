import fs from "fs";

export default function setupFolders() {
  const folders = ["uploads", "uploads/cv"];
  folders.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Dossier créé : ${dir}`);
    }
  });
}
