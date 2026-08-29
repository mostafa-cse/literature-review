import React from 'react';

/**
 * DashedBoxList Component
 * Dynamically maps key-value pair state arrays into editable dashed boxes.
 * Used for both 'Columns' (feature extraction) and 'Summary' (intuition, formulation, etc.).
 */
export function DashedBoxList({
  items = [],
  onChangeItem,
  onAddItem,
  onSplitItem,
  showActions = true,
  addButtonText = 'Add new',
  splitButtonText = 'Split Column'
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
      value: 'Extracted parameter value...'
    };
    onAddItem([...items, newEntry]);
  };

  const handleSplitClick = () => {
    if (onSplitItem) {
      onSplitItem();
    } else {
      // Default split behavior: duplicate last or add sub-features
      const splitEntries = [
        { key: 'Metric (Train)', value: 'Accuracy: 97.4%' },
        { key: 'Metric (Test)', value: 'Accuracy: 95.1%' }
      ];
      onAddItem([...items, ...splitEntries]);
    }
  };

  return (
    <div>
      {items.map((item, idx) => (
        <div className="dashed-box" key={`dashed-${idx}`}>
          <input
            type="text"
            className="dashed-col1"
            value={item.key || ''}
            placeholder="Column / Key"
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
        <div className="btn-group">
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
      )}
    </div>
  );
}
