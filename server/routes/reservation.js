const Router = require("express");
const router = new Router();
const reservationController = require("../controllers/reservationController");
const authMiddleware = require("../middleware/authMiddleware");
const adminOrWaiterMiddleware = require("../middleware/adminOrWaiterMiddleware"); // Новый middleware

router.get("/", authMiddleware, reservationController.getAll);
router.get(
  "/available",
  authMiddleware,
  reservationController.checkAvailability
);
router.post(
  "/",
  authMiddleware,
  adminOrWaiterMiddleware,
  reservationController.create
);
router.put(
  "/:id",
  authMiddleware,
  adminOrWaiterMiddleware,
  reservationController.update
);
router.put(
  "/:id/status",
  authMiddleware,
  adminOrWaiterMiddleware,
  reservationController.changeStatus
);
router.delete(
  "/:id",
  authMiddleware,
  adminOrWaiterMiddleware,
  reservationController.delete
);

module.exports = router;
