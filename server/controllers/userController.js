const ApiError = require("../error/ApiError");
const { User, Order, OrderItem } = require("../models/models");
const bcrypt = require("bcryptjs");
const { Op, fn, col, literal } = require("sequelize");

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
      const { firstName, lastName, email, password, role } = req.body;

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

      // Подготавливаем объект для обновления
      const updateData = { firstName, lastName, email };

      // Если передан пароль, хешируем его и добавляем к данным для обновления
      if (password) {
        const hashPassword = await bcrypt.hash(password, 10);
        updateData.passwordHash = hashPassword;
      }

      // Если передана роль и пользователь имеет права на ее изменение
      if (role) {
        updateData.role = role;
      }

      await user.update(updateData);
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

  // НОВЫЙ МЕТОД: Статистика по официантам
  async getWaitersStats(req, res, next) {
    try {
      const { period = "month" } = req.query;

      let startDate = new Date();
      switch (period) {
        case "day":
          startDate.setHours(0, 0, 0, 0);
          break;
        case "week":
          startDate.setDate(startDate.getDate() - 7);
          break;
        case "month":
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case "year":
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        default:
          startDate.setMonth(startDate.getMonth() - 1);
      }

      // Получаем всех официантов
      const waiters = await User.findAll({
        where: {
          role: "waiter",
          isActive: true,
        },
        attributes: ["id", "firstName", "lastName", "email"],
      });

      // Для каждого официанта получаем статистику заказов
      const waitersStats = await Promise.all(
        waiters.map(async (waiter) => {
          try {
            const orders = await Order.findAll({
              where: {
                waiterId: waiter.id,
                createdAt: {
                  [Op.gte]: startDate,
                },
              },
              attributes: [
                [fn("COUNT", col("id")), "totalOrders"],
                [fn("SUM", col("totalAmount")), "totalRevenue"],
                [fn("AVG", col("totalAmount")), "averageOrderValue"],
              ],
              raw: true,
            });

            const stats = orders[0] || {};

            return {
              waiterId: waiter.id,
              waiterName: `${waiter.firstName} ${waiter.lastName}`,
              totalOrders: parseInt(stats.totalOrders) || 0,
              totalRevenue: parseFloat(stats.totalRevenue) || 0,
              averageOrderValue: parseFloat(stats.averageOrderValue) || 0,
            };
          } catch (error) {
            console.error(
              `Error getting stats for waiter ${waiter.id}:`,
              error
            );
            return {
              waiterId: waiter.id,
              waiterName: `${waiter.firstName} ${waiter.lastName}`,
              totalOrders: 0,
              totalRevenue: 0,
              averageOrderValue: 0,
            };
          }
        })
      );

      // Сортируем по выручке
      const sortedStats = waitersStats.sort(
        (a, b) => b.totalRevenue - a.totalRevenue
      );

      return res.json(sortedStats);
    } catch (e) {
      console.error("Waiters stats error:", e);
      // В случае ошибки возвращаем пустой массив
      return res.json([]);
    }
  }

  // НОВЫЙ МЕТОД: Статистика по поварам
  async getChefsStats(req, res, next) {
    try {
      const { period = "month" } = req.query;

      let startDate = new Date();
      switch (period) {
        case "day":
          startDate.setHours(0, 0, 0, 0);
          break;
        case "week":
          startDate.setDate(startDate.getDate() - 7);
          break;
        case "month":
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case "year":
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        default:
          startDate.setMonth(startDate.getMonth() - 1);
      }

      // Получаем всех поваров
      const chefs = await User.findAll({
        where: {
          role: "chef",
          isActive: true,
        },
        attributes: ["id", "firstName", "lastName", "email"],
      });

      // Для каждого повара получаем статистику
      const chefsStats = await Promise.all(
        chefs.map(async (chef) => {
          try {
            const orderItems = await OrderItem.findAll({
              where: {
                chefId: chef.id,
                updatedAt: {
                  [Op.gte]: startDate,
                },
              },
              attributes: [
                [fn("COUNT", col("id")), "totalDishesPrepared"],
                [
                  fn(
                    "AVG",
                    literal(
                      'EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) / 60'
                    )
                  ),
                  "averagePreparationTime",
                ],
              ],
              raw: true,
            });

            const activeOrders = await OrderItem.count({
              where: {
                chefId: chef.id,
                status: "preparing",
              },
            });

            const stats = orderItems[0] || {};

            return {
              chefId: chef.id,
              chefName: `${chef.firstName} ${chef.lastName}`,
              totalDishesPrepared: parseInt(stats.totalDishesPrepared) || 0,
              averagePreparationTime: Math.round(
                parseFloat(stats.averagePreparationTime) || 0
              ),
              activeOrders: parseInt(activeOrders) || 0,
            };
          } catch (error) {
            console.error(`Error getting stats for chef ${chef.id}:`, error);
            return {
              chefId: chef.id,
              chefName: `${chef.firstName} ${chef.lastName}`,
              totalDishesPrepared: 0,
              averagePreparationTime: 0,
              activeOrders: 0,
            };
          }
        })
      );

      // Сортируем по количеству приготовленных блюд
      const sortedStats = chefsStats.sort(
        (a, b) => b.totalDishesPrepared - a.totalDishesPrepared
      );

      return res.json(sortedStats);
    } catch (e) {
      console.error("Chefs stats error:", e);
      // В случае ошибки возвращаем пустой массив
      return res.json([]);
    }
  }
}

module.exports = new UserController();
