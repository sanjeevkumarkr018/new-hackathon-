// API Integration Layer with Stubbed Endpoints

// Helper to get config safely
function getApiConfig() {
    const config = typeof CONFIG !== 'undefined' ? CONFIG : (typeof window !== 'undefined' ? window.CONFIG : null);
    if (!config) {
        console.warn('CONFIG not found in api.js, using defaults');
        const baseUrl = typeof window !== 'undefined' && window.location ? 
            `${window.location.protocol}//${window.location.hostname}:${window.location.port || '5000'}/api` : 
            'http://localhost:5000/api';
        return { api: { baseUrl, timeout: 30000 }, app: { demoMode: true } };
    }
    return config;
}

class API {
    constructor() {
        const config = getApiConfig();
        this.baseUrl = config.api.baseUrl;
        this.authToken = localStorage.getItem('authToken') || null;
        this.user = JSON.parse(localStorage.getItem('user')) || null;
    }

    // Helper method to set auth token
    setAuthToken(token) {
        this.authToken = token;
        localStorage.setItem('authToken', token);
    }

    // Helper method to set user data
    setUser(user) {
        this.user = user;
        localStorage.setItem('user', JSON.stringify(user));
    }

    // Generic request method
    async request(endpoint, options = {}) {
        const config = getApiConfig();
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        try {
            const response = await fetch(url, {
                ...options,
                headers,
                signal: AbortSignal.timeout(config.api.timeout),
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API Request Error:', error);
            throw error;
        }
    }

    // Authentication Endpoints (Stubbed)
    async login(email, password) {
        // Stub: In production, this would call /api/auth/login
        const config = getApiConfig();
        if (config.app.demoMode) {
            // Mock login for demo
            const mockUser = {
                id: 'demo-user-1',
                email: email,
                isPremium: false,
                householdSize: 1,
                location: 'San Francisco, USA',
            };
            const mockToken = 'demo-token-' + Date.now();
            this.setAuthToken(mockToken);
            this.setUser(mockUser);
            return { user: mockUser, token: mockToken };
        }
        return this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
    }

    async signup(email, password, name) {
        // Stub: In production, this would call /api/auth/signup
        const config = getApiConfig();
        if (config.app.demoMode) {
            const mockUser = {
                id: 'demo-user-' + Date.now(),
                email: email,
                name: name,
                isPremium: false,
                householdSize: 1,
                location: '',
            };
            const mockToken = 'demo-token-' + Date.now();
            this.setAuthToken(mockToken);
            this.setUser(mockUser);
            return { user: mockUser, token: mockToken };
        }
        return this.request('/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ email, password, name }),
        });
    }

    async logout() {
        this.authToken = null;
        this.user = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        // In production: this.request('/auth/logout', { method: 'POST' });
    }

    // User Profile Endpoints (Stubbed)
    async getUserProfile() {
        const config = getApiConfig();
        if (config.app.demoMode) {
            return this.user || {
                id: 'demo-user',
                email: 'demo@example.com',
                isPremium: false,
                householdSize: 1,
                location: 'San Francisco, USA',
                units: 'imperial',
            };
        }
        return this.request('/user/profile');
    }

    async updateUserProfile(profileData) {
        const config = getApiConfig();
        if (config.app.demoMode) {
            const updatedUser = { ...this.user, ...profileData };
            this.setUser(updatedUser);
            return updatedUser;
        }
        return this.request('/user/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData),
        });
    }

    // Carbon Log Endpoints (Stubbed)
    async saveCarbonLog(logData) {
        const logs = this.getCarbonLogs();
        const newLog = {
            id: 'log-' + Date.now(),
            ...logData,
            timestamp: new Date().toISOString(),
        };
        logs.push(newLog);
        localStorage.setItem('carbonLogs', JSON.stringify(logs));

        const config = getApiConfig();
        if (!config.app.demoMode) {
            return this.request('/logs', {
                method: 'POST',
                body: JSON.stringify(newLog),
            });
        }
        return newLog;
    }

    getCarbonLogs() {
        const logs = localStorage.getItem('carbonLogs');
        return logs ? JSON.parse(logs) : [];
    }

    async getCarbonLogsAPI() {
        const config = getApiConfig();
        if (config.app.demoMode) {
            return this.getCarbonLogs();
        }
        return this.request('/logs');
    }

    // Premium/Subscription Endpoints (Stubbed)
    async createCheckoutSession(priceId) {
        const config = getApiConfig();
        if (config.app.demoMode) {
            // Mock checkout - simulate successful subscription
            setTimeout(() => {
                const user = { ...this.user, isPremium: true };
                this.setUser(user);
                window.dispatchEvent(new CustomEvent('subscription-updated', { detail: { isPremium: true } }));
            }, 2000);
            return {
                sessionId: 'mock-session-' + Date.now(),
                url: '#premium-success',
            };
        }
        return this.request('/subscriptions/checkout', {
            method: 'POST',
            body: JSON.stringify({ priceId }),
        });
    }

    async getSubscriptionStatus() {
        const config = getApiConfig();
        if (config.app.demoMode) {
            return {
                isPremium: this.user?.isPremium || false,
                status: 'active',
            };
        }
        return this.request('/subscriptions/status');
    }

    async cancelSubscription() {
        const config = getApiConfig();
        if (config.app.demoMode) {
            const user = { ...this.user, isPremium: false };
            this.setUser(user);
            return { success: true };
        }
        return this.request('/subscriptions/cancel', { method: 'POST' });
    }

    getStripeCustomerPortalUrl() {
        // Stub: In production, this would call /api/subscriptions/portal
        const config = getApiConfig();
        return config.app.demoMode ? '#customer-portal' : `${this.baseUrl}/subscriptions/portal`;
    }

    // Export Endpoints (Stubbed - Premium Only)
    async exportToCSV() {
        const config = getApiConfig();
        if (!this.user?.isPremium && !config.app.demoMode) {
            throw new Error('Premium subscription required for CSV export');
        }
        // Stub: In production, this would call /api/export/csv
        const logs = this.getCarbonLogs();
        // Generate CSV content
        const csvContent = this.generateCSV(logs);
        return csvContent;
    }

    async exportToPDF() {
        const config = getApiConfig();
        if (!this.user?.isPremium && !config.app.demoMode) {
            throw new Error('Premium subscription required for PDF export');
        }
        // Stub: In production, this would call /api/export/pdf
        return { url: '#pdf-export', message: 'PDF export not implemented in demo' };
    }

    generateCSV(logs) {
        const headers = ['Date', 'Category', 'Value', 'CO2e (t)', 'Notes'];
        const rows = logs.map(log => [
            log.timestamp,
            log.category,
            log.value,
            log.co2e,
            log.notes || '',
        ]);
        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
        return csv;
    }

    // Device Integration Endpoints (Stubbed - Premium Only)
    async connectDevice(deviceType, credentials) {
        const config = getApiConfig();
        if (!this.user?.isPremium && !config.app.demoMode) {
            throw new Error('Premium subscription required for device integration');
        }
        // Stub: In production, this would call /api/devices/connect
        return {
            deviceId: 'device-' + Date.now(),
            type: deviceType,
            status: 'connected',
        };
    }

    async getDeviceData(deviceId) {
        // Stub: In production, this would call /api/devices/{deviceId}/data
        return {
            deviceId,
            data: [],
            lastSync: new Date().toISOString(),
        };
    }
}

// Initialize API instance
const api = new API();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
}

