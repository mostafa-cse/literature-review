import React from 'react';

export default function KeyValueEditor({
  pairs,
  onChange,
  onAddPair,
  onSplitColumn,
  showActions = false
}) {
  const handleKeyChange = (index, newKey) => {
    const updated = pairs.map((pair, i) =>
      i === index ? { ...pair, key: newKey } : pair
    );
    onChange(updated);
  };

  const handleValueChange = (index, newVal) => {
    const updated = pairs.map((pair, i) =>
      i === index ? { ...pair, value: newVal } : pair
    );
    onChange(updated);
  };

  return (
    <div className="key-value-editor">
      {pairs.map((pair, index) => (
        <div className="dashed-box" key={index}>
          <input
            type="text"
            className="dashed-col1-input"
            value={pair.key}
            placeholder="col_name"
            onChange={(e) => handleKeyChange(index, e.target.value)}
          />
          <input
            type="text"
            className="dashed-col2-input"
            value={pair.value}
            placeholder="Value.."
            onChange={(e) => handleValueChange(index, e.target.value)}
          />
        </div>
      ))}

      {showActions && (
        <div className="btn-group">
          <button
            type="button"
            className="action-btn"
            onClick={onSplitColumn}
            title="Split selected column into sub-metrics"
          >
            Split Column
          </button>
          <button
            type="button"
            className="action-btn"
            onClick={onAddPair}
            title="Add new key-value column"
          >
            Add new
          </button>
        </div>
      )}
    </div>
  );
}
