const { default: mongoose } = require("mongoose");
const Account = require("../models/Account");
const GeneralLedger = require("../models/GeneralLedger");

const isValidDate = (date) => {
  if (typeof date === "string") {
    date = new Date(date); // Convert string to Date
  }
  return date instanceof Date && !isNaN(date.getTime());
};


/**
 * Utility function to create double entry ledger records
 * Can be used internally by other functions
 */
const createDoubleEntryLedger = async (
  creditAccountId,
  debitAccountId,
  amount,
  transactionType,
  narration,
  paymentId,
  createdBy,
  session
) => {
  try {
    const parsedAmount = parseFloat(amount);

    // Validate amount
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error("Amount must be a valid number greater than 0.");
    }

    // Validate accounts are different
    if (creditAccountId === debitAccountId) {
      throw new Error("Credit and debit accounts must be different.");
    }

    // Get both accounts
    const [creditAccount, debitAccount] = await Promise.all([
      Account.findById(mongoose.Types.ObjectId(creditAccountId)),
      Account.findById(mongoose.Types.ObjectId(debitAccountId)),
    ]);

    if (!creditAccount || !debitAccount) {
      throw new Error("One or both accounts not found.");
    }

    // Determine account types
    const getAccountType = (account) => {
      if (account.isSystemAccount) return "business";
      return account.user?.userType === "Seller"
        ? "seller"
        : account.user?.userType === "Buyer"
        ? "marketer"
        : "business";
    };

    const creditAccountType = getAccountType(creditAccount);
    const debitAccountType = getAccountType(debitAccount);

    // Update account balances
    creditAccount.balance += parsedAmount; // Credit increases balance
    debitAccount.balance -= parsedAmount; // Debit decreases balance

    // Create credit ledger record (creditAmount = amount, debitAmount = 0)
    const creditLedgerRecord = new GeneralLedger({
      accountId: creditAccountId,
      accountType: creditAccountType,
      transactionType,
      debitAmount: 0,
      creditAmount: parsedAmount,
      balance: creditAccount.balance,
      narration: `Credit: ${narration}`,
      paymentId,
      createdBy,
    });

    // Create debit ledger record (creditAmount = 0, debitAmount = amount)
    const debitLedgerRecord = new GeneralLedger({
      accountId: debitAccountId,
      accountType: debitAccountType,
      transactionType,
      debitAmount: parsedAmount,
      creditAmount: 0,
      balance: debitAccount.balance,
      narration: `Debit: ${narration}`,
      paymentId,
      createdBy,
    });

    // Save all records (use session if provided for transaction support)
    const saveOptions = session ? { session } : {};

    await Promise.all([
      creditAccount.save(saveOptions),
      debitAccount.save(saveOptions),
      creditLedgerRecord.save(saveOptions),
      debitLedgerRecord.save(saveOptions),
    ]);

    return {
      success: true,
      creditRecord: creditLedgerRecord,
      debitRecord: debitLedgerRecord,
      creditAccountBalance: creditAccount.balance,
      debitAccountBalance: debitAccount.balance,
    };
  } catch (error) {
    console.error("Error creating double entry ledger:", error);
    return {
      success: false,
      message:
        error.message ||
        "An unexpected error occurred while creating ledger records.",
    };
  }
};


/**
 * Get all general ledger records with filters and pagination
 */
const getAllGeneralLedgerRecords = async (req, res) => {
  const page = req?.query?.page || 1;
  const perPage = req?.query?.perPage || 20;
  const skip = (page - 1) * parseInt(perPage);
  let { fromDate, toDate, accountId, accountType, createdBy, transactionType } =
    req.query;

  const filters = {};
  const currentDate = new Date();

  try {
    // Date filter
    if (fromDate && isValidDate(fromDate)) {
      const startOfTheday = new Date(new Date(fromDate));
      const endOfTheday = new Date(new Date(toDate || currentDate));
      filters.createdAt = { $gte: startOfTheday, $lte: endOfTheday };
    }

    // Other filters
    if (accountId) filters.accountId = mongoose.Types.ObjectId(accountId);
    if (createdBy) filters.createdBy = mongoose.Types.ObjectId(createdBy);
    if (accountType) filters.accountType = accountType;
    if (transactionType) filters.transactionType = transactionType;

    const [records, count] = await Promise.all([
      GeneralLedger.find(filters)
        .sort({ createdAt: -1 })
        .limit(parseInt(perPage))
        .skip(skip)
        .populate({ path: "createdBy", select: "userName" })
        .populate({
          path: "accountId",
          select:
            "accountNo accountName isPaymentOption description accountType user balance",
          populate: [
            {
              path: "user.userId",
              select: "firstName lastName email phoneNo",
              refPath: function () {
                // Dynamically determine the collection based on userType
                switch (this.user?.userType) {
                  case "Buyer":
                    return "buyers";
                  case "Seller":
                    return "sellers";
                  case "Admin":
                    return "admins";
                  default:
                    return "users";
                }
              },
            },
          ],
        })
        .populate({ path: "paymentId" })
        .lean()
        .exec(),
      GeneralLedger.countDocuments(filters),
    ]);

    if (!records?.length) {
      return res.status(200).json({ message: "No records found" });
    }

    res.json({ records, count });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ message: `Error getting records: ${error.message}` });
  }
};

/**
 * Get ledger records for a specific account
 */
const getLedgerByAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const page = req?.query?.page || 1;
    const perPage = req?.query?.perPage || 50;
    const skip = (page - 1) * parseInt(perPage);

    if (!accountId) {
      return res.status(400).json({ message: "Account ID is required." });
    }

    // Validate account exists
    const account = await Account.findById(accountId).lean();
    if (!account) {
      return res.status(404).json({ message: "Account not found." });
    }

    const [records, count] = await Promise.all([
      GeneralLedger.find({ accountId })
        .sort({ createdAt: -1 })
        .limit(parseInt(perPage))
        .skip(skip)
        .populate({ path: "createdBy", select: "userName" })
        .populate({ path: "paymentId" })
        .lean()
        .exec(),
      GeneralLedger.countDocuments({ accountId }),
    ]);

    res.json({
      account,
      records,
      count,
      currentBalance: account.balance,
    });
  } catch (error) {
    console.error("Error getting account ledger:", error);
    res.status(500).json({
      error: error.message,
      message: "Something went wrong while fetching account ledger.",
    });
  }
};

/**
 * Get credit and debit statistics
 */
const getLedgerCreditDebitStats = async (req, res) => {
  try {
    const { fromDate, toDate, accountType, accountId } = req.query;
    const filters = {};

    // Add date filters if provided
    if (fromDate && isValidDate(fromDate)) {
      const startOfTheday = new Date(new Date(fromDate));
      const endOfTheday = new Date(new Date(toDate || new Date()));
      filters.createdAt = { $gte: startOfTheday, $lte: endOfTheday };
    }

    // Add other filters
    if (accountType) filters.accountType = accountType;
    if (accountId) filters.accountId = mongoose.Types.ObjectId(accountId);

    const result = await GeneralLedger.aggregate([
      { $match: filters },
      {
        $group: {
          _id: null,
          totalCreditAmount: { $sum: "$creditAmount" },
          totalDebitAmount: { $sum: "$debitAmount" },
          totalTransactions: { $sum: 1 },
          averageTransactionAmount: {
            $avg: { $add: ["$creditAmount", "$debitAmount"] },
          },
        },
      },
    ]);

    const {
      totalCreditAmount = 0,
      totalDebitAmount = 0,
      totalTransactions = 0,
      averageTransactionAmount = 0,
    } = result[0] || {};

    const netAmount = totalCreditAmount - totalDebitAmount;

    res.status(200).json({
      totalCreditAmount,
      totalDebitAmount,
      netAmount,
      totalTransactions,
      averageTransactionAmount:
        Math.round(averageTransactionAmount * 100) / 100,
    });
  } catch (error) {
    console.error("Error fetching ledger stats:", error);
    res.status(500).json({ message: "Something went wrong" });
  }
};

/**
 * Account reconciliation - transfer amount between accounts
 */
const accountReconciliation = async (req, res) => {
  const { creditAccountId, debitAccountId, amount, narration, createdBy } =
    req.body;

  if (
    !creditAccountId ||
    !debitAccountId ||
    !amount ||
    !narration ||
    !createdBy
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (parseFloat(amount) <= 0) {
    return res.status(400).json({ message: "Amount must be greater than 0" });
  }

  if (creditAccountId === debitAccountId) {
    return res
      .status(400)
      .json({ message: "Credit and debit accounts must be different" });
  }

  try {
    const [creditAccount, debitAccount] = await Promise.all([
      Account.findById(mongoose.Types.ObjectId(creditAccountId)).exec(),
      Account.findById(mongoose.Types.ObjectId(debitAccountId)).exec(),
    ]);

    if (!creditAccount || !debitAccount) {
      return res
        .status(400)
        .json({ message: "One or both accounts not found" });
    }

    const transferAmount = parseFloat(amount);

    // Update balances
    creditAccount.balance -= transferAmount; // Credit account loses money
    debitAccount.balance += transferAmount; // Debit account gains money

    // Determine account types for ledger
    const getAccountType = (account) => {
      if (account.isSystemAccount) return "business";
      return account.user?.userType === "Seller"
        ? "seller"
        : account.user?.userType === "Buyer"
        ? "marketer"
        : "business";
    };

    const creditAccountType = getAccountType(creditAccount);
    const debitAccountType = getAccountType(debitAccount);

    // Create ledger records
    const creditRecord = new GeneralLedger({
      accountId: creditAccountId,
      accountType: creditAccountType,
      debitAmount: transferAmount,
      creditAmount: 0,
      balance: creditAccount.balance,
      narration: `Transfer to ${
        debitAccount.accountName || debitAccount.accountNo
      } - ${narration}`,
      transactionType: "reconciliation",
      createdBy,
    });

    const debitRecord = new GeneralLedger({
      accountId: debitAccountId,
      accountType: debitAccountType,
      debitAmount: 0,
      creditAmount: transferAmount,
      balance: debitAccount.balance,
      narration: `Transfer from ${
        creditAccount.accountName || creditAccount.accountNo
      } - ${narration}`,
      transactionType: "reconciliation",
      createdBy,
    });

    // Save all changes
    await Promise.all([
      creditAccount.save(),
      debitAccount.save(),
      creditRecord.save(),
      debitRecord.save(),
    ]);

    res.status(200).json({
      message: "Account reconciliation completed successfully",
      transferAmount,
      creditAccount: {
        id: creditAccount._id,
        name: creditAccount.accountName || creditAccount.accountNo,
        newBalance: creditAccount.balance,
      },
      debitAccount: {
        id: debitAccount._id,
        name: debitAccount.accountName || debitAccount.accountNo,
        newBalance: debitAccount.balance,
      },
    });
  } catch (error) {
    console.error("Error in account reconciliation:", error);
    res.status(500).json({
      error: error.message,
      message: "Something went wrong during reconciliation",
    });
  }
};

/**
 * Get account balance and recent transactions
 */
const getAccountSummary = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { limit = 10 } = req.query;

    if (!accountId) {
      return res.status(400).json({ message: "Account ID is required." });
    }

    // Get account details
    const account = await Account.findById(accountId)
      .populate("accountCategory", "subCategoryName")
      .lean();

    if (!account) {
      return res.status(404).json({ message: "Account not found." });
    }

    // Get recent transactions
    const recentTransactions = await GeneralLedger.find({ accountId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate({ path: "createdBy", select: "userName" })
      .lean()
      .exec();

    // Get transaction statistics
    const stats = await GeneralLedger.aggregate([
      { $match: { accountId: mongoose.Types.ObjectId(accountId) } },
      {
        $group: {
          _id: null,
          totalCredits: { $sum: "$creditAmount" },
          totalDebits: { $sum: "$debitAmount" },
          transactionCount: { $sum: 1 },
          lastTransactionDate: { $max: "$createdAt" },
        },
      },
    ]);

    const accountStats = stats[0] || {
      totalCredits: 0,
      totalDebits: 0,
      transactionCount: 0,
      lastTransactionDate: null,
    };

    res.json({
      account: {
        ...account,
        currentBalance: account.balance,
      },
      recentTransactions,
      statistics: accountStats,
    });
  } catch (error) {
    console.error("Error getting account summary:", error);
    res.status(500).json({
      error: error.message,
      message: "Something went wrong while fetching account summary.",
    });
  }
};

/**
 * Get ledger records by transaction type
 */
const getLedgerByTransactionType = async (req, res) => {
  try {
    const { transactionType } = req.params;
    const page = req?.query?.page || 1;
    const perPage = req?.query?.perPage || 20;
    const skip = (page - 1) * parseInt(perPage);

    const [records, count] = await Promise.all([
      GeneralLedger.find({ transactionType })
        .sort({ createdAt: -1 })
        .limit(parseInt(perPage))
        .skip(skip)
        .populate({ path: "createdBy", select: "userName" })
        .populate({
          path: "accountId",
          select: "accountNo accountName accountType",
        })
        .lean()
        .exec(),
      GeneralLedger.countDocuments({ transactionType }),
    ]);

    res.json({
      transactionType,
      records,
      count,
    });
  } catch (error) {
    console.error("Error getting ledger by transaction type:", error);
    res.status(500).json({
      error: error.message,
      message: "Something went wrong while fetching records.",
    });
  }
};

module.exports = {
  createDoubleEntryLedger,
  getAllGeneralLedgerRecords,
  getLedgerByAccount,
  getLedgerCreditDebitStats,
  accountReconciliation,
  getAccountSummary,
  getLedgerByTransactionType,
};
