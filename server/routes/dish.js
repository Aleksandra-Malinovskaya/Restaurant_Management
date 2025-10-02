const Router = require("express");
const router = new Router();
const dishController = require("../controllers/dishController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

router.get("/", authMiddleware, dishController.getAll);
router.get("/:id", authMiddleware, dishController.getOne);
router.post("/", authMiddleware, adminMiddleware, dishController.create);
router.put("/:id", authMiddleware, adminMiddleware, dishController.update);
router.put(
  "/:id/stop",
  authMiddleware,
  adminMiddleware,
  dishController.toggleStop
);
router.delete("/:id", authMiddleware, adminMiddleware, dishController.delete);

module.exports = router;
