const chefMiddleware = (req, res, next) => {
  if (
    req.user.role === "super_admin" ||
    req.user.role === "admin" ||
    req.user.role === "chef"
  ) {
    next();
  } else {
    return res.status(403).json({ message: "Доступ запрещен" });
  }
};

module.exports = chefMiddleware;
