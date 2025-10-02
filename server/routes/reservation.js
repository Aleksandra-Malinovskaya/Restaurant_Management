const Router = require("express");
const router = new Router();
const reservationController = require("../controllers/reservationController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

router.get("/", authMiddleware, reservationController.getAll);
router.get(
  "/available",
  authMiddleware,
  reservationController.checkAvailability
);
router.post("/", authMiddleware, adminMiddleware, reservationController.create);
router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  reservationController.update
);
router.put(
  "/:id/status",
  authMiddleware,
  adminMiddleware,
  reservationController.changeStatus
);
router.delete(
  "/:id",
  authMiddleware,
  adminMiddleware,
  reservationController.delete
);

module.exports = router;
