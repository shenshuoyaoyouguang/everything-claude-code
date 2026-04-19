/**
 * GateGuard Phase 3 - Trust Score System
 * 信任积分体系 - 动态调整拦截策略
 * 
 * 核心规则:
 * - 如实描述变更: +5
 * - 主动展示完整影响面: +10
 * - 漏报变更: -50
 * - 连续 10 次诚实: 获得一次豁免权
 * - 信任分 >100: 进入观察模式
 */

class TrustScore {
  constructor(storage = null) {
    this.scores = new Map();
    this.consecutiveHonest = new Map();
    this.exemptions = new Map();
    this.storage = storage;
    this.THRESHOLD_OBSERVE = 100;
    this.THRESHOLD_EXEMPTION = 10;
    this.MAX_SCORE = 1000; // 整数溢出安全上限
  }

  /**
   * 获取用户当前信任分
   */
  getScore(userId) {
    return this.scores.get(userId) || 0;
  }

  /**
   * 用户如实报告变更 (原子操作: 消除竞态条件)
   */
  reportHonest(userId) {
    // 原子更新信任分
    this.scores.set(userId, Math.min(this.MAX_SCORE, this.getScore(userId) + 5));
    
    // 原子更新连续诚实计数
    const consecutive = (this.consecutiveHonest.get(userId) || 0) + 1;
    this.consecutiveHonest.set(userId, consecutive);
    
    // 连续诚实达到阈值时授予豁免权
    if (consecutive >= this.THRESHOLD_EXEMPTION) {
      this.grantExemption(userId);
      this.consecutiveHonest.set(userId, 0);
    }
    
    this.persist();
  }

  /**
   * 用户展示完整影响分析 (原子操作)
   */
  reportImpactAnalysis(userId) {
    this.scores.set(userId, Math.min(this.MAX_SCORE, this.getScore(userId) + 10));
    this.persist();
  }

  /**
   * 用户漏报变更 (原子操作)
   */
  reportMisstatement(userId) {
    this.scores.set(userId, Math.max(0, this.getScore(userId) - 50));
    this.consecutiveHonest.set(userId, 0);
    this.persist();
  }

  /**
   * 授予豁免权 (原子操作)
   */
  grantExemption(userId) {
    this.exemptions.set(userId, (this.exemptions.get(userId) || 0) + 1);
  }

  /**
   * 使用豁免权 (原子操作)
   */
  useExemption(userId) {
    const current = this.exemptions.get(userId) || 0;
    if (current > 0) {
      this.exemptions.set(userId, current - 1);
      this.persist();
      return true;
    }
    return false;
  }

  /**
   * 检查是否处于观察模式
   */
  isInObserveMode(userId) {
    return this.getScore(userId) >= this.THRESHOLD_OBSERVE;
  }

  /**
   * 检查是否应该拦截
   * @returns {boolean} true = 可以拦截, false = 信任用户
   */
  shouldIntercept(userId, riskLevel) {
    // 有豁免权时直接放行
    if (this.useExemption(userId)) {
      return false;
    }
    
    const score = this.getScore(userId);
    
    // 高信任用户只拦截严重风险
    if (score >= 200) {
      return riskLevel === 'critical';
    }
    
    // 观察模式用户只拦截中高风险
    if (score >= this.THRESHOLD_OBSERVE) {
      return riskLevel === 'high' || riskLevel === 'critical';
    }
    
    // 普通用户拦截中高风险
    if (score >= 50) {
      return riskLevel === 'medium' || riskLevel === 'high' || riskLevel === 'critical';
    }
    
    // 低信任用户拦截所有风险
    return true;
  }

  /**
   * 获取用户状态
   */
  getStatus(userId) {
    return {
      score: this.getScore(userId),
      consecutiveHonest: this.consecutiveHonest.get(userId) || 0,
      exemptions: this.exemptions.get(userId) || 0,
      observeMode: this.isInObserveMode(userId)
    };
  }

  /**
   * 重置用户分数
   */
  reset(userId) {
    this.scores.delete(userId);
    this.consecutiveHonest.delete(userId);
    this.exemptions.delete(userId);
    this.persist();
  }

  /**
   * 持久化存储
   */
  persist() {
    if (this.storage && typeof this.storage.save === 'function') {
      this.storage.save({
        scores: Object.fromEntries(this.scores),
        consecutiveHonest: Object.fromEntries(this.consecutiveHonest),
        exemptions: Object.fromEntries(this.exemptions)
      });
    }
  }

  /**
   * 从存储加载
   */
  load(data) {
    if (data.scores) {
      this.scores = new Map(Object.entries(data.scores));
    }
    if (data.consecutiveHonest) {
      this.consecutiveHonest = new Map(Object.entries(data.consecutiveHonest));
    }
    if (data.exemptions) {
      this.exemptions = new Map(Object.entries(data.exemptions));
    }
  }
}

module.exports = TrustScore;
