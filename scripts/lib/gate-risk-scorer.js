/**
 * GateGuard Risk Scoring Engine - Phase 1
 * 
 * Implements frozen interface defined in gateguard-phase1-spec.md
 * DO NOT MODIFY INTERFACE DEFINITIONS - follow spec exactly
 */

const SCORING_VERSION = '1.0.0';
const WEIGHTS = {
  operation_type: 0.35,
  scope_impact: 0.25,
  irreversibility: 0.20,
  context_maturity: 0.15,
  historical_pattern: 0.05
};

/**
 * GateRiskScore implementation
 * @typedef {Object} GateRiskScore
 * @property {number} total_score - 0-100 total risk score
 * @property {Object} dimensions - individual dimension scores
 * @property {Object} metadata - scoring metadata
 * @property {Array} evidence - audit trail of scoring factors
 */

class GateRiskScorer {
  constructor() {
    this.weights = { ...WEIGHTS };
  }

  /**
   * Calculate risk score for a tool execution
   * @param {Object} input 
   * @param {string} input.tool_name - Name of tool being executed
   * @param {Object} input.tool_input - Tool input parameters
   * @param {string} input.session_id - Current session ID
   * @param {Object} input.context - Session context
   * @returns {GateRiskScore} Complete risk score
   */
  calculate(input) {
    const { tool_name, tool_input, session_id, context = {} } = input;
    const evidence = [];
    const dimensions = {};

    // Calculate each dimension
    dimensions.operation_type = this._scoreOperationType(tool_name, tool_input, evidence);
    dimensions.scope_impact = this._scoreScopeImpact(tool_input, evidence);
    dimensions.irreversibility = this._scoreIrreversibility(tool_input, context, evidence);
    dimensions.context_maturity = this._scoreContextMaturity(context, evidence);
    dimensions.historical_pattern = this._scoreHistoricalPattern(tool_name, context, evidence);

    // Calculate weighted total
    let total_score = 0;
    for (const [dim, weight] of Object.entries(this.weights)) {
      total_score += dimensions[dim] * weight;
    }

    // Ensure score stays within 0-100 bounds
    total_score = Math.min(100, Math.max(0, Math.round(total_score)));

    return {
      total_score,
      dimensions,
      metadata: {
        tool_name,
        tool_input,
        session_id,
        timestamp: Date.now(),
        scoring_version: SCORING_VERSION
      },
      evidence
    };
  }

  _scoreOperationType(toolName, toolInput, evidence) {
    let score = 0;
    let desc = '';

    if (toolName === 'Read' || toolName === 'Glob' || toolName === 'Grep') {
      score = 10;
      desc = 'Read-only operation';
    } else if (toolName === 'WebSearch') {
      score = 25;
      desc = 'External read operation';
    } else if (toolName === 'Edit') {
      score = 50;
      desc = 'File modification';
    } else if (toolName === 'Write') {
      score = 70;
      desc = 'File creation / overwrite';
    } else if (toolName === 'Bash') {
      // Check for destructive bash operations
      const cmd = (toolInput.command || '').toLowerCase();
      if (/rm|del|rmdir|format|chmod|chown|mv\s.*\s.*|git\s+reset|git\s+clean/.test(cmd)) {
        score = 90;
        desc = 'Potentially destructive shell operation';
      } else if (/npm|pnpm|yarn|node|ls|cat|echo|pwd/.test(cmd)) {
        score = 35;
        desc = 'Safe shell operation';
      } else {
        score = 65;
        desc = 'General shell execution';
      }
    } else {
      score = 40;
      desc = 'Unknown tool type';
    }

    evidence.push({
      dimension: 'operation_type',
      factor: 'tool_classification',
      weight: WEIGHTS.operation_type,
      score,
      description: desc
    });

    return score;
  }

  _scoreScopeImpact(toolInput, evidence) {
    let score = 0;
    let desc = '';

    const filePath = toolInput.file_path || '';

    if (filePath.includes('/tmp/') || filePath.includes('.tmp')) {
      score = 10;
      desc = 'Temporary file only';
    } else if (filePath && !filePath.includes('*') && !filePath.includes('**')) {
      score = 30;
      desc = 'Single file modification';
    } else if (/\.md$|\.txt$|\.json$/.test(filePath)) {
      score = 45;
      desc = 'Module level change';
    } else if (filePath.includes('*') || filePath.includes('**')) {
      score = 75;
      desc = 'Glob pattern / multiple files';
    } else if (filePath.includes('/.github/') || filePath.includes('package.json') || filePath.includes('.env')) {
      score = 95;
      desc = 'Global configuration / CI files';
    } else {
      score = 40;
      desc = 'Standard project file';
    }

    evidence.push({
      dimension: 'scope_impact',
      factor: 'file_scope',
      weight: WEIGHTS.scope_impact,
      score,
      description: desc
    });

    return score;
  }

  _scoreIrreversibility(toolInput, context, evidence) {
    let score = 0;
    let desc = '';

    if (context.hasUncommittedChanges) {
      score = 10;
      desc = 'Working tree has uncommitted changes';
    } else if (context.gitTracked) {
      score = 30;
      desc = 'File is tracked in git';
    } else if (toolInput.operation === 'create') {
      score = 50;
      desc = 'New file creation';
    } else if (toolInput.operation === 'overwrite') {
      score = 70;
      desc = 'Existing file overwrite';
    } else if (toolInput.command && /rm\s+-rf|del\s+\/s|git\s+clean\s+-f/.test(toolInput.command)) {
      score = 95;
      desc = 'Permanent deletion operation';
    } else {
      score = 40;
      desc = 'Standard modification';
    }

    evidence.push({
      dimension: 'irreversibility',
      factor: 'revertability',
      weight: WEIGHTS.irreversibility,
      score,
      description: desc
    });

    return score;
  }

  _scoreContextMaturity(context, evidence) {
    let score = 0;
    let desc = '';

    if (context.filesRead > 5) {
      score = 10;
      desc = 'Extensive prior file reads';
    } else if (context.filesRead >= 2) {
      score = 35;
      desc = 'Partial context established';
    } else if (context.filesRead === 1) {
      score = 55;
      desc = 'Minimal file read history';
    } else if (context.sessionLength < 3) {
      score = 75;
      desc = 'No prior context in session';
    } else {
      score = 90;
      desc = 'First operation in session';
    }

    evidence.push({
      dimension: 'context_maturity',
      factor: 'session_history',
      weight: WEIGHTS.context_maturity,
      score,
      description: desc
    });

    return score;
  }

  _scoreHistoricalPattern(toolName, context, evidence) {
    let score = 50;
    let desc = 'Neutral historical pattern';

    evidence.push({
      dimension: 'historical_pattern',
      factor: 'pattern_match',
      weight: WEIGHTS.historical_pattern,
      score,
      description: desc
    });

    return score;
  }

  /**
   * Get risk level based on total score
   * @param {number} score 
   * @returns {string} risk level
   */
  getRiskLevel(score) {
    if (score < 40) return 'ALLOW';
    if (score < 60) return 'OBSERVE';
    if (score < 80) return 'VERIFY';
    return 'BLOCK';
  }
}

module.exports = GateRiskScorer;
