const ApiError = require("../error/ApiError");
const { User } = require("../models/models");
const bcrypt = require("bcryptjs");

class UserController {
  async getAll(req, res, next) {
    try {
      const users = await User.findAll({
        attributes: { exclude: ["passwordHash"] },
        order: [["createdAt", "DESC"]],
      });
      return res.json(users);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async getOne(req, res, next) {
    try {
      const { id } = req.params;
      const user = await User.findByPk(id, {
        attributes: { exclude: ["passwordHash"] },
      });
      if (!user) {
        return next(ApiError.notFound("Пользователь не найден"));
      }
      return res.json(user);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async create(req, res, next) {
    try {
      const { email, password, firstName, lastName, role } = req.body;
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
        role: role || "trainee",
      });

      const { passwordHash, ...userData } = user.toJSON();
      return res.json(userData);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const { firstName, lastName, email } = req.body;

      const user = await User.findByPk(id);
      if (!user) {
        return next(ApiError.notFound("Пользователь не найден"));
      }

      if (email && email !== user.email) {
        const candidate = await User.findOne({ where: { email } });
        if (candidate) {
          return next(ApiError.badRequest("Email уже используется"));
        }
      }

      await user.update({ firstName, lastName, email });
      const { passwordHash, ...userData } = user.toJSON();
      return res.json(userData);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async changeRole(req, res, next) {
    try {
      const { id } = req.params;
      const { role } = req.body;

      const user = await User.findByPk(id);
      if (!user) {
        return next(ApiError.notFound("Пользователь не найден"));
      }

      await user.update({ role });
      return res.json({ message: "Роль успешно изменена" });
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async changeStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      const user = await User.findByPk(id);
      if (!user) {
        return next(ApiError.notFound("Пользователь не найден"));
      }

      await user.update({ isActive });
      return res.json({
        message: `Пользователь ${isActive ? "активирован" : "деактивирован"}`,
      });
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const user = await User.findByPk(id);
      if (!user) {
        return next(ApiError.notFound("Пользователь не найден"));
      }

      await user.destroy();
      return res.json({ message: "Пользователь удален" });
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }
}

module.exports = new UserController();
