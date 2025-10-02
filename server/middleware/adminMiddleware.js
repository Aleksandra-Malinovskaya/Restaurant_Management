const adminMiddleware = (req, res, next) => {
  if (req.user.role === "super_admin" || req.user.role === "admin") {
    next();
  } else {
    return res.status(403).json({ message: "Доступ запрещен" });
  }
};

module.exports = adminMiddleware;
