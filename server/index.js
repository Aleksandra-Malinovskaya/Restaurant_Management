require("dotenv").config();
const express = require("express");
const sequelize = require("./db");
const models = require("./models/models");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const router = require("./routes/index");
const errorMiddleware = require("./middleware/errorMiddleware");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const { Op } = require("sequelize");

const PORT = process.env.PORT;

const app = express();
const server = http.createServer(app);

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

const io = new Server(server, {
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

// Хранилище подключенных пользователей
const connectedUsers = {
  chef: [],
  waiter: [],
  manager: [],
};

// Хранилище для отслеживания уже отправленных уведомлений
const sentReservationNotifications = new Map();

io.on("connection", (socket) => {
  console.log("🔌 Пользователь подключен:", socket.id);

  socket.on("user_connected", (userData) => {
    const { role, userId } = userData;

    if (role === "chef" && !connectedUsers.chef.includes(socket.id)) {
      connectedUsers.chef.push(socket.id);
      socket.join("chef");
      console.log(`👨‍🍳 Повар подключен: ${socket.id}, пользователь: ${userId}`);
    } else if (
      role === "waiter" &&
      !connectedUsers.waiter.includes(socket.id)
    ) {
      connectedUsers.waiter.push(socket.id);
      socket.join("waiter");
      console.log(
        `👨‍💼 Официант подключен: ${socket.id}, пользователь: ${userId}`
      );
    } else if (
      role === "manager" &&
      !connectedUsers.manager.includes(socket.id)
    ) {
      connectedUsers.manager.push(socket.id);
      socket.join("manager");
      console.log(
        `👔 Менеджер подключен: ${socket.id}, пользователь: ${userId}`
      );
    }
  });

  socket.on("disconnect", () => {
    console.log("🔌 Пользователь отключен:", socket.id);
    Object.keys(connectedUsers).forEach((role) => {
      const index = connectedUsers[role].indexOf(socket.id);
      if (index > -1) {
        connectedUsers[role].splice(index, 1);
      }
    });
  });
});

app.set("io", io);

// ФУНКЦИЯ ДЛЯ АВТОМАТИЧЕСКИХ УВЕДОМЛЕНИЙ ЗА 15 МИНУТ
async function checkUpcomingReservations() {
  try {
    const { Reservation, Table } = require("./models/models");
    const now = new Date();

    // Ищем брони, которые начнутся через 14-16 минут (окно в 2 минуты для надежности)
    const fifteenMinutesFromNow = new Date(now.getTime() + 14 * 60000);
    const sixteenMinutesFromNow = new Date(now.getTime() + 16 * 60000);

    console.log("🔍 Автоматическая проверка бронирований (15 минут)...", {
      now: now.toISOString(),
      from: fifteenMinutesFromNow.toISOString(),
      to: sixteenMinutesFromNow.toISOString(),
    });

    const upcomingReservations = await Reservation.findAll({
      where: {
        status: "confirmed",
        reservedFrom: {
          [Op.between]: [fifteenMinutesFromNow, sixteenMinutesFromNow],
        },
      },
      include: [
        {
          model: Table,
          as: "table",
          attributes: ["id", "name", "capacity"],
        },
      ],
      order: [["reservedFrom", "ASC"]],
    });

    console.log(
      `📊 Найдено бронирований через 15 минут: ${upcomingReservations.length}`
    );

    // Отправляем уведомления
    for (const reservation of upcomingReservations) {
      const reservationTime = new Date(reservation.reservedFrom);
      const minutesUntil = Math.round((reservationTime - now) / 60000);

      const notificationId = `reservation-15min-${reservation.id}`;

      // Проверяем, не отправляли ли мы уже уведомление для этой брони
      const lastNotification = sentReservationNotifications.get(notificationId);
      const currentTime = Date.now();

      if (!lastNotification || currentTime - lastNotification > 10 * 60000) {
        // 10 минут кэш
        sentReservationNotifications.set(notificationId, currentTime);

        const notificationData = {
          type: "reservation_upcoming",
          reservationId: reservation.id,
          customerName: reservation.customerName,
          tableName: reservation.table.name,
          tableNumber: reservation.table.name,
          reservedFrom: reservation.reservedFrom,
          guestCount: reservation.guestCount,
          minutesUntil: minutesUntil,
          message: `Бронирование через ${minutesUntil} минут: ${reservation.customerName} (${reservation.guestCount} чел.) - Стол ${reservation.table.name}`,
          timestamp: new Date().toLocaleTimeString("ru-RU"),
        };

        console.log(
          `⏰ Отправка автоматического уведомления: ${notificationData.message}`
        );

        // Отправляем всем официантам и менеджерам
        io.to("waiter")
          .to("manager")
          .emit("reservation_notification", notificationData);
      }
    }
  } catch (error) {
    console.error("❌ Ошибка автоматической проверки бронирований:", error);
  }
}

// ФУНКЦИЯ ДЛЯ РУЧНОЙ ПРОВЕРКИ БРОНИРОВАНИЙ
async function checkAllUpcomingReservations() {
  try {
    const { Reservation, Table } = require("./models/models");
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60000);

    console.log("🔍 Ручная проверка всех ближайших бронирований...");

    const upcomingReservations = await Reservation.findAll({
      where: {
        status: "confirmed",
        reservedFrom: {
          [Op.between]: [now, oneHourFromNow],
        },
      },
      include: [
        {
          model: Table,
          as: "table",
          attributes: ["id", "name", "capacity"],
        },
      ],
      order: [["reservedFrom", "ASC"]],
    });

    console.log(
      `📊 Найдено всех ближайших бронирований: ${upcomingReservations.length}`
    );

    const reservationsWithTime = upcomingReservations.map((reservation) => {
      const reservedFrom = new Date(reservation.reservedFrom);
      const minutesUntil = Math.round((reservedFrom - now) / 60000);

      return {
        id: reservation.id,
        customerName: reservation.customerName,
        tableName: reservation.table.name,
        reservedFrom: reservation.reservedFrom,
        guestCount: reservation.guestCount,
        minutesUntil: minutesUntil,
      };
    });

    return reservationsWithTime;
  } catch (error) {
    console.error("❌ Ошибка ручной проверки бронирований:", error);
    throw error;
  }
}

// ЭНДПОИНТ ДЛЯ РУЧНОЙ ПРОВЕРКИ БРОНИРОВАНИЙ
app.get("/api/reservations/upcoming/check", async (req, res) => {
  try {
    const upcomingReservations = await checkAllUpcomingReservations();

    // Фильтруем только те, что в ближайшие 15 минут
    const soonReservations = upcomingReservations.filter(
      (reservation) =>
        reservation.minutesUntil <= 15 && reservation.minutesUntil >= 0
    );

    console.log(
      `📋 Для ручной проверки: ${soonReservations.length} бронирований`
    );

    res.json(soonReservations);
  } catch (error) {
    console.error("❌ Ошибка в эндпоинте проверки бронирований:", error);
    res.status(500).json({
      error: "Ошибка при проверке бронирований",
      details: error.message,
    });
  }
});

// Запускаем автоматическую проверку каждые 30 секунд (для надежности)
setInterval(() => {
  checkUpcomingReservations();
}, 30000); // 30 секунд

// Первая проверка через 10 секунд после запуска
setTimeout(() => {
  checkUpcomingReservations();
}, 10000);

const start = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    server.listen(PORT, () => {
      console.log(`🚀 Server started on ${PORT} with WebSocket support`);
      console.log("✅ Сервис уведомлений о бронированиях запущен");
      console.log("⏰ Автоматические уведомления: за 15 минут до брони");
      console.log("🔔 Ручная проверка: все брони в ближайшие 15 минут");
    });
  } catch (e) {
    console.log(e);
  }
};

start();
