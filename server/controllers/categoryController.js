const ApiError = require("../error/ApiError");
const { DishCategory, Dish } = require("../models/models");

class CategoryController {
  async getAll(req, res, next) {
    try {
      const categories = await DishCategory.findAll({
        include: [{ model: Dish, as: "dishes" }],
        order: [["name", "ASC"]],
      });
      return res.json(categories);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }
  async getOne(req, res, next) {
    try {
      const { id } = req.params;
      const category = await DishCategory.findByPk(id);
      if (!category) {
        return next(ApiError.notFound("Категория не найдена"));
      }
      return res.json(category);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async create(req, res, next) {
    try {
      const { name } = req.body;
      const category = await DishCategory.create({ name });
      return res.json(category);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const category = await DishCategory.findByPk(id);
      if (!category) {
        return next(ApiError.notFound("Категория не найдена"));
      }

      await category.update(req.body);
      return res.json(category);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const category = await DishCategory.findByPk(id);
      if (!category) {
        return next(ApiError.notFound("Категория не найдена"));
      }

      const dishesCount = await Dish.count({ where: { categoryId: id } });
      if (dishesCount > 0) {
        return next(ApiError.badRequest("Нельзя удалить категорию с блюдами"));
      }

      await category.destroy();
      return res.json({ message: "Категория удалена" });
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }
}

module.exports = new CategoryController();
