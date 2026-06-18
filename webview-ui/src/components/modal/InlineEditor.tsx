import { useState } from 'react';

interface Props {
    raw: string;
    vtype: string;
    onSave: (value: unknown) => void;
    onCancel: () => void;
}

export default function InlineEditor({ raw, vtype, onSave, onCancel }: Props) {
    const [value, setValue] = useState(raw);
    const isLong = raw.length > 60;

    const save = () => {
        let parsed: unknown;
        if (vtype === 'string') { parsed = value; }
        else { try { parsed = JSON.parse(value); } catch { parsed = value; } }
        onSave(parsed);
    };

    return (
        <span className="jinput-wrap">
            {isLong ? (
                <textarea
                    className="jinput"
                    rows={Math.min(Math.ceil(raw.length / 60), 6)}
                    style={{ resize: 'vertical' }}
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter' && e.ctrlKey) save(); }}
                    autoFocus
                />
            ) : (
                <input
                    className="jinput"
                    type="text"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter') save(); }}
                    autoFocus
                />
            )}
            <span className="jinput-btns">
                <button className="jinput-save" onClick={save}>
                    {isLong ? 'Save (Ctrl+Enter)' : 'Save (Enter)'}
                </button>
                <button className="jinput-cancel" onClick={onCancel}>Cancel</button>
            </span>
        </span>
    );
}
