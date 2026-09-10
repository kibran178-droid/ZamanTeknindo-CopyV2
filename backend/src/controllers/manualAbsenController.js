const prisma = require("../utils/prismaClient");

const getPendingManual = async (req, res) => {
  const data = await prisma.manualAbsenRequest.findMany({ where: { status: 'PENDING' }, include: { user: true }, orderBy: { createdAt: 'desc' } });
  res.json(data);
};

const approveManual = async (req, res) => {
  const { id } = req.params;
  const request = await prisma.manualAbsenRequest.findUnique({ where: { id } });
  await prisma.absensi.create({
    data: { userId: request.userId, tanggal: request.requestedAt, jamMasuk: request.tipe === 'MASUK'? request.requestedAt : new Date(), jamPulang: request.tipe === 'PULANG'? request.requestedAt : null, lokasi: 'Kiosk Manual Fallback', metode: 'MANUAL_APPROVED', status: 'HADIR', fotoMasuk: request.fotoBukti }
  });
  const updated = await prisma.manualAbsenRequest.update({ where: { id }, data: { status: 'APPROVED' } });
  res.json({ message: 'Di-approve', updated });
};

const rejectManual = async (req, res) => {
  const { id } = req.params;
  const updated = await prisma.manualAbsenRequest.update({ where: { id }, data: { status: 'REJECTED' } });
  res.json({ message: 'Di-reject', updated });
};

module.exports = { getPendingManual, approveManual, rejectManual };