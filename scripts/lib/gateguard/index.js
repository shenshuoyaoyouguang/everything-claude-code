/**
 * GateGuard Phase 3 Entry Point
 * 向后兼容的统一入口
 */

const SilentScanner = require('./silent-scanner');
const TrustScore = require('./trust-score');
const DiffComparator = require('./diff-comparator');

module.exports = {
  SilentScanner,
  TrustScore,
  DiffComparator,
  
  // 向后兼容: 与之前阶段保持相同的导出名称
  GateGuard: class GateGuard {
    constructor(options) {
      this.scanner = new SilentScanner(options);
      this.trust = new TrustScore(options?.storage);
      this.comparator = new DiffComparator();
    }
  }
};
