(function initStudentXlsx(globalScope) {
  'use strict';

  const encoder = new TextEncoder();

  function xmlEscape(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  }

  function columnName(index) {
    let name = '';
    let value = index;
    while (value > 0) {
      value -= 1;
      name = String.fromCharCode(65 + (value % 26)) + name;
      value = Math.floor(value / 26);
    }
    return name;
  }

  function cellXml(value, row, column, style = 0) {
    const reference = `${columnName(column)}${row}`;
    if (typeof value === 'number') return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
    return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
  }

  function sheetXml(rows, widths) {
    const rowXml = rows.map((values, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const style = rowIndex === 0 ? 1 : 0;
      return `<row r="${rowNumber}">${values.map((value, columnIndex) => cellXml(value, rowNumber, columnIndex + 1, style)).join('')}</row>`;
    }).join('');
    const lastCell = `${columnName(rows[0].length)}${rows.length}`;
    const columns = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastCell}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${columns}</cols>
  <sheetData>${rowXml}</sheetData>
  <autoFilter ref="A1:${lastCell}"/>
</worksheet>`;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    };
  }

  function concatBytes(chunks) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  }

  function makeHeader(size, writer) {
    const bytes = new Uint8Array(size);
    writer(new DataView(bytes.buffer));
    return bytes;
  }

  function zipStore(files) {
    const localChunks = [];
    const centralChunks = [];
    const now = dosDateTime(new Date());
    let localOffset = 0;

    for (const file of files) {
      const name = encoder.encode(file.name);
      const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
      const checksum = crc32(data);
      const localHeader = makeHeader(30, (view) => {
        view.setUint32(0, 0x04034b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 0x0800, true);
        view.setUint16(8, 0, true);
        view.setUint16(10, now.time, true);
        view.setUint16(12, now.date, true);
        view.setUint32(14, checksum, true);
        view.setUint32(18, data.length, true);
        view.setUint32(22, data.length, true);
        view.setUint16(26, name.length, true);
        view.setUint16(28, 0, true);
      });
      localChunks.push(localHeader, name, data);

      const centralHeader = makeHeader(46, (view) => {
        view.setUint32(0, 0x02014b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 20, true);
        view.setUint16(8, 0x0800, true);
        view.setUint16(10, 0, true);
        view.setUint16(12, now.time, true);
        view.setUint16(14, now.date, true);
        view.setUint32(16, checksum, true);
        view.setUint32(20, data.length, true);
        view.setUint32(24, data.length, true);
        view.setUint16(28, name.length, true);
        view.setUint16(30, 0, true);
        view.setUint16(32, 0, true);
        view.setUint16(34, 0, true);
        view.setUint16(36, 0, true);
        view.setUint32(38, 0, true);
        view.setUint32(42, localOffset, true);
      });
      centralChunks.push(centralHeader, name);
      localOffset += localHeader.length + name.length + data.length;
    }

    const centralDirectory = concatBytes(centralChunks);
    const end = makeHeader(22, (view) => {
      view.setUint32(0, 0x06054b50, true);
      view.setUint16(4, 0, true);
      view.setUint16(6, 0, true);
      view.setUint16(8, files.length, true);
      view.setUint16(10, files.length, true);
      view.setUint32(12, centralDirectory.length, true);
      view.setUint32(16, localOffset, true);
      view.setUint16(20, 0, true);
    });
    return concatBytes([...localChunks, centralDirectory, end]);
  }

  function buildWorkbook({ students, classNames, groups, captured, absent }) {
    const listRows = [[
      'STT', 'Mã học sinh', 'Lớp', 'Họ và tên', 'Ngày sinh',
      'Điểm danh', 'Chụp ảnh', 'Trạng thái hiện tại',
    ]];
    students.forEach((student, index) => {
      const isAbsent = absent.has(student.key);
      const hasPhoto = captured.has(student.key);
      listRows.push([
        index + 1,
        student.code,
        student.className,
        student.name,
        student.birthDate || '',
        isAbsent ? 'Vắng mặt' : 'Có mặt',
        hasPhoto ? 'Đã chụp' : 'Chưa chụp',
        isAbsent ? 'Vắng mặt' : (hasPhoto ? 'Có mặt' : 'Chưa chụp'),
      ]);
    });

    const summaryRows = [['Lớp', 'Tổng số', 'Có mặt', 'Vắng mặt', 'Đã chụp', 'Chưa chụp', 'Tiến độ']];
    for (const className of classNames) {
      const classStudents = groups.get(className) || [];
      const absentCount = classStudents.filter((student) => absent.has(student.key)).length;
      const capturedCount = classStudents.filter((student) => captured.has(student.key)).length;
      const presentCount = classStudents.filter((student) => captured.has(student.key) && !absent.has(student.key)).length;
      const handledCount = classStudents.filter((student) => captured.has(student.key) || absent.has(student.key)).length;
      summaryRows.push([
        className,
        classStudents.length,
        presentCount,
        absentCount,
        capturedCount,
        classStudents.length - handledCount,
        `${handledCount}/${classStudents.length}`,
      ]);
    }

    const sheet1 = sheetXml(listRows, [7, 19, 10, 30, 15, 15, 15, 21]);
    const sheet2 = sheetXml(summaryRows, [12, 12, 12, 14, 12, 14, 14]);
    const created = new Date().toISOString();
    return new Blob([zipStore([
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
      { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Trạng thái chụp ảnh học sinh</dc:title><dc:creator>Tiểu Học Lương Thế Vinh</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created></cp:coreProperties>` },
      { name: 'docProps/app.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Ảnh học sinh LTV</Application></Properties>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Danh sách" sheetId="1" r:id="rId1"/><sheet name="Tổng hợp lớp" sheetId="2" r:id="rId2"/></sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF176B57"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
      { name: 'xl/worksheets/sheet1.xml', data: sheet1 },
      { name: 'xl/worksheets/sheet2.xml', data: sheet2 },
    ])], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  globalScope.StudentXlsx = { buildWorkbook };
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildWorkbook };
})(typeof window !== 'undefined' ? window : globalThis);
