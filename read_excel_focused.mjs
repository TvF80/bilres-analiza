import XLSX from 'xlsx';
import fs from 'fs';

// Read the workbook with formulas
const wb = XLSX.readFile('C:/Users/tvf19/Desktop/Analiza wskażnikowa 2025-2021 wzór.xlsx', {cellFormula: true});

let output = "";

output += "=== WORKBOOK SHEET NAMES ===\n";
output += wb.SheetNames.join("\n") + "\n\n";

// Define which sheets to process in detail
const detailSheets = ['BIL', 'RZiS', 'płynność finansowa', 'sprawność działania', 'zadłużenie', 'rentowność', 'dyskryminacyjne'];

detailSheets.forEach(sheetName => {
  if (!wb.SheetNames.includes(sheetName)) {
    output += `Sheet "${sheetName}" not found\n\n`;
    return;
  }
  
  output += `\n${"=".repeat(100)}\n`;
  output += `SHEET: ${sheetName}\n`;
  output += `${"=".repeat(100)}\n\n`;
  
  const ws = wb.Sheets[sheetName];
  const range = XLSX.utils.decode_range(ws['!ref']);
  
  output += `Sheet dimensions: ${ws['!ref']}\n\n`;
  
  // Get all rows
  for (let row = range.s.r; row <= range.e.r; row++) {
    const rowNum = row + 1;
    const cells = [];
    
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({r: row, c: col});
      const cell = ws[cellRef];
      
      if (cell) {
        let cellDisplay = "";
        if (cell.f) {
          // It's a formula
          cellDisplay = `[FORMULA: ${cell.f}]`;
        } else if (cell.v !== undefined) {
          // It's a value
          cellDisplay = String(cell.v);
        } else {
          cellDisplay = "[EMPTY]";
        }
        cells.push(cellDisplay);
      } else {
        cells.push("");
      }
    }
    
    // Only print rows that have content
    if (cells.some(c => c && c !== "")) {
      const colA = cells[0] || "";
      const colB = cells[1] || "";
      const colC = cells[2] || "";
      const colD = cells[3] || "";
      const colE = cells[4] || "";
      const colF = cells[5] || "";
      const colG = cells[6] || "";
      
      output += `Row ${rowNum}: A="${colA}" | B="${colB}" | C="${colC}" | D="${colD}" | E="${colE}" | F="${colF}" | G="${colG}"\n`;
    }
  }
});

// Write output to file
fs.writeFileSync('C:/Users/tvf19/exco-analiza/excel_output.txt', output);
console.log("Output written to excel_output.txt");
console.log(output.substring(0, 5000));
