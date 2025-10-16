const Router = require("express");
const router = new Router();
const orderController = require("../controllers/orderController");
const authMiddleware = require("../middleware/authMiddleware");
const waiterMiddleware = require("../middleware/waiterMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

router.get("/", authMiddleware, orderController.getAll);
router.get("/kitchen", authMiddleware, orderController.getKitchenOrders);
router.get("/:id", authMiddleware, orderController.getOne);
router.post("/", authMiddleware, waiterMiddleware, orderController.create);
router.put("/:id", authMiddleware, waiterMiddleware, orderController.update);
router.put("/:id/status", authMiddleware, orderController.changeStatus);
router.put(
  "/:id/served",
  authMiddleware,
  waiterMiddleware,
  orderController.markAsServed
);
router.put(
  "/:id/payment",
  authMiddleware,
  waiterMiddleware,
  orderController.markAsPayment
);
router.put(
  "/:id/close",
  authMiddleware,
  adminMiddleware,
  orderController.closeOrder
);
router.get("/:id/can-close", authMiddleware, orderController.canClose);
// ДОБАВЛЕН НОВЫЙ РОУТ ДЛЯ ПОДАЧИ ОТДЕЛЬНОГО БЛЮДА
router.put(
  "/order-items/:orderItemId/served",
  authMiddleware,
  waiterMiddleware,
  orderController.serveDish
);
// Роуты для повара
router.put(
  "/order-items/:orderItemId/take",
  authMiddleware,
  orderController.takeDish
);
router.put(
  "/order-items/:orderItemId/complete",
  authMiddleware,
  orderController.completeDish
);
router.post(
  "/:id/items",
  authMiddleware,
  waiterMiddleware,
  orderController.addItems
);
module.exports = router;
