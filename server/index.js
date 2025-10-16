require("dotenv").config();
const express = require("express");
const sequelize = require("./db");
const models = require("./models/models");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const router = require("./routes/index");
const errorMiddleware = require("./middleware/errorMiddleware");
const path = require("path");
const http = require("http"); // ДОБАВИТЬ
const { Server } = require("socket.io"); // ДОБАВИТЬ

const PORT = process.env.PORT;

const app = express();

// Создаем HTTP сервер для Socket.IO
const server = http.createServer(app); // ДОБАВИТЬ

// Настройка CORS для Express
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// Настройка CORS для Socket.IO
const io = new Server(server, {
  // ДОБАВИТЬ
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(express.json());
app.use("/static", express.static(path.join(__dirname, "static")));
app.use(fileUpload({}));
app.use("/api", router);

app.use(errorMiddleware);

// Хранилище подключенных пользователей по ролям
const connectedUsers = {
  // ДОБАВИТЬ
  chef: [],
  waiter: [],
};

// WebSocket соединения
io.on("connection", (socket) => {
  // ДОБАВИТЬ
  console.log("Пользователь подключен:", socket.id);

  // Официант или повар подключается и сообщает свою роль
  socket.on("user_connected", (userData) => {
    const { role, userId } = userData;

    if (role === "chef" && !connectedUsers.chef.includes(socket.id)) {
      connectedUsers.chef.push(socket.id);
      console.log(`Повар подключен: ${socket.id}, пользователь: ${userId}`);
    } else if (
      role === "waiter" &&
      !connectedUsers.waiter.includes(socket.id)
    ) {
      connectedUsers.waiter.push(socket.id);
      console.log(`Официант подключен: ${socket.id}, пользователь: ${userId}`);
    }
  });

  // Обработка отключения пользователя
  socket.on("disconnect", () => {
    console.log("Пользователь отключен:", socket.id);

    // Удаляем из всех списков
    Object.keys(connectedUsers).forEach((role) => {
      const index = connectedUsers[role].indexOf(socket.id);
      if (index > -1) {
        connectedUsers[role].splice(index, 1);
      }
    });
  });
});

// Делаем io доступным в контроллерах
app.set("io", io); // ДОБАВИТЬ

const start = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    server.listen(PORT, () =>
      console.log(`Server started on ${PORT} with WebSocket support`)
    ); // ИЗМЕНИТЬ
  } catch (e) {
    console.log(e);
  }
};

start();
