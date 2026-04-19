'use strict';

/**
 * GateGuard 差异对比引擎 - 迭代 #1
 * 对比用户描述的变更和实际代码diff
 */

function calculateMatchScore(description, diff) {
    // 迭代 #1: 简单关键词匹配骨架
    let score = 0;
    const descWords = String(description).toLowerCase().split(/\s+/);
    const diffWords = String(diff).toLowerCase().split(/\s+/);
    
    const common = descWords.filter(w => diffWords.includes(w));
    const matchRate = common.length / Math.max(1, descWords.length);
    
    return {
        score: Math.round(matchRate * 100),
        commonTerms: common.slice(0, 10),
        confidence: 'low'
    };
}

function shouldBlockChange(description, diff) {
    const match = calculateMatchScore(description, diff);
    // 迭代 #1: 永远不触发拦截，只返回评分
    return {
        shouldBlock: false,
        matchScore: match.score,
        reason: '灰度阶段仅评分不拦截'
    };
}

module.exports = { calculateMatchScore, shouldBlockChange };
