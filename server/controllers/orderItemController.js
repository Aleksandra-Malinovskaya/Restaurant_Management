const ApiError = require("../error/ApiError");
const { OrderItem, Dish, Order, Table } = require("../models/models");
const { Op } = require("sequelize");

class OrderItemController {
  async getKitchenItems(req, res, next) {
    try {
      const items = await OrderItem.findAll({
        where: {
          status: { [Op.in]: ["ordered", "preparing"] },
        },
        include: [
          { model: Dish, as: "dish" },
          {
            model: Order,
            as: "order",
            include: [{ model: Table, as: "table" }],
          },
        ],
        order: [["createdAt", "ASC"]],
      });
      return res.json(items);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async changeStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const item = await OrderItem.findByPk(id, {
        include: [{ model: Order, as: "order" }],
      });
      if (!item) {
        return next(ApiError.notFound("Позиция не найдена"));
      }

      const updateData = { status };
      if (status === "preparing" && !item.chefId) {
        updateData.chefId = req.user.id;
      }
      if (status === "ready") {
        updateData.preparedAt = new Date();
      }

      await item.update(updateData);

      if (status === "ready") {
        const pendingItems = await OrderItem.count({
          where: {
            orderId: item.orderId,
            status: { [Op.in]: ["ordered", "preparing"] },
          },
        });

        if (pendingItems === 0) {
          await item.order.update({ status: "ready" });
        }
      }

      return res.json({ message: "Статус позиции изменен" });
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async markServed(req, res, next) {
    try {
      const { id } = req.params;
      const item = await OrderItem.findByPk(id, {
        include: [{ model: Order, as: "order" }],
      });
      if (!item) {
        return next(ApiError.notFound("Позиция не найдена"));
      }

      if (item.status !== "ready") {
        return next(
          ApiError.badRequest("Можно отмечать только готовые позиции")
        );
      }

      await item.update({ status: "served" });

      // Проверяем, все ли позиции поданы
      const pendingItems = await OrderItem.count({
        where: {
          orderId: item.orderId,
          status: { [Op.in]: ["ready"] },
        },
      });

      if (pendingItems === 0) {
        await item.order.update({ status: "closed", closedAt: new Date() });
      }

      return res.json({ message: "Позиция отмечена как поданная" });
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }
}

module.exports = new OrderItemController();
