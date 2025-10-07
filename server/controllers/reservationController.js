const ApiError = require("../error/ApiError");
const { Reservation, Table, User } = require("../models/models");
const { Op } = require("sequelize");

class ReservationController {
  async getAll(req, res, next) {
    try {
      const { date, status } = req.query;
      const where = {};

      if (status) where.status = status;
      if (date) {
        const startDate = new Date(date);
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() + 1);

        where.reservedFrom = {
          [Op.gte]: startDate,
          [Op.lt]: endDate,
        };
      }

      const reservations = await Reservation.findAll({
        where,
        include: [
          { model: Table, as: "table" },
          { model: User, as: "user" },
        ],
        order: [["reservedFrom", "ASC"]],
      });
      return res.json(reservations);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async checkAvailability(req, res, next) {
    try {
      const {
        tableId,
        reservedFrom,
        reservedTo,
        guestsCount,
        excludeReservationId,
      } = req.query;

      console.log("=== CHECK AVAILABILITY ===");
      console.log("Params:", {
        tableId,
        reservedFrom,
        reservedTo,
        guestsCount,
        excludeReservationId,
      });

      if (!tableId || !reservedFrom || !reservedTo) {
        return next(
          ApiError.badRequest(
            "Необходимо указать tableId, reservedFrom и reservedTo"
          )
        );
      }

      const table = await Table.findByPk(tableId);
      if (!table) {
        return next(ApiError.notFound("Столик не найден"));
      }

      if (guestsCount && guestsCount > table.capacity) {
        return res.json({
          available: false,
          reason: "Превышена вместимость столика",
        });
      }

      const checkReservedFrom = new Date(reservedFrom);
      const checkReservedTo = new Date(reservedTo);

      // Создаем условие для исключения бронирования
      const whereCondition = {
        tableId,
        status: { [Op.in]: ["confirmed", "seated"] },
        [Op.and]: [
          {
            reservedFrom: { [Op.lt]: checkReservedTo },
          },
          {
            reservedTo: { [Op.gt]: checkReservedFrom },
          },
        ],
      };

      // Если указан excludeReservationId, исключаем это бронирование из проверки
      if (excludeReservationId) {
        whereCondition.id = { [Op.ne]: excludeReservationId };
      }

      // ПРАВИЛЬНАЯ проверка пересечений по времени
      const conflictingReservation = await Reservation.findOne({
        where: whereCondition,
      });

      console.log("Availability check result:", {
        available: !conflictingReservation,
        conflict: conflictingReservation
          ? {
              id: conflictingReservation.id,
              reservedFrom: conflictingReservation.reservedFrom,
              reservedTo: conflictingReservation.reservedTo,
              status: conflictingReservation.status,
            }
          : null,
      });

      const available = !conflictingReservation;
      return res.json({
        available,
        conflict: conflictingReservation
          ? {
              id: conflictingReservation.id,
              reservedFrom: conflictingReservation.reservedFrom,
              reservedTo: conflictingReservation.reservedTo,
            }
          : null,
      });
    } catch (e) {
      console.error("Availability check error:", e);
      next(ApiError.internal(e.message));
    }
  }

  async create(req, res, next) {
    try {
      const {
        tableId,
        customerName,
        customerPhone,
        guestCount,
        reservedFrom,
        reservedTo,
      } = req.body;

      // Проверяем обязательные поля
      if (
        !tableId ||
        !customerName ||
        !customerPhone ||
        !reservedFrom ||
        !reservedTo
      ) {
        return next(
          ApiError.badRequest(
            "Необходимо указать tableId, customerName, customerPhone, reservedFrom и reservedTo"
          )
        );
      }

      const table = await Table.findByPk(tableId);
      if (!table) {
        return next(ApiError.notFound("Столик не найден"));
      }

      if (guestCount && guestCount > table.capacity) {
        return next(ApiError.badRequest("Превышена вместимость столика"));
      }

      const checkReservedFrom = new Date(reservedFrom);
      const checkReservedTo = new Date(reservedTo);

      // Проверяем пересечения по времени
      const conflictingReservation = await Reservation.findOne({
        where: {
          tableId,
          status: { [Op.in]: ["confirmed", "seated"] },
          [Op.and]: [
            {
              reservedFrom: { [Op.lt]: checkReservedTo },
            },
            {
              reservedTo: { [Op.gt]: checkReservedFrom },
            },
          ],
        },
      });

      if (conflictingReservation) {
        return next(ApiError.badRequest("Столик занят на указанное время"));
      }

      // Создаем бронирование
      const reservation = await Reservation.create({
        tableId,
        customerName,
        customerPhone,
        guestCount,
        reservedFrom: checkReservedFrom,
        reservedTo: checkReservedTo,
        userId: req.user.id,
      });

      const fullReservation = await Reservation.findByPk(reservation.id, {
        include: [
          { model: Table, as: "table" },
          { model: User, as: "user" },
        ],
      });

      return res.json(fullReservation);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const { tableId, reservedFrom, reservedTo, guestCount, ...otherFields } =
        req.body;

      console.log("=== UPDATE RESERVATION ===");
      console.log("Reservation ID:", id);
      console.log("Request body:", req.body);

      const reservation = await Reservation.findByPk(id);
      if (!reservation) {
        return next(ApiError.notFound("Бронирование не найдено"));
      }

      console.log("Current reservation:", {
        tableId: reservation.tableId,
        reservedFrom: reservation.reservedFrom,
        reservedTo: reservation.reservedTo,
        status: reservation.status,
      });

      // Если меняется время или стол - проверяем доступность
      if (reservedFrom || reservedTo || tableId) {
        const checkTableId = tableId || reservation.tableId;
        const checkReservedFrom = new Date(
          reservedFrom || reservation.reservedFrom
        );
        const checkReservedTo = new Date(reservedTo || reservation.reservedTo);
        const checkGuestCount = guestCount || reservation.guestCount;

        console.log("Checking availability for:", {
          checkTableId,
          checkReservedFrom,
          checkReservedTo,
          checkGuestCount,
        });

        // Проверяем стол
        const table = await Table.findByPk(checkTableId);
        if (!table) {
          return next(ApiError.notFound("Столик не найден"));
        }

        // Проверяем вместимость
        if (checkGuestCount && checkGuestCount > table.capacity) {
          return next(ApiError.badRequest("Превышена вместимость столика"));
        }

        // Ищем конфликтующие бронирования (исключая текущее)
        const conflictingReservations = await Reservation.findAll({
          where: {
            tableId: checkTableId,
            id: { [Op.ne]: id }, // ВАЖНО: исключаем текущее бронирование
            status: { [Op.in]: ["confirmed", "seated"] },
            [Op.and]: [
              {
                reservedFrom: { [Op.lt]: checkReservedTo },
              },
              {
                reservedTo: { [Op.gt]: checkReservedFrom },
              },
            ],
          },
        });

        console.log(
          "Found conflicting reservations:",
          conflictingReservations.length
        );
        if (conflictingReservations.length > 0) {
          console.log(
            "Conflicts details:",
            conflictingReservations.map((r) => ({
              id: r.id,
              reservedFrom: r.reservedFrom,
              reservedTo: r.reservedTo,
              status: r.status,
              customerName: r.customerName,
            }))
          );

          const conflict = conflictingReservations[0];
          return next(
            ApiError.badRequest({
              message: "Столик занят на указанное время другим бронированием",
              conflict: {
                id: conflict.id,
                customerName: conflict.customerName,
                reservedFrom: conflict.reservedFrom,
                reservedTo: conflict.reservedTo,
              },
            })
          );
        }
      }

      // Обновляем бронирование
      const updateData = { ...otherFields };
      if (tableId) updateData.tableId = tableId;
      if (reservedFrom) updateData.reservedFrom = new Date(reservedFrom);
      if (reservedTo) updateData.reservedTo = new Date(reservedTo);
      if (guestCount) updateData.guestCount = guestCount;

      console.log("Updating with data:", updateData);

      await reservation.update(updateData);

      const updatedReservation = await Reservation.findByPk(id, {
        include: [
          { model: Table, as: "table" },
          { model: User, as: "user" },
        ],
      });

      console.log("Update successful");
      return res.json(updatedReservation);
    } catch (e) {
      console.error("Update error:", e);
      next(ApiError.internal(e.message));
    }
  }

  async changeStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      console.log("=== CHANGE STATUS ===");
      console.log("Reservation ID:", id);
      console.log("New status:", status);

      const reservation = await Reservation.findByPk(id);
      if (!reservation) {
        return next(ApiError.notFound("Бронирование не найдено"));
      }

      // Если меняем статус на confirmed или seated - проверяем конфликты
      if (
        (status === "confirmed" || status === "seated") &&
        reservation.status !== status
      ) {
        // Проверяем пересечения (исключая текущее бронирование)
        const conflictingReservation = await Reservation.findOne({
          where: {
            tableId: reservation.tableId,
            id: { [Op.ne]: id }, // ← ИСКЛЮЧАЕМ ТЕКУЩЕЕ БРОНИРОВАНИЕ
            status: { [Op.in]: ["confirmed", "seated"] },
            [Op.and]: [
              {
                reservedFrom: { [Op.lt]: reservation.reservedTo },
              },
              {
                reservedTo: { [Op.gt]: reservation.reservedFrom },
              },
            ],
          },
        });

        console.log(
          "Status change - conflicting reservation:",
          conflictingReservation
        );

        if (conflictingReservation) {
          return next(
            ApiError.badRequest({
              message:
                "Невозможно изменить статус - столик занят на это время другим бронированием",
              conflict: {
                id: conflictingReservation.id,
                customerName: conflictingReservation.customerName,
                reservedFrom: conflictingReservation.reservedFrom,
                reservedTo: conflictingReservation.reservedTo,
              },
            })
          );
        }
      }

      await reservation.update({ status });
      console.log("Status changed successfully");
      return res.json({ message: "Статус бронирования изменен" });
    } catch (e) {
      console.error("Status change error:", e);
      next(ApiError.internal(e.message));
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const reservation = await Reservation.findByPk(id);
      if (!reservation) {
        return next(ApiError.notFound("Бронирование не найдено"));
      }

      await reservation.destroy();
      return res.json({ message: "Бронирование удалено" });
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }
}

module.exports = new ReservationController();
