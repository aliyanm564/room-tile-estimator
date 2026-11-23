// Safety net: `npm test` must NEVER call the real Anthropic API.
// - No credentials: any accidental real client hits the missing-key error first.
// - Even if a key sneaks in, the SDK's base URL points at a closed local port.
// Tests use injected fake clients or a fake `fetch` instead.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;
delete process.env.ANTHROPIC_MODEL;
process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:9";
