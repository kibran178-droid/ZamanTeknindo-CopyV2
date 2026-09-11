require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const absensiRoutes = require("./routes/absensiRoutes");
const adminRoutes = require("./routes/adminRoutes");
const izinRoutes = require("./routes/izinRoutes");
const arsipRoutes = require("./routes/arsipRoutes");
const cronRoutes = require("./routes/cronRoutes");
const pushNotificationRoutes = require("./routes/pushNotificationRoutes");
const kioskRoutes = require("./routes/kiosk");
const manualAbsenRoutes = require("./routes/manualAbsenRoutes");

const app = express();

// --- TAMBAHAN WAJIB INI, TARUH DI SINI ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.urlencoded({ extended: true }));
// -----------------------------------------

app.use("/api/auth", authRoutes);
app.use("/api/absensi", absensiRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/arsip-bulanan", arsipRoutes);
app.use("/api/izin", izinRoutes);
app.use("/api/notifikasi", pushNotificationRoutes);
app.use("/api/cron", cronRoutes);
app.use("/api/kiosk", kioskRoutes);
app.use("/api/manual-absen", manualAbsenRoutes);

app.get("/api", (req, res) => {
  res.json({ pesan: "Server Sistem Absensi berjalan dengan baik 🚀" });
});

module.exports = app;