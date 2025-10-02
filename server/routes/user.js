const Router = require("express");
const router = new Router();
const userController = require("../controllers/userController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

router.get("/", authMiddleware, adminMiddleware, userController.getAll);
router.get("/:id", authMiddleware, adminMiddleware, userController.getOne);
router.post("/", authMiddleware, adminMiddleware, userController.create);
router.put("/:id", authMiddleware, adminMiddleware, userController.update);
router.put(
  "/:id/role",
  authMiddleware,
  adminMiddleware,
  userController.changeRole
);
router.put(
  "/:id/status",
  authMiddleware,
  adminMiddleware,
  userController.changeStatus
);
router.delete("/:id", authMiddleware, adminMiddleware, userController.delete);

module.exports = router;
