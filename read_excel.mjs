import XLSX from 'xlsx';

// Read the workbook with formulas
const wb = XLSX.readFile('C:/Users/tvf19/Desktop/Analiza wskażnikowa 2025-2021 wzór.xlsx', {cellFormula: true});

console.log("=== WORKBOOK SHEET NAMES ===");
console.log(wb.SheetNames);
console.log("\n");

// Process each sheet
wb.SheetNames.forEach(sheetName => {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`SHEET: ${sheetName}`);
  console.log(`${"=".repeat(60)}`);
  
  const ws = wb.Sheets[sheetName];
  const range = XLSX.utils.decode_range(ws['!ref']);
  
  console.log(`Sheet dimensions: ${ws['!ref']}`);
  console.log("\n");
  
  // Create a map of all data with formulas
  const data = {};
  
  for (let row = range.s.r; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({r: row, c: col});
      const cell = ws[cellRef];
      if (cell) {
        if (!data[row]) data[row] = {};
        data[row][col] = cell;
      }
    }
  }
  
  // Output data
  const colHeaders = [];
  for (let c = 0; c <= range.e.c; c++) {
    colHeaders.push(XLSX.utils.encode_col(c));
  }
  
  console.log(`Columns: ${colHeaders.join(" | ")}`);
  console.log("-".repeat(150));
  
  for (let row = range.s.r; row <= range.e.r; row++) {
    const rowData = data[row] || {};
    const rowNum = row + 1;
    const rowContent = [];
    
    for (let col = 0; col <= range.e.c; col++) {
      const cell = rowData[col];
      if (cell) {
        // Show formula if exists, otherwise show value
        let cellDisplay = "";
        if (cell.f) {
          cellDisplay = `[FORMULA: ${cell.f}]`;
        } else if (cell.v !== undefined) {
          cellDisplay = String(cell.v);
        }
        rowContent.push(cellDisplay);
      } else {
        rowContent.push("");
      }
    }
    
    console.log(`Row ${rowNum}: ${rowContent.join(" | ")}`);
  }
});

console.log("\n\n=== END OF REPORT ===");
