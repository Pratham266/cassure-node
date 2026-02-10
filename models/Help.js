import mongoose from 'mongoose';

const helpSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    subject: {
        type: String,
        enum: ['General Support', 'Feature Request', 'Bug Report', 'Other'],
        default: 'General Support'
    },
    message: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['open', 'in-progress', 'resolved'],
        default: 'open'
    }
}, {
    timestamps: true
});

export default mongoose.model('Help', helpSchema);
