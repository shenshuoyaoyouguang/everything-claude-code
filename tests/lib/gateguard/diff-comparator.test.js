/**
 * Tests for scripts/lib/gateguard/diff-comparator.js
 */

const assert = require('assert');
const DiffComparator = require('../../../scripts/lib/gateguard/diff-comparator');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

function runTests() {
  console.log('\n=== Testing diff-comparator.js ===\n');

  let passed = 0;
  let failed = 0;

  const comparator = new DiffComparator();

  // ── calculateMatchScore ───────────────────────────────────────────

  test('calculateMatchScore: handles empty inputs', () => {
    const result = comparator.calculateMatchScore('', '');
    assert.strictEqual(result.score, 1.0);
    assert.strictEqual(result.commonTokens, 0);
    assert.strictEqual(result.totalTokens, 0);
  });

  test('calculateMatchScore: correct tokenization with whitespace', () => {
    const result = comparator.calculateMatchScore('fix login bug', 'fixed login system bug');
    assert.ok(result.score >= 0.4);
  });

  test('calculateMatchScore: filters stop words and short tokens', () => {
    const result = comparator.calculateMatchScore(
      'this is a fix for the login bug',
      'fix login bug'
    );
    assert.ok(Math.abs(result.score - 1.0) < 1e-9);
  });

  test('calculateMatchScore: handles unicode/CJK text correctly', () => {
    const result = comparator.calculateMatchScore(
      '修复登录bug',
      '修复了登录系统的bug'
    );
    assert.ok(result.score >= 0.5);
  });

  test('calculateMatchScore: deduplicates tokens on both sides', () => {
    const result = comparator.calculateMatchScore(
      'fix fix fix login login',
      'fix login'
    );
    assert.strictEqual(result.score, 1.0);
  });

  // ── shouldBlockChange ─────────────────────────────────────────────

  test('shouldBlockChange: defaults to dryRun mode', () => {
    const result = comparator.shouldBlockChange('add ui', 'removed entire database layer');
    assert.strictEqual(result.shouldBlock, false);
    assert.ok(result.matchScore < 0.3);
    assert.strictEqual(result.dryRun, true);
  });

  test('shouldBlockChange: respects threshold config', () => {
    const result = comparator.shouldBlockChange('a', 'b', { threshold: 0.1, dryRun: false });
    assert.strictEqual(result.shouldBlock, true);
  });

  test('shouldBlockChange: returns full metadata for observability', () => {
    const result = comparator.shouldBlockChange('fix bug', 'fixed bug');
    assert.ok('matchScore' in result);
    assert.ok('threshold' in result);
    assert.ok('reason' in result);
    assert.ok('dryRun' in result);
    assert.ok('shouldBlock' in result);
  });

  // ── Backward compatibility ────────────────────────────────────────

  test('parseDeclaration: existing functionality preserved', () => {
    const result = comparator.parseDeclaration('modify login.js');
    assert.strictEqual(result.files[0], 'login.js');
  });

  // ── Summary ───────────────────────────────────────────────────────

  console.log('\n=== Test Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  if (require.main === module) {
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
