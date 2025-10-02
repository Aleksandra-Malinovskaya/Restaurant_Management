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
      const { tableId, reservedFrom, reservedTo, guestsCount } = req.query;

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

      // Проверяем пересечения по времени
      const conflictingReservation = await Reservation.findOne({
        where: {
          tableId,
          status: { [Op.in]: ["confirmed", "seated"] },
          [Op.or]: [
            {
              reservedFrom: { [Op.lt]: new Date(reservedTo) },
              reservedTo: { [Op.gt]: new Date(reservedFrom) },
            },
          ],
        },
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

      // Проверяем доступность используя ту же логику что и в checkAvailability
      const table = await Table.findByPk(tableId);
      if (!table) {
        return next(ApiError.notFound("Столик не найден"));
      }

      if (guestCount && guestCount > table.capacity) {
        return next(ApiError.badRequest("Превышена вместимость столика"));
      }

      // Проверяем пересечения по времени
      const conflictingReservation = await Reservation.findOne({
        where: {
          tableId,
          status: { [Op.in]: ["confirmed", "seated"] },
          [Op.or]: [
            {
              reservedFrom: { [Op.lt]: new Date(reservedTo) },
              reservedTo: { [Op.gt]: new Date(reservedFrom) },
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
        reservedFrom: new Date(reservedFrom),
        reservedTo: new Date(reservedTo),
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

      const reservation = await Reservation.findByPk(id);
      if (!reservation) {
        return next(ApiError.notFound("Бронирование не найдено"));
      }

      // Если меняется время или стол - проверяем доступность
      if (reservedFrom || reservedTo || tableId) {
        const checkTableId = tableId || reservation.tableId;
        const checkReservedFrom = reservedFrom || reservation.reservedFrom;
        const checkReservedTo = reservedTo || reservation.reservedTo;
        const checkGuestCount = guestCount || reservation.guestCount;

        // Проверяем стол
        const table = await Table.findByPk(checkTableId);
        if (!table) {
          return next(ApiError.notFound("Столик не найден"));
        }

        // Проверяем вместимость
        if (checkGuestCount && checkGuestCount > table.capacity) {
          return next(ApiError.badRequest("Превышена вместимость столика"));
        }

        // Проверяем пересечения по времени (исключая текущее бронирование)
        const conflictingReservation = await Reservation.findOne({
          where: {
            tableId: checkTableId,
            id: { [Op.ne]: id }, // Исключаем текущее бронирование
            status: { [Op.in]: ["confirmed", "seated"] },
            [Op.or]: [
              {
                reservedFrom: { [Op.lt]: new Date(checkReservedTo) },
                reservedTo: { [Op.gt]: new Date(checkReservedFrom) },
              },
            ],
          },
        });

        if (conflictingReservation) {
          return next(
            ApiError.badRequest({
              message: "Столик занят на указанное время",
              conflict: {
                id: conflictingReservation.id,
                reservedFrom: conflictingReservation.reservedFrom,
                reservedTo: conflictingReservation.reservedTo,
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

      await reservation.update(updateData);

      const updatedReservation = await Reservation.findByPk(id, {
        include: [
          { model: Table, as: "table" },
          { model: User, as: "user" },
        ],
      });

      return res.json(updatedReservation);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async changeStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const reservation = await Reservation.findByPk(id);
      if (!reservation) {
        return next(ApiError.notFound("Бронирование не найдено"));
      }

      if (
        (status === "confirmed" || status === "seated") &&
        reservation.status !== status
      ) {
        const conflictingReservation = await Reservation.findOne({
          where: {
            tableId: reservation.tableId,
            id: { [Op.ne]: id },
            status: { [Op.in]: ["confirmed", "seated"] },
            [Op.or]: [
              {
                reservedFrom: { [Op.lt]: reservation.reservedTo },
                reservedTo: { [Op.gt]: reservation.reservedFrom },
              },
            ],
          },
        });

        if (conflictingReservation) {
          return next(
            ApiError.badRequest({
              message: "Невозможно изменить статус - столик занят на это время",
              conflict: {
                id: conflictingReservation.id,
                reservedFrom: conflictingReservation.reservedFrom,
                reservedTo: conflictingReservation.reservedTo,
              },
            })
          );
        }
      }

      await reservation.update({ status });
      return res.json({ message: "Статус бронирования изменен" });
    } catch (e) {
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
