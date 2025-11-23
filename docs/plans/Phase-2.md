# Phase 2: Deployment & Frontend Integration

## Phase Goal

Deploy the Lambda prediction service with API Gateway, implement the frontend integration layer (API client, polling, sync orchestration), and update the UI to display multi-signal predictions. This phase connects the backend ML service built in Phase 1 to the user-facing application, completing the feature end-to-end. By the end of this phase, users will see directional predictions with probabilities in both the sentiment tab and portfolio, replacing the legacy bag-of-words system.

**Success Criteria**:
- Lambda prediction service deployed and accessible via API Gateway
- Deployment automation script (`npm run deploy`) functional and persistent
- Frontend API client polls Lambda successfully and retrieves predictions
- Sync orchestration triggers predictions with smart refresh logic
- UI displays predictions in correct format (↑ 72% or ↓ 38%)
- Integration tests verify frontend-to-backend flow with mocked Lambda
- E2E tests demonstrate full user flow (local verification)
- Legacy bag-of-words prediction code removed

**Estimated Tokens**: ~104,000

---

## Prerequisites

### Completed Dependencies
- Phase 0 read and understood
- Phase 1 completed and verified (all tests passing)
- Lambda prediction handler functional with mocked data

### External Dependencies to Verify
- AWS account configured with appropriate permissions
- API Gateway quota available (if new API)
- Frontend `.env` file ready for API URL injection

### Environment Requirements
- SAM CLI installed and configured
- Node.js v24 (for deployment script and frontend)
- Frontend development server running for local testing
- AWS credentials with Lambda, API Gateway, CloudWatch permissions

---

## Tasks

### Task 1: SAM Template Completion - IAM Permissions for Lambda Chain

**Goal**: Update the SAM template to configure IAM permissions for the sentiment Lambda to invoke the prediction Lambda. The prediction Lambda is **not directly exposed via API Gateway** - it's invoked by the sentiment Lambda after aspect/sentiment processing completes.

**Files to Modify/Create**:
- `backend/template.yaml` - Add IAM permissions for Lambda invocation
- `backend/src/handlers/sentiment.handler.ts` - Add prediction Lambda invocation at end
- `backend/src/handlers/prediction.handler.ts` - Update handler to accept invocation from sentiment Lambda

**Prerequisites**:
- Phase 1 Task 4 completed (basic SAM template exists)
- Understanding of Lambda-to-Lambda invocation pattern
- Knowledge of IAM role policies for Lambda

**Implementation Steps**:
1. Update `backend/template.yaml` to configure IAM permissions:
   - Add IAM policy to **SentimentFunction** execution role:
     - Allow `lambda:InvokeFunction` on `PredictionFunction`
     - Resource ARN: `!GetAtt PredictionFunction.Arn`
   - Example policy statement:
     ```yaml
     Policies:
       - Statement:
           Effect: Allow
           Action: lambda:InvokeFunction
           Resource: !GetAtt PredictionFunction.Arn
     ```
   - Ensure `PredictionFunction` has permissions to read DynamoDB tables
2. Update `backend/src/handlers/sentiment.handler.ts`:
   - Import AWS SDK v3 Lambda client (@aws-sdk/client-lambda)
   - At end of sentiment processing (after storing results):
     - Check if prediction should be triggered (smart refresh logic)
     - If yes: Invoke PredictionFunction asynchronously
     - Pass payload: `{ ticker, days }`
   - Example invocation:
     ```typescript
     import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

     const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });
     await lambdaClient.send(new InvokeCommand({
       FunctionName: process.env.PREDICTION_FUNCTION_NAME,
       InvocationType: 'Event',  // Async
       Payload: JSON.stringify({ ticker, days })
     }));
     ```
3. Update `backend/template.yaml` environment variables:
   - Add `PREDICTION_FUNCTION_NAME` to SentimentFunction environment
   - Value: `!Ref PredictionFunction`
4. Update `backend/src/handlers/prediction.handler.ts`:
   - Accept event payload: `{ ticker: string, days: number }`
   - Support both API Gateway events and direct Lambda invocation
   - Return predictions to be stored (or emit event/write to DB)
5. Test template validation:
   - Run `sam validate` (should pass)
   - Verify IAM policy correctly references PredictionFunction

**Verification Checklist**:
- [ ] SAM template validates without errors
- [ ] IAM policy allows SentimentFunction to invoke PredictionFunction
- [ ] Environment variable PREDICTION_FUNCTION_NAME configured
- [ ] PredictionFunction has DynamoDB read permissions
- [ ] Sentiment handler includes Lambda invocation code
- [ ] Prediction handler accepts Lambda event (not API Gateway event)
- [ ] Smart refresh logic implemented in sentiment handler

**Testing Instructions**:
- Unit test: Validate SAM template (`sam validate`)
- Unit test: Build template (`sam build`)
- Unit test: Verify IAM policy syntax
- Integration test: Mock Lambda invocation in sentiment handler tests
- Run: `cd backend && sam validate && sam build`

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

feat(api): configure Lambda-to-Lambda invocation chain

- Add IAM policy for SentimentFunction to invoke PredictionFunction
- Configure PREDICTION_FUNCTION_NAME environment variable
- Update sentiment handler to invoke prediction after processing
- Implement smart refresh logic (check if prediction needed)
- Update prediction handler to accept Lambda event payload
```

---

### Task 2: Deployment Automation Script

**Goal**: Implement the `npm run deploy` script following the specification in Phase 0. This script interactively gathers configuration, programmatically generates `samconfig.toml`, deploys the Lambda stack, and updates the frontend `.env` file with the API Gateway URL.

**Files to Modify/Create**:
- `backend/scripts/deploy.js` (or `.ts`) - Deployment orchestration script
- `backend/.gitignore` - Add `.deploy-config.json` to ignore list
- `backend/package.json` - Add `deploy` script
- `backend/.deploy-config.json` - Git-ignored config file (created by script)

**Prerequisites**:
- Task 1 completed (SAM template ready)
- Understanding of Node.js fs, child_process modules
- Familiarity with AWS SAM CLI commands

**Implementation Steps**:
1. Create `backend/scripts/deploy.js` with the following functions:
   - `checkPrerequisites()`: Verify AWS CLI and SAM CLI installed
     - Run `aws sts get-caller-identity` (check AWS credentials)
     - Run `sam --version` (check SAM CLI available)
     - Exit with error if prerequisites missing
   - `loadOrPromptConfig()`: Load from `.deploy-config.json` or prompt user
     - If file exists, read and parse JSON
     - If values missing, prompt interactively (use `readline` or `inquirer`)
     - Required fields: region, stackName, lambdaMemory, lambdaTimeout
     - Defaults: region=us-east-1, stackName=stocks-prediction-service, memory=1024, timeout=120
     - Save to `.deploy-config.json` after prompting
   - `generateSamConfig(config)`: Programmatically create `samconfig.toml`
     - Use config values to build TOML content
     - Write to `backend/samconfig.toml` (overwrite existing)
     - Format example from Phase 0
   - `buildAndDeploy()`: Execute SAM build and deploy
     - Run `sam build` (compile Lambda dependencies)
     - Run `sam deploy` (using generated samconfig.toml)
     - Capture stdout/stderr for logging
     - Parse stack outputs from deploy result
   - `updateFrontendEnv(apiUrl)`: Update frontend `.env` file
     - Read existing `../../.env` (frontend directory)
     - Update or add `EXPO_PUBLIC_PREDICTION_API_URL=<apiUrl>`
     - Preserve other environment variables
     - Create `.env` if doesn't exist
   - `verifyDeployment(apiUrl)`: Health check (optional)
     - Make test request to API Gateway
     - Log success or failure
2. Add error handling:
   - Catch and log deployment failures
   - Provide rollback guidance (delete stack, revert env)
   - Validate user inputs (region format, positive integers)
3. Update `backend/package.json`:
   - Add script: `"deploy": "node scripts/deploy.js"`
4. Update `backend/.gitignore`:
   - Add `.deploy-config.json`
   - Add `samconfig.toml` (generated, should not be committed)

**Verification Checklist**:
- [ ] Script runs without errors on first execution (prompts for config)
- [ ] Script loads config from file on subsequent runs (no re-prompting)
- [ ] `samconfig.toml` generated correctly with user inputs
- [ ] SAM build executes successfully
- [ ] SAM deploy creates CloudFormation stack
- [ ] API Gateway URL captured from stack outputs
- [ ] Frontend `.env` updated with API URL
- [ ] Deployment can be run multiple times (idempotent)

**Testing Instructions**:
- Manual test: Run `cd backend && npm run deploy` (first time)
- Manual test: Verify prompts appear and config saved
- Manual test: Run `npm run deploy` again (should use cached config)
- Manual test: Check `.env` in frontend directory (API URL present)
- Manual test: Verify CloudFormation stack exists in AWS Console

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

feat(deploy): implement automated deployment script with persistent config

- Add deploy.js script with prerequisite checks
- Implement interactive config prompting with persistence
- Generate samconfig.toml programmatically (no --guided)
- Execute sam build and sam deploy
- Capture API Gateway URL from stack outputs
- Auto-update frontend .env with EXPO_PUBLIC_PREDICTION_API_URL
```

---

### Task 3: Update Sentiment API Response - Include Predictions

**Goal**: Update the existing sentiment API client to handle predictions in the response. Since the backend sentiment Lambda auto-invokes prediction Lambda and stores results, the sentiment API response should now include both sentiment data AND prediction results.

**Files to Modify/Create**:
- `src/services/api/lambdaSentiment.service.ts` - Update to handle predictions in response
- `src/types/api.types.ts` - Update sentiment response type to include predictions
- `__tests__/services/api/lambdaSentiment.service.test.ts` - Update tests

**Prerequisites**:
- Task 1 completed (sentiment Lambda invokes prediction Lambda)
- Understanding of existing sentiment service polling pattern
- Familiarity with sentiment API response structure

**Implementation Steps**:
1. Update `src/types/api.types.ts`:
   - Extend `SentimentResponse` interface (or create new combined response):
     - Existing: `sentiment` data (articles, scores, etc.)
     - **New**: `predictions` object:
       ```typescript
       predictions?: {
         nextDay: { direction: 'up' | 'down', probability: number },
         twoWeek: { direction: 'up' | 'down', probability: number },
         oneMonth: { direction: 'up' | 'down', probability: number }
       }
       ```
   - Predictions are optional (may not exist if prediction Lambda hasn't run yet or failed)
2. Update `src/services/api/lambdaSentiment.service.ts`:
   - No changes to request logic (still requests sentiment analysis)
   - Update response parsing to extract predictions if present
   - Handle case where predictions are missing (backend still processing or failed)
   - Return combined result: `{ sentiment: {...}, predictions: {...} }`
3. Update polling logic:
   - Poll until BOTH sentiment AND predictions complete (if predictions expected)
   - Or accept partial completion (sentiment done, predictions pending/failed)
   - Log prediction availability status
4. Write/update unit tests:
   - Mock sentiment response WITH predictions
   - Mock sentiment response WITHOUT predictions (partial completion)
   - Test prediction extraction and typing
   - Test backward compatibility (old responses without predictions field)

**Verification Checklist**:
- [ ] Sentiment response type includes optional predictions field
- [ ] Response parsing extracts predictions correctly
- [ ] Handles missing predictions gracefully (not an error)
- [ ] Backward compatible with old sentiment responses
- [ ] Polling logic accepts partial completion (sentiment without predictions)
- [ ] Unit tests cover both scenarios (with/without predictions)
- [ ] Tests use mocked responses (no real API calls)

**Testing Instructions**:
- Unit test: Parse sentiment response WITH predictions
- Unit test: Parse sentiment response WITHOUT predictions
- Unit test: Backward compatibility (old response format)
- Unit test: Prediction typing and structure validation
- Run: `npm test -- lambdaSentiment.service.test.ts`

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

feat(api): extend sentiment response to include predictions

- Update SentimentResponse type with optional predictions field
- Parse predictions from sentiment API response
- Handle partial completion (sentiment done, predictions pending)
- Maintain backward compatibility with old responses
- Update unit tests for combined response format
```

---

### Task 4: Async Polling Mechanism (Future Optimization)

**Goal**: [OPTIONAL FOR INITIAL RELEASE] Implement asynchronous polling pattern similar to sentiment service. For initial release, we use synchronous Lambda invocation (prediction returned immediately). This task documents the polling approach for future optimization when predictions take >30s.

**Files to Modify/Create**:
- `src/services/api/prediction.service.ts` - Add polling functions (future)
- Documentation on async pattern for future reference

**Prerequisites**:
- Task 3 completed (synchronous API client working)
- Understanding of existing sentiment polling pattern

**Implementation Steps** (for future):
1. Extend Lambda handler to support async pattern:
   - Immediate response: `{ jobId, status: 'PENDING' }`
   - Background processing: Run prediction pipeline asynchronously
   - Store result in DynamoDB or return via polling endpoint
2. Add polling endpoint to API Gateway:
   - `GET /predict/{jobId}` - Check job status
   - Returns: `{ status: 'PENDING' | 'COMPLETE' | 'FAILED', predictions: {...} }`
3. Frontend polling implementation:
   - `pollPredictionStatus(jobId: string): Promise<PredictionResponse>`
   - Poll every 2s, timeout after 60s
   - Return predictions when status='COMPLETE'
4. Update sync orchestrator to use async pattern

**Verification Checklist** (if implemented):
- [ ] Lambda returns job ID immediately
- [ ] Polling endpoint returns status updates
- [ ] Frontend polls until completion or timeout
- [ ] Error handling for timeouts and failures
- [ ] Tests verify polling logic

**Decision**: For Phase 2, we use **synchronous invocation** (simpler, acceptable latency). Mark this task as future optimization.

**Commit Message Template** (if implemented):
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

feat(api): add async polling support for long-running predictions

- Extend Lambda handler to return job ID for async processing
- Add GET /predict/{jobId} endpoint for status polling
- Implement frontend polling mechanism with 2s interval
- Add timeout handling (60s max wait)
- Update sync orchestrator to use async pattern
```

**For Phase 2**: Skip async polling, use synchronous pattern. Document for future.

---

### Task 5: Store Predictions from Sentiment Response

**Goal**: Update the sentiment sync service to extract and store predictions from the sentiment API response. Since the backend automatically triggers predictions after sentiment processing, the frontend just needs to store the results that come back.

**Files to Modify/Create**:
- `src/services/sync/sentimentDataSync.ts` - Update to handle predictions in response
- `src/database/repositories/combined_word_count.repository.ts` - Add prediction storage methods
- `src/database/repositories/portfolio.repository.ts` - Add prediction storage methods
- `__tests__/services/sync/sentimentDataSync.test.ts` - Update tests

**Prerequisites**:
- Task 3 completed (sentiment API returns predictions)
- Understanding of sync orchestrator flow
- Familiarity with repository pattern

**Implementation Steps**:
1. Update `src/services/sync/sentimentDataSync.ts`:
   - After receiving sentiment API response (which includes predictions):
     - Extract predictions from response: `response.predictions`
     - If predictions exist:
       - Store in `daily_sentiment_aggregate` (for sentiment tab display)
       - If ticker in portfolio: Store in `portfolio_details`
     - If predictions missing (backend still processing or failed):
       - Log info message (not an error)
       - Continue with sentiment storage (degrade gracefully)
   - Use transactions for atomic updates
2. Update repositories (if needed):
   - `combined_word_count.repository.ts`:
     - Ensure `insert()` handles new prediction fields
     - Or add `updatePredictions()` method specifically for prediction updates
   - `portfolio.repository.ts`:
     - Ensure `update()` handles new prediction fields
3. Handle partial completion:
   - Sentiment may complete while predictions still processing
   - Store sentiment first, predictions when available
   - No blocking - accept partial data
4. Write unit tests:
   - Test sentiment sync WITH predictions in response
   - Test sentiment sync WITHOUT predictions (partial completion)
   - Test database storage of predictions
   - Test transaction rollback on error

**Verification Checklist**:
- [ ] Sentiment sync extracts predictions from response
- [ ] Predictions stored in daily_sentiment_aggregate
- [ ] Predictions stored in portfolio_details (if applicable)
- [ ] Partial completion handled gracefully (sentiment without predictions)
- [ ] Transactions ensure atomic updates
- [ ] Unit tests cover all scenarios
- [ ] Integration tests verify orchestrator flow

**Testing Instructions**:
- Unit test: Sync with predictions in response
- Unit test: Sync without predictions (partial)
- Unit test: Store predictions in database
- Unit test: Error handling (database failure)
- Integration test: Full sentiment sync flow
- Run: `npm test -- sync/sentimentDataSync.test.ts`

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

feat(sync): store predictions from sentiment API response

- Update sentimentDataSync to extract predictions from response
- Store predictions in daily_sentiment_aggregate and portfolio_details
- Handle partial completion (sentiment without predictions)
- Use transactions for atomic database updates
- Add unit tests for prediction storage logic
```

---

### Task 6: Backend Smart Refresh Logic (Backend Implementation)

**Goal**: Implement smart refresh logic **in the backend** (sentiment Lambda) to avoid triggering prediction Lambda when no new articles exist since the last prediction. This task documents the backend changes needed.

**Files to Modify/Create** (Backend):
- `backend/src/handlers/sentiment.handler.ts` - Add smart refresh logic before invoking prediction
- `backend/src/functions/sentiment/smart_refresh.py` - Helper module for date comparisons
- `__tests__/backend/sentiment/test_smart_refresh.py` - Unit tests

**Prerequisites**:
- Task 1 completed (sentiment Lambda invokes prediction Lambda)
- Understanding of backend database structure (DynamoDB/RDS)

**Implementation Steps** (Backend):
1. Create `smart_refresh.py` helper module:
   - `should_trigger_prediction(ticker: str) -> bool`
     - Query backend DB for latest prediction `updateDate` for ticker
     - Query backend DB for latest article date for ticker (only EARNINGS/GUIDANCE)
     - Compare dates:
       - If no previous prediction: return True (first time)
       - If `latest_article_date > latest_prediction_date`: return True (new articles)
       - Else: return False (no new material articles)
2. Update `sentiment/handler.py`:
   - After sentiment processing completes
   - Before invoking prediction Lambda:
     - Call `should_trigger_prediction(ticker)`
     - If True: Invoke prediction Lambda
     - If False: Log "Skipping prediction - no new articles" and skip invocation
   - Log decision for monitoring/debugging
3. Backend testing:
   - Test smart refresh with no new articles (prediction Lambda NOT invoked)
   - Test smart refresh with new articles (prediction Lambda invoked)
   - Test first-time prediction (no previous prediction exists)
   - Mock database queries in tests

**Note**: This is a **backend task** but documented in Phase 2 for completeness. If backend team is separate, coordinate with them.

**Verification Checklist** (Backend):
- [ ] Smart refresh logic compares article and prediction dates
- [ ] Prediction Lambda NOT invoked when no new articles
- [ ] Prediction Lambda invoked when new articles exist
- [ ] Prediction Lambda invoked on first request (no previous prediction)
- [ ] Logging indicates skip or trigger decision
- [ ] Backend unit tests cover smart refresh scenarios
- [ ] Integration test: Sentiment → (conditional) → Prediction chain

**Testing Instructions** (Backend):
- Unit test: should_trigger_prediction with no new articles (False)
- Unit test: should_trigger_prediction with new articles (True)
- Unit test: should_trigger_prediction with no previous prediction (True)
- Integration test: Sentiment handler respects smart refresh decision
- Run: `python -m pytest backend/__tests__/sentiment/test_smart_refresh.py`

**Commit Message Template** (Backend):
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

feat(backend): implement smart refresh for prediction invocation

- Add should_trigger_prediction helper to check for new articles
- Update sentiment handler to conditionally invoke prediction Lambda
- Skip prediction invocation if no new material articles exist
- Log smart refresh decisions for monitoring
- Add backend unit tests for smart refresh logic
```

---

### Task 7: UI Update - Sentiment Tab Predictions Display

**Goal**: Update the sentiment tab's daily aggregate component (`CombinedWordItem`) to display predictions in the new format (direction + probability) instead of legacy percentage returns.

**Files to Modify/Create**:
- `src/components/sentiment/CombinedWordItem.tsx` - Update predictions display
- `src/hooks/useSentimentData.ts` - Ensure new prediction fields fetched
- `__tests__/components/sentiment/CombinedWordItem.test.tsx` - Update tests

**Prerequisites**:
- Task 5 completed (predictions stored in database)
- Understanding of existing CombinedWordItem component
- Familiarity with React Native Paper components

**Implementation Steps**:
1. Update `src/hooks/useSentimentData.ts` (if needed):
   - Ensure repository query fetches new prediction fields (nextDayDirection, nextDayProbability, etc.)
   - Return typed data with new fields
2. Update `CombinedWordItem.tsx`:
   - Locate existing predictions display section (shows nextDay, twoWks, oneMnth)
   - Replace with new format:
     - **1-Day**: `{direction === 'up' ? '↑' : '↓'} {probability * 100}%`
     - **2-Week**: Same format with twoWeekDirection, twoWeekProbability
     - **1-Month**: Same format with oneMonthDirection, oneMonthProbability
   - Add color coding:
     - Up (↑): Green color
     - Down (↓): Red color
   - Handle missing predictions:
     - If prediction fields are null: Display "—" (placeholder)
     - No error message, just graceful degradation
3. Update styling:
   - Ensure directional arrows visible and sized correctly
   - Probability percentage aligned
   - Colors match theme (light/dark mode compatible)
4. Write/update tests:
   - Test component renders with up predictions
   - Test component renders with down predictions
   - Test component renders with missing predictions ("—")
   - Test color coding (green for up, red for down)

**Verification Checklist**:
- [ ] Predictions display in new format (↑ 72%)
- [ ] Color coding applied correctly (green/red)
- [ ] Missing predictions show "—" placeholder
- [ ] All three horizons displayed (1-day, 2-week, 1-month)
- [ ] Component tests updated and passing
- [ ] Visual appearance matches design (manual review)

**Testing Instructions**:
- Unit test: Render with up prediction (verify ↑ and percentage)
- Unit test: Render with down prediction (verify ↓ and percentage)
- Unit test: Render with null predictions (verify "—")
- Visual test: Run app locally, view sentiment tab with predictions
- Run: `npm test -- CombinedWordItem.test.tsx`

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

feat(ui): update sentiment tab to display directional predictions

- Replace legacy percentage returns with direction + probability format
- Add color coding (green for ↑, red for ↓)
- Display "—" placeholder when predictions unavailable
- Update CombinedWordItem component styling
- Update unit tests for new prediction format
```

---

### Task 8: UI Update - Portfolio Predictions Display

**Goal**: Add predictions display to the portfolio component (`PortfolioItem`). Currently, portfolio items do not show predictions - this task adds a predictions section similar to the sentiment tab.

**Files to Modify/Create**:
- `src/components/portfolio/PortfolioItem.tsx` - Add predictions display section
- `src/hooks/usePortfolioData.ts` - Ensure predictions fetched from portfolio_details
- `__tests__/components/portfolio/PortfolioItem.test.tsx` - Add tests

**Prerequisites**:
- Task 7 completed (sentiment tab predictions working)
- Understanding of PortfolioItem component structure
- Familiarity with portfolio_details schema

**Implementation Steps**:
1. Update `src/hooks/usePortfolioData.ts`:
   - Ensure repository query fetches new prediction fields from `portfolio_details`
   - Return typed PortfolioDetails with prediction fields
2. Update `PortfolioItem.tsx`:
   - Add new predictions section below stock name/ticker
   - Display three predictions in row or column layout:
     - **1-Day**: `{direction} {probability}%` with arrow icon
     - **2-Week**: Same format
     - **1-Month**: Same format
   - Apply same color coding as sentiment tab (green/red)
   - Handle missing predictions: Display "—"
3. Design considerations:
   - Keep layout compact (portfolio items are list items)
   - Ensure predictions don't clutter UI (maybe smaller font)
   - Align with existing portfolio item design
4. Write tests:
   - Test PortfolioItem renders with predictions
   - Test color coding and formatting
   - Test missing predictions handling

**Verification Checklist**:
- [ ] Predictions section added to PortfolioItem
- [ ] All three horizons displayed
- [ ] Color coding matches sentiment tab
- [ ] Missing predictions handled gracefully
- [ ] Layout compact and readable
- [ ] Component tests passing

**Testing Instructions**:
- Unit test: Render PortfolioItem with predictions
- Unit test: Verify direction arrows and colors
- Unit test: Missing predictions show "—"
- Visual test: View portfolio screen with predictions
- Run: `npm test -- PortfolioItem.test.tsx`

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

feat(ui): add predictions display to portfolio items

- Add predictions section to PortfolioItem component
- Display 1-day, 2-week, and 1-month predictions with direction arrows
- Apply color coding (green for up, red for down)
- Handle missing predictions with "—" placeholder
- Update portfolio hooks to fetch prediction fields
- Add unit tests for predictions display
```

---

### Task 9: Integration Testing - Frontend to Backend Flow

**Goal**: Write comprehensive integration tests that verify the end-to-end flow from user action to UI update, using mocked Lambda responses. These tests ensure the sync orchestrator, API client, repositories, and UI components work together correctly.

**Files to Modify/Create**:
- `__tests__/integration/predictionFlow.test.ts` - Integration test suite
- `__tests__/__mocks__/prediction.mock.ts` - Mock Lambda responses

**Prerequisites**:
- Tasks 5-8 completed (sync, repositories, UI all implemented)
- Understanding of integration testing patterns
- Familiarity with React Native Testing Library

**Implementation Steps**:
1. Create `__tests__/__mocks__/prediction.mock.ts`:
   - Define mock Lambda response:
     - Success response with 3 predictions
     - Error response (500, timeout)
   - Define mock historical data (price, sentiment)
   - Reusable across tests
2. Create `__tests__/integration/predictionFlow.test.ts`:
   - **Test 1: Complete sync flow**
     - Mock prediction API to return success response
     - Trigger sync for ticker "AAPL"
     - Verify prediction API called with correct params
     - Verify predictions stored in database (check repository)
     - Verify UI components receive updated data (React Query cache)
   - **Test 2: Smart refresh - skip prediction**
     - Mock existing prediction (recent updateDate)
     - Mock no new articles
     - Trigger sync
     - Verify prediction API NOT called (skipped)
   - **Test 3: Smart refresh - trigger prediction**
     - Mock existing prediction (old updateDate)
     - Mock new articles (recent articleDate)
     - Trigger sync
     - Verify prediction API called
   - **Test 4: Error handling**
     - Mock prediction API failure
     - Trigger sync
     - Verify error logged but sync continues
     - Verify UI shows "—" (no predictions available)
3. Mock all external dependencies:
   - Prediction API (fetch)
   - Database operations (repositories)
   - React Query cache
   - No real network calls, no real database writes
4. Ensure tests run in CI:
   - Fast execution (<10s total)
   - No AWS dependencies
   - Deterministic results

**Verification Checklist**:
- [ ] Integration tests cover happy path (sync → store → display)
- [ ] Smart refresh scenarios tested (skip and trigger)
- [ ] Error handling verified (failures degrade gracefully)
- [ ] All external dependencies mocked (no real API/DB)
- [ ] Tests pass in CI environment
- [ ] Test execution time acceptable (<10s)

**Testing Instructions**:
- Run: `npm test -- integration/predictionFlow.test.ts`
- Verify: All tests pass
- Verify: No real network calls (check test logs)
- Run in CI: Push to branch, verify GitHub Actions pass

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

test(integration): add end-to-end prediction flow tests

- Create integration test suite for sync → store → display flow
- Test smart refresh logic (skip and trigger scenarios)
- Test error handling and graceful degradation
- Mock all external dependencies (API, database)
- Ensure CI compatibility (fast, deterministic)
```

---

### Task 10: End-to-End Testing - Local Verification

**Goal**: Perform manual end-to-end testing with the deployed Lambda service to verify the complete user flow works in a real environment. This is local verification only, not required for CI.

**Files to Modify/Create**:
- `docs/testing/E2E_VERIFICATION.md` - E2E test checklist and results

**Prerequisites**:
- All previous tasks completed
- Lambda deployed to AWS
- Frontend `.env` updated with API URL
- Development server running

**Implementation Steps**:
1. Create `docs/testing/E2E_VERIFICATION.md` with test scenarios:
   - **Scenario 1: New stock selection**
     - Open app
     - Search for stock "AAPL"
     - Select stock
     - Wait for sync to complete
     - Navigate to sentiment tab
     - Verify predictions display (↑/↓ with percentages)
     - Navigate to portfolio (if added)
     - Verify predictions display in portfolio
   - **Scenario 2: Smart refresh**
     - Select same stock again
     - Verify sync completes quickly (prediction skipped)
     - Predictions still display correctly (from cache)
   - **Scenario 3: Multiple stocks**
     - Add "GOOGL" to portfolio
     - Trigger sync
     - Verify predictions for both stocks
   - **Scenario 4: Error handling**
     - Disconnect network
     - Select stock
     - Verify graceful error (no crash)
     - Reconnect network
     - Retry sync
     - Verify recovery
2. Execute each scenario manually:
   - Document pass/fail for each step
   - Capture screenshots of predictions display
   - Note any issues or unexpected behavior
3. Verify across platforms:
   - Web browser
   - iOS simulator (if available)
   - Android emulator (if available)
4. Log findings in E2E_VERIFICATION.md

**Verification Checklist**:
- [ ] New stock selection displays predictions
- [ ] Smart refresh skips redundant computation
- [ ] Predictions display correctly in sentiment tab
- [ ] Predictions display correctly in portfolio
- [ ] Error handling graceful (no crashes)
- [ ] Works on web platform
- [ ] Works on iOS (if tested)
- [ ] Works on Android (if tested)

**Testing Instructions**:
- Manual: Follow each scenario in E2E_VERIFICATION.md
- Manual: Document results (pass/fail, screenshots)
- Manual: Test on multiple platforms if possible
- Manual: Verify Lambda logs in CloudWatch (predictions triggered)

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

test(e2e): complete end-to-end verification with deployed Lambda

- Create E2E verification checklist document
- Test new stock selection flow with predictions display
- Verify smart refresh logic in production
- Test error handling and recovery
- Verify predictions on web, iOS, and Android platforms
- Document results and screenshots
```

---

### Task 11: Legacy Code Removal - Bag-of-Words Cleanup

**Goal**: Remove the deprecated bag-of-words prediction code now that the multi-signal model is fully integrated and tested. This reduces code complexity and prevents confusion.

**Files to Modify/Create**:
- `src/ml/sentiment/sentiment.service.ts` - Remove or deprecate legacy code
- `src/ml/prediction/model.ts` - Remove legacy prediction logic (if exists)
- `src/services/sync/` - Remove references to old prediction sync
- `src/database/repositories/` - Keep legacy DB fields for backward compat (don't drop columns yet)

**Prerequisites**:
- Task 10 completed (E2E verification passed)
- Confidence that new system works correctly
- Backup plan in case rollback needed

**Implementation Steps**:
1. Identify all bag-of-words prediction code:
   - Search codebase for references to old prediction methods
   - List files that contain deprecated logic
   - Review if any code is still needed (transitional period)
2. Remove or deprecate:
   - **Option A (Aggressive)**: Delete deprecated code entirely
   - **Option B (Conservative)**: Add `@deprecated` comments, disable imports
   - Recommended: Start with Option B, delete in future phase
3. Update imports and references:
   - Remove imports of deprecated modules
   - Update any remaining callers to use new prediction service
4. Keep database schema compatibility:
   - Don't drop legacy prediction columns yet (nextDay, twoWks, oneMnth as single values)
   - Keep for rollback safety
   - Plan future migration to drop columns after monitoring period
5. Update documentation:
   - Mark old prediction methods as deprecated in CLAUDE.md
   - Update README to reflect new prediction system
6. Write cleanup verification tests:
   - Ensure no references to old prediction code in active paths
   - Grep for deprecated imports (should find none in active files)

**Verification Checklist**:
- [ ] Deprecated prediction code identified and listed
- [ ] Code removed or marked @deprecated
- [ ] No active imports of deprecated modules
- [ ] Database schema backward compatible (columns kept)
- [ ] Documentation updated (CLAUDE.md, README)
- [ ] Tests pass without deprecated code
- [ ] No build warnings or errors

**Testing Instructions**:
- Run: `npm run type-check` (verify TypeScript compiles)
- Run: `npm test` (all tests pass without deprecated code)
- Run: `npm run lint` (no unused imports warnings)
- Search: `grep -r "sentiment.service" src/` (verify deprecated imports removed)

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

refactor(prediction): remove deprecated bag-of-words prediction code

- Mark legacy sentiment.service prediction methods as deprecated
- Remove imports and references to old prediction logic
- Keep database columns for backward compatibility
- Update documentation to reflect new multi-signal system
- Verify all tests pass without deprecated code
```

---

### Task 12: Documentation and Final Verification

**Goal**: Complete comprehensive documentation for the multi-signal prediction feature, update project README, and perform final verification that all Phase 2 tasks are complete and production-ready.

**Files to Modify/Create**:
- `CLAUDE.md` - Update project instructions with new prediction system
- `README.md` - Update feature list and architecture section
- `docs/architecture/PREDICTION_SYSTEM.md` - Create detailed architecture doc
- `CHANGELOG.md` - Add entry for multi-signal prediction feature

**Prerequisites**:
- All previous tasks completed (1-11)
- All tests passing
- E2E verification passed
- Deployment successful

**Implementation Steps**:
1. Update `CLAUDE.md`:
   - Remove references to bag-of-words prediction (deprecated)
   - Add section on multi-signal prediction:
     - Lambda-based service
     - 14-feature model
     - Smart refresh logic
     - UI display format
   - Update external services section (add prediction Lambda)
   - Update data flow diagram (include prediction step)
2. Update project `README.md`:
   - Add multi-signal prediction to feature list
   - Update architecture overview (mention Lambda prediction service)
   - Add deployment instructions for backend
3. Create `docs/architecture/PREDICTION_SYSTEM.md`:
   - Detailed architecture documentation
   - Feature engineering pipeline
   - Model training approach
   - API contract (request/response schemas)
   - Smart refresh logic explanation
   - Performance characteristics
   - Future optimization opportunities
4. Update `CHANGELOG.md`:
   - Add entry for new feature:
     - Version number (e.g., v2.0.0)
     - Release date
     - Major changes: Multi-signal prediction replaces bag-of-words
     - Breaking changes: None (backward compatible)
     - New endpoints: Lambda prediction API
5. Create quick reference guide:
   - How to deploy backend (`npm run deploy`)
   - How to trigger predictions (user action)
   - How to debug (CloudWatch logs, network inspector)
   - Troubleshooting common issues
6. Final verification checklist:
   - [ ] All Phase 2 tasks completed
   - [ ] All tests passing (unit, integration, E2E)
   - [ ] CI pipeline passing (GitHub Actions)
   - [ ] Deployment successful (Lambda accessible)
   - [ ] UI displays predictions correctly
   - [ ] Smart refresh working (verified in logs)
   - [ ] Documentation complete and accurate
   - [ ] No breaking changes for existing users

**Verification Checklist**:
- [ ] CLAUDE.md updated with prediction system details
- [ ] README.md reflects new feature
- [ ] Architecture documentation created
- [ ] CHANGELOG.md entry added
- [ ] Quick reference guide available
- [ ] All links in documentation valid
- [ ] Final verification checklist complete

**Testing Instructions**:
- Manual: Review all documentation for accuracy
- Manual: Verify links in README and docs
- Manual: Run through quick reference guide (verify steps work)
- Run: Full test suite one final time (`npm test`)
- Run: CI pipeline (push to branch, verify Actions pass)

**Commit Message Template**:
```
Author & Commiter : HatmanStack
Email : 82614182+HatmanStack@users.noreply.github.com

docs: complete documentation for multi-signal prediction feature

- Update CLAUDE.md with prediction system architecture
- Add multi-signal prediction to README feature list
- Create detailed architecture documentation
- Add CHANGELOG entry for v2.0.0 release
- Include quick reference guide for deployment and debugging
- Complete final verification checklist
```

---

## Phase Verification

### How to Verify Phase 2 Completion

Run the following checks to confirm Phase 2 is complete:

1. **Backend Deployment**:
   - [ ] Run `cd backend && npm run deploy` (deployment succeeds)
   - [ ] Verify CloudFormation stack exists in AWS Console
   - [ ] Check API Gateway endpoint accessible (curl or Postman test)
   - [ ] Check Lambda function logs in CloudWatch (verify invocations)

2. **Frontend Integration**:
   - [ ] Run `npm test -- services/api/prediction` (API client tests pass)
   - [ ] Run `npm test -- sync/` (sync orchestrator tests pass)
   - [ ] Verify `.env` has `EXPO_PUBLIC_PREDICTION_API_URL` set
   - [ ] Run app locally (`npm start`), select stock, verify sync triggers

3. **UI Verification**:
   - [ ] Sentiment tab displays predictions (↑/↓ with percentages)
   - [ ] Portfolio displays predictions
   - [ ] Color coding correct (green for up, red for down)
   - [ ] Missing predictions show "—" placeholder

4. **Integration Tests**:
   - [ ] Run `npm test -- integration/predictionFlow` (all tests pass)
   - [ ] Verify smart refresh logic (check logs)
   - [ ] Verify error handling (mocked failures)

5. **End-to-End**:
   - [ ] Complete E2E verification checklist (manual testing)
   - [ ] Test on web platform
   - [ ] Test on mobile platforms (if available)

6. **Code Quality**:
   - [ ] Run `npm run lint` (no errors)
   - [ ] Run `npm run type-check` (TypeScript compiles)
   - [ ] Run `npm test` (all tests pass)
   - [ ] CI pipeline passing (GitHub Actions green)

7. **Documentation**:
   - [ ] CLAUDE.md updated
   - [ ] README.md updated
   - [ ] Architecture docs created
   - [ ] CHANGELOG.md entry added

### Integration Points to Test

- **Lambda ↔ API Gateway**: Endpoint invokes Lambda correctly
- **Frontend ↔ Lambda**: API client sends requests and receives responses
- **Sync Orchestrator ↔ Prediction API**: Sync triggers predictions after sentiment
- **Repositories ↔ Database**: Predictions stored and retrieved correctly
- **UI Components ↔ Repositories**: Components display fetched predictions
- **Smart Refresh ↔ Database**: Date comparison logic works correctly

### Known Limitations

**Accepted for Phase 2**:
- Async polling not implemented (using synchronous invocation)
- DynamoDB caching not implemented (optional optimization)
- No model performance tracking in production
- No feature importance analysis yet (planned for Phase 5 F-testing)
- Lambda cold starts may cause first prediction to be slow (5-10s)

**Technical Debt**:
- Legacy database columns not dropped (kept for rollback safety)
- No A/B testing framework (compare multi-signal vs bag-of-words)
- No prediction confidence thresholds (show all predictions regardless of confidence)
- No batch prediction API (one ticker at a time)

---

## Success Metrics

After Phase 2 completion, the following should be true:

- **Functionality**: Users see directional predictions with probabilities in sentiment tab and portfolio
- **Performance**: Predictions appear within 20s of stock selection (including Lambda cold start)
- **Reliability**: Sync completes successfully 95%+ of the time
- **Smart Refresh**: 70%+ of syncs skip prediction due to no new articles (cost savings)
- **Code Quality**: 80%+ test coverage, CI passing, no TypeScript errors
- **User Experience**: Predictions display clearly, errors handled gracefully, no crashes

---

## Next Steps

With Phase 2 complete, the multi-signal prediction feature is **production-ready**. Recommended next steps:

1. **Monitor Production**: Watch CloudWatch logs for errors, latency, cold starts
2. **Gather Feedback**: User testing, identify UX improvements
3. **Optimize**: Implement async polling if predictions exceed 30s consistently
4. **Analyze Performance**: Track prediction accuracy over time (manual or automated)
5. **Feature Enhancements** (Future Phases):
   - Phase 3: F-testing to optimize feature set
   - Phase 4: Batch predictions for portfolio (single API call)
   - Phase 5: Model performance tracking and A/B testing
   - Phase 6: Feature importance visualization in UI

---

## Estimated Token Breakdown

- Task 1: SAM template API Gateway - ~8,000 tokens
- Task 2: Deployment automation script - ~12,000 tokens
- Task 3: Frontend API client - ~10,000 tokens
- Task 4: Async polling (optional/future) - ~3,000 tokens (documented, not implemented)
- Task 5: Sync orchestration integration - ~12,000 tokens
- Task 6: Smart refresh logic - ~10,000 tokens
- Task 7: UI sentiment tab update - ~9,000 tokens
- Task 8: UI portfolio update - ~9,000 tokens
- Task 9: Integration testing - ~12,000 tokens
- Task 10: E2E testing - ~8,000 tokens
- Task 11: Legacy code removal - ~7,000 tokens
- Task 12: Documentation and verification - ~10,000 tokens

**Total Estimated**: ~110,000 tokens (within target range)

---

**Phase 2 Complete** - Multi-signal stock prediction feature ready for production deployment.
