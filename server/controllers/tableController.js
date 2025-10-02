const ApiError = require("../error/ApiError");
const { Table } = require("../models/models");

class TableController {
  async getAll(req, res, next) {
    try {
      const tables = await Table.findAll({
        where: { isActive: true },
        order: [["name", "ASC"]],
      });
      return res.json(tables);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async getOne(req, res, next) {
    try {
      const { id } = req.params;
      const table = await Table.findByPk(id);
      if (!table) {
        return next(ApiError.notFound("Столик не найден"));
      }
      return res.json(table);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async create(req, res, next) {
    try {
      const { name, capacity } = req.body;
      const table = await Table.create({ name, capacity });
      return res.json(table);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const table = await Table.findByPk(id);
      if (!table) {
        return next(ApiError.notFound("Столик не найден"));
      }

      await table.update(req.body);
      return res.json(table);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const table = await Table.findByPk(id);
      if (!table) {
        return next(ApiError.notFound("Столик не найден"));
      }

      await table.update({ isActive: false });
      return res.json({ message: "Столик деактивирован" });
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }
}

module.exports = new TableController();
