const Router = require("express");
const router = new Router();
const orderController = require("../controllers/orderController");
const authMiddleware = require("../middleware/authMiddleware");
const waiterMiddleware = require("../middleware/waiterMiddleware");

router.get("/", authMiddleware, orderController.getAll);
router.get("/kitchen", authMiddleware, orderController.getKitchenOrders);
router.get("/:id", authMiddleware, orderController.getOne);
router.post("/", authMiddleware, waiterMiddleware, orderController.create);
router.put("/:id", authMiddleware, waiterMiddleware, orderController.update);
router.put("/:id/status", authMiddleware, orderController.changeStatus);
router.put("/:id/close", authMiddleware, orderController.close);
router.get("/:id/can-close", authMiddleware, orderController.canClose);

module.exports = router;
