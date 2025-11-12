<div align="center">

# Stock Insights

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![React Native](https://img.shields.io/badge/React%20Native-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Expo](https://img.shields.io/badge/Expo-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A comprehensive cross-platform stock tracking application built with React Native and Expo. Monitor stock prices, read latest news, and analyze market sentiment with AI-powered insights. Track your portfolio with detailed analytics and historical data.

[Features](#-features) • [Tech Stack](#-tech-stack) • [Getting Started](#-getting-started) • [Architecture](#-architecture)

---

</div>

## ✨ Features

* **Real-Time Stock Data:** Access historical OHLCV price data with customizable date ranges.
* **Market Sentiment Analysis:** Browser-based sentiment analysis with financial lexicon (instant, offline-capable).
* **Latest News:** Stay informed with real-time news articles from major financial sources.
* **Portfolio Management:** Track your favorite stocks with a personalized watchlist.
* **Cross-Platform:** Single codebase runs on iOS, Android, and Web seamlessly.
* **Offline-First:** Local database caching + browser-based ML works without network.
* **Material Design:** Beautiful, responsive UI with React Native Paper components.
* **Smart Sync:** Automatic data synchronization with progress tracking and error handling.
* **Dual Database:** SQLite for native apps, localStorage for web - transparent platform abstraction.
* **ML Predictions:** Browser-based stock predictions (next day, week, month) using logistic regression.
* **Secure Backend:** AWS Lambda backend protects API keys, no client-side exposure.

---

## 💻 Tech Stack

### Frontend
* **Framework:** [React Native](https://reactnative.dev/) 0.81.5
* **Platform:** [Expo](https://expo.dev/) ~54.0.23
* **Language:** [TypeScript](https://www.typescriptlang.org/) 5.9.2
* **Navigation:** [Expo Router](https://docs.expo.dev/router/introduction/) ~6.0.14 (File-based routing)
* **UI Library:** [React Native Paper](https://reactnativepaper.com/) 5.14.5 (Material Design)

### State & Data
* **Data Fetching:** [TanStack Query](https://tanstack.com/query) (React Query) 5.90.7
* **State Management:** React Context API
* **Native Database:** [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/) 16.0.9
* **Web Storage:** localStorage (custom SQL-like interface)
* **Networking:** [Axios](https://axios-http.com/) 1.13.2

### Backend & APIs
* **Backend:** AWS Lambda (Node.js 20.x) + API Gateway HTTP API
* **Stock Data:** [Tiingo](https://www.tiingo.com/) & [Polygon.io](https://polygon.io/) (proxied through Lambda)
* **Sentiment Analysis:** Browser-based JavaScript analyzer with financial lexicon
* **Price Predictions:** Browser-based logistic regression model (ported from scikit-learn)

### Machine Learning
* **Sentiment Library:** [sentiment](https://www.npmjs.com/package/sentiment) 5.0.2
* **Math Operations:** [mathjs](https://mathjs.org/) 14.0.3
* **Performance:** <100ms sentiment analysis, <50ms predictions

### Testing & Quality
* **Testing:** [Jest](https://jestjs.io/) ~30.2.0 & [React Native Testing Library](https://callstack.github.io/react-native-testing-library/)
* **Coverage:** 618 tests passing (94%), 85%+ coverage on critical paths
* **Linting:** [ESLint](https://eslint.org/) with Expo config
* **Formatting:** [Prettier](https://prettier.io/) 3.6.2

---

## 🚀 Getting Started

### Prerequisites

* [Node.js](https://nodejs.org/) v20.x or higher (v24 LTS recommended)
* npm (comes with Node.js)
* [Expo Go](https://expo.dev/go) app on your iOS or Android device (for testing)

### Installation & Running

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/yourusername/react-stocks.git
    cd react-stocks
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the development server:**
    ```bash
    # Start the Expo dev server
    npm start

    # Or run directly on a specific platform
    npm run android  # Android emulator/device
    npm run ios      # iOS simulator
    npm run web      # Web browser
    ```

4.  **Configure environment variables:**
    ```bash
    # Copy the example environment file
    cp .env.example .env
    ```

    Then edit `.env` and configure:
    * **EXPO_PUBLIC_BACKEND_URL**: Your AWS Lambda API Gateway URL (from backend deployment)
    * **EXPO_PUBLIC_BROWSER_SENTIMENT**: Set to `true` to use browser-based sentiment analysis
    * **EXPO_PUBLIC_BROWSER_PREDICTION**: Set to `true` to use browser-based prediction model

    **Getting the Backend URL:**
    ```bash
    # Deploy the backend first (see backend/DEPLOYMENT.md)
    cd backend
    sam deploy --guided

    # Copy the ReactStocksApiUrl from the output
    # Example: https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com
    ```

5.  **Open the app:**
    * Scan the QR code from the terminal using **Expo Go**.
    * Or, press `a` for Android / `i` for iOS / `w` for Web in the terminal.

### Environment Setup

This app requires a backend Lambda API for fetching stock and news data. The backend deployment process is documented in `backend/DEPLOYMENT.md`.

**Required Environment Variables:**
* `EXPO_PUBLIC_BACKEND_URL` - AWS Lambda API Gateway endpoint URL (required)
* `EXPO_PUBLIC_BROWSER_SENTIMENT` - Enable browser-based sentiment analysis (default: false)
* `EXPO_PUBLIC_BROWSER_PREDICTION` - Enable browser-based prediction model (default: false)

**Setup Steps:**
1. Deploy the backend: `cd backend && sam deploy --guided`
2. Copy `.env.example` to `.env`
3. Update `EXPO_PUBLIC_BACKEND_URL` with your Lambda URL
4. Optionally enable feature flags for browser-based ML

**⚠️ Security Note:** API keys for Tiingo and Polygon are stored in the backend Lambda environment variables, NOT in the frontend code. Never commit API keys to version control.

### Development Commands

```bash
# Testing
npm test                  # Run all tests once
npm run test:watch        # Run tests in watch mode (TDD)
npm run test:coverage     # Generate coverage report

# Code Quality
npm run type-check        # TypeScript compilation check
npm run lint              # Run ESLint
npm run lint:fix          # Auto-fix ESLint issues
npm run format            # Format code with Prettier
```

---

## 🏗 Architecture

### Overview

Stock Insights follows a **layered architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────┐
│          Presentation Layer                 │
│  (Expo Router Screens & Components)         │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│       State Management Layer                │
│  (React Context + React Query Cache)        │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│        Business Logic Layer                 │
│      (Custom Hooks & Services)              │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│         Data Access Layer                   │
│     (Repository Pattern + Sync)             │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  Storage Layer (Platform Abstraction)       │
│   Native: SQLite  |  Web: localStorage      │
└─────────────────────────────────────────────┘
```

### Key Design Patterns

* **Repository Pattern:** All database operations abstracted through repositories
* **Platform Abstraction:** Dual database implementation (SQLite/localStorage) with unified interface
* **Service Layer:** External API calls isolated in dedicated service modules
* **Hook Composition:** Data fetching and business logic encapsulated in custom hooks
* **Sync Orchestration:** Coordinated data pipeline for stocks → news → sentiment

### Project Structure

```
react-stocks/
├── app/                          # Expo Router (file-based routing)
│   ├── _layout.tsx              # Root layout with providers
│   └── (tabs)/                  # Tab navigation group
│       ├── index.tsx            # Search screen
│       ├── portfolio.tsx        # Portfolio screen
│       └── stock/[ticker]/      # Dynamic stock routes
│           ├── index.tsx        # Price tab
│           ├── sentiment.tsx    # Sentiment tab
│           └── news.tsx         # News tab
├── src/
│   ├── components/              # Reusable UI components
│   ├── contexts/                # React Context providers
│   ├── database/                # Database layer (SQLite + Web)
│   │   ├── repositories/        # Data access layer
│   │   ├── database.ts          # Native SQLite
│   │   ├── database.web.ts      # Web localStorage
│   │   └── index.ts             # Platform abstraction
│   ├── hooks/                   # Custom React hooks
│   ├── services/                # External API services
│   │   ├── api/                 # API clients
│   │   └── sync/                # Data synchronization
│   ├── types/                   # TypeScript definitions
│   ├── utils/                   # Utility functions
│   └── theme/                   # Styling & theming
├── __tests__/                   # Jest tests (mirrors src/)
└── assets/                      # Static assets
```

For detailed architecture documentation, see [CLAUDE.md](CLAUDE.md).

---

## 🔑 API Keys

This app requires API keys for stock data and sentiment analysis:

1. **Stock Data APIs** (choose one):
   * [Tiingo](https://www.tiingo.com/) - Free tier: 500 requests/hour
   * [Polygon.io](https://polygon.io/) - Free tier: 5 requests/minute

2. **Sentiment Analysis:**
   * Uses Google Cloud Run microservice (endpoint included)
   * No API key required (public endpoint)

Configure API keys in your environment or service configuration files.

---

## 🧪 Testing

The app includes comprehensive test coverage:

* **Unit Tests:** Repository, service, and utility functions
* **Integration Tests:** Complete data flow and sync pipeline
* **Component Tests:** React Native Testing Library for UI

```bash
# Run all tests
npm test

# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage
```

---

## 📱 Platform Support

| Platform | Status | Database | Notes |
|----------|--------|----------|-------|
| iOS      | ✅     | SQLite   | Supports iOS 13+ |
| Android  | ✅     | SQLite   | Supports Android 6.0+ |
| Web      | ✅     | localStorage | Full feature parity |

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure:
* All tests pass (`npm test`)
* Code follows style guidelines (`npm run lint`)
* TypeScript compiles without errors (`npm run type-check`)

---

## 📜 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

* Stock data provided by [Tiingo](https://www.tiingo.com/) and [Polygon.io](https://polygon.io/)
* Sentiment analysis powered by [FinBERT](https://github.com/ProsusAI/finBERT)
* UI components from [React Native Paper](https://reactnativepaper.com/)
* Built with [Expo](https://expo.dev/) and [React Native](https://reactnative.dev/)

---

<div align="center">

**[⬆ back to top](#stock-insights)**

Made with ❤️ using React Native & Expo

</div>
