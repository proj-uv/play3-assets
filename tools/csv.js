/**
 * Robust CSV parser with full RFC 4180 compliance and common real-world exceptions.
 * Handles:
 * - Quoted fields with embedded delimiters, newlines, and escaped quotes
 * - Empty fields, missing fields, extra fields
 * - Leading/trailing whitespace
 * - BOM (Byte Order Mark)
 * - Different line endings (\n, \r\n, \r)
 * - Optional header row
 * - Malformed lines (tries to recover)
 * - Comments (lines starting with #)
 * - Fields with embedded line breaks
 * - Trailing delimiters
 * - Spaces after delimiters
 */
function parseCSV(data, options = {}) {
  // Options
  const delimiter = options.delimiter || ',';
  const commentChar = options.commentChar || '#';
  const hasHeader = options.hasHeader !== false; // default true

  // Remove BOM if present
  if (data.charCodeAt(0) === 0xFEFF) {
    data = data.slice(1);
  }

  // Normalize line endings
  data = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // State machine for parsing
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  let lineStart = true;
  let prevChar = '';
  let curLineNum = 1;

  function pushField() {
    // Remove leading/trailing whitespace unless quoted
    if (!inQuotes && options.trim !== false) {
      field = field.trim();
    }
    // Unescape double quotes if quoted
    if (
      field.length >= 2 &&
      field.startsWith('"') &&
      field.endsWith('"')
    ) {
      field = field.slice(1, -1).replace(/""/g, '"');
    }
    row.push(field);
    field = '';
  }

  function pushRow() {
    // Ignore empty lines and comment lines
    if (
      row.length === 1 &&
      (row[0] === '' || row[0].trim() === '')
    ) {
      row = [];
      return;
    }
    if (
      row.length > 0 &&
      row[0].trim().startsWith(commentChar)
    ) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  }

  while (i < data.length) {
    const c = data[i];

    if (lineStart && c === commentChar) {
      // Skip comment line
      while (i < data.length && data[i] !== '\n') i++;
      lineStart = true;
      curLineNum++;
      i++;
      continue;
    }

    if (!inQuotes && (c === delimiter)) {
      pushField();
      lineStart = false;
      i++;
      continue;
    }

    if (!inQuotes && (c === '\n')) {
      pushField();
      pushRow();
      lineStart = true;
      curLineNum++;
      i++;
      continue;
    }

    if (!inQuotes && (c === '\0')) {
      // Null char, treat as end of field/row
      pushField();
      pushRow();
      lineStart = true;
      i++;
      continue;
    }

    if (c === '"') {
      if (!inQuotes) {
        // Start of quoted field
        if (field === '') {
          inQuotes = true;
          field += c;
        } else {
          // Malformed: quote in middle of unquoted field
          field += c;
        }
      } else {
        // inQuotes
        if (data[i + 1] === '"') {
          // Escaped quote
          field += '"';
          i++;
        } else {
          // End of quoted field
          inQuotes = false;
          field += c;
        }
      }
      lineStart = false;
      i++;
      continue;
    }

    // Embedded newlines in quoted field
    if (c === '\n' && inQuotes) {
      field += '\n';
      curLineNum++;
      i++;
      continue;
    }

    // All other characters
    field += c;
    lineStart = false;
    i++;
  }

  // Handle last field/row
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }

  // Remove empty trailing rows
  while (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
    rows.pop();
  }

  // If no rows, return []
  if (rows.length === 0) return [];

  // Header
  let headers = [];
  let startIdx = 0;
  if (hasHeader) {
    headers = rows[0];
    startIdx = 1;
  } else {
    // Generate generic headers
    const maxLen = Math.max(...rows.map(r => r.length));
    for (let j = 0; j < maxLen; j++) headers.push('field' + (j + 1));
  }

  // Build objects
  const result = [];
  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i];
    // Pad or trim row to match headers
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = r[j] !== undefined ? r[j] : '';
    }
    result.push(obj);
  }
  return result;
}

// CSV 파싱시 줄바꿈이 필드 내부에 포함된 경우를 처리
function splitCSVLines(data) {
  const lines = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (c === '"') {
      // Check for escaped quote
      if (inQuotes && data[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
        cur += '"';
      }
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      // End of line (not inside quotes)
      // Handle \r\n as one line break
      if (c === '\r' && data[i + 1] === '\n') i++;
      if (cur.trim() !== '') lines.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.trim() !== '') lines.push(cur);
  return lines;
}
