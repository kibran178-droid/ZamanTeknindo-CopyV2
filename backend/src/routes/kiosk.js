const express = require("express");
const router = express.Router();
const kioskController = require("../controllers/kioskController");

// middleware cek x-kiosk-key
router.use(kioskController.checkKioskKey);

router.get("/faces", kioskController.getAllFaces);
router.get("/pengguna-list", kioskController.getPenggunaListKiosk);
router.get("/status/:penggunaId", kioskController.getStatusKiosk);
router.post("/enroll", kioskController.enrollFace);
router.post("/recognize", kioskController.recognize);
router.post("/absen", kioskController.kioskAbsen);
router.post("/manual-fallback", kioskController.submitManualFallback);
router.post("/verify-admin-pin", kioskController.verifyAdminPin);

module.exports = router;