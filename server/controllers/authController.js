const ApiError = require("../error/ApiError");
const { User } = require("../models/models");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const generateJwt = (id, email, role) => {
  return jwt.sign({ id, email, role }, process.env.SECRET_KEY, {
    expiresIn: "24h",
  });
};

class AuthController {
  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ where: { email } });
      if (!user) {
        return next(ApiError.badRequest("Пользователь не найден"));
      }

      const comparePassword = bcrypt.compareSync(password, user.passwordHash);
      if (!comparePassword) {
        return next(ApiError.badRequest("Неверный пароль"));
      }

      if (!user.isActive) {
        return next(ApiError.forbidden("Аккаунт деактивирован"));
      }

      const token = generateJwt(user.id, user.email, user.role);
      return res.json({
        token,
      });
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async register(req, res, next) {
    try {
      const { email, password, firstName, lastName } = req.body;

      if (!email || !password) {
        return next(ApiError.badRequest("Некорректные данные"));
      }

      const candidate = await User.findOne({ where: { email } });
      if (candidate) {
        return next(ApiError.badRequest("Пользователь уже существует"));
      }

      const hashPassword = await bcrypt.hash(password, 10);
      const user = await User.create({
        email,
        passwordHash: hashPassword,
        firstName,
        lastName,
        role: "trainee",
      });

      const token = generateJwt(user.id, user.email, user.role);
      return res.json({
        token,
      });
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async check(req, res) {
    const token = generateJwt(req.user.id, req.user.email, req.user.role);
    return res.json({ token, user: req.user });
  }
}

module.exports = new AuthController();
