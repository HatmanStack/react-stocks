# Python to TypeScript Conversion Guide for ML Implementation

## Purpose

This guide helps engineers convert the planned Python/scikit-learn ML pipeline to TypeScript/TensorFlow.js. Use this as a reference when implementing Phase 1 tasks that need conversion from Python patterns to TypeScript.

---

## Table of Contents

1. [Language Basics](#language-basics)
2. [File Structure & Imports](#file-structure--imports)
3. [Data Models](#data-models)
4. [NumPy → JavaScript Arrays/TensorFlow](#numpy--javascript-arraystensorflow)
5. [scikit-learn → TensorFlow.js](#scikit-learn--tensorflowjs)
6. [Testing: pytest → Jest](#testing-pytest--jest)
7. [Common Patterns](#common-patterns)

---

## Language Basics

### Variable Declarations

```python
# Python
data = fetch_data()
result: float = 0.5
items: List[str] = ["a", "b"]
```

```typescript
// TypeScript
const data = fetchData();
const result: number = 0.5;
const items: string[] = ["a", "b"];
```

### Functions

```python
# Python
def calculate_score(value: float, weight: float = 1.0) -> float:
    return value * weight
```

```typescript
// TypeScript
function calculateScore(value: number, weight: number = 1.0): number {
    return value * weight;
}

// Or arrow function
const calculateScore = (value: number, weight: number = 1.0): number => {
    return value * weight;
};
```

### Classes and Interfaces

```python
# Python
from dataclasses import dataclass

@dataclass
class StockPrice:
    date: str
    open: float
    close: float
```

```typescript
// TypeScript
interface StockPrice {
    date: string;
    open: number;
    close: number;
}

// Or type alias
type StockPrice = {
    date: string;
    open: number;
    close: number;
};
```

---

## File Structure & Imports

### Python Structure

```
backend/src/functions/prediction/
  __init__.py
  handler.py
  data_fetcher.py
  models.py
  requirements.txt
```

### TypeScript Structure

```
backend/src/handlers/
  prediction.handler.ts
backend/src/services/
  dataFetcher.ts
  featureEngineering.ts
backend/src/types/
  prediction.types.ts
backend/package.json (not requirements.txt)
```

### Import Syntax

```python
# Python
from typing import List, Optional
from .models import StockPrice
import numpy as np
```

```typescript
// TypeScript
import { StockPrice } from '../types/prediction.types';
import * as tf from '@tensorflow/tfjs-node';
```

---

## Data Models

### Python (Pydantic/dataclasses)

```python
from pydantic import BaseModel
from typing import List, Optional

class DailyFeatures(BaseModel):
    date: str
    ticker: str
    open: float
    high: float
    low: float
    close: float
    volume: int
    event_earnings: float
    event_ma: float
    aspect_score: float
    finbert_score: float
    label: Optional[int] = None
```

### TypeScript (interfaces)

```typescript
interface DailyFeatures {
    date: string;
    ticker: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    eventEarnings: number;
    eventMa: number;
    aspectScore: number;
    finbertScore: number;
    label?: number; // Optional
}
```

**Note**: TypeScript uses camelCase (not snake_case) for property names.

---

## NumPy → JavaScript Arrays/TensorFlow

### Array Operations

```python
# Python with NumPy
import numpy as np

# Create array
X = np.array([[1, 2], [3, 4]])
y = np.array([0, 1])

# Shape
print(X.shape)  # (2, 2)

# Math operations
mean = np.mean(X, axis=0)
std = np.std(X, axis=0)

# Slicing
first_row = X[0, :]
```

```typescript
// TypeScript with TensorFlow.js
import * as tf from '@tensorflow/tfjs-node';

// Create tensor
const X = tf.tensor2d([[1, 2], [3, 4]]);
const y = tf.tensor1d([0, 1]);

// Shape
console.log(X.shape);  // [2, 2]

// Math operations
const mean = X.mean(0);  // axis=0
const std = tf.moments(X, 0).variance.sqrt();

// Slicing
const firstRow = X.slice([0, 0], [1, -1]);

// IMPORTANT: Clean up tensors to prevent memory leaks
X.dispose();
y.dispose();
```

**Key Difference**: TensorFlow.js requires manual memory management (`tensor.dispose()`). Use `tf.tidy()` for automatic cleanup:

```typescript
const result = tf.tidy(() => {
    const X = tf.tensor2d([[1, 2], [3, 4]]);
    const mean = X.mean();
    return mean.dataSync()[0];  // Extract value before dispose
});
```

### Working with JavaScript Arrays

```typescript
// For simple operations, plain JavaScript arrays work fine
const prices: number[] = [100, 101, 102];
const mean = prices.reduce((a, b) => a + b, 0) / prices.length;

// Convert between arrays and tensors
const tensor = tf.tensor1d(prices);
const array = await tensor.array();  // Note: async
tensor.dispose();
```

---

## scikit-learn → TensorFlow.js

### StandardScaler (Normalization)

```python
# Python (scikit-learn)
from sklearn.preprocessing import StandardScaler

scaler = StandardScaler()
X_normalized = scaler.fit_transform(X)
```

```typescript
// TypeScript (TensorFlow.js)
import * as tf from '@tensorflow/tfjs-node';

function createScaler(X: tf.Tensor2D): { mean: tf.Tensor1D; std: tf.Tensor1D } {
    const moments = tf.moments(X, 0);
    return {
        mean: moments.mean as tf.Tensor1D,
        std: (moments.variance as tf.Tensor1D).sqrt()
    };
}

function normalizeFeatures(X: tf.Tensor2D, scaler: { mean: tf.Tensor1D; std: tf.Tensor1D }): tf.Tensor2D {
    return X.sub(scaler.mean).div(scaler.std);
}

// Usage
const X = tf.tensor2d([[1, 2], [3, 4]]);
const scaler = createScaler(X);
const XNormalized = normalizeFeatures(X, scaler);
```

**Or use built-in normalization layer**:

```typescript
const normalizationLayer = tf.layers.normalization({ axis: 1 });
// Adapt layer to data
normalizationLayer.adapt(X);
// Apply normalization
const XNormalized = normalizationLayer.apply(X) as tf.Tensor2D;
```

### Logistic Regression

```python
# Python (scikit-learn)
from sklearn.linear_model import LogisticRegression

model = LogisticRegression(
    max_iter=1000,
    solver='lbfgs',
    random_state=42,
    class_weight='balanced'
)
model.fit(X, y)

# Predictions
predictions = model.predict(X_test)
probabilities = model.predict_proba(X_test)[:, 1]
```

```typescript
// TypeScript (TensorFlow.js)
import * as tf from '@tensorflow/tfjs-node';

function createLogisticRegressionModel(inputDim: number): tf.Sequential {
    const model = tf.sequential({
        layers: [
            tf.layers.dense({
                inputShape: [inputDim],
                units: 1,
                activation: 'sigmoid',
                kernelInitializer: 'glorotUniform'
            })
        ]
    });

    model.compile({
        optimizer: tf.train.adam(0.01),
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
    });

    return model;
}

async function trainModel(
    model: tf.Sequential,
    X: tf.Tensor2D,
    y: tf.Tensor2D,
    epochs: number = 100
): Promise<void> {
    await model.fit(X, y, {
        epochs: epochs,
        batchSize: 32,
        verbose: 0,
        shuffle: true,
        validationSplit: 0.2
    });
}

// Usage
const model = createLogisticRegressionModel(14);  // 14 features
await trainModel(model, XTrain, yTrain);

// Predictions
const predictions = model.predict(XTest) as tf.Tensor2D;
const probabilities = await predictions.array();  // Extract values

// Clean up
predictions.dispose();
```

**Class Weighting** (balanced):

```typescript
// Calculate class weights manually
function calculateClassWeights(y: number[]): { 0: number; 1: number } {
    const counts = { 0: 0, 1: 0 };
    y.forEach(label => counts[label as 0 | 1]++);

    const total = y.length;
    return {
        0: total / (2 * counts[0]),
        1: total / (2 * counts[1])
    };
}

// Apply in training
const classWeights = calculateClassWeights(yArray);
await model.fit(X, y, {
    epochs: 100,
    classWeight: classWeights
});
```

---

## Testing: pytest → Jest

### Test File Structure

```python
# Python (pytest)
# __tests__/backend/prediction/test_model.py

import pytest
from backend.src.functions.prediction.model import train_model

def test_train_model_with_valid_data():
    X = [[1, 2], [3, 4]]
    y = [0, 1]
    model = train_model(X, y)
    assert model is not None
```

```typescript
// TypeScript (Jest)
// __tests__/backend/handlers/prediction.handler.test.ts

import { trainModel } from '../../../src/services/mlModel';
import * as tf from '@tensorflow/tfjs-node';

describe('trainModel', () => {
    it('should train model with valid data', async () => {
        const X = tf.tensor2d([[1, 2], [3, 4]]);
        const y = tf.tensor2d([[0], [1]]);

        const model = await trainModel(X, y);

        expect(model).toBeDefined();
        expect(model.outputs[0].shape[1]).toBe(1);

        // Cleanup
        X.dispose();
        y.dispose();
    });
});
```

### Mocking

```python
# Python (pytest with mock)
from unittest.mock import patch, MagicMock

@patch('backend.src.functions.prediction.data_fetcher.query_dynamodb')
def test_fetch_data_calls_dynamodb(mock_query):
    mock_query.return_value = {'Items': []}
    result = fetch_stock_data('AAPL')
    mock_query.assert_called_once()
```

```typescript
// TypeScript (Jest)
import { fetchStockData } from '../../../src/services/dataFetcher';

jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn(),
    QueryCommand: jest.fn()
}));

describe('fetchStockData', () => {
    it('should call DynamoDB query', async () => {
        const mockSend = jest.fn().mockResolvedValue({ Items: [] });
        const mockClient = { send: mockSend };

        await fetchStockData('AAPL', mockClient as any);

        expect(mockSend).toHaveBeenCalledTimes(1);
    });
});
```

### Running Tests

```bash
# Python
pytest backend/__tests__/prediction/test_model.py -v

# TypeScript
npm test -- prediction.handler.test.ts
# or
npx jest backend/__tests__/handlers/prediction.handler.test.ts
```

---

## Common Patterns

### Async/Await

**Python**:
```python
async def fetch_data(ticker: str) -> dict:
    result = await dynamodb.query(...)
    return result
```

**TypeScript**:
```typescript
async function fetchData(ticker: string): Promise<object> {
    const result = await dynamodb.query(...);
    return result;
}
```

### Error Handling

**Python**:
```python
try:
    data = fetch_data()
except ValueError as e:
    print(f"Error: {e}")
    raise
```

**TypeScript**:
```typescript
try {
    const data = fetchData();
} catch (error) {
    if (error instanceof ValueError) {
        console.error(`Error: ${error.message}`);
    }
    throw error;
}
```

### List Comprehensions → map/filter

**Python**:
```python
# List comprehension
squared = [x**2 for x in numbers]
filtered = [x for x in numbers if x > 5]
```

**TypeScript**:
```typescript
// map and filter
const squared = numbers.map(x => x ** 2);
const filtered = numbers.filter(x => x > 5);
```

### Dictionary → Object/Map

**Python**:
```python
event_counts = {"EARNINGS": 2, "M&A": 0}
count = event_counts.get("EARNINGS", 0)
```

**TypeScript**:
```typescript
const eventCounts: Record<string, number> = { EARNINGS: 2, "M&A": 0 };
const count = eventCounts.EARNINGS ?? 0;

// Or use Map for dynamic keys
const eventCounts = new Map<string, number>();
eventCounts.set("EARNINGS", 2);
const count = eventCounts.get("EARNINGS") ?? 0;
```

---

## TensorFlow.js Best Practices

### Memory Management

```typescript
// BAD: Memory leak
function processData() {
    const X = tf.tensor2d([[1, 2], [3, 4]]);
    const result = X.sum();
    return result.dataSync()[0];  // X and result never disposed!
}

// GOOD: Use tf.tidy
function processData() {
    return tf.tidy(() => {
        const X = tf.tensor2d([[1, 2], [3, 4]]);
        const result = X.sum();
        return result.dataSync()[0];
        // X and result automatically disposed
    });
}

// GOOD: Manual disposal
async function processData() {
    const X = tf.tensor2d([[1, 2], [3, 4]]);
    try {
        const result = X.sum();
        const value = result.dataSync()[0];
        result.dispose();
        return value;
    } finally {
        X.dispose();
    }
}
```

### Extracting Values

```typescript
// Synchronous (small data)
const tensor = tf.tensor1d([1, 2, 3]);
const array = tensor.arraySync();  // [1, 2, 3]
const value = tensor.dataSync()[0];  // 1

// Asynchronous (large data, preferred)
const array = await tensor.array();
const value = (await tensor.data())[0];

tensor.dispose();
```

### Shape Handling

```python
# Python
X.shape  # (100, 14)
X.reshape(-1, 1)  # Reshape
```

```typescript
// TypeScript
X.shape  // [100, 14]
X.reshape([-1, 1])  // Reshape

// Common reshaping
const y1d = tf.tensor1d([0, 1, 0, 1]);
const y2d = y1d.reshape([-1, 1]);  // Shape: [4, 1]
```

---

## Quick Reference: Module Mapping

| Python Module | TypeScript Equivalent |
|--------------|----------------------|
| `numpy` | `@tensorflow/tfjs-node` or plain arrays |
| `sklearn.preprocessing.StandardScaler` | `tf.layers.normalization()` or custom |
| `sklearn.linear_model.LogisticRegression` | `tf.sequential()` with sigmoid |
| `pandas` | Plain objects/arrays (no direct equivalent) |
| `typing` | Built-in TypeScript types |
| `dataclasses` / `pydantic` | `interface` or `type` |
| `boto3` (AWS SDK) | `@aws-sdk/client-dynamodb` |

---

## Example: Complete Function Conversion

### Python Version

```python
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

def train_and_predict(X: np.ndarray, y: np.ndarray, X_test: np.ndarray) -> np.ndarray:
    # Normalize
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    X_test_scaled = scaler.transform(X_test)

    # Train
    model = LogisticRegression(max_iter=100, random_state=42)
    model.fit(X_scaled, y)

    # Predict
    probabilities = model.predict_proba(X_test_scaled)[:, 1]
    return probabilities
```

### TypeScript Version

```typescript
import * as tf from '@tensorflow/tfjs-node';

async function trainAndPredict(
    X: tf.Tensor2D,
    y: tf.Tensor2D,
    XTest: tf.Tensor2D
): Promise<number[]> {
    // Synchronous normalization in tidy
    const { mean, std, XScaled, XTestScaled } = tf.tidy(() => {
        // Normalize
        const moments = tf.moments(X, 0);
        const mean = moments.mean as tf.Tensor1D;
        const std = (moments.variance as tf.Tensor1D).sqrt();

        const XScaled = X.sub(mean).div(std);
        const XTestScaled = XTest.sub(mean).div(std);

        return { mean, std, XScaled, XTestScaled };
    });

    try {
        // Train (async operations outside tidy)
        const model = tf.sequential({
            layers: [
                tf.layers.dense({
                    inputShape: [X.shape[1]],
                    units: 1,
                    activation: 'sigmoid'
                })
            ]
        });

        model.compile({
            optimizer: 'adam',
            loss: 'binaryCrossentropy'
        });

        await model.fit(XScaled, y, {
            epochs: 100,
            verbose: 0
        });

        // Predict
        const predictions = model.predict(XTestScaled) as tf.Tensor2D;
        const probabilities = await predictions.array();

        // Cleanup
        predictions.dispose();
        model.dispose();

        return probabilities.map(p => p[0]);
    } finally {
        // Always dispose tensors from tidy
        mean.dispose();
        std.dispose();
        XScaled.dispose();
        XTestScaled.dispose();
    }
}
```

---

## Additional Resources

- **TensorFlow.js Docs**: https://www.tensorflow.org/js/guide
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/
- **Jest Documentation**: https://jestjs.io/docs/getting-started
- **AWS SDK v3 (TypeScript)**: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/

---

## When in Doubt

1. **Check existing backend code** in `backend/src/handlers/` and `backend/src/services/`
2. **Follow established patterns** (sentiment.handler.ts, stocks.handler.ts)
3. **Use TypeScript types** extensively (catches errors at compile time)
4. **Test frequently** with Jest
5. **Dispose tensors** to avoid memory leaks

---

**This guide covers 95% of the Python → TypeScript conversions needed for Phase 1 tasks. For specific TensorFlow.js questions, consult the official docs or reference existing handlers.**
