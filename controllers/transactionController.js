import Transaction from '../models/Transaction.js';
import Statement from '../models/Statement.js';

export const getTransactions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      statementId,
      search,
      sortBy = 'date',
      sortOrder = 'desc',
      startDate,
      endDate
    } = req.query;

    // Build query
    const query = { userId: req.user.id };

    if (statementId) {
      query.statementId = statementId;
    }

    if (search) {
      query.description = { $regex: search, $options: 'i' };
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const transactions = await Transaction.find(query)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-__v -rawData');

    const count = await Transaction.countDocuments(query);

    // Calculate summary
    const summary = await Transaction.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalDebit: { $sum: '$debit' },
          totalCredit: { $sum: '$credit' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      transactions,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      total: count,
      summary: summary[0] || { totalDebit: 0, totalCredit: 0 }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching transactions',
      error: error.message
    });
  }
};

export const getTransactionById = async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user.id
    }).populate('statementId', 'fileName uploadDate');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    res.status(200).json({
      success: true,
      transaction
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching transaction',
      error: error.message
    });
  }
};

export const exportTransactions = async (req, res) => {
  try {
    const { statementId, format = 'json' } = req.query;

    const query = { userId: req.user.id };
    if (statementId) {
      query.statementId = statementId;
    }

    const transactions = await Transaction.find(query)
      .sort({ date: 1 })
      .select('-__v -rawData -userId -statementId -_id');

    if (format === 'csv') {
      // Convert to CSV
      const csvRows = [];
      csvRows.push('Date,Description,Debit,Credit,Balance');
      
      transactions.forEach(txn => {
        csvRows.push([
          txn.date.toISOString().split('T')[0],
          `"${txn.description}"`,
          txn.debit || 0,
          txn.credit || 0,
          txn.balance || 0
        ].join(','));
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
      return res.send(csvRows.join('\n'));
    }

    // Default JSON export
    res.status(200).json({
      success: true,
      transactions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error exporting transactions',
      error: error.message
    });
  }
};


