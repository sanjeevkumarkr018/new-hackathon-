// Configuration file for Carbon Footprint Tracker
// Make sure this file loads before app.js

// Get base URL from window location or use default
const getBaseUrl = () => {
    if (typeof window !== 'undefined' && window.location) {
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        const port = window.location.port ? `:${window.location.port}` : '';
        return `${protocol}//${hostname}${port}`;
    }
    return 'http://localhost:5000';
};

const CONFIG = {
    // API Configuration
    api: {
        baseUrl: getBaseUrl() + '/api',
        timeout: 30000,
    },

    // Stripe Configuration (stubbed)
    stripe: {
        publishableKey: 'pk_test_your_stripe_key_here', // Replace with your Stripe key
        priceId: 'price_premium_monthly',
    },

    // Chatbot Configuration
    chatbot: {
        enabled: true,
        apiBase: getBaseUrl(), // Use same host/port as the page
        mockMode: false, // Set to true if backend is not available
    },

    // Application Settings
    app: {
        name: 'Carbon Footprint Tracker',
        version: '1.0.0',
        demoMode: true, // Toggle between demo and real user data
        seedDemoData: false, // When true, pre-populate dashboard with demo logs
    },

    // Carbon Emission Factors (kg CO2e per unit)
    emissionFactors: {
        transport: {
            car: 0.41, // kg CO2e per mile
            electricCar: 0.15, // kg CO2e per mile (depends on grid)
            hybridCar: 0.25, // kg CO2e per mile
            flightShort: 0.158, // kg CO2e per km (short-haul)
            flightLong: 0.25, // kg CO2e per km (long-haul)
            metro: 0.05, // kg CO2e per mile
            bus: 0.06, // kg CO2e per mile
            train: 0.04, // kg CO2e per mile
            tram: 0.03, // kg CO2e per mile
            taxi: 0.35, // kg CO2e per mile
            rideshare: 0.35, // kg CO2e per mile
            bike: 0, // kg CO2e per mile (zero emissions)
            walking: 0, // kg CO2e per mile (zero emissions)
            motorcycle: 0.22, // kg CO2e per mile
            truck: 0.65, // kg CO2e per mile
        },
        energy: {
            electricity: 0.233, // kg CO2e per kWh (US average)
            gas: 5.3, // kg CO2e per therm
            heatingOil: 2.68, // kg CO2e per liter
            propane: 1.51, // kg CO2e per liter
            coal: 2.42, // kg CO2e per kg
            solar: 0.05, // kg CO2e per kWh (manufacturing only)
            wind: 0.01, // kg CO2e per kWh (manufacturing only)
        },
        food: {
            meatMeal: 7.19, // kg CO2e per meal
            beefMeal: 15.5, // kg CO2e per meal
            chickenMeal: 4.2, // kg CO2e per meal
            fishMeal: 3.8, // kg CO2e per meal
            vegetarianMeal: 2.5, // kg CO2e per meal
            veganMeal: 1.5, // kg CO2e per meal
            dairyServing: 2.5, // kg CO2e per serving
            cheese: 3.2, // kg CO2e per serving
            eggs: 1.8, // kg CO2e per serving
            processedFood: 3.5, // kg CO2e per meal
        },
        waste: {
            wasteBag: 2.5, // kg CO2e per bag
            recyclingOffset: -1.2, // negative because recycling reduces emissions
            compostOffset: -0.8, // negative because composting reduces emissions
            plasticWaste: 3.2, // kg CO2e per kg
            paperWaste: 1.5, // kg CO2e per kg
            organicWaste: 0.5, // kg CO2e per kg
        },
        shopping: {
            general: 0.005, // kg CO2e per dollar
            electronics: 50, // kg CO2e per item
            clothing: 15, // kg CO2e per item
            furniture: 120, // kg CO2e per item
            appliances: 200, // kg CO2e per item
            books: 2.5, // kg CO2e per item
            toys: 8, // kg CO2e per item
            onlineShipping: 0.5, // kg CO2e per package
        },
    },

    // Conversion Factors
    conversions: {
        kgToTonnes: 0.001,
        tonnesToKg: 1000,
        treesPerTonne: 20, // Average trees needed to offset 1 tonne CO2
    },

    // UI Configuration
    ui: {
        defaultTheme: 'light',
        chartColors: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'],
        animationDuration: 300,
    },
};

// Initialize theme from localStorage
if (typeof document !== 'undefined') {
    const savedTheme = localStorage.getItem('theme') || CONFIG.ui.defaultTheme;
    document.documentElement.setAttribute('data-theme', savedTheme);
}

// Make CONFIG globally available
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}

// Export for use in other scripts (Node.js/CommonJS)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}

// Verify CONFIG is loaded
console.log('CONFIG loaded:', CONFIG);

