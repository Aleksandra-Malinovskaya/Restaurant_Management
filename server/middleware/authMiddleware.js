const jwt = require("jsonwebtoken");
const { User } = require("../models/models");

module.exports = async (req, res, next) => {
  if (req.method === "OPTIONS") {
    next();
  }

  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Не авторизован" });
    }

    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ["passwordHash"] },
    });

    if (!user || !user.isActive) {
      return res
        .status(401)
        .json({ message: "Пользователь не найден или деактивирован" });
    }

    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ message: "Не авторизован" });
  }
};
