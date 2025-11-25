describe('API Gateway Cache Configuration (Integration)', () => {
  it.skip('API Gateway v2 HTTP API does not support built-in response caching', () => {
    // HTTP API v2 does not support response caching like REST API does.
    // We rely on DynamoDB caching instead.
    // See Phase-0 ADR for caching architecture.
    // This test is skipped as the feature is not applicable to HTTP API.
  });
});
