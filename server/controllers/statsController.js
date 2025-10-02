const ApiError = require("../error/ApiError");
const {
  Order,
  OrderItem,
  Dish,
  Reservation,
  sequelize,
} = require("../models/models");
const { Op, fn, col, literal } = require("sequelize");

class StatsController {
  async getDaily(req, res, next) {
    try {
      const { date } = req.query;
      const targetDate = date ? new Date(date) : new Date();

      const startDate = new Date(targetDate);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(targetDate);
      endDate.setHours(23, 59, 59, 999);

      const orderStats = await Order.findOne({
        where: {
          createdAt: {
            [Op.between]: [startDate, endDate],
          },
        },
        attributes: [
          [fn("COUNT", col("id")), "totalOrders"],
          [fn("SUM", col("totalAmount")), "totalRevenue"],
          [fn("AVG", col("totalAmount")), "averageOrderValue"],
          [fn("COUNT", literal('DISTINCT "waiterId"')), "uniqueWaiters"],
        ],
        raw: true,
      });

      const reservationStats = await Reservation.findOne({
        where: {
          reservedFrom: {
            [Op.between]: [startDate, endDate],
          },
        },
        attributes: [
          [fn("COUNT", col("id")), "totalReservations"],
          [fn("SUM", col("guestCount")), "totalGuests"],
        ],
        raw: true,
      });

      const orderStatusStats = await Order.findAll({
        where: {
          createdAt: {
            [Op.between]: [startDate, endDate],
          },
        },
        attributes: ["status", [fn("COUNT", col("id")), "count"]],
        group: ["status"],
        raw: true,
      });

      const stats = {
        date: targetDate.toISOString().split("T")[0],
        orders: {
          total: parseInt(orderStats?.totalOrders) || 0,
          revenue: parseFloat(orderStats?.totalRevenue) || 0,
          averageOrderValue: parseFloat(orderStats?.averageOrderValue) || 0,
          uniqueWaiters: parseInt(orderStats?.uniqueWaiters) || 0,
        },
        reservations: {
          total: parseInt(reservationStats?.totalReservations) || 0,
          totalGuests: parseInt(reservationStats?.totalGuests) || 0,
        },
        orderStatuses: orderStatusStats.reduce((acc, stat) => {
          acc[stat.status] = parseInt(stat.count);
          return acc;
        }, {}),
      };

      return res.json(stats);
    } catch (e) {
      console.error("Daily stats error:", e);
      next(ApiError.internal(e.message));
    }
  }

  async getWeekly(req, res, next) {
    try {
      const { startDate } = req.query;
      let start = startDate ? new Date(startDate) : new Date();

      start.setDate(
        start.getDate() - start.getDay() + (start.getDay() === 0 ? -6 : 1)
      );
      start.setHours(0, 0, 0, 0);

      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);

      const dailyStats = await Order.findAll({
        where: {
          createdAt: {
            [Op.between]: [start, end],
          },
        },
        attributes: [
          [fn("DATE", col("createdAt")), "date"],
          [fn("COUNT", col("id")), "ordersCount"],
          [fn("SUM", col("totalAmount")), "dailyRevenue"],
          [fn("AVG", col("totalAmount")), "averageOrderValue"],
        ],
        group: [fn("DATE", col("createdAt"))],
        order: [[fn("DATE", col("createdAt")), "ASC"]],
        raw: true,
      });

      const weeklyStats = await Order.findOne({
        where: {
          createdAt: {
            [Op.between]: [start, end],
          },
        },
        attributes: [
          [fn("COUNT", col("id")), "totalOrders"],
          [fn("SUM", col("totalAmount")), "totalRevenue"],
          [fn("AVG", col("totalAmount")), "averageOrderValue"],
          [fn("COUNT", literal('DISTINCT "waiterId"')), "uniqueWaiters"],
        ],
        raw: true,
      });

      const reservationStats = await Reservation.findOne({
        where: {
          reservedFrom: {
            [Op.between]: [start, end],
          },
        },
        attributes: [
          [fn("COUNT", col("id")), "totalReservations"],
          [fn("SUM", col("guestCount")), "totalGuests"],
        ],
        raw: true,
      });

      const stats = {
        period: {
          start: start.toISOString().split("T")[0],
          end: end.toISOString().split("T")[0],
        },
        dailyStats: dailyStats.map((day) => ({
          date: day.date,
          ordersCount: parseInt(day.ordersCount) || 0,
          dailyRevenue: parseFloat(day.dailyRevenue) || 0,
          averageOrderValue: parseFloat(day.averageOrderValue) || 0,
        })),
        totals: {
          orders: {
            total: parseInt(weeklyStats?.totalOrders) || 0,
            revenue: parseFloat(weeklyStats?.totalRevenue) || 0,
            averageOrderValue: parseFloat(weeklyStats?.averageOrderValue) || 0,
            uniqueWaiters: parseInt(weeklyStats?.uniqueWaiters) || 0,
          },
          reservations: {
            total: parseInt(reservationStats?.totalReservations) || 0,
            totalGuests: parseInt(reservationStats?.totalGuests) || 0,
          },
        },
      };

      return res.json(stats);
    } catch (e) {
      console.error("Weekly stats error:", e);
      next(ApiError.internal(e.message));
    }
  }

  async getMonthly(req, res, next) {
    try {
      const { year, month } = req.query;
      const now = new Date();
      const targetYear = parseInt(year) || now.getFullYear();
      const targetMonth = parseInt(month) || now.getMonth() + 1;

      const startDate = new Date(targetYear, targetMonth - 1, 1);
      const endDate = new Date(targetYear, targetMonth, 0);
      endDate.setHours(23, 59, 59, 999);

      const dailyStats = await Order.findAll({
        where: {
          createdAt: {
            [Op.between]: [startDate, endDate],
          },
        },
        attributes: [
          [fn("DATE", col("createdAt")), "date"],
          [fn("COUNT", col("id")), "ordersCount"],
          [fn("SUM", col("totalAmount")), "dailyRevenue"],
        ],
        group: [fn("DATE", col("createdAt"))],
        order: [[fn("DATE", col("createdAt")), "ASC"]],
        raw: true,
      });

      const monthlyStats = await Order.findOne({
        where: {
          createdAt: {
            [Op.between]: [startDate, endDate],
          },
        },
        attributes: [
          [fn("COUNT", col("id")), "totalOrders"],
          [fn("SUM", col("totalAmount")), "totalRevenue"],
          [fn("AVG", col("totalAmount")), "averageOrderValue"],
          [fn("MAX", col("totalAmount")), "maxOrderValue"],
          [fn("COUNT", literal('DISTINCT "waiterId"')), "uniqueWaiters"],
        ],
        raw: true,
      });

      const reservationStats = await Reservation.findOne({
        where: {
          reservedFrom: {
            [Op.between]: [startDate, endDate],
          },
        },
        attributes: [
          [fn("COUNT", col("id")), "totalReservations"],
          [fn("SUM", col("guestCount")), "totalGuests"],
          [fn("AVG", col("guestCount")), "averageGuestsPerReservation"],
        ],
        raw: true,
      });

      const stats = {
        period: {
          year: targetYear,
          month: targetMonth,
          monthName: startDate.toLocaleString("default", { month: "long" }),
        },
        dailyStats: dailyStats.map((day) => ({
          date: day.date,
          ordersCount: parseInt(day.ordersCount) || 0,
          dailyRevenue: parseFloat(day.dailyRevenue) || 0,
        })),
        totals: {
          orders: {
            total: parseInt(monthlyStats?.totalOrders) || 0,
            revenue: parseFloat(monthlyStats?.totalRevenue) || 0,
            averageOrderValue: parseFloat(monthlyStats?.averageOrderValue) || 0,
            maxOrderValue: parseFloat(monthlyStats?.maxOrderValue) || 0,
            uniqueWaiters: parseInt(monthlyStats?.uniqueWaiters) || 0,
          },
          reservations: {
            total: parseInt(reservationStats?.totalReservations) || 0,
            totalGuests: parseInt(reservationStats?.totalGuests) || 0,
            averageGuestsPerReservation:
              parseFloat(reservationStats?.averageGuestsPerReservation) || 0,
          },
        },
      };

      return res.json(stats);
    } catch (e) {
      console.error("Monthly stats error:", e);
      next(ApiError.internal(e.message));
    }
  }

  async getPopularDishes(req, res, next) {
    try {
      const { period = "month", limit = 10 } = req.query;

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

      const popularDishes = await OrderItem.findAll({
        include: [
          {
            model: Order,
            as: "order",
            where: {
              createdAt: {
                [Op.gte]: startDate,
              },
            },
            attributes: [],
          },
          {
            model: Dish,
            as: "dish",
            attributes: ["id", "name", "price"],
          },
        ],
        attributes: [
          "dishId",
          [fn("SUM", col("quantity")), "totalquantity"],
          [
            fn("SUM", literal('quantity * "order_item"."itemPrice"')),
            "totalrevenue",
          ],
          [fn("COUNT", literal('DISTINCT "orderId"')), "uniqueorders"],
        ],
        group: ["dishId", "dish.id", "dish.name", "dish.price"],
        order: [[literal("SUM(quantity)"), "DESC"]],
        limit: parseInt(limit),
        raw: false,
      });

      const stats = popularDishes.map((dish) => ({
        dishId: dish.dishId,
        dishName: dish.dish.name,
        price: parseFloat(dish.dish.price),
        totalQuantity: parseInt(dish.get("totalquantity")) || 0,
        totalRevenue: parseFloat(dish.get("totalrevenue")) || 0,
        uniqueOrders: parseInt(dish.get("uniqueorders")) || 0,
      }));

      return res.json({
        period: period,
        limit: parseInt(limit),
        popularDishes: stats,
      });
    } catch (e) {
      console.error("Popular dishes stats error:", e);
      next(ApiError.internal(e.message));
    }
  }
}

module.exports = new StatsController();
