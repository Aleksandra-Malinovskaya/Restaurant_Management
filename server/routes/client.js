const Router = require("express");
const router = new Router();
const clientController = require("../controllers/clientController");

router.get("/menu", clientController.getMenu);
router.get("/menu/:tableId", clientController.getMenuForTable);
router.post("/order", clientController.createOrder);

module.exports = router;
