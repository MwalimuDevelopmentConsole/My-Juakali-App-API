const express = require("express");
const router = express.Router();
const generalLedgerController = require("../controllers/generalLedgerController");
const { authenticateToken } = require("../middleware/auth");
router.use(authenticateToken);

router
  .post("/reconcile", generalLedgerController.accountReconciliation)
  .get("/", generalLedgerController.getAllGeneralLedgerRecords)
  .get("/stats", generalLedgerController.getLedgerCreditDebitStats);

module.exports = router;
