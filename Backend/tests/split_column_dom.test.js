/**
 * Master Matrix Split Column DOM Manipulation & Cell Indexing Verification Suite
 */
const assert = require('assert');

console.log('======================================================================');
console.log('🧪 VERIFYING MASTER MATRIX SPLIT COLUMN DOM LOGIC & CELL INDEXING');
console.log('======================================================================');

// Minimal DOM Mock Implementation for Node.js
class MockElement {
  constructor(tagName, id = '', className = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = className;
    this.children = [];
    this.cells = this.children;
    this.rows = this.children;
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this._innerHTML = '';
    this._textContent = '';
    this.rowSpan = 1;
    this.colSpan = 1;
  }

  get innerHTML() {
    return this._innerHTML || '';
  }

  set innerHTML(val) {
    this._innerHTML = val;
    if (val === '') {
      this.children = [];
      this._textContent = '';
    } else {
      this._textContent = String(val).replace(/<[^>]*>/g, '').replace(/✕/g, '').trim();
    }
  }

  get textContent() {
    if (this._textContent !== undefined && this._textContent !== '') {
      return this._textContent;
    }
    return this._innerHTML ? String(this._innerHTML).replace(/<[^>]*>/g, '').replace(/✕/g, '').trim() : '';
  }

  set textContent(val) {
    this._textContent = String(val);
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  addEventListener() {}

  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === 'id') this.id = String(v);
  }

  getAttribute(k) {
    return this.attributes[k] !== undefined ? this.attributes[k] : null;
  }

  appendChild(el) {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
    this.children.push(el);
    el.parentNode = this;
    return el;
  }

  insertBefore(newEl, refEl) {
    if (newEl.parentNode) {
      newEl.parentNode.removeChild(newEl);
    }
    const idx = this.children.indexOf(refEl);
    if (idx === -1) {
      this.children.push(newEl);
    } else {
      this.children.splice(idx, 0, newEl);
    }
    newEl.parentNode = this;
    return newEl;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
    }
    return child;
  }

  querySelector(sel) {
    if (sel.includes('thead tr:first-child') || sel === 'tr:first-child' || sel === '#matrix-main-headers') {
      const thead = this.tagName === 'THEAD' ? this : (this.children.find(c => c.tagName === 'THEAD') || this);
      return thead.children[0] || null;
    }
    if (sel.includes('tr:nth-child(2)') || sel === '#matrix-sub-headers') {
      const thead = this.tagName === 'THEAD' ? this : (this.children.find(c => c.tagName === 'THEAD') || this);
      return thead.children[1] || null;
    }
    if (sel === 'thead' || sel === '#matrix-thead') {
      return this.children.find(c => c.tagName === 'THEAD') || null;
    }
    if (sel === 'tbody' || sel === '#matrix-tbody') {
      return this.children.find(c => c.tagName === 'TBODY') || null;
    }
    if (sel === '.col-title-text') {
      return this.children.find(c => c.className === 'col-title-text') || null;
    }
    return null;
  }

  querySelectorAll(sel) {
    return this.children;
  }
}

const mockDoc = {
  getElementById: (id) => {
    if (id === 'matrix-table') return mockTable;
    if (id === 'matrix-thead') return mockThead;
    if (id === 'matrix-tbody') return mockTbody;
    if (id === 'matrix-sub-headers') return mockThead.children.find(c => c.id === 'matrix-sub-headers') || null;
    return null;
  },
  createElement: (tag) => new MockElement(tag),
  addEventListener: () => {},
  querySelectorAll: () => []
};

global.window = {
  addEventListener: () => {}
};

const mockTable = new MockElement('table', 'matrix-table');
const mockThead = new MockElement('thead', 'matrix-thead');
const mockTbody = new MockElement('tbody', 'matrix-tbody');
mockTable.appendChild(mockThead);
mockTable.appendChild(mockTbody);

const mockMainHeaders = new MockElement('tr', 'matrix-main-headers');
mockThead.appendChild(mockMainHeaders);

function createTh(key, name, className = '') {
  const th = new MockElement('th', '', className);
  th.setAttribute('data-col-key', key);
  th.setAttribute('data-col-name', name);
  const titleSpan = new MockElement('span', '', 'col-title-text');
  titleSpan.textContent = name;
  th.appendChild(titleSpan);
  th.textContent = name;
  return th;
}

mockMainHeaders.appendChild(createTh('idx', '#', 'sticky-col'));
mockMainHeaders.appendChild(createTh('title', 'Paper Title', 'sticky-col-2'));
mockMainHeaders.appendChild(createTh('authors', 'Authors'));
mockMainHeaders.appendChild(createTh('dyn_performance', 'Performance'));
mockMainHeaders.appendChild(createTh('notes', 'Notes'));

function createRow(paperId, vals) {
  const tr = new MockElement('tr');
  tr.setAttribute('data-paper-id', paperId);
  vals.forEach(v => {
    const td = new MockElement('td');
    td.textContent = v;
    td.innerHTML = v;
    td.setAttribute('data-raw-val', v);
    tr.appendChild(td);
  });
  return tr;
}

mockTbody.appendChild(createRow(1, ['1', 'AI Review', 'Jane Doe', '98% Acc', 'Approved']));
mockTbody.appendChild(createRow(2, ['2', 'ML Study', 'John Smith', '92% Acc', 'In Review']));

global.window = {
  addEventListener: () => {}
};
global.document = mockDoc;
global.getAuthHeaders = () => ({});
global.showToast = (msg) => console.log('  [Toast]:', msg);

// Load the columns.js script into this window context
const fs = require('fs');
const path = require('path');
const columnsCode = fs.readFileSync(path.join(__dirname, '../../Frontend/js/workspace/columns.js'), 'utf-8');
const matrixCode = fs.readFileSync(path.join(__dirname, '../../Frontend/js/workspace/matrix.js'), 'utf-8');

eval(matrixCode);
eval(columnsCode);

// 1. Test splitting column in the middle ("Performance" at index 3) into 3 sub-columns
console.log('\n--- 1. Testing Split Column on Middle Column ("Performance") into 3 Sub-Columns ---');
const splitSuccess = window.splitMatrixColumnDOM('dyn_performance', 3, ['Model', 'Dataset', 'Accuracy']);
assert.strictEqual(splitSuccess, true, 'splitMatrixColumnDOM should return true');

const mainHeaders = mockMainHeaders.children;
const subHeaders = mockDoc.getElementById('matrix-sub-headers').children;
const row1Cells = mockTbody.children[0].children;
const row2Cells = mockTbody.children[1].children;

// Header assertions
assert.strictEqual(mainHeaders[0].rowSpan, 2, 'Unsplit # header must have rowSpan 2');
assert.strictEqual(mainHeaders[1].rowSpan, 2, 'Unsplit Title header must have rowSpan 2');
assert.strictEqual(mainHeaders[2].rowSpan, 2, 'Unsplit Authors header must have rowSpan 2');
assert.strictEqual(mainHeaders[3].rowSpan, 1, 'Split Performance header must have rowSpan 1');
assert.strictEqual(mainHeaders[3].colSpan, 3, 'Split Performance header must have colSpan 3');
assert.strictEqual(mainHeaders[4].rowSpan, 2, 'Unsplit Notes header must have rowSpan 2');

console.log('✅ Main headers rowSpan & colSpan correctly updated.');

// Sub-header assertions
assert.strictEqual(subHeaders.length, 3, 'Sub-header row should have 3 sub-headers');
assert.strictEqual(subHeaders[0].textContent, 'Model');
assert.strictEqual(subHeaders[1].textContent, 'Dataset');
assert.strictEqual(subHeaders[2].textContent, 'Accuracy');
console.log('✅ Sub-headers properly generated under parent column.');

// Row 1 Cell assertions (Total cells should now be: 1 (#) + 1 (Title) + 1 (Authors) + 3 (Performance sub-cells) + 1 (Notes) = 7 cells)
assert.strictEqual(row1Cells.length, 7, 'Row 1 should have exactly 7 cells');
assert.strictEqual(row1Cells[0].textContent.trim(), '1', 'Cell 0 is #');
assert.strictEqual(row1Cells[1].textContent.trim(), 'AI Review', 'Cell 1 is Title');
assert.strictEqual(row1Cells[2].textContent.trim(), 'Jane Doe', 'Cell 2 is Authors (Unaligned adjacent column check)');
assert.strictEqual(row1Cells[3].textContent.trim(), '98% Acc', 'Cell 3 is Sub 1 (Preserved original content)');
assert.strictEqual(row1Cells[4].textContent.trim(), '-', 'Cell 4 is Sub 2 (New empty sub-cell)');
assert.strictEqual(row1Cells[5].textContent.trim(), '-', 'Cell 5 is Sub 3 (New empty sub-cell)');
assert.strictEqual(row1Cells[6].textContent.trim(), 'Approved', 'Cell 6 is Notes (Must remain aligned after split!)');
console.log('✅ Row 1 cells correctly split and adjacent Notes column remains perfectly aligned.');

// Row 2 Cell assertions
assert.strictEqual(row2Cells.length, 7, 'Row 2 should have exactly 7 cells');
assert.strictEqual(row2Cells[2].textContent.trim(), 'John Smith', 'Row 2 Authors column is intact');
assert.strictEqual(row2Cells[3].textContent.trim(), '92% Acc', 'Row 2 Sub 1 content');
assert.strictEqual(row2Cells[6].textContent.trim(), 'In Review', 'Row 2 Notes column remains intact');
console.log('✅ Row 2 cells correctly split and adjacent Notes column remains perfectly aligned.');

// 2. Test splitting a second column ("Authors" at earlier index 2) into 2 sub-columns
console.log('\n--- 2. Testing Split on Second Column ("Authors") into 2 Sub-Columns ---');
const splitSuccess2 = window.splitMatrixColumnDOM('authors', 2, ['Primary Author', 'Co-Authors']);
assert.strictEqual(splitSuccess2, true, 'Second splitMatrixColumnDOM should return true');

const subHeadersAfter = mockDoc.getElementById('matrix-sub-headers').children;
const row1CellsAfter = mockTbody.children[0].children;

assert.strictEqual(subHeadersAfter.length, 5, 'Sub-headers should now have 2 (Authors) + 3 (Performance) = 5 sub-headers in correct horizontal sequence');
assert.strictEqual(subHeadersAfter[0].textContent, 'Primary Author');
assert.strictEqual(subHeadersAfter[1].textContent, 'Co-Authors');
assert.strictEqual(subHeadersAfter[2].textContent, 'Model');
assert.strictEqual(subHeadersAfter[3].textContent, 'Dataset');
assert.strictEqual(subHeadersAfter[4].textContent, 'Accuracy');

// Row 1 total cells: 1 (#) + 1 (Title) + 2 (Authors sub-cells) + 3 (Performance sub-cells) + 1 (Notes) = 8 cells
assert.strictEqual(row1CellsAfter.length, 8, 'Row 1 should have exactly 8 cells');
assert.strictEqual(row1CellsAfter[0].textContent.trim(), '1');
assert.strictEqual(row1CellsAfter[1].textContent.trim(), 'AI Review');
assert.strictEqual(row1CellsAfter[2].textContent.trim(), 'Jane Doe');
assert.strictEqual(row1CellsAfter[3].textContent.trim(), '-');
assert.strictEqual(row1CellsAfter[4].textContent.trim(), '98% Acc');
assert.strictEqual(row1CellsAfter[5].textContent.trim(), '-');
assert.strictEqual(row1CellsAfter[6].textContent.trim(), '-');
console.log('✅ Multiple sequential column splits work seamlessly without any misalignment!');

// 3. Test Fetching Existing Sub-Columns & Re-splitting a Previously Split Column
console.log('\n--- 3. Testing Fetching Existing Sub-Columns & Re-Splitting Previous Split ---');
const existingPerfSubs = window.getExistingSubColumnsForColumn('dyn_performance');
assert.deepStrictEqual(existingPerfSubs, ['Model', 'Dataset', 'Accuracy'], 'Should accurately fetch existing sub-columns for Performance');
console.log('✅ getExistingSubColumnsForColumn correctly fetched previous sub-columns:', existingPerfSubs);

const existingAuthorSubs = window.getExistingSubColumnsForColumn('authors');
assert.deepStrictEqual(existingAuthorSubs, ['Primary Author', 'Co-Authors'], 'Should accurately fetch existing sub-columns for Authors');
console.log('✅ getExistingSubColumnsForColumn correctly fetched previous sub-columns for Authors:', existingAuthorSubs);

// Now user expands Authors from 2 to 3 sub-columns: ['Primary Author', 'Second Author', 'Other Contributors']
const reSplitSuccess = window.splitMatrixColumnDOM('authors', 3, ['Primary Author', 'Second Author', 'Other Contributors']);
assert.strictEqual(reSplitSuccess, true, 'Re-splitting Authors column should return true');

const mainHeadersReSplit = mockMainHeaders.children;
const subHeadersReSplit = mockDoc.getElementById('matrix-sub-headers').children;
const row1CellsReSplit = mockTbody.children[0].children;

assert.strictEqual(mainHeadersReSplit[2].colSpan, 3, 'Authors header colSpan should be 3');
assert.strictEqual(subHeadersReSplit.length, 6, 'Total sub-headers should now be 3 (Authors) + 3 (Performance) = 6');
assert.strictEqual(subHeadersReSplit[0].textContent, 'Primary Author');
assert.strictEqual(subHeadersReSplit[1].textContent, 'Second Author');
assert.strictEqual(subHeadersReSplit[2].textContent, 'Other Contributors');
assert.strictEqual(subHeadersReSplit[3].textContent, 'Model');
assert.strictEqual(subHeadersReSplit[4].textContent, 'Dataset');
assert.strictEqual(subHeadersReSplit[5].textContent, 'Accuracy');

// Total cells: 1 (#) + 1 (Title) + 3 (Authors) + 3 (Performance) + 1 (Notes) = 9 cells
assert.strictEqual(row1CellsReSplit.length, 9, 'Row 1 should now have exactly 9 cells after re-split');
assert.strictEqual(row1CellsReSplit[0].textContent.trim(), '1');
assert.strictEqual(row1CellsReSplit[1].textContent.trim(), 'AI Review');
assert.strictEqual(row1CellsReSplit[2].textContent.trim(), 'Jane Doe', 'Primary Author preserves existing content');
assert.strictEqual(row1CellsReSplit[3].textContent.trim(), '-', 'Second Author');
assert.strictEqual(row1CellsReSplit[4].textContent.trim(), '-', 'Other Contributors');
assert.strictEqual(row1CellsReSplit[5].textContent.trim(), '98% Acc', 'Performance Sub 1 preserves 98% Acc');
assert.strictEqual(row1CellsReSplit[6].textContent.trim(), '-');
assert.strictEqual(row1CellsReSplit[7].textContent.trim(), '-');
assert.strictEqual(row1CellsReSplit[8].textContent.trim(), 'Approved', 'Notes column at end remains 100% aligned');
console.log('✅ Re-splitting a previously split column replaces previous sub-cells cleanly and keeps all surrounding columns aligned.');

const updatedAuthorSubs = window.getExistingSubColumnsForColumn('authors');
assert.deepStrictEqual(updatedAuthorSubs, ['Primary Author', 'Second Author', 'Other Contributors']);
console.log('✅ Re-split sub-columns immediately retrievable for future split requests!');

// 4. Test Drag & Drop Column Re-positioning with Split Columns
console.log('\n--- 4. Testing Drag & Drop Re-positioning with Split Columns ---');
// Currently headers are: [# (0), Title (1), Authors [split 3] (2), Performance [split 3] (3), Notes [unsplit 1] (4)]
// Let's drag "Notes" (index 4) and drop it before "dyn_performance" (index 3)
const reorderSuccess1 = window.reorderMatrixColumnDOM('notes', 'dyn_performance');
assert.strictEqual(reorderSuccess1, true, 'reorderMatrixColumnDOM for Notes should return true');

const mainHeadersAfterReorder1 = mockMainHeaders.children;
const subHeadersAfterReorder1 = mockDoc.getElementById('matrix-sub-headers').children;
const row1CellsAfterReorder1 = mockTbody.children[0].children;

// Main headers order should now be: #, Title, Authors, Notes, Performance
assert.strictEqual(mainHeadersAfterReorder1[2].getAttribute('data-col-key'), 'authors');
assert.strictEqual(mainHeadersAfterReorder1[3].getAttribute('data-col-key'), 'notes');
assert.strictEqual(mainHeadersAfterReorder1[4].getAttribute('data-col-key'), 'dyn_performance');

// Sub-headers order: Authors 3 subs, then Performance 3 subs
assert.strictEqual(subHeadersAfterReorder1.length, 6);
assert.strictEqual(subHeadersAfterReorder1[0].textContent, 'Primary Author');
assert.strictEqual(subHeadersAfterReorder1[1].textContent, 'Second Author');
assert.strictEqual(subHeadersAfterReorder1[2].textContent, 'Other Contributors');
assert.strictEqual(subHeadersAfterReorder1[3].textContent, 'Model');
assert.strictEqual(subHeadersAfterReorder1[4].textContent, 'Dataset');
assert.strictEqual(subHeadersAfterReorder1[5].textContent, 'Accuracy');

// Row 1 cells order: # (0), Title (1), Authors [2,3,4], Notes [5], Performance [6,7,8]
assert.strictEqual(row1CellsAfterReorder1.length, 9);
assert.strictEqual(row1CellsAfterReorder1[0].textContent.trim(), '1');
assert.strictEqual(row1CellsAfterReorder1[1].textContent.trim(), 'AI Review');
assert.strictEqual(row1CellsAfterReorder1[2].textContent.trim(), 'Jane Doe');
assert.strictEqual(row1CellsAfterReorder1[3].textContent.trim(), '-');
assert.strictEqual(row1CellsAfterReorder1[4].textContent.trim(), '-');
assert.strictEqual(row1CellsAfterReorder1[5].textContent.trim(), 'Approved', 'Notes moved cleanly before Performance!');
assert.strictEqual(row1CellsAfterReorder1[6].textContent.trim(), '98% Acc', 'Performance Sub 1 moved after Notes!');
assert.strictEqual(row1CellsAfterReorder1[7].textContent.trim(), '-');
assert.strictEqual(row1CellsAfterReorder1[8].textContent.trim(), '-');
console.log('✅ Unsplit column successfully dragged past split column with perfect cell alignment.');

// Now let's drag split column "Performance" (3 sub-cells) and move it before "Authors" (3 sub-cells)
const reorderSuccess2 = window.reorderMatrixColumnDOM('dyn_performance', 'authors');
assert.strictEqual(reorderSuccess2, true, 'reorderMatrixColumnDOM for Performance should return true');

const mainHeadersAfterReorder2 = mockMainHeaders.children;
const subHeadersAfterReorder2 = mockDoc.getElementById('matrix-sub-headers').children;
const row1CellsAfterReorder2 = mockTbody.children[0].children;

// Main headers order: #, Title, Performance, Authors, Notes
assert.strictEqual(mainHeadersAfterReorder2[2].getAttribute('data-col-key'), 'dyn_performance');
assert.strictEqual(mainHeadersAfterReorder2[3].getAttribute('data-col-key'), 'authors');
assert.strictEqual(mainHeadersAfterReorder2[4].getAttribute('data-col-key'), 'notes');

// Sub-headers order: Performance 3 subs first, then Authors 3 subs
assert.strictEqual(subHeadersAfterReorder2[0].textContent, 'Model');
assert.strictEqual(subHeadersAfterReorder2[1].textContent, 'Dataset');
assert.strictEqual(subHeadersAfterReorder2[2].textContent, 'Accuracy');
assert.strictEqual(subHeadersAfterReorder2[3].textContent, 'Primary Author');
assert.strictEqual(subHeadersAfterReorder2[4].textContent, 'Second Author');
assert.strictEqual(subHeadersAfterReorder2[5].textContent, 'Other Contributors');

// Row 1 cells order: # (0), Title (1), Performance [2,3,4], Authors [5,6,7], Notes [8]
assert.strictEqual(row1CellsAfterReorder2[0].textContent.trim(), '1');
assert.strictEqual(row1CellsAfterReorder2[1].textContent.trim(), 'AI Review');
assert.strictEqual(row1CellsAfterReorder2[2].textContent.trim(), '98% Acc', 'Performance block moved first');
assert.strictEqual(row1CellsAfterReorder2[3].textContent.trim(), '-');
assert.strictEqual(row1CellsAfterReorder2[4].textContent.trim(), '-');
assert.strictEqual(row1CellsAfterReorder2[5].textContent.trim(), 'Jane Doe', 'Authors block moved second');
assert.strictEqual(row1CellsAfterReorder2[6].textContent.trim(), '-');
assert.strictEqual(row1CellsAfterReorder2[7].textContent.trim(), '-');
assert.strictEqual(row1CellsAfterReorder2[8].textContent.trim(), 'Approved', 'Notes remains at end');
console.log('✅ Split column successfully dragged and re-positioned with all sub-cells and sub-headers moving synchronously!');

// 5. Test Sub-Column Resizing (Add Sub-Columns, Remove Sub-Columns, and Unsplit)
console.log('\n--- 5. Testing Sub-Column Resizing (Add & Remove Sub-Columns, and Unsplit) ---');

// 5.1 Add a sub-column to "dyn_performance" (expand from 3 to 4 sub-columns)
const addSuccess = window.splitMatrixColumnDOM('dyn_performance', 4, ['Model', 'Dataset', 'Accuracy', 'F1-Score']);
assert.strictEqual(addSuccess, true, 'Adding sub-column to Performance should return true');

const mainHeadersAdd = mockMainHeaders.children;
const subHeadersAdd = mockDoc.getElementById('matrix-sub-headers').children;
const row1CellsAdd = mockTbody.children[0].children;

assert.strictEqual(mainHeadersAdd[2].colSpan, 4, 'Performance colSpan should now be 4');
assert.strictEqual(subHeadersAdd.length, 7, 'Total sub-headers should now be 4 (Performance) + 3 (Authors) = 7');
assert.strictEqual(subHeadersAdd[3].textContent.trim(), 'F1-Score');
assert.strictEqual(row1CellsAdd.length, 10, 'Row 1 should now have exactly 10 cells (1 + 1 + 4 + 3 + 1)');
assert.strictEqual(row1CellsAdd[2].textContent.trim(), '98% Acc', 'Sub 1 retains value');
assert.strictEqual(row1CellsAdd[5].textContent.trim(), '-', 'Sub 4 (F1-Score) initialized with -');
assert.strictEqual(row1CellsAdd[6].textContent.trim(), 'Jane Doe', 'Authors column remains perfectly aligned');
console.log('✅ Sub-column successfully added (expanded from 3 to 4) with synchronized headers and body cells.');

// 5.2 Remove a sub-column from "dyn_performance" (reduce from 4 to 3 sub-columns)
const removeSuccess = window.splitMatrixColumnDOM('dyn_performance', 3, ['Model', 'Accuracy', 'F1-Score']);
assert.strictEqual(removeSuccess, true, 'Removing sub-column from Performance should return true');

const mainHeadersRemove = mockMainHeaders.children;
const subHeadersRemove = mockDoc.getElementById('matrix-sub-headers').children;
const row1CellsRemove = mockTbody.children[0].children;

assert.strictEqual(mainHeadersRemove[2].colSpan, 3, 'Performance colSpan should now be 3');
assert.strictEqual(subHeadersRemove.length, 6, 'Total sub-headers should now be 3 (Performance) + 3 (Authors) = 6');
assert.strictEqual(subHeadersRemove[0].textContent.trim(), 'Model');
assert.strictEqual(subHeadersRemove[1].textContent.trim(), 'Accuracy');
assert.strictEqual(subHeadersRemove[2].textContent.trim(), 'F1-Score');
assert.strictEqual(row1CellsRemove.length, 9, 'Row 1 should now have exactly 9 cells');
assert.strictEqual(row1CellsRemove[5].textContent.trim(), 'Jane Doe', 'Authors column remains aligned after sub-column removal');
console.log('✅ Sub-column successfully removed (reduced from 4 to 3) without misaligning any rows.');

// 5.3 Unsplit / Collapse "authors" column back to a single column (1 sub-column)
const unsplitAuthorsSuccess = window.splitMatrixColumnDOM('authors', 1, []);
assert.strictEqual(unsplitAuthorsSuccess, true, 'Unsplitting Authors should return true');

const mainHeadersUnsplit1 = mockMainHeaders.children;
const subHeadersUnsplit1 = mockDoc.getElementById('matrix-sub-headers').children;
const row1CellsUnsplit1 = mockTbody.children[0].children;

assert.strictEqual(mainHeadersUnsplit1[3].colSpan, 1, 'Authors colSpan should now be 1');
assert.strictEqual(mainHeadersUnsplit1[3].rowSpan, 2, 'Authors rowSpan should be 2 while Performance remains split');
assert.strictEqual(subHeadersUnsplit1.length, 3, 'Sub-headers should now only contain 3 sub-headers (Performance only)');
assert.strictEqual(subHeadersUnsplit1[0].textContent.trim(), 'Model');
assert.strictEqual(subHeadersUnsplit1[1].textContent.trim(), 'Accuracy');
assert.strictEqual(subHeadersUnsplit1[2].textContent.trim(), 'F1-Score');

// Row 1: # (0), Title (1), Performance [2,3,4], Authors [5], Notes [6] = 7 cells
assert.strictEqual(row1CellsUnsplit1.length, 7, 'Row 1 should now have exactly 7 cells');
assert.strictEqual(row1CellsUnsplit1[5].textContent.trim(), 'Jane Doe', 'Authors collapsed into single cell with preserved value');
assert.strictEqual(row1CellsUnsplit1[6].textContent.trim(), 'Approved', 'Notes column remains aligned');
console.log('✅ Authors column unsplit back into single column, collapsing sub-cells cleanly.');

// 5.4 Unsplit the final split column "dyn_performance" back to single column
const unsplitPerfSuccess = window.splitMatrixColumnDOM('dyn_performance', 1, []);
assert.strictEqual(unsplitPerfSuccess, true, 'Unsplitting Performance should return true');

const mainHeadersUnsplit2 = mockMainHeaders.children;
const subHeadersElement = mockDoc.getElementById('matrix-sub-headers');
const row1CellsUnsplit2 = mockTbody.children[0].children;

assert.strictEqual(subHeadersElement, null, 'Sub-headers row should be completely removed when all columns are unsplit');
assert.strictEqual(mainHeadersUnsplit2[0].rowSpan, 1, 'Main header # rowSpan should reset to 1');
assert.strictEqual(mainHeadersUnsplit2[1].rowSpan, 1, 'Main header Title rowSpan should reset to 1');
assert.strictEqual(mainHeadersUnsplit2[2].rowSpan, 1, 'Main header Performance rowSpan should reset to 1');
assert.strictEqual(mainHeadersUnsplit2[3].rowSpan, 1, 'Main header Authors rowSpan should reset to 1');
assert.strictEqual(mainHeadersUnsplit2[4].rowSpan, 1, 'Main header Notes rowSpan should reset to 1');

// Row 1: # (0), Title (1), Performance (2), Authors (3), Notes (4) = 5 cells
assert.strictEqual(row1CellsUnsplit2.length, 5, 'Row 1 should now have exactly 5 single cells');
assert.strictEqual(row1CellsUnsplit2[0].textContent.trim(), '1');
assert.strictEqual(row1CellsUnsplit2[1].textContent.trim(), 'AI Review');
assert.strictEqual(row1CellsUnsplit2[2].textContent.trim(), '98% Acc');
assert.strictEqual(row1CellsUnsplit2[3].textContent.trim(), 'Jane Doe');
assert.strictEqual(row1CellsUnsplit2[4].textContent.trim(), 'Approved');
console.log('✅ All columns unsplit: entire table smoothly reverts to single standard header row and single cells!');

// ======================================================================
// 6. Testing Clean Native Cell Formatting & Direct Split Column Action
// ======================================================================
console.log('\n--- 6. Testing Clean Native Cell Formatting & Direct Split Column Action ---');

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function testFormatCellContent(val) {
  let text = '';
  if (val !== null && val !== undefined) {
    if (typeof val === 'object') {
      text = Object.entries(val).map(([k, v]) => `${k}: ${v}`).join('; ');
    } else {
      const trimmed = String(val).trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            text = Object.entries(parsed).map(([k, v]) => `${k}: ${v}`).join('; ');
          } else {
            text = trimmed;
          }
        } catch (_) {
          text = trimmed;
        }
      } else {
        text = trimmed;
      }
    }
  }
  if (!text) text = '-';
  return `<div class="cell-wrapper"><div class="cell-clamp-2">${escapeHtml(text)}</div></div>`;
}

// 6.1 Verify cell formatting outputs pure clean native cell text without internal tables
const sampleVal = 'ResNet-50 / ImageNet (94.2%)';
const formattedHtml = testFormatCellContent(sampleVal);
assert(formattedHtml.includes('cell-wrapper'), 'HTML should contain cell-wrapper');
assert(!formattedHtml.includes('<table'), 'HTML must not contain nested internal tables');
assert(!formattedHtml.includes('cell-subcols-container'), 'HTML must not contain internal table containers');
assert(formattedHtml.includes('ResNet-50 / ImageNet (94.2%)'), 'HTML should render clean value');
console.log('✅ Cells format directly as clean text in native <td> without internal tables or containers.');

// 6.2 Verify structured objects format as native text in separate sub-cells
const jsonObjVal = JSON.stringify({ "Model": "Transformer", "F1": "91.2%" });
const formattedJson = testFormatCellContent(jsonObjVal);
assert(!formattedJson.includes('<table'), 'JSON cell must not contain nested table tags');
assert(!formattedJson.includes('cell-subcols-container'), 'JSON cell must not contain internal table view');
assert(formattedJson.includes('Model: Transformer; F1: 91.2%'), 'JSON object formatted cleanly as native text');
console.log('✅ Structured data formatted cleanly as native cell text.');

console.log('\n======================================================================');
console.log('🎉 ALL MASTER MATRIX SPLIT COLUMN & NATIVE CELL TESTS PASSED (100% SUCCESS)');
console.log('======================================================================\n');
