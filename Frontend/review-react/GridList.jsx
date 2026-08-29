import React, { useState } from 'react';

/**
 * GridList Component
 * Dynamically renders Cluster, Domain, or Keywords in a 3-column grid.
 * Provides selection toggling and an inline '+ add new' input with Enter-to-add.
 */
export function GridList({
  items = [],
  selectedItems = [], // Array for multi-select (e.g. keywords) or single string
  onSelect,
  onAddItem,
  isMultiSelect = false,
  placeholder = 'Add new item...'
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
    <div className="grid-container">
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
  );
}
