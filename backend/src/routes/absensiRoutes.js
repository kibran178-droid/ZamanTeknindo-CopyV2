const express = require("express");
const router = express.Router();
const { cekLogin } = require("../middleware/authMiddleware");
const upload = require("../utils/uploadConfig");
const kompresFoto = require("../middleware/kompresFoto");
const {
  absenMasuk,
  absenPulang,
  riwayatSaya,
  statusHariIni,
} = require("../controllers/absensiController");

// Semua rute di bawah ini wajib login dulu
router.use(cekLogin);

router.post("/masuk", upload.single("foto"), kompresFoto, absenMasuk);
router.post("/pulang", upload.single("foto"), kompresFoto, absenPulang);
router.get("/riwayat-saya", riwayatSaya);
router.get("/status-hari-ini", statusHariIni);

module.exports = router;