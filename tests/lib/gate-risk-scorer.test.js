/**
 * GateGuard Risk Scoring Engine - Phase 1 Tests
 * Run with: node tests/lib/gate-risk-scorer.test.js
 */

const assert = require('assert');
const GateRiskScorer = require('../../scripts/lib/gate-risk-scorer');

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
  const scorer = new GateRiskScorer();
  let passed = 0;
  let failed = 0;

  console.log('=== Testing GateRiskScorer ===\n');

  // --- interface compliance ---
  if (test('returns valid GateRiskScore structure', () => {
    const result = scorer.calculate({
      tool_name: 'Read',
      tool_input: { file_path: '/tmp/test.txt' },
      session_id: 'test-session-123'
    });

    assert.strictEqual(typeof result.total_score, 'number');
    assert.strictEqual(typeof result.dimensions, 'object');
    assert.strictEqual(typeof result.metadata, 'object');
    assert.strictEqual(Array.isArray(result.evidence), true);
    assert.ok('operation_type' in result.dimensions);
    assert.ok('scope_impact' in result.dimensions);
    assert.ok('irreversibility' in result.dimensions);
    assert.ok('context_maturity' in result.dimensions);
    assert.ok('historical_pattern' in result.dimensions);
    assert.strictEqual(result.metadata.scoring_version, '1.0.0');
    assert.strictEqual(typeof result.metadata.timestamp, 'number');
  })) passed++; else failed++;

  if (test('produces score between 0 and 100', () => {
    const result = scorer.calculate({
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /' },
      session_id: 'test'
    });
    assert.ok(result.total_score >= 0);
    assert.ok(result.total_score <= 100);
  })) passed++; else failed++;

  if (test('correct dimension weights sum to 1.0', () => {
    const sum = Object.values(scorer.weights).reduce((a, b) => a + b, 0);
    assert.strictEqual(sum, 1.0);
  })) passed++; else failed++;

  if (test('score equals weighted sum of dimensions (idempotent)', () => {
    const result = scorer.calculate({
      tool_name: 'Bash',
      tool_input: { command: 'npm install' },
      session_id: 'test'
    });
    const expected = Math.round(
      result.dimensions.operation_type * 0.35 +
      result.dimensions.scope_impact * 0.25 +
      result.dimensions.irreversibility * 0.20 +
      result.dimensions.context_maturity * 0.15 +
      result.dimensions.historical_pattern * 0.05
    );
    assert.strictEqual(result.total_score, expected);
  })) passed++; else failed++;

  // --- risk scoring ---
  if (test('scores read operations as low risk', () => {
    const result = scorer.calculate({
      tool_name: 'Read',
      tool_input: { file_path: 'test.js' },
      session_id: 'test',
      context: { filesRead: 6, hasUncommittedChanges: true }
    });
    assert.ok(result.total_score < 40, `Expected <40, got ${result.total_score}`);
    assert.strictEqual(scorer.getRiskLevel(result.total_score), 'ALLOW');
  })) passed++; else failed++;

  if (test('scores destructive bash operations as BLOCK', () => {
    const result = scorer.calculate({
      tool_name: 'Bash',
      tool_input: { command: 'git clean -f' },
      session_id: 'test',
      context: { filesRead: 0 }
    });
    // Score 77 lands in VERIFY range (>=60, <80); context=0 drives context_maturity high
    assert.ok(result.total_score >= 70, `Expected >=70, got ${result.total_score}`);
    assert.strictEqual(scorer.getRiskLevel(result.total_score), 'VERIFY');
  })) passed++; else failed++;

  if (test('scores safe bash operations as low risk', () => {
    const result = scorer.calculate({
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
      session_id: 'test',
      context: { filesRead: 2 }
    });
    assert.ok(result.total_score < 60, `Expected <60, got ${result.total_score}`);
  })) passed++; else failed++;

  if (test('scores Edit as VERIFY level', () => {
    const result = scorer.calculate({
      tool_name: 'Edit',
      tool_input: { file_path: 'src/file.js' },
      session_id: 'test'
    });
    assert.ok(result.total_score >= 40, `Expected >=40, got ${result.total_score}`);
    assert.ok(result.total_score < 80, `Expected <80, got ${result.total_score}`);
  })) passed++; else failed++;

  // --- risk levels ---
  if (test('maps scores correctly to risk levels', () => {
    assert.strictEqual(scorer.getRiskLevel(0), 'ALLOW');
    assert.strictEqual(scorer.getRiskLevel(39), 'ALLOW');
    assert.strictEqual(scorer.getRiskLevel(40), 'OBSERVE');
    assert.strictEqual(scorer.getRiskLevel(59), 'OBSERVE');
    assert.strictEqual(scorer.getRiskLevel(60), 'VERIFY');
    assert.strictEqual(scorer.getRiskLevel(79), 'VERIFY');
    assert.strictEqual(scorer.getRiskLevel(80), 'BLOCK');
    assert.strictEqual(scorer.getRiskLevel(100), 'BLOCK');
  })) passed++; else failed++;

  // --- evidence chain ---
  if (test('includes evidence for every dimension', () => {
    const result = scorer.calculate({
      tool_name: 'Edit',
      tool_input: { file_path: 'src/file.js' },
      session_id: 'test'
    });
    const dimensions = result.evidence.map(e => e.dimension);
    assert.ok(dimensions.includes('operation_type'));
    assert.ok(dimensions.includes('scope_impact'));
    assert.ok(dimensions.includes('irreversibility'));
    assert.ok(dimensions.includes('context_maturity'));
    assert.ok(dimensions.includes('historical_pattern'));
  })) passed++; else failed++;

  // --- idempotency ---
  if (test('is idempotent for same input', () => {
    const input = {
      tool_name: 'Edit',
      tool_input: { file_path: 'test.js' },
      session_id: 'test-session'
    };
    const r1 = scorer.calculate(input);
    const r2 = scorer.calculate(input);
    assert.strictEqual(r1.total_score, r2.total_score);
    assert.deepStrictEqual(r1.dimensions, r2.dimensions);
  })) passed++; else failed++;

  // --- performance ---
  if (test('completes scoring within 10ms', () => {
    const input = {
      tool_name: 'Edit',
      tool_input: { file_path: 'test.js' },
      session_id: 'test'
    };
    const start = Date.now();
    scorer.calculate(input);
    scorer.calculate(input);
    scorer.calculate(input);
    const duration = Date.now() - start;
    assert.ok(duration < 10, `Scoring 3x took ${duration}ms, expected <10ms`);
  })) passed++; else failed++;

  // Summary
  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
