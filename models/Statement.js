import mongoose from 'mongoose';

const statementSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  fileName: {
    type: String,
    required: true
  },
  pageCount: {
    type: Number,
    required: true
  },
  uploadDate: {
    type: Date,
    default: Date.now
  },
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  maskedAccountNumber: {
    type: String,
    default: ''
  },
  bankName: {
    type: String,
    default: ''
  },
  statementPeriod: {
    from: Date,
    to: Date
  },
  transactionCount: {
    type: Number,
    default: 0
  },
  errorMessage: {
    type: String,
    default: ''
  },
  isAccurate: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for faster queries
statementSchema.index({ userId: 1, uploadDate: -1 });

export default mongoose.model('Statement', statementSchema);
