const ApiError = require("../error/ApiError");
const { Order, OrderItem, Dish, Table, User } = require("../models/models");
const { Op } = require("sequelize");

class OrderController {
  async getAll(req, res, next) {
    try {
      const { status, date } = req.query;
      const where = {};

      if (status) {
        if (status.includes(",")) {
          where.status = { [Op.in]: status.split(",") };
        } else {
          where.status = status;
        }
      }

      if (date) {
        const startDate = new Date(date);
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() + 1);

        where.createdAt = {
          [Op.gte]: startDate,
          [Op.lt]: endDate,
        };
      }

      const orders = await Order.findAll({
        where,
        include: [
          { model: Table, as: "table" },
          { model: User, as: "waiter" },
          {
            model: OrderItem,
            as: "items",
            include: [{ model: Dish, as: "dish" }],
          },
        ],
        order: [["createdAt", "DESC"]],
      });
      return res.json(orders);
    } catch (e) {
      console.error("Error in getAll orders:", e);
      next(ApiError.internal(e.message));
    }
  }

  async getKitchenOrders(req, res, next) {
    try {
      const orders = await Order.findAll({
        where: {
          status: { [Op.in]: ["open", "in_progress"] },
        },
        include: [
          { model: Table, as: "table" },
          {
            model: OrderItem,
            as: "items",
            where: { status: { [Op.in]: ["ordered", "preparing"] } },
            include: [{ model: Dish, as: "dish" }],
          },
        ],
        order: [["createdAt", "ASC"]],
      });
      return res.json(orders);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async getOne(req, res, next) {
    try {
      const { id } = req.params;
      const order = await Order.findByPk(id, {
        include: [
          { model: Table, as: "table" },
          { model: User, as: "waiter" },
          {
            model: OrderItem,
            as: "items",
            include: [{ model: Dish, as: "dish" }],
          },
        ],
      });
      if (!order) {
        return next(ApiError.notFound("Заказ не найден"));
      }
      return res.json(order);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async create(req, res, next) {
    try {
      const { tableId, items, orderType } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return next(ApiError.badRequest("Необходим массив items с блюдами"));
      }

      if (!tableId) {
        return next(ApiError.badRequest("Необходим tableId"));
      }

      const totalAmount = items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      const order = await Order.create({
        tableId,
        waiterId: req.user.id,
        orderType: orderType || "dine_in",
        totalAmount,
      });

      const orderItems = await Promise.all(
        items.map((item) =>
          OrderItem.create({
            orderId: order.id,
            dishId: item.dishId,
            quantity: item.quantity,
            itemPrice: item.price,
          })
        )
      );

      const fullOrder = await Order.findByPk(order.id, {
        include: [
          { model: Table, as: "table" },
          { model: User, as: "waiter" },
          {
            model: OrderItem,
            as: "items",
            include: [{ model: Dish, as: "dish" }],
          },
        ],
      });

      return res.json(fullOrder);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const { items, ...otherFields } = req.body;

      const order = await Order.findByPk(id, {
        include: [
          {
            model: OrderItem,
            as: "items",
            include: [{ model: Dish, as: "dish" }],
          },
        ],
      });

      if (!order) {
        return next(ApiError.notFound("Заказ не найден"));
      }

      if (items && Array.isArray(items)) {
        await OrderItem.destroy({ where: { orderId: id } });

        const orderItems = await Promise.all(
          items.map((item) =>
            OrderItem.create({
              orderId: order.id,
              dishId: item.dishId,
              quantity: item.quantity,
              itemPrice: item.price,
            })
          )
        );

        const totalAmount = items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        );

        await order.update({ ...otherFields, totalAmount });
      } else {
        await order.update(otherFields);
      }

      const updatedOrder = await Order.findByPk(id, {
        include: [
          { model: Table, as: "table" },
          { model: User, as: "waiter" },
          {
            model: OrderItem,
            as: "items",
            include: [{ model: Dish, as: "dish" }],
          },
        ],
      });

      return res.json(updatedOrder);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async changeStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const order = await Order.findByPk(id);
      if (!order) {
        return next(ApiError.notFound("Заказ не найден"));
      }

      await order.update({ status });
      return res.json({ message: "Статус заказа изменен" });
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async close(req, res, next) {
    try {
      const { id } = req.params;
      const { force } = req.body;

      const order = await Order.findByPk(id, {
        include: [
          {
            model: OrderItem,
            as: "items",
            include: [{ model: Dish, as: "dish" }],
          },
        ],
      });

      if (!order) {
        return next(ApiError.notFound("Заказ не найден"));
      }

      const orderedItems = order.items.filter(
        (item) => item.status === "ordered"
      );
      const preparingItems = order.items.filter(
        (item) => item.status === "preparing"
      );
      const readyItems = order.items.filter((item) => item.status === "ready");
      const servedItems = order.items.filter(
        (item) => item.status === "served"
      );

      if ((orderedItems.length > 0 || preparingItems.length > 0) && !force) {
        return next(
          ApiError.badRequest({
            message:
              "Невозможно закрыть заказ. Есть позиции в процессе приготовления",
            details: {
              ordered: orderedItems.length,
              preparing: preparingItems.length,
              ready: readyItems.length,
              served: servedItems.length,
            },
            forceCloseAvailable: true,
          })
        );
      }

      if (readyItems.length > 0 && !force) {
        return next(
          ApiError.badRequest({
            message: "Есть готовые, но не поданные позиции",
            details: {
              ready: readyItems.length,
              served: servedItems.length,
            },
            forceCloseAvailable: true,
          })
        );
      }

      await order.update({
        status: "closed",
        closedAt: new Date(),
      });

      if (force) {
        await OrderItem.update(
          { status: "served" },
          {
            where: {
              orderId: id,
              status: { [Op.in]: ["ordered", "preparing", "ready"] },
            },
          }
        );
      }

      const updatedOrder = await Order.findByPk(id, {
        include: [
          { model: Table, as: "table" },
          { model: User, as: "waiter" },
          {
            model: OrderItem,
            as: "items",
            include: [{ model: Dish, as: "dish" }],
          },
        ],
      });

      return res.json({
        message: force ? "Заказ принудительно закрыт" : "Заказ закрыт",
        order: updatedOrder,
      });
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }
  async canClose(req, res, next) {
    try {
      const { id } = req.params;

      const order = await Order.findByPk(id, {
        include: [
          {
            model: OrderItem,
            as: "items",
          },
        ],
      });

      if (!order) {
        return next(ApiError.notFound("Заказ не найден"));
      }

      const unfinishedItems = order.items.filter(
        (item) => item.status !== "served"
      );

      return res.json({
        canClose: unfinishedItems.length === 0,
        unfinishedItems: unfinishedItems.length,
        details: {
          ordered: order.items.filter((item) => item.status === "ordered")
            .length,
          preparing: order.items.filter((item) => item.status === "preparing")
            .length,
          ready: order.items.filter((item) => item.status === "ready").length,
          served: order.items.filter((item) => item.status === "served").length,
        },
      });
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }
}

module.exports = new OrderController();
