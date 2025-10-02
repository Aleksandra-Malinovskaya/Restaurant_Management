const Router = require("express");
const router = new Router();

const authRouter = require("./auth");
const userRouter = require("./user");
const dishRouter = require("./dish");
const categoryRouter = require("./category");
const tableRouter = require("./table");
const orderRouter = require("./order");
const orderItemRouter = require("./order-item");
const reservationRouter = require("./reservation");
const clientRouter = require("./client");
const statsRouter = require("./stats");

router.use("/auth", authRouter);
router.use("/users", userRouter);
router.use("/dishes", dishRouter);
router.use("/categories", categoryRouter);
router.use("/tables", tableRouter);
router.use("/orders", orderRouter);
router.use("/order-items", orderItemRouter);
router.use("/reservations", reservationRouter);
router.use("/client", clientRouter);
router.use("/stats", statsRouter);

module.exports = router;
