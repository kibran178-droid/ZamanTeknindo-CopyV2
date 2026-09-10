const express = require("express");
const router = express.Router();
const { cekLogin, cekAdmin } = require("../middleware/authMiddleware");
const { getPendingManual, approveManual, rejectManual } = require("../controllers/manualAbsenController");

router.use(cekLogin, cekAdmin);
router.get("/pending", getPendingManual);
router.post("/approve/:id", approveManual);
router.post("/reject/:id", rejectManual);

module.exports = router;