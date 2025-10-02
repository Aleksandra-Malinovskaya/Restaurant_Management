const sequelize = require("../db");
const { DataTypes } = require("sequelize");

const User = sequelize.define("user", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  firstName: { type: DataTypes.STRING, allowNull: false },
  lastName: { type: DataTypes.STRING, allowNull: false },
  role: {
    type: DataTypes.ENUM("super_admin", "admin", "waiter", "chef", "trainee"),
    defaultValue: "trainee",
  },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
});

const DishCategory = sequelize.define("dish_category", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, unique: true, allowNull: false },
});

const Dish = sequelize.define("dish", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  ingredients: { type: DataTypes.TEXT },
  allergens: { type: DataTypes.TEXT },
  nutritionInfo: { type: DataTypes.TEXT },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  imgUrl: { type: DataTypes.STRING },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  isStopped: { type: DataTypes.BOOLEAN, defaultValue: false },
  cookingTimeMin: { type: DataTypes.INTEGER, defaultValue: 15 },
});

const Table = sequelize.define("table", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  capacity: { type: DataTypes.INTEGER, allowNull: false },
  qrUrl: { type: DataTypes.STRING },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
});

const Order = sequelize.define("order", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  orderType: {
    type: DataTypes.ENUM("dine_in", "takeaway"),
    defaultValue: "dine_in",
  },
  status: {
    type: DataTypes.ENUM("open", "in_progress", "ready", "closed", "cancelled"),
    defaultValue: "open",
  },
  totalAmount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.0 },
  createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  closedAt: { type: DataTypes.DATE },
});

const OrderItem = sequelize.define("order_item", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
  itemPrice: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  status: {
    type: DataTypes.ENUM("ordered", "preparing", "ready", "served"),
    defaultValue: "ordered",
  },
  notes: { type: DataTypes.TEXT },
});

const Reservation = sequelize.define("reservation", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customerName: { type: DataTypes.STRING, allowNull: false },
  customerPhone: { type: DataTypes.STRING, allowNull: false },
  guestCount: { type: DataTypes.INTEGER, allowNull: false },
  reservedFrom: { type: DataTypes.DATE, allowNull: false },
  reservedTo: { type: DataTypes.DATE, allowNull: false },
  status: {
    type: DataTypes.ENUM("confirmed", "seated", "cancelled", "completed"),
    defaultValue: "confirmed",
  },
});

User.hasMany(Order, {
  foreignKey: "waiterId",
  as: "waiterOrders",
});
Order.belongsTo(User, {
  foreignKey: "waiterId",
  as: "waiter",
});

User.hasMany(OrderItem, {
  foreignKey: "chefId",
  as: "chefOrderItems",
});
OrderItem.belongsTo(User, {
  foreignKey: "chefId",
  as: "chef",
});

User.hasMany(Reservation, {
  foreignKey: "userId",
  as: "userReservations",
});
Reservation.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

Table.hasMany(Order, {
  foreignKey: "tableId",
  as: "tableOrders",
});
Order.belongsTo(Table, {
  foreignKey: "tableId",
  as: "table",
});

Table.hasMany(Reservation, {
  foreignKey: "tableId",
  as: "tableReservations",
});
Reservation.belongsTo(Table, {
  foreignKey: "tableId",
  as: "table",
});

Order.hasMany(OrderItem, {
  foreignKey: "orderId",
  as: "items",
});
OrderItem.belongsTo(Order, {
  foreignKey: "orderId",
  as: "order",
});

Dish.hasMany(OrderItem, {
  foreignKey: "dishId",
  as: "orderItems",
});
OrderItem.belongsTo(Dish, {
  foreignKey: "dishId",
  as: "dish",
});

DishCategory.hasMany(Dish, {
  foreignKey: "categoryId",
  as: "dishes",
});
Dish.belongsTo(DishCategory, {
  foreignKey: "categoryId",
  as: "category",
});

module.exports = {
  User,
  DishCategory,
  Dish,
  Table,
  Order,
  OrderItem,
  Reservation,
};
