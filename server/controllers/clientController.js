const ApiError = require("../error/ApiError");
const {
  Dish,
  DishCategory,
  Table,
  Order,
  OrderItem,
} = require("../models/models");

class ClientController {
  async getMenu(req, res, next) {
    try {
      const categories = await DishCategory.findAll({
        include: [
          {
            model: Dish,
            as: "dishes",
            where: { isActive: true, isStopped: false },
            required: false,
          },
        ],
        order: [["name", "ASC"]],
      });

      return res.json(categories);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async getMenuForTable(req, res, next) {
    try {
      const { tableId } = req.params;
      const table = await Table.findByPk(tableId);
      if (!table) {
        return next(ApiError.notFound("Столик не найден"));
      }

      const categories = await DishCategory.findAll({
        include: [
          {
            model: Dish,
            as: "dishes",
            where: { isActive: true, isStopped: false },
            required: false,
          },
        ],
        order: [["name", "ASC"]],
      });

      return res.json({
        table,
        menu: categories,
      });
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async createOrder(req, res, next) {
    try {
      const { tableId, items, customerName } = req.body;

      const table = await Table.findByPk(tableId);
      if (!table) {
        return next(ApiError.notFound("Столик не найден"));
      }

      for (const item of items) {
        const dish = await Dish.findByPk(item.dishId);
        if (!dish || !dish.isActive || dish.isStopped) {
          return next(ApiError.badRequest(`Блюдо "${dish?.name}" недоступно`));
        }
      }

      const totalAmount = items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      const order = await Order.create({
        tableId,
        orderType: "dine_in",
        totalAmount,
        customerName,
      });

      await Promise.all(
        items.map((item) =>
          OrderItem.create({
            orderId: order.id,
            dishId: item.dishId,
            quantity: item.quantity,
            itemPrice: item.price,
          })
        )
      );

      return res.json({
        message: "Заказ создан успешно",
        orderId: order.id,
        totalAmount,
      });
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }
}

module.exports = new ClientController();
