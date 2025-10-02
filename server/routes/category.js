const Router = require("express");
const router = new Router();
const categoryController = require("../controllers/categoryController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

router.get("/", authMiddleware, categoryController.getAll);
router.post("/", authMiddleware, adminMiddleware, categoryController.create);
router.put("/:id", authMiddleware, adminMiddleware, categoryController.update);
router.delete(
  "/:id",
  authMiddleware,
  adminMiddleware,
  categoryController.delete
);

module.exports = router;
