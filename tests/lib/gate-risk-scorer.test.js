const assert = require('assert');
const GateRiskScorer = require('../../scripts/lib/gate-risk-scorer');

describe('GateRiskScorer', () => {
  let scorer;

  beforeEach(() => {
    scorer = new GateRiskScorer();
  });

  describe('interface compliance', () => {
    it('should return valid GateRiskScore structure', () => {
      const result = scorer.calculate({
        tool_name: 'Read',
        tool_input: { file_path: '/tmp/test.txt' },
        session_id: 'test-session-123'
      });

      assert.strictEqual(typeof result.total_score, 'number');
      assert.strictEqual(typeof result.dimensions, 'object');
      assert.strictEqual(typeof result.metadata, 'object');
      assert.strictEqual(Array.isArray(result.evidence), true);

      // Verify all dimension fields exist
      assert.ok('operation_type' in result.dimensions);
      assert.ok('scope_impact' in result.dimensions);
      assert.ok('irreversibility' in result.dimensions);
      assert.ok('context_maturity' in result.dimensions);
      assert.ok('historical_pattern' in result.dimensions);

      // Verify metadata fields
      assert.strictEqual(result.metadata.scoring_version, '1.0.0');
      assert.strictEqual(typeof result.metadata.timestamp, 'number');
    });

    it('should produce score between 0 and 100', () => {
      const result = scorer.calculate({
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /' },
        session_id: 'test'
      });

      assert.ok(result.total_score >= 0);
      assert.ok(result.total_score <= 100);
    });
  });

  describe('risk scoring', () => {
    it('should score read operations as low risk', () => {
      const result = scorer.calculate({
        tool_name: 'Read',
        tool_input: { file_path: 'test.js' },
        session_id: 'test',
        context: { filesRead: 6, hasUncommittedChanges: true }
      });

      assert.ok(result.total_score < 40);
      assert.strictEqual(scorer.getRiskLevel(result.total_score), 'ALLOW');
    });

    it('should score destructive bash operations as high risk', () => {
      const result = scorer.calculate({
        tool_name: 'Bash',
        tool_input: { command: 'git clean -f' },
        session_id: 'test',
        context: { filesRead: 0 }
      });

      assert.ok(result.total_score >= 80);
      assert.strictEqual(scorer.getRiskLevel(result.total_score), 'BLOCK');
    });

    it('should properly weight dimensions', () => {
      const result = scorer.calculate({
        tool_name: 'Bash',
        tool_input: { command: 'npm install' },
        session_id: 'test'
      });

      // Total should be sum of weighted scores
      const expected = 
        result.dimensions.operation_type * 0.35 +
        result.dimensions.scope_impact * 0.25 +
        result.dimensions.irreversibility * 0.20 +
        result.dimensions.context_maturity * 0.15 +
        result.dimensions.historical_pattern * 0.05;

      assert.strictEqual(result.total_score, Math.round(expected));
    });
  });

  describe('risk levels', () => {
    it('should map scores correctly to levels', () => {
      assert.strictEqual(scorer.getRiskLevel(0), 'ALLOW');
      assert.strictEqual(scorer.getRiskLevel(39), 'ALLOW');
      assert.strictEqual(scorer.getRiskLevel(40), 'OBSERVE');
      assert.strictEqual(scorer.getRiskLevel(59), 'OBSERVE');
      assert.strictEqual(scorer.getRiskLevel(60), 'VERIFY');
      assert.strictEqual(scorer.getRiskLevel(79), 'VERIFY');
      assert.strictEqual(scorer.getRiskLevel(80), 'BLOCK');
      assert.strictEqual(scorer.getRiskLevel(100), 'BLOCK');
    });
  });

  describe('evidence chain', () => {
    it('should include evidence for every dimension', () => {
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
    });
  });
});
