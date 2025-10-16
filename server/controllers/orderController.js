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
          // Включаем все статусы кроме closed
          status: { [Op.ne]: "closed" },
        },
        include: [
          { model: Table, as: "table" },
          { model: User, as: "waiter" },
          {
            model: OrderItem,
            as: "items",
            include: [
              { model: Dish, as: "dish" },
              { model: User, as: "chef" },
            ],
            where: {
              // Фильтруем только те блюда, которые нужны кухне
              status: { [Op.in]: ["ordered", "preparing", "ready"] },
            },
            required: false, // LEFT JOIN чтобы заказы без активных блюд тоже возвращались
          },
        ],
        order: [["createdAt", "ASC"]],
      });

      // Фильтруем на бэкенде заказы, у которых есть активные блюда
      const filteredOrders = orders.filter(
        (order) => order.items && order.items.length > 0
      );

      return res.json(filteredOrders);
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

      // WebSocket уведомление поварам о новом заказе - ИСПРАВЛЕНО
      const io = req.app.get("io");
      if (io) {
        console.log(
          "Server: Отправка WebSocket уведомления поварам о заказе #" +
            fullOrder.id
        );

        // Отправляем через socket событие, которое обрабатывается в server.js
        io.emit("notify_chef_new_order", fullOrder);

        // Дублируем прямое уведомление для надежности
        io.emit("new_order_notification", {
          message: `Новый заказ #${fullOrder.id}`,
          order: fullOrder,
          timestamp: new Date().toLocaleTimeString(),
        });
      } else {
        console.log("Server: io не доступен в контроллере!");
      }

      return res.json(fullOrder);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const { items, ...otherFields } = req.body;

      const order = await Order.findByPk(id);
      if (!order) {
        return next(ApiError.notFound("Заказ не найден"));
      }

      if (items && Array.isArray(items)) {
        await OrderItem.destroy({ where: { orderId: id } });

        const dishIds = items.map((item) => item.dishId);
        const dishes = await Dish.findAll({
          where: { id: { [Op.in]: dishIds } },
        });

        const dishPriceMap = {};
        dishes.forEach((dish) => {
          dishPriceMap[dish.id] = dish.price;
        });

        const orderItems = await Promise.all(
          items.map((item) => {
            const itemPrice = dishPriceMap[item.dishId] || item.price || 0;

            return OrderItem.create({
              orderId: order.id,
              dishId: item.dishId,
              quantity: item.quantity,
              itemPrice: itemPrice,
              notes: item.notes,
            });
          })
        );

        const totalAmount = items.reduce((sum, item) => {
          const itemPrice = dishPriceMap[item.dishId] || item.price || 0;
          return sum + itemPrice * item.quantity;
        }, 0);

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
      console.error("Error updating order:", e);
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

  async markAsServed(req, res, next) {
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

      const notServedItems = order.items.filter(
        (item) => item.status !== "served"
      );

      if (notServedItems.length > 0) {
        return next(ApiError.badRequest("Не все блюда поданы"));
      }

      await order.update({ status: "served" });

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
        message: "Заказ переведен в статус 'Подано'",
        order: updatedOrder,
      });
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async markAsPayment(req, res, next) {
    try {
      const { id } = req.params;

      const order = await Order.findByPk(id);
      if (!order) {
        return next(ApiError.notFound("Заказ не найден"));
      }

      if (order.status !== "served") {
        return next(
          ApiError.badRequest("Заказ должен быть в статусе 'Подано'")
        );
      }

      await order.update({ status: "payment" });

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
        message: "Заказ переведен в статус 'Ожидание оплаты'",
        order: updatedOrder,
      });
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async closeOrder(req, res, next) {
    try {
      const { id } = req.params;

      const order = await Order.findByPk(id);
      if (!order) {
        return next(ApiError.notFound("Заказ не найден"));
      }

      if (order.status !== "payment") {
        return next(
          ApiError.badRequest("Заказ должен быть в статусе 'Ожидание оплаты'")
        );
      }

      await order.update({
        status: "closed",
        closedAt: new Date(),
      });

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
        message: "Заказ закрыт",
        order: updatedOrder,
      });
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async serveDish(req, res, next) {
    try {
      const { orderItemId } = req.params;

      const orderItem = await OrderItem.findByPk(orderItemId, {
        include: [
          {
            model: Order,
            as: "order",
            include: [
              {
                model: OrderItem,
                as: "items",
              },
            ],
          },
        ],
      });

      if (!orderItem) {
        return next(ApiError.notFound("Позиция заказа не найдена"));
      }

      if (orderItem.status !== "ready") {
        return next(ApiError.badRequest("Блюдо должно быть готово к подаче"));
      }

      await orderItem.update({ status: "served" });

      const notServedItems = await OrderItem.count({
        where: {
          orderId: orderItem.order.id,
          status: { [Op.ne]: "served" },
        },
      });

      if (notServedItems === 0) {
        await orderItem.order.update({ status: "served" });
      }

      const updatedOrder = await Order.findByPk(orderItem.order.id, {
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
        message: "Блюдо отмечено как поданное",
        order: updatedOrder,
      });
    } catch (error) {
      console.error("Ошибка подачи блюда:", error);
      next(ApiError.internal(error.message));
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

      const notServedItems = order.items.filter(
        (item) => item.status !== "served"
      );

      return res.json({
        canMarkServed:
          notServedItems.length === 0 &&
          order.status !== "served" &&
          order.status !== "payment" &&
          order.status !== "closed",
        canMarkPayment: order.status === "served",
        canClose: order.status === "payment",
        notServedItems: notServedItems.length,
        currentStatus: order.status,
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

  async takeDish(req, res, next) {
    try {
      const { orderItemId } = req.params;
      const chefId = req.user.id;

      const orderItem = await OrderItem.findByPk(orderItemId, {
        include: [{ model: Order, as: "order" }],
      });

      if (!orderItem) {
        return next(ApiError.notFound("Позиция заказа не найдена"));
      }

      if (orderItem.status !== "ordered") {
        return next(ApiError.badRequest("Блюдо уже взято в работу"));
      }

      await orderItem.update({
        status: "preparing",
        chefId: chefId,
      });

      if (orderItem.order.status === "open") {
        await orderItem.order.update({ status: "in_progress" });
      }

      const updatedOrder = await Order.findByPk(orderItem.order.id, {
        include: [
          { model: Table, as: "table" },
          { model: User, as: "waiter" },
          {
            model: OrderItem,
            as: "items",
            include: [
              { model: Dish, as: "dish" },
              { model: User, as: "chef" },
            ],
          },
        ],
      });

      return res.json({
        message: "Блюдо взято в работу",
        order: updatedOrder,
      });
    } catch (error) {
      console.error("Ошибка взятия блюда:", error);
      next(ApiError.internal(error.message));
    }
  }

  async completeDish(req, res, next) {
    try {
      const { orderItemId } = req.params;
      const chefId = req.user.id;

      const orderItem = await OrderItem.findByPk(orderItemId, {
        include: [
          {
            model: Order,
            as: "order",
            include: [
              { model: Table, as: "table" },
              { model: OrderItem, as: "items" },
            ],
          },
          { model: Dish, as: "dish" },
        ],
      });

      if (!orderItem) {
        return next(ApiError.notFound("Позиция заказа не найдена"));
      }

      if (orderItem.status !== "preparing" || orderItem.chefId !== chefId) {
        return next(ApiError.badRequest("Нельзя завершить это блюдо"));
      }

      await orderItem.update({ status: "ready" });

      // WebSocket уведомление официантам о готовом блюде
      const io = req.app.get("io");
      if (io) {
        console.log(
          "🍽️ Server: Отправка WebSocket уведомления о готовом блюде"
        );

        // Уведомление о готовом блюде
        io.emit("dish_ready_notification", {
          message: `Блюдо "${orderItem.dish.name}" готово`, // ДОБАВЛЕНО ПОЛЕ message
          orderId: orderItem.order.id,
          dishName: orderItem.dish.name,
          tableNumber: orderItem.order.table
            ? orderItem.order.table.name
            : "Неизвестно",
          timestamp: new Date().toLocaleTimeString(),
        });

        console.log("✅ Уведомление о готовом блюде отправлено");
      }

      const notReadyItems = await OrderItem.count({
        where: {
          orderId: orderItem.order.id,
          status: { [Op.notIn]: ["ready", "served"] },
        },
      });

      if (notReadyItems === 0) {
        await orderItem.order.update({ status: "ready" });
      }

      const updatedOrder = await Order.findByPk(orderItem.order.id, {
        include: [
          { model: Table, as: "table" },
          { model: User, as: "waiter" },
          {
            model: OrderItem,
            as: "items",
            include: [
              { model: Dish, as: "dish" },
              { model: User, as: "chef" },
            ],
          },
        ],
      });

      return res.json({
        message: "Блюдо отмечено как готовое",
        order: updatedOrder,
      });
    } catch (error) {
      console.error("Ошибка завершения блюда:", error);
      next(ApiError.internal(error.message));
    }
  }

  async addItems(req, res, next) {
    try {
      const { id } = req.params;
      const { items } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return next(ApiError.badRequest("Необходим массив items с блюдами"));
      }

      const order = await Order.findByPk(id, {
        include: [
          { model: Table, as: "table" },
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

      const dishIds = items.map((item) => item.dishId);
      const dishes = await Dish.findAll({
        where: { id: { [Op.in]: dishIds } },
      });

      const dishPriceMap = {};
      dishes.forEach((dish) => {
        dishPriceMap[dish.id] = dish.price;
      });

      const newOrderItems = await Promise.all(
        items.map((item) => {
          const itemPrice = dishPriceMap[item.dishId] || item.price || 0;

          return OrderItem.create({
            orderId: order.id,
            dishId: item.dishId,
            quantity: item.quantity,
            itemPrice: itemPrice,
            notes: item.notes,
            status: "ordered",
          });
        })
      );

      const allItems = [...order.items, ...newOrderItems];
      const totalAmount = allItems.reduce(
        (sum, item) => sum + item.itemPrice * item.quantity,
        0
      );

      await order.update({ totalAmount });

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

      // WebSocket уведомление поварам о добавленных блюдах в существующий заказ
      const io = req.app.get("io");
      if (io) {
        console.log(
          "🍽️ Server: Отправка WebSocket уведомления о добавленных блюдах в заказ #" +
            updatedOrder.id
        );

        // Уведомление о добавленных блюдах
        io.emit("new_order_items_notification", {
          message: `В заказ #${updatedOrder.id} добавлены новые блюда`,
          order: updatedOrder,
          newItems: newOrderItems,
          tableNumber: updatedOrder.table
            ? updatedOrder.table.name
            : "Неизвестно",
          timestamp: new Date().toLocaleTimeString(),
        });

        // Дублируем для совместимости с существующей логикой
        io.emit("new_order_notification", {
          message: `В заказ #${updatedOrder.id} добавлены новые блюда`,
          order: updatedOrder,
          timestamp: new Date().toLocaleTimeString(),
        });

        console.log("✅ Уведомление о добавленных блюдах отправлено");
      }

      return res.json(updatedOrder);
    } catch (e) {
      console.error("Error adding items to order:", e);
      next(ApiError.internal(e.message));
    }
  }
}

module.exports = new OrderController();
