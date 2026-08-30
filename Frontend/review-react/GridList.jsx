import React, { useState } from 'react';

/**
 * GridList Component
 * Dynamically renders Cluster, Domain, or Keywords in a 3-column grid.
 * Provides selection toggling, inline '+ add new' input, empty state handling, and right-aligned Save button.
 */
export function GridList({
  items = [],
  selectedItems = [], // Array for multi-select (e.g. keywords) or single string
  onSelect,
  onAddItem,
  onSave,
  saveButtonText = 'Save',
  showSaveButton = false,
  isMultiSelect = false,
  placeholder = 'Add new item...',
  emptyMessage = 'No items found. Click "+ add new" to create one.'
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newVal, setNewVal] = useState('');

  const isSelected = (item) => {
    if (isMultiSelect && Array.isArray(selectedItems)) {
      return selectedItems.includes(item);
    }
    return selectedItems === item;
  };

  const handleItemClick = (item) => {
    if (onSelect) {
      onSelect(item);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      submitNewItem();
    } else if (e.key === 'Escape') {
      setIsAdding(false);
      setNewVal('');
    }
  };

  const submitNewItem = () => {
    const trimmed = newVal.trim();
    if (trimmed) {
      onAddItem(trimmed);
      setNewVal('');
      setIsAdding(false);
    }
  };

  return (
    <div>
      <div className="grid-container">
        {items.length === 0 && !isAdding && (
          <div className="empty-taxonomy-state" style={{ gridColumn: '1 / -1', fontSize: '12px', color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic', padding: '6px 2px' }}>
            {emptyMessage}
          </div>
        )}

        {items.map((item, idx) => {
          const selected = isSelected(item);
          return (
            <div
              key={`${item}-${idx}`}
              className={`grid-item ${selected ? 'selected' : ''}`}
              onClick={() => handleItemClick(item)}
              title={`Click to ${selected ? 'deselect' : 'select'}: ${item}`}
            >
              {item}
            </div>
          );
        })}

        {/* Inline '+ add new' button or input */}
        <div className="grid-item add-new-btn">
          {isAdding ? (
            <input
              type="text"
              className="inline-add-input"
              placeholder={placeholder}
              value={newVal}
              autoFocus
              onChange={(e) => setNewVal(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={submitNewItem}
            />
          ) : (
            <a
              onClick={(e) => {
                e.preventDefault();
                setIsAdding(true);
              }}
            >
              + add new
            </a>
          )}
        </div>
      </div>

      {/* Right-aligned Save Button */}
      {showSaveButton && onSave && (
        <div className="section-action-bar">
          <button
            type="button"
            className="section-save-btn"
            onClick={onSave}
          >
            <span className="save-icon">💾</span> {saveButtonText}
          </button>
        </div>
      )}
    </div>
  );
}

export default GridList;
