import React, { useState } from 'react';

export default function GridList({
  items,
  selectedItem,
  onSelect,
  onAddItem,
  placeholderPrefix = 'item'
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newVal, setNewVal] = useState('');

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && newVal.trim()) {
      onAddItem(newVal.trim());
      setNewVal('');
      setIsAdding(false);
    } else if (e.key === 'Escape') {
      setIsAdding(false);
      setNewVal('');
    }
  };

  return (
    <div className="grid-container">
      {items.map((item, idx) => {
        const isSelected = Array.isArray(selectedItem)
          ? selectedItem.includes(item)
          : selectedItem === item;

        return (
          <div
            key={`${item}-${idx}`}
            className={`grid-item ${isSelected ? 'selected' : ''}`}
            onClick={() => onSelect && onSelect(item)}
          >
            [{item}]
          </div>
        );
      })}

      {/* Inline "+ add new" entry */}
      {isAdding ? (
        <div className="grid-item add-input-wrapper">
          <input
            type="text"
            className="inline-add-input"
            placeholder={`+ ${placeholderPrefix}...`}
            autoFocus
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (newVal.trim()) {
                onAddItem(newVal.trim());
                setNewVal('');
              }
              setIsAdding(false);
            }}
          />
        </div>
      ) : (
        <div
          className="grid-item add-new-btn"
          onClick={() => setIsAdding(true)}
          role="button"
          tabIndex={0}
        >
          + add new
        </div>
      )}
    </div>
  );
}
