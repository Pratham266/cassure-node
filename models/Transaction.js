import mongoose from 'mongoose';
import encrypt from 'mongoose-encryption';

const transactionSchema = new mongoose.Schema({
  statementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Statement',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  description: {
    type: String,
    required: true
  },
  debit: {
    type: Number,
    default: 0
  },
  credit: {
    type: Number,
    default: 0
  },
  balance: {
    type: Number,
    default: 0
  },
  category: {
    type: String,
    default: 'Uncategorized'
  },
  rawData: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Encrypt sensitive fields - DISABLED FOR NOW
// TODO: Re-enable encryption with proper key configuration
// Note: mongoose-encryption requires specific key format
/*
const encKey = process.env.ENCRYPTION_KEY;
if (encKey && encKey.length >= 32) {
  transactionSchema.plugin(encrypt, {
    secret: encKey,
    encryptedFields: ['description', 'rawData']
  });
}
*/
console.log('ℹ️  Transaction encryption is currently disabled.');

// Compound index for efficient queries
transactionSchema.index({ userId: 1, statementId: 1, date: -1 });

export default mongoose.model('Transaction', transactionSchema);
