'use strict';

const CHANGE_TYPES = {
  FUNCTION_SIGNATURE: 'function_signature',
  FUNCTION_BODY: 'function_body',
  VARIABLE: 'variable',
  EXPORT: 'export',
  IMPORT: 'import',
  COMMENT: 'comment',
  WHITESPACE: 'whitespace'
};

function analyzeDiff(oldContent, newContent) {
  if (typeof oldContent !== 'string' || typeof newContent !== 'string') {
    throw new TypeError('Both oldContent and newContent must be strings');
  }

  const oldLines = oldContent.split(/\r?\n/);
  const newLines = newContent.split(/\r?\n/);
  const changes = [];

  // Simple line-based diff algorithm
  let i = 0, j = 0;
  
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      i++;
      j++;
      continue;
    }

    // Find matching lines ahead
    let matchFound = false;
    for (let lookAhead = 1; lookAhead <= Math.min(5, oldLines.length - i, newLines.length - j); lookAhead++) {
      if (oldLines[i + lookAhead] === newLines[j]) {
        // Deleted lines
        for (let k = 0; k < lookAhead; k++) {
          changes.push({
            type: 'delete',
            line: i + 1 + k,
            content: oldLines[i + k],
            changeType: _classifyChange(oldLines[i + k])
          });
        }
        i += lookAhead;
        matchFound = true;
        break;
      }
      if (oldLines[i] === newLines[j + lookAhead]) {
        // Inserted lines
        for (let k = 0; k < lookAhead; k++) {
          changes.push({
            type: 'insert',
            line: j + 1 + k,
            content: newLines[j + k],
            changeType: _classifyChange(newLines[j + k])
          });
        }
        j += lookAhead;
        matchFound = true;
        break;
      }
    }

    if (!matchFound) {
      if (i < oldLines.length) {
        changes.push({
          type: 'delete',
          line: i + 1,
          content: oldLines[i],
          changeType: _classifyChange(oldLines[i])
        });
        i++;
      }
      if (j < newLines.length) {
        changes.push({
          type: 'insert',
          line: j + 1,
          content: newLines[j],
          changeType: _classifyChange(newLines[j])
        });
        j++;
      }
    }
  }

  return changes;
}

function _classifyChange(line) {
  const trimmed = line.trim();
  
  if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('#')) {
    return CHANGE_TYPES.COMMENT;
  }
  if (trimmed === '' || /^\s+$/.test(line)) {
    return CHANGE_TYPES.WHITESPACE;
  }
  if (/^(?:const|let|var)\s+\w+/.test(trimmed)) {
    return CHANGE_TYPES.VARIABLE;
  }
  if (/^(?:import|require)\b/.test(trimmed)) {
    return CHANGE_TYPES.IMPORT;
  }
  if (/^(?:export|module\.exports)\b/.test(trimmed)) {
    return CHANGE_TYPES.EXPORT;
  }
  if (/^(?:function|async\s+function)\s+\w+|^\w+\s*=\s*(?:async\s+)?\(/.test(trimmed)) {
    return CHANGE_TYPES.FUNCTION_SIGNATURE;
  }
  if (/^\s*(?:if|for|while|return|const|let|var)\b/.test(trimmed)) {
    return CHANGE_TYPES.FUNCTION_BODY;
  }
  
  return CHANGE_TYPES.FUNCTION_BODY;
}

module.exports = { analyzeDiff, CHANGE_TYPES, _classifyChange };
