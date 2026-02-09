// Load env vars FIRST before any other imports
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { startCron } from "./services/cron.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });




import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import connectDB from './config/database.js';



// Connect to database
connectDB();

const app = express();

// Security middleware
app.use(helmet());

// CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Import routes
import authRoutes from './routes/auth.js';
import statementRoutes from './routes/statements.js';
import transactionRoutes from './routes/transactions.js';
import simpleStatementRoutes from './routes/simpleStatements.js';
import helpRoutes from './routes/help.js';

// Root route for cron/health check
app.get('/', (req, res) => {
  res.status(200).send('CAssure Backend is Alive! 🚀');
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/statements', statementRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/simple', simpleStatementRoutes);
app.use('/api/help', helpRoutes);


// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {

  startCron()

  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
