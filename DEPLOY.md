# Deployment Guide - Carbon Footprint Tracker

## Quick Start

### Option 1: Run with Python (Development)

```bash
# Install dependencies
pip install -r requirements.txt

# Run the server
python chatbot.py
# or
python run_server.py
```

Open http://localhost:5000 in your browser.

### Option 2: Production Deployment

#### Using Gunicorn (Recommended)

```bash
# Install Gunicorn
pip install gunicorn

# Run with Gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 chatbot:app
```

#### Using Docker

Create a `Dockerfile`:

```dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 5000
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "chatbot:app"]
```

Build and run:
```bash
docker build -t carbon-tracker .
docker run -p 5000:5000 carbon-tracker
```

#### Using Heroku

1. Install Heroku CLI
2. Create `Procfile`:
```
web: gunicorn -w 4 -b 0.0.0.0:$PORT chatbot:app
```

3. Deploy:
```bash
heroku create your-app-name
git push heroku main
```

#### Environment Variables

Set these environment variables:

```bash
export PORT=5000
export DEBUG=false
export GEMINI_API_KEY=your_gemini_key_here  # Optional
export USE_GEMINI=true  # Set to true to enable Gemini AI
export MOCK_MODE=false  # Set to false to use real backend
```

## File Structure for Deployment

```
proj/
├── index.html          # Frontend HTML
├── styles.css          # CSS styles
├── app.js              # Main app logic
├── chatbot.js          # Frontend chatbot
├── api.js              # API client
├── config.js           # Configuration
├── chatbot.py          # Flask backend API
├── requirements.txt    # Python dependencies
├── run_server.py       # Server runner script
└── static/            # Static files (if needed)
```

## Features

✅ **Fixed CONFIG Loading** - Works in all browsers
✅ **Backend Integration** - Flask API for chatbot
✅ **Production Ready** - Error handling, CORS, logging
✅ **Responsive Design** - Works on all devices
✅ **Authentication** - Login/Signup system
✅ **Data Persistence** - localStorage with API hooks

## API Endpoints

- `GET /` - Serve frontend
- `POST /chatbot/chat` - Chatbot messages
- `GET /chatbot/intents` - Available intents
- `POST /chatbot/conversation` - Save conversation
- `GET /chatbot/conversation/<user_id>` - Get conversation
- `POST /chatbot/premium/plan` - Generate premium plan
- `GET /health` - Health check

## Troubleshooting

### CONFIG is not defined error

✅ **Fixed!** The code now safely handles CONFIG loading with fallbacks.

### CORS errors

✅ **Fixed!** Flask-CORS is enabled for all routes.

### Chatbot not connecting

1. Make sure `chatbot.py` is running
2. Check `config.js` has `mockMode: false`
3. Verify API base URL matches your server

### Port already in use

```bash
# Find and kill process on port 5000
# Windows:
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Linux/Mac:
lsof -ti:5000 | xargs kill -9
```

## Support

For issues, check:
1. Browser console for errors
2. Server logs for API errors
3. Network tab for failed requests

