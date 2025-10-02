const Router = require("express");
const router = new Router();
const authController = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/login", authController.login);
router.post("/register", authController.register);
router.get("/me", authMiddleware, authController.check);

module.exports = router;
