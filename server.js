import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import connectDB from "./config/db.js";
import setupFolders from "./startup/setupFolders.js";
import { seedAdmin } from "./startup/seedAdmin.js";

import authRoutes from "./routes/authRoutes.js";
import candidateRoutes from "./routes/candidateRoutes.js";
import recruiterRoutes from "./routes/recruiterRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import offerRoutes from "./routes/offerRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

async function startServer() {
  try {
    await connectDB();
    setupFolders();
    await seedAdmin();

    app.use("/api/auth", authRoutes);
    app.use("/api/candidates", candidateRoutes);
    app.use("/api/recruiters", recruiterRoutes);
    app.use("/api/admin", adminRoutes);
    app.use("/api/offers", offerRoutes);
    app.use("/api/notifications", notificationRoutes);

    app.get("/", (req, res) => res.send("✅ API Recrutement opérationnelle !"));

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`🚀 Serveur lancé sur le port ${PORT}`));
  } catch (error) {
    console.error("❌ Erreur lors du démarrage du serveur :", error);
    process.exit(1);
  }
}

startServer();
