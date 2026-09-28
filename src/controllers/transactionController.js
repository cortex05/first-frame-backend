import { listTransactions as listTransactionsService } from '../services/transactionService.js';

export const listTransactions = async (req, res) => {
  const transactions = await listTransactionsService(req.auth, {
    status: req.query.status,
    limit: req.query.limit,
  });

  res.status(200).json({
    success: true,
    message: 'Transactions retrieved successfully',
    data: transactions,
  });
};
