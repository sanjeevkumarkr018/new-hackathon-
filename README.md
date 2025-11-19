# Carbon Footprint Tracker

A professional, responsive, and accessible single-page web application for tracking and reducing carbon footprint with an advanced AI-powered chatbot module.

## Features

### Core Features
- **Interactive Emissions Calculator** - Calculate emissions from transport, energy, food, waste, and shopping
- **Dashboard** - View monthly CO₂e, trends, category breakdown, and progress
- **Insights & Recommendations** - AI-powered tips and suggestions
- **Goals & Challenges** - Set reduction targets and track progress
- **Profile & Settings** - Customize household size, location, units

### Premium Features
- Advanced analytics with time-series data
- PDF/CSV export functionality
- Device integrations (smart meters, mobility apps)
- Priority chatbot with personalized reduction plans
- Team/multi-household tracking

### Chatbot Module
- Floating, collapsible chat interface
- Onboarding conversation to collect user inputs
- Itemized emissions tips and explanations
- Mock NLU with rule-based intents (API-ready)
- Premium-only features gating
- Conversation history (localStorage + API hooks)
- Accessibility support (ARIA labels, keyboard navigation)

## Tech Stack

- **Frontend**: HTML5, CSS3 (CSS Variables, Grid, Flexbox, Glassmorphism), Vanilla JavaScript
- **Backend** (Optional): Python Flask
- **Chatbot**: Separate `chatbot.py` module for backend API integration
- **Storage**: localStorage fallback + REST API hooks
- **Payment**: Stripe Checkout/Subscriptions (stubbed)

## File Structure

```
carbon-footprint-tracker/
├── index.html              # Main HTML structure
├── styles.css              # Advanced CSS with themes, animations
├── app.js                  # Main application logic
├── chatbot.js              # Frontend chatbot module
├── chatbot.py              # Backend chatbot API
├── api.js                  # API integration layer
├── config.js               # Configuration file
├── requirements.txt        # Python dependencies
├── .env.example            # Environment variables template
└── README.md               # This file
```

## Setup & Installation

### Frontend Only (No Backend)

1. Clone or download the repository
2. Open `index.html` in a web browser
3. The app runs entirely in the browser with localStorage

### With Backend (Full Stack)

1. **Install Python Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure Environment Variables**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

3. **Start Backend Server**
   ```bash
   python chatbot.py
   ```

4. **Configure Frontend**
   - Update `config.js` with your API base URL
   - Set `mockMode: false` in `CONFIG.chatbot` to use backend

5. **Open Frontend**
   - Serve `index.html` via a local server (e.g., `python -m http.server 8000`)
   - Or open directly in browser (some features may be limited)

## Configuration

### Chatbot Configuration

Edit `config.js`:

```javascript
const CONFIG = {
    chatbot: {
        enabled: true,
        apiBase: 'http://localhost:5000',
        mockMode: true, // Set to false to use backend
    },
    // ... other config
};
```

### Environment Variables

- `GEMINI_API_KEY` - Optional: Google Gemini API key for AI responses
- `USE_GEMINI` - Set to `true` to enable Gemini API (requires API key)
- `MOCK_MODE` - Set to `false` to use real backend endpoints
- `PORT` - Backend server port (default: 5000)

## Chatbot API Integration

### Initialize Chatbot (Frontend)

```javascript
// Automatically initialized on page load, or manually:
CarbonFootprintChatbot.initChatbot({
    apiBase: 'http://localhost:5000',
    userId: 'user-123',
    authToken: 'bearer-token',
    isPremium: false,
    mockMode: false,
    onTipClicked: (tipTitle) => {
        console.log('Tip clicked:', tipTitle);
    },
    onExportRequest: () => {
        scrollToSection('dashboard');
    }
});
```

### Backend API Endpoints

- `POST /chatbot/chat` - Send message and get response
  ```json
  {
    "message": "How can I reduce my emissions?",
    "userId": "user-123",
    "conversationHistory": [...],
    "context": {
      "is_premium": false,
      "monthly_co2e": 2.5
    }
  }
  ```

- `GET /chatbot/intents` - List available intents
- `POST /chatbot/conversation` - Save conversation history
- `GET /chatbot/conversation/<user_id>` - Get conversation history
- `POST /chatbot/premium/plan` - Generate personalized plan (Premium)

## Stripe Integration (Stubbed)

### Checkout Flow

1. User clicks "Subscribe" button
2. Frontend calls `api.createCheckoutSession(priceId)`
3. Redirect to Stripe Checkout
4. After payment, Stripe webhook updates user subscription
5. Frontend unlocks premium features

### Webhook Endpoint (Implement in your backend)

```python
@app.route('/webhooks/stripe', methods=['POST'])
def stripe_webhook():
    # Verify webhook signature
    # Update user subscription status
    # Return 200 OK
```

### Customer Portal

Link to Stripe Customer Portal for subscription management:
- `GET /api/subscriptions/portal` - Returns portal session URL

## API Integration (Stubbed)

### User Authentication

```javascript
// Login
await api.login(email, password);

// Signup
await api.signup(email, password, name);

// Get Profile
await api.getUserProfile();

// Update Profile
await api.updateUserProfile({ householdSize: 2, location: 'SF' });
```

### Carbon Logs

```javascript
// Save log
await api.saveCarbonLog({
    category: 'transport',
    co2e: 2.5,
    value: 100,
    notes: 'Car travel this month'
});

// Get logs
const logs = await api.getCarbonLogsAPI();
```

### Premium Features

```javascript
// Create checkout session
const session = await api.createCheckoutSession(priceId);

// Export data
const csv = await api.exportToCSV();
const pdf = await api.exportToPDF();

// Device integration
await api.connectDevice('smart_meter', { apiKey: '...' });
```

## Accessibility

- Keyboard navigation for all interactive elements
- ARIA labels for screen readers
- Focus indicators for all focusable elements
- High contrast color scheme
- Skip links for main content
- Reduced motion support

## Localization

The app is ready for localization. Strings are stored in the `i18n` object structure (can be added):

```javascript
const i18n = {
    en: {
        'calculate.footprint': 'Calculate My Footprint',
        'dashboard.title': 'Your Dashboard',
        // ... more strings
    },
    kn: { // Kannada
        'calculate.footprint': 'ನನ್ನ ಪಾದಚಿಹ್ನೆಯನ್ನು ಲೆಕ್ಕಹಾಕಿ',
        // ... translations
    }
};
```

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Acceptance Criteria

✅ **Core Features**
- [x] Hero section with value proposition
- [x] Interactive emissions calculator (all categories)
- [x] Dashboard with KPIs and charts
- [x] Insights & recommendations section
- [x] Goals & challenges tracking
- [x] Profile & settings management
- [x] Premium features page with comparison

✅ **Chatbot**
- [x] Floating, collapsible chat UI
- [x] Onboarding conversation
- [x] Intent detection (mock NLU)
- [x] Premium feature gating
- [x] Conversation history (localStorage)
- [x] API-ready hooks for backend
- [x] Accessibility support

✅ **Design & UX**
- [x] Dark/light theme toggle
- [x] Glassmorphism effects
- [x] Smooth animations
- [x] Responsive design (mobile/tablet/desktop)
- [x] Print stylesheet for reports

✅ **Technical**
- [x] CSS variables for theming
- [x] Grid/Flexbox layouts
- [x] localStorage fallback
- [x] REST API stubs
- [x] Stripe integration stubs
- [x] Error handling
- [x] Loading states

## Development

### Running in Development Mode

```bash
# Backend (if using)
python chatbot.py

# Frontend (using Python HTTP server)
python -m http.server 8000
# Open http://localhost:8000
```

### Adding New Features

1. **New Calculator Category**: Add input fields in `index.html`, calculation logic in `app.js`
2. **New Intent**: Add pattern to `INTENT_PATTERNS` in `chatbot.py`, add response in `generate_response()`
3. **New Premium Feature**: Gate via `user.isPremium` check, add to premium comparison table

## License

This project is provided as-is for educational and commercial use.

## Support

For issues or questions, please refer to the code comments or create an issue in the repository.

---

**Note**: This is a production-ready scaffold. To deploy:
1. Replace stubbed API endpoints with real backend
2. Configure Stripe with real API keys
3. Set up database for user data and logs
4. Deploy backend to a server (e.g., Heroku, AWS, DigitalOcean)
5. Deploy frontend to a static host (e.g., Netlify, Vercel, GitHub Pages)

