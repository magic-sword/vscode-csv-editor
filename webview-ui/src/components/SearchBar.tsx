import { memo } from 'react';

interface Props {
    query: string;
    enabled: boolean;
    isSearchMode: boolean;
    searchError: string;
    onChange: (value: string) => void;
    onSearch: () => void;
    onClear: () => void;
}

export default memo(function SearchBar({
    query, enabled, isSearchMode, searchError, onChange, onSearch, onClear,
}: Props) {
    return (
        <div id="search-bar">
            <input
                id="search-input"
                type="text"
                value={query}
                onChange={e => onChange(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter') onSearch();
                    if (e.key === 'Escape') onClear();
                }}
                disabled={!enabled}
                placeholder={enabled
                    ? '例: label = "cat"  /  score >= 0.9 AND name contains "Alice"  /  (a = "x" OR b = "y") AND c != "z"'
                    : '読み込み完了後に検索できます'}
            />
            <button className="search-btn primary" onClick={onSearch} disabled={!enabled}>検索</button>
            {isSearchMode && (
                <button className="search-btn" onClick={onClear}>✕ クリア</button>
            )}
            {searchError && <span className="search-error">{searchError}</span>}
        </div>
    );
});
