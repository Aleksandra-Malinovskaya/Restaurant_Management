const ApiError = require("../error/ApiError");

const adminOrChefMiddleware = (req, res, next) => {
  try {
    // Проверяем, что пользователь авторизован
    if (!req.user) {
      return next(ApiError.unauthorized("Пользователь не авторизован"));
    }

    // Проверяем, что пользователь имеет роль admin или chef
    if (
      req.user.role !== "admin" &&
      req.user.role !== "chef" &&
      req.user.role !== "super_admin"
    ) {
      return next(
        ApiError.forbidden(
          "Доступ запрещен. Требуется роль администратора или повара"
        )
      );
    }

    next();
  } catch (e) {
    return next(ApiError.unauthorized(e.message));
  }
};

module.exports = adminOrChefMiddleware;
