# Phase 4: Frontend Async Loading

## Phase Goal

Update React Native frontend to use async Lambda sentiment endpoints instead of local browser-based analysis. Implement progressive loading UX where price and news tabs display immediately while sentiment tab shows a spinner during processing, eliminating the 45+ second UI hang.

**Success Criteria:**
- ✅ Price and news tabs load immediately (<2s)
- ✅ Sentiment tab shows spinner while processing
- ✅ Polling mechanism checks sentiment job status every 2 seconds
- ✅ Sentiment data displays when job completes
- ✅ Error states handled gracefully
- ✅ Offline mode preserved (fall back to local analysis if Lambda unavailable)
- ✅ Local DB hydrated with Lambda results for offline access

**Estimated tokens:** ~35,000

---

## Prerequisites

- **Phase 3 complete**: Lambda sentiment endpoints deployed and functional
- **All backend tests passing**: Sentiment processing working correctly
- **Frontend development environment**: Expo dev server running
- **Backend URL configured**: `EXPO_PUBLIC_BACKEND_URL` set in `.env`

---

## Tasks

### Task 4.1: Create Lambda API Service

**Goal:** Create frontend service layer to call Lambda sentiment endpoints (POST /sentiment, GET /sentiment/job, GET /sentiment).

**Files to Create:**
- `src/services/api/lambdaSentiment.service.ts` - Lambda sentiment API client
- `src/services/api/__tests__/lambdaSentiment.service.test.ts` - Unit tests

**Prerequisites:**
- Review existing API services (tiingo.service.ts, polygon.service.ts)
- Understand environment variable usage (`EXPO_PUBLIC_BACKEND_URL`)

**Implementation Steps:**

1. **Import environment config**:
   ```typescript
   import { environment } from '@/config/environment';
   const BASE_URL = environment.BACKEND_URL;
   ```

2. **Create TypeScript interfaces**:
   ```typescript
   interface SentimentJobRequest {
     ticker: string;
     startDate: string;
     endDate: string;
   }

   interface SentimentJobResponse {
     jobId: string;
     status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
     cached: boolean;
   }

   interface SentimentJobStatus extends SentimentJobResponse {
     ticker: string;
     startDate: string;
     endDate: string;
     articlesProcessed?: number;
     startedAt?: number;
     completedAt?: number;
     durationMs?: number;
     error?: string;
   }

   interface DailySentiment {
     date: string;
     positive: number;
     negative: number;
     sentimentScore: number;
     classification: 'POS' | 'NEG' | 'NEUT';
   }

   interface SentimentResultsResponse {
     ticker: string;
     startDate: string;
     endDate: string;
     dailySentiment: DailySentiment[];
     cached: boolean;
   }
   ```

3. **Implement POST /sentiment**:
   ```typescript
   export async function triggerSentimentAnalysis(
     request: SentimentJobRequest
   ): Promise<SentimentJobResponse>
   ```
   - Make POST request to `${BASE_URL}/sentiment`
   - Send JSON body with ticker and date range
   - Handle network errors (return APIError)
   - Timeout after 30 seconds

4. **Implement GET /sentiment/job/:jobId**:
   ```typescript
   export async function getSentimentJobStatus(
     jobId: string
   ): Promise<SentimentJobStatus>
   ```
   - Make GET request to `${BASE_URL}/sentiment/job/${jobId}`
   - Parse JSON response
   - Handle 404 (job not found)

5. **Implement GET /sentiment**:
   ```typescript
   export async function getSentimentResults(
     ticker: string,
     startDate: string,
     endDate: string
   ): Promise<SentimentResultsResponse>
   ```
   - Make GET request to `${BASE_URL}/sentiment?ticker={ticker}&startDate={startDate}&endDate={endDate}`
   - Parse daily sentiment array
   - Return typed response

6. **Add error handling**:
   - Use existing `APIError` class from other services
   - Map HTTP status codes to error messages
   - Handle network timeouts gracefully

7. **Add request logging** (debug only):
   - Log requests in development mode
   - Include request URL and parameters
   - Log response status and timing

**Verification Checklist:**
- [ ] All functions use `EXPO_PUBLIC_BACKEND_URL` from environment
- [ ] TypeScript interfaces match Lambda response formats
- [ ] Network errors handled gracefully
- [ ] Request timeouts configured (30s)
- [ ] Logging helps debug API issues

**Testing Instructions:**

Create unit tests with mocked fetch:

- **Test triggerSentimentAnalysis**:
  - Mock fetch to return jobId
  - Verify POST request sent with correct body
  - Verify typed response returned

- **Test getSentimentJobStatus**:
  - Mock fetch to return job status
  - Verify GET request to correct URL
  - Test 404 handling (job not found)

- **Test getSentimentResults**:
  - Mock fetch to return daily sentiment
  - Verify query parameters encoded correctly
  - Verify typed response matches interface

- **Test error handling**:
  - Mock fetch to throw network error
  - Verify APIError thrown with message

Run tests: `npm test -- services/api/lambdaSentiment.service`

**Commit Message Template:**
```
feat(api): create Lambda sentiment API service for frontend

- Implement POST /sentiment client to trigger analysis
- Implement GET /sentiment/job/:jobId for status polling
- Implement GET /sentiment for fetching cached results
- Add TypeScript interfaces matching Lambda responses
- Handle network errors and timeouts gracefully
- Comprehensive unit tests with mocked fetch

Task: Phase 4, Task 4.1
```

**Estimated tokens:** ~7,000

---

### Task 4.2: Create Sentiment Polling Hook

**Goal:** Create React hook that polls Lambda for sentiment job completion, managing polling state and results.

**Files to Create:**
- `src/hooks/useSentimentPolling.ts` - Polling hook
- `src/hooks/__tests__/useSentimentPolling.test.ts` - Unit tests

**Prerequisites:**
- Task 4.1 complete (API service available)
- Understand React hooks (useState, useEffect, useRef)

**Implementation Steps:**

1. **Create hook signature**:
   ```typescript
   export function useSentimentPolling(
     ticker: string,
     startDate: string,
     endDate: string,
     options?: {
       enabled?: boolean;
       pollInterval?: number;
       maxAttempts?: number;
       onComplete?: (data: DailySentiment[]) => void;
       onError?: (error: Error) => void;
     }
   ): {
     isPolling: boolean;
     jobId: string | null;
     jobStatus: SentimentJobStatus | null;
     sentimentData: DailySentiment[] | null;
     error: Error | null;
     triggerAnalysis: () => Promise<void>;
   }
   ```

2. **Implement polling logic**:
   - **Step 1**: Trigger analysis via POST /sentiment
     - Store jobId in state
     - Set isPolling to true
   - **Step 2**: Poll job status every 2 seconds
     - Use setInterval or setTimeout
     - Call getSentimentJobStatus(jobId)
     - Check if status is COMPLETED or FAILED
   - **Step 3**: Fetch results when complete
     - Call getSentimentResults()
     - Store in state
     - Set isPolling to false
     - Call onComplete callback
   - **Step 4**: Handle errors and timeout
     - If status is FAILED, set error state
     - If maxAttempts reached, timeout error
     - Call onError callback

3. **Add cleanup**:
   - Clear interval on unmount
   - Clear interval when polling completes
   - Prevent memory leaks

4. **Add timeout handling**:
   - Default maxAttempts: 60 (2 minutes at 2s intervals)
   - Throw error if exceeded: "Sentiment analysis timed out"

5. **Optimize polling**:
   - Use exponential backoff after 10 attempts (2s → 4s → 8s)
   - Stop polling if component unmounts
   - Cancel pending requests on unmount

**Verification Checklist:**
- [ ] Polling starts when triggerAnalysis called
- [ ] Interval set to 2 seconds (configurable via options)
- [ ] Polling stops when job completes or fails
- [ ] Timeout after maxAttempts (default 60)
- [ ] Cleanup prevents memory leaks
- [ ] Callbacks invoked at appropriate times

**Testing Instructions:**

Create tests using React Testing Library:

- **Test successful polling**:
  - Mock API to return PENDING, then COMPLETED
  - Verify polling occurs at 2s intervals
  - Verify results fetched when complete
  - Verify onComplete callback invoked

- **Test polling timeout**:
  - Mock API to always return IN_PROGRESS
  - Set maxAttempts to 3
  - Verify timeout error after 3 attempts

- **Test error handling**:
  - Mock API to return FAILED status
  - Verify error state set
  - Verify onError callback invoked

- **Test cleanup**:
  - Unmount component during polling
  - Verify interval cleared
  - Verify no memory leaks

Run tests: `npm test -- hooks/useSentimentPolling`

**Commit Message Template:**
```
feat(hooks): create sentiment polling hook for async job tracking

- Implement polling logic with configurable interval (default 2s)
- Trigger analysis via POST /sentiment
- Poll job status until COMPLETED or FAILED
- Fetch results when job completes
- Add timeout handling (default 60 attempts = 2 minutes)
- Cleanup interval on unmount to prevent memory leaks
- Comprehensive tests with React Testing Library

Task: Phase 4, Task 4.2
```

**Estimated tokens:** ~6,000

---

### Task 4.3: Update useSentimentData Hook to Use Lambda

**Goal:** Modify existing `useSentimentData` hook to call Lambda instead of local sentiment sync, with fallback to local if Lambda unavailable.

**Files to Modify:**
- `src/hooks/useSentimentData.ts` - Replace local sync with Lambda calls

**Prerequisites:**
- Task 4.2 complete (polling hook available)
- Review current useSentimentData implementation

**Implementation Steps:**

1. **Add Lambda integration**:
   - Import `getSentimentResults` from lambdaSentiment.service
   - Import `useSentimentPolling` hook

2. **Modify query function** to check Lambda first:
   ```typescript
   queryFn: async (): Promise<CombinedWordDetails[]> => {
     // Step 1: Check local DB (fastest)
     let localData = await CombinedWordRepository.findByTickerAndDateRange(
       ticker,
       startDate,
       endDate
     );

     if (localData.length > 0) {
       console.log(`[useSentimentData] Returning ${localData.length} local records`);
       return localData;
     }

     // Step 2: Check Lambda cache
     try {
       const lambdaResults = await getSentimentResults(ticker, startDate, endDate);
       if (lambdaResults.dailySentiment.length > 0) {
         // Transform Lambda format to local DB format
         const transformed = transformLambdaToLocal(lambdaResults.dailySentiment, ticker);
         // Hydrate local DB for offline access
         await CombinedWordRepository.batchUpsert(transformed);
         return transformed;
       }
     } catch (error) {
       console.warn('[useSentimentData] Lambda unavailable, falling back to local analysis:', error);
       // Fall through to local analysis
     }

     // Step 3: Fallback to local analysis (legacy behavior)
     console.log('[useSentimentData] Triggering local sentiment analysis');
     const dates = getDatesInRange(startDate, endDate);
     for (const date of dates) {
       await syncSentimentData(ticker, date); // Existing local sync
     }

     localData = await CombinedWordRepository.findByTickerAndDateRange(
       ticker,
       startDate,
       endDate
     );

     return localData;
   }
   ```

3. **Create transformation helper**:
   ```typescript
   function transformLambdaToLocal(
     dailySentiment: DailySentiment[],
     ticker: string
   ): CombinedWordDetails[] {
     return dailySentiment.map(day => ({
       date: day.date,
       ticker,
       positive: day.positive,
       negative: day.negative,
       sentimentNumber: day.sentimentScore,
       sentiment: day.classification,
       nextDay: 0, // Not provided by Lambda
       twoWks: 0,  // Not provided by Lambda
       oneMnth: 0, // Not provided by Lambda
       updateDate: formatDateForDB(new Date()),
     }));
   }
   ```

4. **Add feature flag support** (optional):
   - Check `EXPO_PUBLIC_USE_LAMBDA_SENTIMENT` environment variable
   - If false, skip Lambda and use local analysis
   - Allows rollback if Lambda issues occur

5. **Preserve offline mode**:
   - If network error, fall back to local DB
   - If local DB has stale data, still return it (better than nothing)
   - Log warnings when using fallback

**Verification Checklist:**
- [ ] Local DB checked first (fastest path)
- [ ] Lambda checked second (shared cache)
- [ ] Local analysis used as fallback (offline mode)
- [ ] Lambda results hydrate local DB for future offline access
- [ ] Transformation helper correctly maps Lambda format to local schema
- [ ] Feature flag allows disabling Lambda (rollback)

**Testing Instructions:**

Create tests with mocked API and DB:

- **Test Lambda cache hit**:
  - Mock local DB as empty
  - Mock Lambda to return sentiment data
  - Verify Lambda called
  - Verify data transformed and stored locally

- **Test local DB cache hit**:
  - Mock local DB with data
  - Verify Lambda NOT called (short-circuit)

- **Test Lambda fallback**:
  - Mock local DB as empty
  - Mock Lambda to throw network error
  - Verify local analysis triggered

- **Test offline mode**:
  - Mock network as unavailable
  - Mock local DB with stale data
  - Verify stale data returned (not error)

Run tests: `npm test -- hooks/useSentimentData`

**Commit Message Template:**
```
feat(hooks): integrate Lambda sentiment in useSentimentData hook

- Check Lambda cache before local analysis
- Hydrate local DB with Lambda results for offline access
- Fall back to local analysis if Lambda unavailable
- Transform Lambda format to local DB schema
- Preserve offline-first architecture
- Add feature flag for Lambda enable/disable
- Comprehensive tests for all code paths

Task: Phase 4, Task 4.3
```

**Estimated tokens:** ~7,000

---

### Task 4.4: Create Sentiment Tab Loading States

**Goal:** Update sentiment screen to show spinner while sentiment processes, with clear messaging about analysis status.

**Files to Modify:**
- `app/(tabs)/stock/[ticker]/sentiment.tsx` - Add loading states
- `src/components/sentiment/SentimentLoadingState.tsx` - New loading component (create)

**Prerequisites:**
- Task 4.3 complete (hook integrated)
- Review current sentiment screen implementation

**Implementation Steps:**

1. **Create loading state component** (`SentimentLoadingState.tsx`):
   ```typescript
   interface SentimentLoadingStateProps {
     jobStatus?: SentimentJobStatus;
     progress?: number; // 0-100
   }

   export function SentimentLoadingState({ jobStatus, progress }: SentimentLoadingStateProps) {
     return (
       <View style={styles.container}>
         <ActivityIndicator size="large" color="#007AFF" />
         <Text style={styles.title}>Analyzing Sentiment...</Text>
         <Text style={styles.subtitle}>
           {jobStatus?.status === 'PENDING' && 'Queued for analysis'}
           {jobStatus?.status === 'IN_PROGRESS' && `Processing ${jobStatus.articlesProcessed || 0} articles`}
         </Text>
         {progress !== undefined && (
           <ProgressBar progress={progress / 100} style={styles.progressBar} />
         )}
       </View>
     );
   }
   ```

2. **Update sentiment screen** to use loading states:
   - Import `useSentimentPolling` (or use state from context)
   - Show `SentimentLoadingState` when `isAggregateLoading || isPolling`
   - Pass job status to loading component for progress updates
   - Show error state if job fails

3. **Add progressive enhancement**:
   - If local data exists but stale, show it with "Refreshing..." indicator
   - Don't block user from viewing old data while new analysis runs

4. **Add retry button** for failed analysis:
   ```typescript
   if (error) {
     return (
       <View style={styles.errorContainer}>
         <ErrorDisplay error={error} />
         <Button mode="contained" onPress={() => refetch()}>
           Retry Analysis
         </Button>
       </View>
     );
   }
   ```

5. **Add "Cancel" button** while polling (optional):
   - Allow user to cancel long-running analysis
   - Clear polling interval
   - Show cached data if available

**Verification Checklist:**
- [ ] Spinner shows while sentiment processing
- [ ] Job status displayed (PENDING, IN_PROGRESS)
- [ ] Progress indicator shows articles processed (if available)
- [ ] Error state shows retry button
- [ ] Stale data still visible while refreshing
- [ ] Cancel button stops polling (optional)

**Testing Instructions:**

Create UI tests:

- **Test loading state**:
  - Navigate to sentiment tab with no cached data
  - Verify spinner and "Analyzing Sentiment..." message
  - Wait for completion, verify data displays

- **Test error state**:
  - Mock API to return FAILED status
  - Verify error message and retry button shown
  - Click retry, verify re-triggers analysis

- **Test progressive loading**:
  - Navigate to sentiment tab with stale data
  - Verify stale data shown with "Refreshing..." indicator
  - Verify data updates when new analysis completes

Run tests: `npm test -- app/(tabs)/stock/[ticker]/sentiment`

**Commit Message Template:**
```
feat(ui): add progressive loading states to sentiment tab

- Create SentimentLoadingState component with spinner and status
- Display job status (PENDING, IN_PROGRESS) during polling
- Show progress indicator with articles processed count
- Add retry button for failed analysis
- Display stale data while refreshing (progressive enhancement)
- Comprehensive UI tests for all loading states

Task: Phase 4, Task 4.4
```

**Estimated tokens:** ~6,000

---

### Task 4.5: Update Sync Orchestrator for Lambda Integration

**Goal:** Modify `syncOrchestrator.ts` to trigger Lambda sentiment analysis instead of local processing, making search/portfolio sync use Lambda.

**Files to Modify:**
- `src/services/sync/syncOrchestrator.ts` - Replace local sentiment sync with Lambda trigger

**Prerequisites:**
- Task 4.1 complete (Lambda API service available)
- Review current syncOrchestrator implementation

**Implementation Steps:**

1. **Import Lambda API service**:
   ```typescript
   import { triggerSentimentAnalysis, getSentimentJobStatus } from '@/services/api/lambdaSentiment.service';
   ```

2. **Replace sentiment sync step**:
   - Remove sequential `syncSentimentData()` calls
   - Replace with single `triggerSentimentAnalysis()` call
   - Store jobId for later polling

3. **Update progress callback**:
   ```typescript
   // Old: Sequential date processing with progress per date
   for (let i = 0; i < dates.length; i++) {
     const date = dates[i];
     await syncSentimentData(ticker, date);
     onProgress?.({ step: 'sentiment', progress: i / dates.length, total: dates.length, message: `Analyzing ${i+1}/${dates.length} days...` });
   }

   // New: Trigger Lambda analysis (non-blocking)
   try {
     const response = await triggerSentimentAnalysis({
       ticker,
       startDate,
       endDate
     });

     onProgress?.({
       step: 'sentiment',
       progress: 2.5, // Midway between step 2 and 3
       total: 3,
       message: `Sentiment analysis started (Job ID: ${response.jobId})`,
     });

     result.sentimentJobId = response.jobId; // Add to result
   } catch (error) {
     console.warn('[SyncOrchestrator] Failed to trigger Lambda sentiment, falling back to local:', error);
     // Fallback to local analysis if Lambda unavailable
     // ... existing local sync code
   }
   ```

4. **Update SyncResult interface**:
   ```typescript
   export interface SyncResult {
     ticker: string;
     stockRecords: number;
     newsArticles: number;
     sentimentAnalyses: number; // Deprecated, may be 0 if Lambda used
     sentimentJobId?: string; // New field
     daysProcessed: number;
     errors: string[];
   }
   ```

5. **Add Lambda fallback**:
   - If `triggerSentimentAnalysis()` fails (network error), fall back to local analysis
   - Log warning but don't fail entire sync
   - Existing local sync code remains as fallback

6. **Update completion message**:
   - If Lambda used: "Sync complete. Sentiment analysis in progress (Job ID: ...)."
   - If local used: "Sync complete. Sentiment analyzed locally."

**Verification Checklist:**
- [ ] Lambda sentiment trigger replaces local processing
- [ ] Progress callback updated with jobId message
- [ ] Fallback to local analysis if Lambda fails
- [ ] SyncResult includes jobId for tracking
- [ ] Completion message indicates async processing

**Testing Instructions:**

Create integration tests:

- **Test Lambda sentiment trigger**:
  - Call syncAllData('AAPL', 30)
  - Verify triggerSentimentAnalysis called
  - Verify jobId in result
  - Verify progress callback shows Lambda message

- **Test Lambda fallback**:
  - Mock Lambda API to throw error
  - Verify local analysis triggered
  - Verify sync completes successfully

- **Test progress updates**:
  - Capture progress callbacks
  - Verify sentiment step shows Lambda jobId

Run tests: `npm test -- services/sync/syncOrchestrator`

**Commit Message Template:**
```
feat(sync): integrate Lambda sentiment in sync orchestrator

- Replace local sentiment processing with Lambda trigger
- Update progress callbacks to show Lambda job ID
- Add fallback to local analysis if Lambda unavailable
- Update SyncResult to include sentimentJobId
- Preserve backward compatibility with local fallback
- Integration tests for Lambda and fallback paths

Task: Phase 4, Task 4.5
```

**Estimated tokens:** ~5,500

---

### Task 4.6: Add Sentiment Polling to Stock Detail Context

**Goal:** Integrate sentiment polling into StockDetailContext so all tabs can access sentiment status without prop drilling.

**Files to Modify:**
- `src/contexts/StockDetailContext.tsx` - Add polling state and methods (create if doesn't exist)
- `app/(tabs)/stock/[ticker]/_layout.tsx` - Integrate context provider

**Prerequisites:**
- Task 4.2 complete (polling hook available)
- Understand React Context API

**Implementation Steps:**

1. **Create StockDetailContext** (if doesn't exist):
   ```typescript
   interface StockDetailContextValue {
     ticker: string;
     startDate: string;
     endDate: string;

     // Sentiment polling state
     isSentimentPolling: boolean;
     sentimentJobId: string | null;
     sentimentJobStatus: SentimentJobStatus | null;
     sentimentError: Error | null;

     // Methods
     triggerSentimentAnalysis: () => Promise<void>;
   }

   const StockDetailContext = createContext<StockDetailContextValue | undefined>(undefined);

   export function useStockDetail() {
     const context = useContext(StockDetailContext);
     if (!context) {
       throw new Error('useStockDetail must be used within StockDetailProvider');
     }
     return context;
   }
   ```

2. **Implement StockDetailProvider**:
   ```typescript
   export function StockDetailProvider({ ticker, children }: { ticker: string, children: ReactNode }) {
     const [startDate, setStartDate] = useState(formatDateForDB(subDays(new Date(), 30)));
     const [endDate, setEndDate] = useState(formatDateForDB(new Date()));

     // Use polling hook
     const {
       isPolling: isSentimentPolling,
       jobId: sentimentJobId,
       jobStatus: sentimentJobStatus,
       error: sentimentError,
       triggerAnalysis: triggerSentimentAnalysis,
     } = useSentimentPolling(ticker, startDate, endDate, {
       enabled: true,
       onComplete: (data) => {
         console.log('[StockDetail] Sentiment analysis complete:', data.length, 'days');
         // Optionally invalidate React Query cache to re-fetch
         queryClient.invalidateQueries(['sentimentData', ticker]);
       },
       onError: (error) => {
         console.error('[StockDetail] Sentiment analysis failed:', error);
       },
     });

     const value = {
       ticker,
       startDate,
       endDate,
       isSentimentPolling,
       sentimentJobId,
       sentimentJobStatus,
       sentimentError,
       triggerSentimentAnalysis,
     };

     return (
       <StockDetailContext.Provider value={value}>
         {children}
       </StockDetailContext.Provider>
     );
   }
   ```

3. **Integrate provider in layout**:
   - Wrap stock detail screens with `StockDetailProvider`
   - Extract ticker from route params
   - Pass ticker to provider

4. **Update sentiment screen** to use context:
   - Replace local polling state with `useStockDetail()`
   - Access `isSentimentPolling`, `sentimentJobStatus` from context
   - Remove redundant polling logic

**Verification Checklist:**
- [ ] Context provides sentiment polling state to all tabs
- [ ] Polling starts automatically on tab navigation
- [ ] All tabs can access jobId and status
- [ ] Context invalidates React Query cache on completion
- [ ] No prop drilling needed

**Testing Instructions:**

Create tests for context:

- **Test provider initialization**:
  - Render provider with ticker
  - Verify context value available to children
  - Verify polling starts automatically

- **Test triggerAnalysis method**:
  - Call triggerAnalysis from child component
  - Verify API called
  - Verify polling state updated

- **Test completion callback**:
  - Mock polling to complete
  - Verify React Query cache invalidated
  - Verify data re-fetched

Run tests: `npm test -- contexts/StockDetailContext`

**Commit Message Template:**
```
feat(context): add StockDetailContext for sentiment polling state

- Create context with sentiment polling state and methods
- Integrate useSentimentPolling hook in provider
- Trigger analysis automatically on tab navigation
- Invalidate React Query cache on completion
- Remove prop drilling for sentiment status
- Comprehensive context tests

Task: Phase 4, Task 4.6
```

**Estimated tokens:** ~5,000

---

### Task 4.7: Add Offline Mode Indicator

**Goal:** Display indicator when app is using local analysis (offline mode) vs Lambda (online mode).

**Files to Create:**
- `src/components/common/OfflineIndicator.tsx` - Offline mode banner

**Prerequisites:**
- Understand NetInfo API (React Native network detection)

**Implementation Steps:**

1. **Create offline indicator component**:
   ```typescript
   import NetInfo from '@react-native-community/netinfo';

   export function OfflineIndicator() {
     const [isOffline, setIsOffline] = useState(false);

     useEffect(() => {
       const unsubscribe = NetInfo.addEventListener(state => {
         setIsOffline(!state.isConnected);
       });

       return () => unsubscribe();
     }, []);

     if (!isOffline) return null;

     return (
       <View style={styles.banner}>
         <Icon name="cloud-offline-outline" size={16} color="#fff" />
         <Text style={styles.text}>Offline Mode - Using local analysis</Text>
       </View>
     );
   }
   ```

2. **Add to sentiment screen**:
   - Display banner at top of screen when offline
   - Show "Using local analysis" message
   - Optionally show "Reconnect to use Lambda" hint

3. **Add to sync orchestrator**:
   - Detect offline mode before triggering Lambda
   - Skip Lambda call if offline, use local analysis directly
   - Log "Offline mode: using local sentiment analysis"

4. **Style banner**:
   - Subtle yellow/orange background (#FFA500)
   - Small height (30px)
   - Fixed to top of screen

**Verification Checklist:**
- [ ] Banner shows when network disconnected
- [ ] Banner hides when network connected
- [ ] Sync orchestrator detects offline mode
- [ ] Local analysis used when offline

**Testing Instructions:**

Manual testing:

- **Test offline detection**:
  - Disable network on device/simulator
  - Navigate to sentiment tab
  - Verify offline banner shows
  - Verify local analysis used

- **Test online detection**:
  - Re-enable network
  - Verify banner disappears
  - Verify Lambda used for new requests

**Commit Message Template:**
```
feat(ui): add offline mode indicator for sentiment analysis

- Create OfflineIndicator component using NetInfo
- Display banner when network unavailable
- Show "Using local analysis" message
- Detect offline mode in sync orchestrator
- Skip Lambda calls when offline
- Manual testing validated on iOS/Android

Task: Phase 4, Task 4.7
```

**Estimated tokens:** ~4,000

---

### Task 4.8: Update Search Screen to Handle Async Sentiment

**Goal:** Update search screen flow to trigger Lambda sentiment without blocking UI, show success message with job ID.

**Files to Modify:**
- `app/(tabs)/index.tsx` - Update search screen sync flow

**Prerequisites:**
- Task 4.5 complete (sync orchestrator updated)
- Review current search screen implementation

**Implementation Steps:**

1. **Update sync success message**:
   - After syncAllData completes, check if `sentimentJobId` present
   - Show toast/notification: "Stock data synced. Sentiment analysis in progress."
   - Include job ID for tracking (optional, for advanced users)

2. **Add navigation after sync**:
   - Current: Wait for full sync before navigating
   - New: Navigate immediately after stock + news sync (don't wait for sentiment)
   - User can navigate to stock detail, sentiment will load asynchronously

3. **Handle sync errors gracefully**:
   - If sentiment trigger fails, show warning but don't block navigation
   - User can still view price and news tabs
   - Sentiment tab will show error with retry button

4. **Add progress indicator** (optional):
   - Show indeterminate progress bar during sync
   - Update message as each step completes:
     - "Fetching prices..." (Step 1/3)
     - "Fetching news..." (Step 2/3)
     - "Triggering sentiment analysis..." (Step 3/3)
   - Navigate when Step 2 completes (don't wait for Step 3)

**Verification Checklist:**
- [ ] Search triggers sync without blocking UI
- [ ] Navigation happens after stock + news sync (async sentiment)
- [ ] Success message indicates sentiment in progress
- [ ] Error handling doesn't block navigation
- [ ] Progress indicator shows current step (optional)

**Testing Instructions:**

Manual testing:

- **Test successful search**:
  - Search for AAPL
  - Verify progress shows each step
  - Verify navigation after news sync completes
  - Navigate to sentiment tab, verify polling occurs

- **Test sentiment error**:
  - Mock Lambda to fail
  - Verify search still succeeds
  - Verify price and news tabs functional
  - Verify sentiment tab shows error

**Commit Message Template:**
```
feat(search): update search flow for async sentiment processing

- Navigate to stock detail after stock + news sync (don't wait for sentiment)
- Show success message indicating sentiment in progress
- Display job ID for tracking (advanced users)
- Handle sentiment errors without blocking navigation
- Add progress indicator for each sync step
- Manual testing validated on iOS/Android/Web

Task: Phase 4, Task 4.8
```

**Estimated tokens:** ~4,500

---

### Task 4.9: Add Feature Flag for Lambda Sentiment

**Goal:** Create environment variable toggle to enable/disable Lambda sentiment, allowing easy rollback if issues occur.

**Files to Modify:**
- `.env.example` - Add new flag
- `src/config/environment.ts` - Export flag
- `src/hooks/useSentimentData.ts` - Check flag
- `src/services/sync/syncOrchestrator.ts` - Check flag

**Prerequisites:**
- Understand Expo environment variables (`EXPO_PUBLIC_*`)

**Implementation Steps:**

1. **Add environment variable** to `.env.example`:
   ```bash
   # Feature flag: Use Lambda for sentiment analysis (fallback to local if false)
   EXPO_PUBLIC_USE_LAMBDA_SENTIMENT=true
   ```

2. **Export flag** in `environment.ts`:
   ```typescript
   export const environment = {
     BACKEND_URL: process.env.EXPO_PUBLIC_BACKEND_URL,
     USE_LAMBDA_SENTIMENT: process.env.EXPO_PUBLIC_USE_LAMBDA_SENTIMENT === 'true',
     // ... other flags
   };
   ```

3. **Check flag in useSentimentData**:
   ```typescript
   queryFn: async () => {
     // Check local DB first
     let localData = await CombinedWordRepository.findByTickerAndDateRange(...);
     if (localData.length > 0) return localData;

     // Check feature flag
     if (environment.USE_LAMBDA_SENTIMENT) {
       try {
         const lambdaResults = await getSentimentResults(...);
         // ... Lambda flow
       } catch (error) {
         console.warn('Lambda unavailable, falling back to local');
         // Fall through to local analysis
       }
     }

     // Local analysis (fallback or if flag disabled)
     // ... existing local sync code
   }
   ```

4. **Check flag in syncOrchestrator**:
   ```typescript
   if (environment.USE_LAMBDA_SENTIMENT) {
     try {
       const response = await triggerSentimentAnalysis(...);
       // ... Lambda flow
     } catch (error) {
       console.warn('Lambda failed, using local analysis');
       // ... local fallback
     }
   } else {
     // Use local analysis directly
     // ... existing code
   }
   ```

5. **Document flag** in README:
   - Add to "Feature Flags" section in CLAUDE.md
   - Explain when to disable (e.g., Lambda outage, debugging)

**Verification Checklist:**
- [ ] Flag added to .env.example with documentation
- [ ] Flag exported from environment.ts
- [ ] All Lambda calls check flag before executing
- [ ] Local analysis used when flag is false
- [ ] README documents flag usage

**Testing Instructions:**

Manual testing:

- **Test flag enabled (true)**:
  - Set `EXPO_PUBLIC_USE_LAMBDA_SENTIMENT=true`
  - Trigger sentiment analysis
  - Verify Lambda called

- **Test flag disabled (false)**:
  - Set `EXPO_PUBLIC_USE_LAMBDA_SENTIMENT=false`
  - Trigger sentiment analysis
  - Verify local analysis used
  - Verify no Lambda calls

**Commit Message Template:**
```
feat(config): add feature flag for Lambda sentiment toggle

- Add EXPO_PUBLIC_USE_LAMBDA_SENTIMENT environment variable
- Export flag from environment.ts
- Check flag in useSentimentData and syncOrchestrator
- Fall back to local analysis when flag disabled
- Document flag in README and CLAUDE.md
- Manual testing validates both enabled and disabled states

Task: Phase 4, Task 4.9
```

**Estimated tokens:** ~4,000

---

### Task 4.10: Deploy and Validate Frontend Changes

**Goal:** Test frontend changes on iOS, Android, and Web to ensure async sentiment loading works correctly.

**Files to Modify:**
- None (testing and validation only)

**Prerequisites:**
- All Phase 4 tasks complete
- Backend deployed (Phase 3 complete)

**Implementation Steps:**

1. **Run full test suite**:
   - Unit tests: `npm test`
   - Ensure all new tests passing
   - Fix any failing tests

2. **Test on Web**:
   - Run `npm run web`
   - Search for stock (e.g., AAPL)
   - Verify price and news tabs load immediately
   - Navigate to sentiment tab, verify spinner shows
   - Wait for sentiment to complete, verify data displays
   - Test offline mode (disable network in DevTools)

3. **Test on iOS Simulator**:
   - Run `npm run ios`
   - Perform same tests as web
   - Verify native performance (smooth animations)
   - Test offline mode (airplane mode)

4. **Test on Android Emulator**:
   - Run `npm run android`
   - Perform same tests
   - Verify material design components work
   - Test offline mode

5. **Performance validation**:
   - Measure time from search to price tab display (<2s target)
   - Measure time from search to sentiment complete (<15s target)
   - Compare to old architecture (should be ~70% faster for sentiment)

6. **Error scenario testing**:
   - Test with invalid ticker, verify error handling
   - Test with network error during polling, verify retry works
   - Test Lambda timeout, verify timeout error shown

**Verification Checklist:**
- [ ] All platforms (iOS, Android, Web) functional
- [ ] Price and news tabs load immediately (<2s)
- [ ] Sentiment tab shows spinner during processing
- [ ] Sentiment data displays when complete
- [ ] Offline mode works (local analysis fallback)
- [ ] Error states show appropriate messages
- [ ] No UI hangs or freezes
- [ ] Performance meets targets

**Testing Instructions:**

Manual end-to-end tests:

- **Happy path**:
  1. Search "AAPL"
  2. Verify navigation to stock detail
  3. Verify price tab shows data immediately
  4. Switch to news tab, verify data loaded
  5. Switch to sentiment tab, verify spinner
  6. Wait for completion, verify sentiment data
  7. Navigate back, search again
  8. Verify cache hit (instant load)

- **Error path**:
  1. Search invalid ticker "ZZZZZ"
  2. Verify error message
  3. Enable airplane mode
  4. Search "GOOGL" (not cached)
  5. Verify offline indicator shows
  6. Verify local analysis used

- **Performance test**:
  1. Clear app data
  2. Time search → price tab display
  3. Time search → sentiment complete
  4. Record metrics for comparison

**Commit Message Template:**
```
test(frontend): validate async sentiment loading on all platforms

- Tested on Web, iOS, Android successfully
- Verified price/news load <2s, sentiment <15s
- Validated offline mode with local analysis fallback
- Tested error scenarios (invalid ticker, network error, timeout)
- Performance meets targets (70% faster than old architecture)
- No UI hangs or freezes detected

Task: Phase 4, Task 4.10
```

**Estimated tokens:** ~5,000

---

## Phase Verification

After completing all tasks, verify the entire phase:

**Functional Validation:**
- [ ] Price and news tabs load immediately without waiting for sentiment
- [ ] Sentiment tab shows spinner while processing
- [ ] Polling updates sentiment tab when complete
- [ ] Offline mode falls back to local analysis
- [ ] Error states handled gracefully with retry options

**Performance Validation:**
- [ ] Price tab loads <2 seconds after search
- [ ] Sentiment completes <15 seconds (vs 45s+ previously)
- [ ] No UI blocking or hangs
- [ ] Smooth animations and transitions

**Testing Validation:**
- [ ] All unit tests passing: `npm test`
- [ ] Manual testing complete on iOS, Android, Web
- [ ] Offline mode tested and functional
- [ ] Error scenarios tested (network errors, timeouts, invalid tickers)

**User Experience Validation:**
- [ ] Clear loading states (spinner, progress messages)
- [ ] Error messages actionable (retry button, helpful text)
- [ ] Offline indicator shows when Lambda unavailable
- [ ] Feature flag allows easy rollback

**Known Limitations:**
- Sentiment polling every 2 seconds (no WebSocket) - acceptable for MVP
- No real-time updates (manual refresh needed) - acceptable
- Offline mode uses local analysis (slower) - expected behavior

---

## Next Steps

✅ **Phase 4 Complete!** You now have:
- Progressive loading UX (price/news immediate, sentiment async)
- Lambda sentiment integration with local fallback
- Polling mechanism for job status tracking
- Offline mode preserved with local analysis
- Feature flag for easy rollback

**Proceed to Phase 5:** Migration, optimization, and cleanup.

→ **[Phase 5: Migration & Optimization](./Phase-5.md)**
