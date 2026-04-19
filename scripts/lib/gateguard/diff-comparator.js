/**
 * GateGuard Phase 3 - Diff Comparator
 * 声明与实际变更对比逻辑
 * 
 * 核心能力:
 * - 解析用户声明的变更范围
 * - 分析 git diff 实际变更内容
 * - 精确识别漏报的风险点
 */

class DiffComparator {
  constructor() {
    this.declarationPatterns = {
      file: /(?:modify|change|update|delete|add|remove)\s+(\S+\.(?:js|md|json|yml))/gi,
      function: /(?:modify|change|update|fix)\s+(\w+)\s+(?:function|method)/gi,
      field: /(?:modify|change|update|remove|delete)\s+(\w+)\s+(?:field|property|export)/gi,
      impact: /(?:impact|affect)\s+(.+?)(?:\.|$)/gi
    };
  }

  /**
   * 解析用户声明的变更
   */
  parseDeclaration(declarationText) {
    const declared = {
      files: [],
      functions: [],
      fields: [],
      impacts: []
    };

    // 提取声明的文件
    let match;
    while ((match = this.declarationPatterns.file.exec(declarationText)) !== null) {
      declared.files.push(match[1]);
    }

    // 提取声明的函数
    while ((match = this.declarationPatterns.function.exec(declarationText)) !== null) {
      declared.functions.push(match[1]);
    }

    // 提取声明的字段
    while ((match = this.declarationPatterns.field.exec(declarationText)) !== null) {
      declared.fields.push(match[1]);
    }

    // 提取声明的影响
    while ((match = this.declarationPatterns.impact.exec(declarationText)) !== null) {
      declared.impacts.push(match[1].trim());
    }

    return declared;
  }

  /**
   * 分析实际 git diff
   */
  analyzeActualDiff(diffContent) {
    const actual = {
      modifiedFiles: [],
      deletedExports: [],
      addedExports: [],
      modifiedFunctions: [],
      deletedFunctions: [],
      changedSignatures: []
    };

    const lines = diffContent.split('\n');
    let currentFile = null;

    for (const line of lines) {
      // 识别变更文件
      if (line.startsWith('diff --git')) {
        currentFile = line.split(' b/')[1];
        if (currentFile) actual.modifiedFiles.push(currentFile);
        continue;
      }

      if (!currentFile) continue;

      // 识别导出变更
      if (line.startsWith('-module.exports.') || line.startsWith('- module.exports.')) {
        const field = line.match(/module\.exports\.(\w+)/);
        if (field) actual.deletedExports.push({ file: currentFile, field: field[1] });
      }

      if (line.startsWith('+module.exports.') || line.startsWith('+ module.exports.')) {
        const field = line.match(/module\.exports\.(\w+)/);
        if (field) actual.addedExports.push({ file: currentFile, field: field[1] });
      }

      // 识别函数变更
      if (line.startsWith('-function ') || line.startsWith('- function ')) {
        const fn = line.match(/function\s+(\w+)/);
        if (fn) actual.deletedFunctions.push({ file: currentFile, function: fn[1] });
      }

      if (line.startsWith('+function ') || line.startsWith('+ function ')) {
        const fn = line.match(/function\s+(\w+)/);
        if (fn) {
          const existing = actual.deletedFunctions.find(d => 
            d.file === currentFile && d.function === fn[1]
          );
          if (existing) {
            actual.changedSignatures.push({ file: currentFile, function: fn[1] });
            actual.deletedFunctions = actual.deletedFunctions.filter(d => d !== existing);
          }
        }
      }
    }

    return actual;
  }

  /**
   * 对比声明与实际变更
   */
  compare(declarationText, diffContent) {
    const declared = this.parseDeclaration(declarationText);
    const actual = this.analyzeActualDiff(diffContent);
    const discrepancies = [];

    // 检查未声明的文件变更
    actual.modifiedFiles.forEach(file => {
      if (!declared.files.some(f => file.includes(f))) {
        discrepancies.push({
          type: 'undeclared_file',
          severity: 'low',
          file,
          message: `变更了未声明的文件: ${file}`
        });
      }
    });

    // 检查未声明的导出删除
    actual.deletedExports.forEach(({ file, field }) => {
      if (!declared.fields.includes(field) && !declared.files.some(f => file.includes(f))) {
        discrepancies.push({
          type: 'undeclared_export_delete',
          severity: 'high',
          file,
          field,
          message: `删除了导出字段但未声明: ${file} -> ${field}`
        });
      }
    });

    // 检查未声明的函数签名变更
    actual.changedSignatures.forEach(({ file, function: fn }) => {
      if (!declared.functions.includes(fn) && !declared.files.some(f => file.includes(f))) {
        discrepancies.push({
          type: 'undeclared_signature_change',
          severity: 'medium',
          file,
          function: fn,
          message: `修改了函数签名但未声明: ${file} -> ${fn}()`
        });
      }
    });

    // 检查未声明的函数删除
    actual.deletedFunctions.forEach(({ file, function: fn }) => {
      if (!declared.functions.includes(fn) && !declared.files.some(f => file.includes(f))) {
        discrepancies.push({
          type: 'undeclared_function_delete',
          severity: 'high',
          file,
          function: fn,
          message: `删除了函数但未声明: ${file} -> ${fn}()`
        });
      }
    });

    return {
      declared,
      actual,
      discrepancies,
      matchRate: this.calculateMatchRate(declared, actual)
    };
  }

  /**
   * 计算声明与实际的匹配度
   */
  calculateMatchRate(declared, actual) {
    let total = 0;
    let matches = 0;

    total += actual.modifiedFiles.length;
    matches += actual.modifiedFiles.filter(f => declared.files.some(d => f.includes(d))).length;

    total += actual.deletedExports.length;
    matches += actual.deletedExports.filter(e => declared.fields.includes(e.field)).length;

    total += actual.changedSignatures.length;
    matches += actual.changedSignatures.filter(s => declared.functions.includes(s.function)).length;

    return total > 0 ? matches / total : 1.0;
  }

  /**
   * 检查是否存在重大漏报
   */
  hasCriticalMisstatement(result) {
    return result.discrepancies.some(d => d.severity === 'high');
  }
}

module.exports = DiffComparator;
