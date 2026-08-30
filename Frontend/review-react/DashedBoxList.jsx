import React from 'react';

/**
 * DashedBoxList Component
 * Dynamically maps key-value pair state arrays into editable dashed boxes.
 * Used for dynamic survey extraction columns.
 */
export function DashedBoxList({
  items = [],
  onChangeItem,
  onAddItem,
  onSplitItem,
  onSave,
  showActions = true,
  showSaveButton = true,
  addButtonText = 'Add new',
  splitButtonText = 'Split Column',
  saveButtonText = 'Save',
  emptyMessage = 'No extraction columns defined yet. Click "+ Add new" to create one.'
}) {
  const handleKeyChange = (index, newKey) => {
    const updated = [...items];
    updated[index] = { ...updated[index], key: newKey };
    onChangeItem(updated);
  };

  const handleValueChange = (index, newVal) => {
    const updated = [...items];
    updated[index] = { ...updated[index], value: newVal };
    onChangeItem(updated);
  };

  const handleAddClick = () => {
    const newEntry = {
      key: `Feature_${items.length + 1}`,
      value: ''
    };
    onAddItem([...items, newEntry]);
  };

  const handleSplitClick = () => {
    if (onSplitItem) {
      onSplitItem();
    } else {
      const splitIdx = items.length + 1;
      const splitEntries = [
        { key: `Feature_${splitIdx}(TC)`, value: '' },
        { key: `Feature_${splitIdx}(SC)`, value: '' }
      ];
      onAddItem([...items, ...splitEntries]);
    }
  };

  return (
    <div>
      {items.length === 0 && (
        <div className="empty-columns-state" style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic', padding: '6px 2px 10px' }}>
          {emptyMessage}
        </div>
      )}

      {items.map((item, idx) => (
        <div className="dashed-box" key={`dashed-${idx}`}>
          <input
            type="text"
            className="dashed-col1"
            value={item.key || ''}
            placeholder="Column name"
            onChange={(e) => handleKeyChange(idx, e.target.value)}
          />
          <input
            type="text"
            className="dashed-col2"
            value={item.value || ''}
            placeholder="Extracted data or notes..."
            onChange={(e) => handleValueChange(idx, e.target.value)}
          />
        </div>
      ))}

      {showActions && (
        <div className="btn-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {splitButtonText && (
              <button
                type="button"
                className="action-btn"
                onClick={handleSplitClick}
              >
                {splitButtonText}
              </button>
            )}
            <button
              type="button"
              className="action-btn"
              onClick={handleAddClick}
            >
              {addButtonText}
            </button>
          </div>

          {showSaveButton && onSave && (
            <button
              type="button"
              className="section-save-btn"
              onClick={onSave}
            >
              <svg className="save-btn-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> {saveButtonText}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default DashedBoxList;
