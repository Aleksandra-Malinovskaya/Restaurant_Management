const Router = require("express");
const router = new Router();
const tableController = require("../controllers/tableController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

router.get("/", authMiddleware, tableController.getAll);
router.get("/:id", authMiddleware, tableController.getOne);
router.post("/", authMiddleware, adminMiddleware, tableController.create);
router.put("/:id", authMiddleware, adminMiddleware, tableController.update);
router.delete("/:id", authMiddleware, adminMiddleware, tableController.delete);

module.exports = router;
