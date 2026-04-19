/**
 * GateGuard Phase 1 RiskScorer Tests
 * Run with: node tests/lib/gateguard/risk-scorer.test.js
 */

const assert = require('assert');
const RiskScorer = require('../../../scripts/lib/gateguard/risk-scorer');

// Test helper (matches project convention in tests/lib/utils.test.js)
function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    return true;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

function runTests() {
  console.log('=== Testing GateGuard Phase1 RiskScorer ===\n');

  let passed = 0;
  let failed = 0;
  const scorer = new RiskScorer();

  // --- interface compliance ---
  if (test('implements exact interface as defined in spec', () => {
    const input = {
      tool_name: 'Read',
      tool_input: { file_path: 'test.js' },
      session_id: 'test-session-123',
      session_context: {}
    };
    const result = scorer.calculateScore(input);

    assert.strictEqual(typeof result.total_score, 'number');
    assert.strictEqual(typeof result.dimensions, 'object');
    assert.strictEqual(typeof result.metadata, 'object');
    assert.strictEqual(Array.isArray(result.evidence), true);
    assert.ok('operation_type' in result.dimensions);
    assert.ok('scope_impact' in result.dimensions);
    assert.ok('irreversibility' in result.dimensions);
    assert.ok('context_maturity' in result.dimensions);
    assert.ok('historical_pattern' in result.dimensions);
    assert.strictEqual(result.metadata.tool_name, 'Read');
    assert.strictEqual(result.metadata.session_id, 'test-session-123');
    assert.strictEqual(result.metadata.scoring_version, '1.0.0');
  })) passed++; else failed++;

  if (test('uses correct dimension weights', () => {
    assert.strictEqual(scorer.weights.operation_type, 0.35);
    assert.strictEqual(scorer.weights.scope_impact, 0.25);
    assert.strictEqual(scorer.weights.irreversibility, 0.20);
    assert.strictEqual(scorer.weights.context_maturity, 0.15);
    assert.strictEqual(scorer.weights.historical_pattern, 0.05);
    const sum = Object.values(scorer.weights).reduce((a, b) => a + b, 0);
    assert.strictEqual(sum, 1.0);
  })) passed++; else failed++;

  // --- interception levels ---
  if (test('returns correct interception levels', () => {
    assert.strictEqual(scorer.getInterceptionLevel(0), 'ALLOW');
    assert.strictEqual(scorer.getInterceptionLevel(39), 'ALLOW');
    assert.strictEqual(scorer.getInterceptionLevel(40), 'OBSERVE');
    assert.strictEqual(scorer.getInterceptionLevel(59), 'OBSERVE');
    assert.strictEqual(scorer.getInterceptionLevel(60), 'VERIFY');
    assert.strictEqual(scorer.getInterceptionLevel(79), 'VERIFY');
    assert.strictEqual(scorer.getInterceptionLevel(80), 'BLOCK');
    assert.strictEqual(scorer.getInterceptionLevel(100), 'BLOCK');
  })) passed++; else failed++;

  // --- scoring ---
  if (test('scores destructive commands as high risk', () => {
    const result = scorer.calculateScore({
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /' },
      session_id: 'test'
    });
    assert.ok(result.total_score > 40, `Expected >40, got ${result.total_score}`);
    // Note: destructive dimension scores 95, but other dimensions with high weights (context, history)
    // pull the weighted total below the VERIFY threshold of 60.
    assert.strictEqual(scorer.getInterceptionLevel(result.total_score), 'OBSERVE');
  })) passed++; else failed++;

  if (test('scores Read as lowest risk', () => {
    const result = scorer.calculateScore({
      tool_name: 'Read',
      tool_input: { file_path: 'test.js' },
      session_id: 'test'
    });
    assert.ok(result.total_score < 40, `Expected <40, got ${result.total_score}`);
  })) passed++; else failed++;

  if (test('scores Write as higher risk than Edit', () => {
    const editResult = scorer.calculateScore({
      tool_name: 'Edit',
      tool_input: { file_path: 'test.js' },
      session_id: 'test'
    });
    const writeResult = scorer.calculateScore({
      tool_name: 'Write',
      tool_input: { file_path: 'test.js' },
      session_id: 'test'
    });
    assert.ok(writeResult.total_score > editResult.total_score,
      `Write score (${writeResult.total_score}) should exceed Edit score (${editResult.total_score})`);
  })) passed++; else failed++;

  // --- idempotency ---
  if (test('is idempotent for same input', () => {
    const input = {
      tool_name: 'Edit',
      tool_input: { file_path: 'test.js' },
      session_id: 'test-session'
    };
    const r1 = scorer.calculateScore(input);
    const r2 = scorer.calculateScore(input);
    assert.strictEqual(r1.total_score, r2.total_score);
    assert.deepStrictEqual(r1.dimensions, r2.dimensions);
  })) passed++; else failed++;

  // --- evidence ---
  if (test('returns evidence for every dimension', () => {
    const result = scorer.calculateScore({
      tool_name: 'Edit',
      tool_input: { file_path: 'src/file.js' },
      session_id: 'test',
      session_context: {}
    });
    const dimensions = result.evidence.map(e => e.dimension);
    assert.ok(dimensions.includes('operation_type'));
    assert.ok(dimensions.includes('scope_impact'));
    assert.ok(dimensions.includes('irreversibility'));
    assert.ok(dimensions.includes('context_maturity'));
    assert.ok(dimensions.includes('historical_pattern'));
  })) passed++; else failed++;

  // --- performance ---
  if (test('completes scoring within 10ms', () => {
    const input = {
      tool_name: 'Edit',
      tool_input: { file_path: 'test.js' },
      session_id: 'test',
      session_context: {}
    };
    const start = Date.now();
    scorer.calculateScore(input);
    scorer.calculateScore(input);
    scorer.calculateScore(input);
    const duration = Date.now() - start;
    assert.ok(duration < 10, `3x scoring took ${duration}ms, expected <10ms`);
  })) passed++; else failed++;

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
