import Skill from "../models/Skills.js";

// Créer un skill (Admin seulement)
export const createSkill = async (req, res) => {
  try {
    const { name, category } = req.body;
    // Normalisation : on stocke en minuscule ou Capitalized pour éviter les doublons
    const normalizedName = name.trim();

    const exist = await Skill.findOne({
      name: { $regex: new RegExp(`^${normalizedName}$`, "i") },
    });
    if (exist) return res.status(400).json({ msg: "Ce skill existe déjà." });

    const newSkill = await Skill.create({ name: normalizedName, category });
    res.status(201).json(newSkill);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// Récupérer tous les skills (Pour l'autocomplétion côté front)
export const getSkills = async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const skills = await Skill.find(query).sort({ name: 1 }).limit(50);
    res.json(skills);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// Supprimer un skill
export const deleteSkill = async (req, res) => {
  try {
    await Skill.findByIdAndDelete(req.params.id);
    res.json({ msg: "Skill supprimé" });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
