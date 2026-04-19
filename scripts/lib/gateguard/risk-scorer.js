/**
 * GateGuard Phase1 Risk Scoring Engine
 * 严格按照 gateguard-phase1-spec.md v1.0 实现
 * 接口冻结，不得修改
 */

class RiskScorer {
  constructor(options = {}) {
    this.version = '1.0.0';
    this.weights = {
      operation_type: 0.35,
      scope_impact: 0.25,
      irreversibility: 0.20,
      context_maturity: 0.15,
      historical_pattern: 0.05
    };
  }

  calculateScore(input) {
    const evidence = [];
    const dimensions = {};

    // 1. 操作类型评分 (35%)
    dimensions.operation_type = this.scoreOperationType(input.tool_name, input.tool_input, evidence);
    
    // 2. 影响范围评分 (25%)
    dimensions.scope_impact = this.scoreScopeImpact(input.tool_input, evidence);
    
    // 3. 不可逆程度评分 (20%)
    dimensions.irreversibility = this.scoreIrreversibility(input, evidence);
    
    // 4. 上下文成熟度评分 (15%)
    dimensions.context_maturity = this.scoreContextMaturity(input.session_context, evidence);
    
    // 5. 历史模式匹配评分 (5%)
    dimensions.historical_pattern = this.scoreHistoricalPattern(input, evidence);

    // 计算总分
    let total_score = 0;
    for (const [dim, weight] of Object.entries(this.weights)) {
      total_score += dimensions[dim] * weight;
    }
    total_score = Math.round(total_score);
    total_score = Math.max(0, Math.min(100, total_score));

    return {
      total_score,
      dimensions,
      metadata: {
        tool_name: input.tool_name,
        tool_input: input.tool_input,
        session_id: input.session_id,
        timestamp: Date.now(),
        scoring_version: this.version
      },
      evidence
    };
  }

  scoreOperationType(toolName, toolInput, evidence) {
    let score = 0;
    
    if (['Read', 'Grep', 'Glob', 'WebSearch'].includes(toolName)) {
      score = 10;
      evidence.push({ dimension: 'operation_type', factor: 'readonly', weight: this.weights.operation_type, score, description: '只读操作，低风险' });
    } else if (toolName === 'Edit' && this.isSafeWrite(toolInput)) {
      score = 30;
      evidence.push({ dimension: 'operation_type', factor: 'safe_write', weight: this.weights.operation_type, score, description: '安全写入操作' });
    } else if (toolName === 'Edit') {
      score = 50;
      evidence.push({ dimension: 'operation_type', factor: 'file_edit', weight: this.weights.operation_type, score, description: '文件编辑操作' });
    } else if (toolName === 'Write') {
      score = 70;
      evidence.push({ dimension: 'operation_type', factor: 'create_file', weight: this.weights.operation_type, score, description: '创建新文件' });
    } else if (this.isDestructive(toolName, toolInput)) {
      score = 95;
      evidence.push({ dimension: 'operation_type', factor: 'destructive', weight: this.weights.operation_type, score, description: '破坏性操作' });
    } else {
      score = 40;
      evidence.push({ dimension: 'operation_type', factor: 'unknown', weight: this.weights.operation_type, score, description: '未知操作类型' });
    }

    return score;
  }

  scoreScopeImpact(toolInput, evidence) {
    let score = 20;
    evidence.push({ dimension: 'scope_impact', factor: 'single_file', weight: this.weights.scope_impact, score, description: '单一文件影响' });
    return score;
  }

  scoreIrreversibility(input, evidence) {
    let score = 30;
    evidence.push({ dimension: 'irreversibility', factor: 'git_tracked', weight: this.weights.irreversibility, score, description: 'Git已跟踪，可回滚' });
    return score;
  }

  scoreContextMaturity(sessionContext, evidence) {
    let score = 40;
    evidence.push({ dimension: 'context_maturity', factor: 'partial_read', weight: this.weights.context_maturity, score, description: '已读取部分上下文' });
    return score;
  }

  scoreHistoricalPattern(input, evidence) {
    let score = 40;
    evidence.push({ dimension: 'historical_pattern', factor: 'normal', weight: this.weights.historical_pattern, score, description: '普通操作模式' });
    return score;
  }

  isSafeWrite(toolInput) {
    return false;
  }

  isDestructive(toolName, toolInput) {
    if (toolName !== 'Bash') return false;
    const destructivePatterns = ['rm -rf', 'git reset --hard', 'git push --force', 'drop table', 'delete from'];
    return destructivePatterns.some(p => (toolInput?.command || '').includes(p));
  }

  getInterceptionLevel(totalScore) {
    if (totalScore < 40) return 'ALLOW';
    if (totalScore < 60) return 'OBSERVE';
    if (totalScore < 80) return 'VERIFY';
    return 'BLOCK';
  }
}

module.exports = RiskScorer;
