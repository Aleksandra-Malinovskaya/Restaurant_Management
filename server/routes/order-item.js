const Router = require("express");
const router = new Router();
const orderItemController = require("../controllers/orderItemController");
const authMiddleware = require("../middleware/authMiddleware");
const chefMiddleware = require("../middleware/chefMiddleware");

router.get(
  "/kitchen",
  authMiddleware,
  chefMiddleware,
  orderItemController.getKitchenItems
);
router.put(
  "/:id/status",
  authMiddleware,
  chefMiddleware,
  orderItemController.changeStatus
);
router.put("/:id/served", authMiddleware, orderItemController.markServed);

module.exports = router;
