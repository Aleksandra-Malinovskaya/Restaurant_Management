const ApiError = require("../error/ApiError");
const { Dish, DishCategory } = require("../models/models");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

class DishController {
  async getAll(req, res, next) {
    try {
      let { categoryId, isActive, limit, page } = req.query;
      page = page || 1;
      limit = limit || 9;
      let offset = page * limit - limit;

      let where = {};

      if (categoryId) {
        where.categoryId = categoryId;
      }
      if (isActive !== undefined) {
        where.isActive = isActive === "true";
      }

      const dishes = await Dish.findAndCountAll({
        where,
        include: [
          {
            model: DishCategory,
            as: "category",
          },
        ],
        limit,
        offset,
        order: [["createdAt", "DESC"]],
      });

      return res.json(dishes);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async getOne(req, res, next) {
    try {
      const { id } = req.params;
      const dish = await Dish.findByPk(id, {
        include: [
          {
            model: DishCategory,
            as: "category",
          },
        ],
      });
      if (!dish) {
        return next(ApiError.notFound("Блюдо не найдено"));
      }
      return res.json(dish);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async create(req, res, next) {
    try {
      const {
        name,
        price,
        categoryId,
        ingredients,
        allergens,
        nutritionInfo,
        cookingTimeMin,
        isActive,
        isStopped,
      } = req.body;

      let fileName = null;

      if (req.files && req.files.img) {
        const { img } = req.files;
        fileName = uuidv4() + ".jpg";

        const fs = require("fs");
        const staticPath = path.resolve(__dirname, "..", "static");
        if (!fs.existsSync(staticPath)) {
          fs.mkdirSync(staticPath, { recursive: true });
        }

        await img.mv(path.resolve(staticPath, fileName));
      }

      const dish = await Dish.create({
        name,
        price,
        categoryId,
        ingredients,
        allergens,
        nutritionInfo,
        cookingTimeMin: cookingTimeMin || 15,
        isActive: isActive !== undefined ? isActive === "true" : true,
        isStopped: isStopped !== undefined ? isStopped === "true" : false,
        imgUrl: fileName ? `/static/${fileName}` : null,
      });

      return res.json(dish);
    } catch (e) {
      next(ApiError.badRequest(e.message));
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const dish = await Dish.findByPk(id);
      if (!dish) {
        return next(ApiError.notFound("Блюдо не найдено"));
      }

      let fileName = dish.imgUrl;

      if (req.files && req.files.img) {
        const { img } = req.files;
        fileName = uuidv4() + ".jpg";

        const fs = require("fs");
        const staticPath = path.resolve(__dirname, "..", "static");
        if (!fs.existsSync(staticPath)) {
          fs.mkdirSync(staticPath, { recursive: true });
        }

        await img.mv(path.resolve(staticPath, fileName));

        if (dish.imgUrl) {
          const oldImagePath = path.resolve(__dirname, "..", dish.imgUrl);
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        }

        req.body.imgUrl = `/static/${fileName}`;
      }

      // Разрешаем обновление только определенных полей
      const allowedFields = [
        "name",
        "price",
        "categoryId",
        "ingredients",
        "allergens",
        "nutritionInfo",
        "cookingTimeMin",
        "isActive",
        "isStopped",
        "imgUrl",
      ];

      const updateData = {};
      allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) {
          // Преобразуем строковые значения в булевы для isActive и isStopped
          if (field === "isActive" || field === "isStopped") {
            updateData[field] =
              req.body[field] === "true" || req.body[field] === true;
          } else {
            updateData[field] = req.body[field];
          }
        }
      });

      await dish.update(updateData);
      return res.json(dish);
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async toggleStop(req, res, next) {
    try {
      const { id } = req.params;
      const dish = await Dish.findByPk(id);
      if (!dish) {
        return next(ApiError.notFound("Блюдо не найдено"));
      }

      await dish.update({ isStopped: !dish.isStopped });
      return res.json({
        message: `Блюдо ${
          !dish.isStopped ? "снято со стопа" : "поставлено на стоп"
        }`,
      });
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const dish = await Dish.findByPk(id);
      if (!dish) {
        return next(ApiError.notFound("Блюдо не найдено"));
      }

      if (dish.imgUrl) {
        const fs = require("fs");
        const imagePath = path.resolve(__dirname, "..", dish.imgUrl);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }

      await dish.destroy();
      return res.json({ message: "Блюдо удалено" });
    } catch (e) {
      next(ApiError.internal(e.message));
    }
  }
}

module.exports = new DishController();
