(function initStudentCsv(globalScope) {
  'use strict';

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            quoted = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"' && field.length === 0) {
        quoted = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n') {
        row.push(field.replace(/\r$/, ''));
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
    }
    return rows;
  }

  const cp1252Specials = new Map([
    [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
    [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
    [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
    [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
    [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
    [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
    [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
  ]);

  function repairVietnamese(value) {
    if (typeof value !== 'string' || !/[ÃÄÂáºá»]/u.test(value)) return value;
    const bytes = [];
    for (const ch of value) {
      const point = ch.codePointAt(0);
      if (point <= 0xff) bytes.push(point);
      else if (cp1252Specials.has(point)) bytes.push(cp1252Specials.get(point));
      else return value;
    }
    const repaired = new TextDecoder('utf-8').decode(new Uint8Array(bytes));
    return repaired.includes('\ufffd') ? value : repaired;
  }

  function formatDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    return match ? `${match[3]}/${match[2]}/${match[1]}` : (value || '');
  }

  function naturalCompare(a, b) {
    return String(a).localeCompare(String(b), 'vi', { numeric: true, sensitivity: 'base' });
  }

  function parseStudentCsv(text) {
    const parsed = parseCsv(String(text || '').replace(/^\ufeff/, ''));
    if (parsed.length < 2) throw new Error('File CSV không có dữ liệu học sinh.');

    const headers = parsed[0].map((header) => header.trim());
    const column = Object.fromEntries(headers.map((name, index) => [name, index]));
    for (const required of ['ma_hs_so', 'thongtin']) {
      if (!(required in column)) throw new Error(`File CSV thiếu cột “${required}”.`);
    }

    const groups = new Map();
    const warnings = [];
    const seenKeys = new Map();

    for (let rowIndex = 1; rowIndex < parsed.length; rowIndex += 1) {
      const row = parsed[rowIndex];
      if (row.length === 1 && !row[0]) continue;

      let info;
      try {
        info = JSON.parse(row[column.thongtin]);
      } catch (error) {
        warnings.push(`Dòng ${rowIndex + 1}: không đọc được thông tin học sinh.`);
        continue;
      }

      const className = repairVietnamese(info.tenlop || info.malop || '').trim();
      const studentCode = String(row[column.ma_hs_so] || '').trim();
      if (!className || !studentCode) {
        warnings.push(`Dòng ${rowIndex + 1}: thiếu lớp hoặc mã học sinh.`);
        continue;
      }

      const duplicateNumber = (seenKeys.get(studentCode) || 0) + 1;
      seenKeys.set(studentCode, duplicateNumber);
      if (duplicateNumber > 1) {
        warnings.push(`Dòng ${rowIndex + 1}: mã học sinh ${studentCode} bị trùng; khi lưu có thể ghi đè ảnh cũ.`);
      }
      const student = {
        key: `${studentCode}::${rowIndex}`,
        code: studentCode,
        className,
        name: repairVietnamese(info.hoten || '').trim() || 'Chưa có tên',
        birthDate: formatDate(info.ngaysinh),
        rowNumber: rowIndex + 1,
        duplicateNumber,
      };
      if (!groups.has(className)) groups.set(className, []);
      groups.get(className).push(student);
    }

    const classNames = [...groups.keys()].sort(naturalCompare);
    for (const students of groups.values()) {
      students.sort((a, b) => naturalCompare(a.name, b.name));
    }

    const students = classNames.flatMap((className) => groups.get(className));
    if (!students.length) throw new Error('Không tìm thấy học sinh hợp lệ trong file CSV.');
    return { groups, classNames, students, warnings };
  }

  const api = { parseCsv, parseStudentCsv, repairVietnamese, formatDate, naturalCompare };
  globalScope.StudentCsv = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
