import { JsonNode, JsonPath } from '../../types';
import { InlineEdit } from './types';
import InlineEditor from './InlineEditor';

interface Props {
    node: JsonNode;
    path: JsonPath;
    inlineEdit: InlineEdit | null;
    onNavigate: (path: JsonPath) => void;
    onRequestEdit: (path: JsonPath) => void;
    onSaveEdit: (path: JsonPath, value: unknown) => void;
    onCancelEdit: () => void;
    onLoadMore: (shown: number) => void;
}

export default function JsonTreeView({
    node, path, inlineEdit, onNavigate, onRequestEdit, onSaveEdit, onCancelEdit, onLoadMore,
}: Props) {
    if (node.kind === 'scalar') {
        return (
            <div style={{ padding: '8px 6px', display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span className={`jval-${node.vtype}`}>{node.display}</span>
                {inlineEdit && JSON.stringify(inlineEdit.path) === JSON.stringify(path) ? (
                    <InlineEditor
                        raw={inlineEdit.raw}
                        vtype={inlineEdit.vtype}
                        onSave={v => onSaveEdit(path, v)}
                        onCancel={onCancelEdit}
                    />
                ) : (
                    <button className="jedit-btn jedit-btn-root" onClick={() => onRequestEdit(path)}>Edit</button>
                )}
            </div>
        );
    }

    const entries = node.kind === 'object' ? node.entries : null;
    const items   = node.kind === 'array'  ? node.items   : null;

    return (
        <>
            <ul className="jtree">
                {entries?.map(({ key, preview, vtype }) => {
                    const childPath = [...path, key];
                    const isNav = vtype === 'object' || vtype === 'array';
                    const isEditing = inlineEdit && JSON.stringify(inlineEdit.path) === JSON.stringify(childPath);
                    return (
                        <li key={key}>
                            <span className="jkey">&quot;{key}&quot;:</span>
                            {isEditing ? (
                                <InlineEditor
                                    raw={inlineEdit!.raw}
                                    vtype={inlineEdit!.vtype}
                                    onSave={v => onSaveEdit(childPath, v)}
                                    onCancel={onCancelEdit}
                                />
                            ) : isNav ? (
                                <span className="jnav" onClick={() => onNavigate(childPath)}>{preview}</span>
                            ) : (
                                <>
                                    <span className={`jval-${vtype}`}>{preview}</span>
                                    <button className="jedit-btn" onClick={() => onRequestEdit(childPath)}>Edit</button>
                                </>
                            )}
                        </li>
                    );
                })}
                {items?.map(({ preview, vtype }, idx) => {
                    const offset = node.shown - items.length;
                    const absIdx = offset + idx;
                    const childPath = [...path, absIdx];
                    const isNav = vtype === 'object' || vtype === 'array';
                    const isEditing = inlineEdit && JSON.stringify(inlineEdit.path) === JSON.stringify(childPath);
                    return (
                        <li key={absIdx}>
                            <span className="jindex">[{absIdx}]:</span>
                            {isEditing ? (
                                <InlineEditor
                                    raw={inlineEdit!.raw}
                                    vtype={inlineEdit!.vtype}
                                    onSave={v => onSaveEdit(childPath, v)}
                                    onCancel={onCancelEdit}
                                />
                            ) : isNav ? (
                                <span className="jnav" onClick={() => onNavigate(childPath)}>{preview}</span>
                            ) : (
                                <>
                                    <span className={`jval-${vtype}`}>{preview}</span>
                                    <button className="jedit-btn" onClick={() => onRequestEdit(childPath)}>Edit</button>
                                </>
                            )}
                        </li>
                    );
                })}
            </ul>
            {node.shown < node.total && (
                <button className="jmore-btn" onClick={() => onLoadMore(node.shown)}>
                    ↓ Load more ({node.shown} / {node.total} shown)
                </button>
            )}
        </>
    );
}
