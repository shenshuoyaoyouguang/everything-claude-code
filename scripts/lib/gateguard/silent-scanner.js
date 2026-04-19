/**
 * GateGuard Phase 3 - Silent Scanner Engine
 * 静默校验异步引擎 - 不拦截用户操作，后台扫描变更影响
 * 
 * 核心原则: 90% 操作完全无感通过，只有当用户漏报风险时才拦截
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const execFileAsync = promisify(execFile);

const isValidFilePath = (file) => {
  // 禁止路径穿越、绝对路径、命令注入特殊字符
  if (typeof file !== 'string') return false;
  if (file.includes('..') || path.isAbsolute(file) || /[;&|`$()<>]/.test(file)) {
    return false;
  }
  // 验证文件解析后仍在当前工作目录内
  try {
    const resolved = path.resolve(file);
    const cwd = path.resolve('./');
    return resolved.startsWith(cwd + path.sep);
  } catch {
    return false;
  }
};

class SilentScanner {
  constructor(options = {}) {
    this.timeout = options.timeout || 5000;
    this.maxParallel = options.maxParallel || 3;
    this.activeScans = new Map();
    this.pendingCallbacks = new Map();
  }

  /**
   * 启动静默扫描 (非阻塞)
   * @param {string} editId 编辑操作唯一标识
   * @param {Object} change 用户声明的变更
   * @param {Function} onRiskDetected 风险发现回调
   */
  startScan(editId, change, onRiskDetected) {
    if (this.activeScans.has(editId)) {
      return;
    }

    const scanPromise = this.runFullScan(change);
    this.activeScans.set(editId, scanPromise);
    
    scanPromise
      .then(risks => {
        this.activeScans.delete(editId);
        if (risks.length > 0 && onRiskDetected) {
          onRiskDetected(editId, risks);
        }
      })
      .catch(err => {
        console.error('[SilentScanner] Scan failed:', err.message);
        this.activeScans.delete(editId);
      });
  }

  /**
   * 运行完整扫描流程
   */
  async runFullScan(change) {
    const risks = [];
    
    // 过滤非法文件路径
    const validFiles = (change.files || []).filter(isValidFilePath);
    
    // 1. 扫描所有引用
    const references = await this.scanReferences(validFiles);
    
    // 2. 扫描变更实际影响
    const actualImpact = await this.scanActualImpact(validFiles);
    
    // 3. 对比声明与实际
    const mismatches = this.compareDeclaredVsActual(change.declaredImpact, actualImpact);
    
    // 4. 只有当存在漏报时才返回风险
    mismatches.forEach(mismatch => {
      if (!this.isExpectedRisk(mismatch, change)) {
        risks.push({
          type: 'undeclared_impact',
          severity: 'medium',
          declared: change.declaredImpact,
          actual: mismatch.actual,
          file: mismatch.file,
          message: `声明变更与实际不符: ${mismatch.description}`
        });
      }
    });

    return risks;
  }

  /**
   * 扫描文件引用
   */
  async scanReferences(files) {
    const references = new Map();
    
    for (const file of files) {
      try {
        const { stdout } = await execFileAsync('grep', [
          '-r', '--include=*.js', '--include=*.md',
          file, './'
        ], { timeout: this.timeout });
        
        const lines = stdout.trim().split('\n').filter(Boolean);
        references.set(file, lines.length);
      } catch (err) {
        // grep 返回非 0 表示未找到引用，属于正常情况
        references.set(file, 0);
      }
    }
    
    return references;
  }

  /**
   * 扫描实际变更影响
   */
  async scanActualImpact(files) {
    const impact = {
      exports: [],
      imports: [],
      functionSignatures: [],
      exportedFields: []
    };

    for (const file of files) {
      try {
        const { stdout } = await execFileAsync('git', [
          'diff', '--no-index', '/dev/null', file
        ], { timeout: this.timeout });
        
        // 提取导出变更
        const exportChanges = stdout.match(/^[+-]\s*module\.exports\./gm) || [];
        impact.exportedFields.push(...exportChanges.map(line => line.trim()));
        
        // 提取函数签名变更
        const functionChanges = stdout.match(/^[+-]\s*function\s+\w+/gm) || [];
        impact.functionSignatures.push(...functionChanges.map(line => line.trim()));
        
      } catch (err) {
        continue;
      }
    }

    return impact;
  }

  /**
   * 对比声明与实际变更
   */
  compareDeclaredVsActual(declared, actual) {
    const mismatches = [];
    
    // 检查是否存在未声明的导出删除
    actual.exportedFields.forEach(field => {
      if (field.startsWith('-') && !declared.includes(field.slice(1))) {
        mismatches.push({
          type: 'deleted_export',
          actual: field,
          description: `删除了导出字段但未声明: ${field.slice(1)}`
        });
      }
    });

    // 检查是否存在未声明的函数签名变更
    actual.functionSignatures.forEach(sig => {
      if (sig.startsWith('-') && !declared.some(d => d.includes(sig.slice(1).split(' ')[1]))) {
        mismatches.push({
          type: 'changed_signature',
          actual: sig,
          description: `修改了函数签名但未声明: ${sig.slice(1)}`
        });
      }
    });

    return mismatches;
  }

  /**
   * 检查风险是否在预期范围内
   */
  isExpectedRisk(mismatch, change) {
    // 用户已经展示了影响分析
    if (change.hasImpactAnalysis) return true;
    
    // 用户已经运行了检查命令
    if (change.hasRunChecks) return true;
    
    // 风险在用户声明的范围内
    if (change.declaredImpact.some(d => mismatch.description.includes(d))) return true;
    
    return false;
  }

  /**
   * 取消扫描
   */
  cancelScan(editId) {
    this.activeScans.delete(editId);
    this.pendingCallbacks.delete(editId);
  }

  /**
   * 销毁实例
   */
  destroy() {
    this.activeScans.clear();
    this.pendingCallbacks.clear();
  }
}

module.exports = SilentScanner;
