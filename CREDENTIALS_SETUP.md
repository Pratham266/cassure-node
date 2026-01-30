# Google Service Account Credentials Setup

## Quick Setup Steps

### 1. Download Your Service Account Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to: **IAM & Admin** → **Service Accounts**
4. Find your service account (or create one)
5. Click **Actions** (⋮) → **Manage Keys**
6. Click **Add Key** → **Create New Key**
7. Choose **JSON** format
8. Click **Create** - the file will download

### 2. Set Up the Credentials File

```bash
# Navigate to backend directory
cd backend

# Copy the example file
cp service-account-key.example.json service-account-key.json

# Replace with your downloaded credentials
# Option 1: Replace the content
cat ~/Downloads/your-project-xxxxx.json > service-account-key.json

# Option 2: Copy and rename
cp ~/Downloads/your-project-xxxxx.json service-account-key.json
```

### 3. Verify the Setup

Your `service-account-key.json` should look like this:

```json
{
  "type": "service_account",
  "project_id": "your-actual-project-id",
  "private_key_id": "abc123def456...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIE...actual key...\n-----END PRIVATE KEY-----\n",
  "client_email": "your-service-account@your-project.iam.gserviceaccount.com",
  "client_id": "123456789012345678901",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/...",
  "universe_domain": "googleapis.com"
}
```

### 4. Update .env File

Make sure your `.env` file has:

```bash
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
```

## Security Checklist

- [x] `service-account-key.json` is in `.gitignore`
- [x] Never commit this file to version control
- [x] Don't share this file publicly
- [x] Use environment variables in production
- [x] Rotate keys periodically (every 90 days recommended)

## Troubleshooting

### "File not found" Error
```bash
# Check if file exists
ls -la service-account-key.json

# Check file permissions
chmod 600 service-account-key.json
```

### "Invalid Credentials" Error
- Verify the JSON is valid (use a JSON validator)
- Ensure the service account has correct permissions
- Check that Document AI API is enabled

### "Permission Denied" Error
Make sure your service account has these roles:
- **Document AI API User**
- **Document AI Editor** (optional, for managing processors)

## Production Setup

For production, use environment variables instead of files:

```javascript
// In your code
const credentials = process.env.GOOGLE_CREDENTIALS_JSON 
  ? JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON)
  : require('./service-account-key.json');
```

Set environment variable:
```bash
# Convert to base64 for safe storage
cat service-account-key.json | base64

# In production, set:
GOOGLE_CREDENTIALS_JSON='{"type":"service_account",...}'
```

## Testing Your Setup

Run this test to verify credentials work:

```bash
cd backend
node -e "
const { DocumentProcessorServiceClient } = require('@google-cloud/documentai');
const client = new DocumentProcessorServiceClient({
  keyFilename: './service-account-key.json'
});
console.log('✅ Credentials loaded successfully!');
"
```

## Need Help?

- See `GOOGLE_SETUP.md` for full Document AI setup
- Check [Google Cloud Documentation](https://cloud.google.com/docs/authentication/getting-started)
- Verify your project ID matches in both files

---

**⚠️ IMPORTANT**: Never commit `service-account-key.json` to git!
