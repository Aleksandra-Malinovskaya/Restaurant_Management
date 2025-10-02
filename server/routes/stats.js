const Router = require("express");
const router = new Router();
const statsController = require("../controllers/statsController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

router.get("/daily", authMiddleware, adminMiddleware, statsController.getDaily);
router.get(
  "/weekly",
  authMiddleware,
  adminMiddleware,
  statsController.getWeekly
);
router.get(
  "/monthly",
  authMiddleware,
  adminMiddleware,
  statsController.getMonthly
);
router.get(
  "/popular-dishes",
  authMiddleware,
  adminMiddleware,
  statsController.getPopularDishes
);

module.exports = router;
