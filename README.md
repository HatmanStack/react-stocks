<div align="center">

# Stock Insights - React Native

[![](https://img.shields.io/badge/React%20Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactnative.dev/)
[![](https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev/)
[![](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![](https://img.shields.io/badge/AWS%20Lambda-FF9900?style=for-the-badge&logo=awslambda&logoColor=white)](https://aws.amazon.com/lambda/)

**Professional stock tracking and sentiment analysis for everyone.**

A cross-platform application that lets you monitor real-time stock prices, analyze market sentiment, and track your portfolio with AI-powered insights.

---

<!-- ![Stock Insights Banner](assets/banner.png) -->

---

</div>

## ✨ Features

* 📈 **Real-Time Stock Data** - Historical OHLCV price data with customizable date ranges
* 🧠 **Market Sentiment Analysis** - Browser-based sentiment with financial lexicon (instant, offline)
* 📰 **Latest News** - Real-time news articles from major financial sources
* 💼 **Portfolio Management** - Track your favorite stocks with personalized watchlist
* 🌐 **Cross-Platform** - Single codebase runs on iOS, Android, and Web seamlessly
* 📴 **Offline-First** - Local database caching + browser-based ML works without network
* 🎨 **Material Design** - Beautiful, responsive UI with React Native Paper components
* 🔄 **Smart Sync** - Automatic data synchronization with progress tracking
* 🗄️ **Dual Database** - SQLite for native, localStorage for web - transparent abstraction
* 🎯 **ML Predictions** - Browser-based predictions (next day, week, month) using logistic regression
* 🔒 **Secure Backend** - AWS Lambda backend protects API keys, no client-side exposure

---

## 🔧 Recent Improvements

### v2.0.0 - Backend Migration & ML Implementation
- **AWS Lambda Backend**: Secure API proxy for stock/news data with DynamoDB caching
  - Eliminates client-side API key exposure
  - 7-30 day cache TTL for >80% hit rate
  - Auto-updates frontend `.env` on deployment
- **Browser-Based ML**: Replaced Python microservices with JavaScript implementations
  - Sentiment analysis: <100ms per article (vs ~1000ms API call)
  - Stock predictions: <50ms per prediction with scikit-learn numerical match
  - Full offline capability
- **Testing & Security**: 618 tests (94% pass rate), comprehensive security audit
- **Production Ready**: SAM deployment templates, CloudWatch monitoring, cost optimization (<$20/month)

---

## 💻 Tech Stack

* **Core:** React Native 0.81.5, Expo ~54.0.23, TypeScript 5.9.2
* **Navigation:** Expo Router ~6.0.14 (file-based routing)
* **UI:** React Native Paper 5.14.5 (Material Design 3)
* **State Management:** React Context + TanStack Query 5.90.7
* **Database:** Expo SQLite 16.0.9 (native) / localStorage (web)
* **Backend:** AWS Lambda (Node.js 20.x) + API Gateway + DynamoDB
* **APIs:** Tiingo & Finnhub (proxied through Lambda)
* **ML:** Browser-based sentiment analysis + logistic regression predictions
* **Testing:** Jest 30.2.0 + React Native Testing Library (618 tests, 94% pass rate)

---

## 🚀 Getting Started

### Prerequisites

* [Node.js](https://nodejs.org/) v20+ (v24 LTS recommended)
* npm (included with Node.js)
* [Expo Go](https://expo.dev/go) app (for mobile testing)
* AWS CLI v2+ and SAM CLI v1.70.0+ (for backend deployment)

### Installation & Running

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/yourusername/react-stocks.git
    cd react-stocks
    ```

2.  **Install dependencies:**
    ```bash
    npm install --legacy-peer-deps
    ```

3.  **Deploy backend (auto-configures .env):**
    ```bash
    cd backend
    npm install
    npm run deploy:guided  # Enter API keys when prompted
    # Returns to root directory and auto-updates .env
    ```

4.  **Start the app:**
    ```bash
    npm start              # Expo dev server
    npm run android        # Android emulator/device
    npm run ios            # iOS simulator
    npm run web            # Web browser
    ```

5.  **Open the app:**
    * Scan QR code with **Expo Go** app
    * Or press `a` (Android) / `i` (iOS) / `w` (Web) in terminal

---

## Available Scripts

```bash
# Development
npm start                  # Start Expo dev server
npm run android            # Run on Android
npm run ios                # Run on iOS
npm run web                # Run on Web

# Testing
npm test                   # Run all tests
npm run test:watch         # Watch mode for TDD
npm run test:coverage      # Generate coverage report

# Code Quality
npm run type-check         # TypeScript compilation check
npm run lint               # Run ESLint
npm run lint:fix           # Auto-fix ESLint issues
npm run format             # Format with Prettier

# Backend
cd backend
npm run deploy:guided      # First-time deployment
npm run deploy             # Subsequent deployments
npm run update-env         # Update frontend .env with API URL
npm run logs               # View Lambda logs
npm run warm-cache         # Pre-populate DynamoDB cache
```

---

## 🏗 Architecture

**Layered architecture** with clear separation of concerns:
- **Presentation:** Expo Router screens + React Native Paper components
- **State Management:** React Context + TanStack Query cache
- **Business Logic:** Custom hooks + service layer
- **Data Access:** Repository pattern with platform abstraction
- **Storage:** SQLite (native) / localStorage (web)

**Key patterns:** Repository, Platform Abstraction, Service Layer, Hook Composition

See [CLAUDE.md](CLAUDE.md) for detailed architecture documentation.

---

## 📜 License

This project is licensed under the terms of the MIT License.
