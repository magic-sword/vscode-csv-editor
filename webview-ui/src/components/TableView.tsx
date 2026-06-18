import { memo } from 'react';
import { CellData } from '../types';

interface Props {
    headers: string[];
    rows: CellData[][];
    rowOriginalIndices: number[];
    onOpenModal: (displayedRi: number, ci: number) => void;
    showLoadMore: boolean;
    loadMoreLabel: string;
    colCount: number;
    onLoadMore: () => void;
}

// Individual data row — memoized so only changed rows re-render.
const DataRow = memo(function DataRow({
    rowData, displayedRi, origIdx, onOpenModal,
}: {
    rowData: CellData[];
    displayedRi: number;
    origIdx: number;
    onOpenModal: (displayedRi: number, ci: number) => void;
}) {
    return (
        <tr data-orig-row={origIdx}>
            <td className="row-num">{origIdx + 1}</td>
            {rowData.map((cell, ci) => (
                <td key={ci} onDoubleClick={cell.json ? undefined : () => onOpenModal(displayedRi, ci)}>
                    {cell.json ? (
                        <span className="json-badge" onClick={e => { e.stopPropagation(); onOpenModal(displayedRi, ci); }}>
                            JSON
                        </span>
                    ) : (
                        <span className="cell-preview">{cell.v}</span>
                    )}
                </td>
            ))}
        </tr>
    );
});

export default function TableView({ headers, rows, rowOriginalIndices, onOpenModal, showLoadMore, loadMoreLabel, colCount, onLoadMore }: Props) {
    return (
        <div id="table-container">
            <table id="csv-table">
                <thead>
                    <tr>
                        <th>#</th>
                        {headers.map((h, i) => <th key={i}>{h}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((rowData, displayedRi) => (
                        <DataRow
                            key={rowOriginalIndices[displayedRi]}
                            rowData={rowData}
                            displayedRi={displayedRi}
                            origIdx={rowOriginalIndices[displayedRi]}
                            onOpenModal={onOpenModal}
                        />
                    ))}
                </tbody>
                {showLoadMore && (
                    <tfoot>
                        <tr>
                            <td className="load-more-td" colSpan={colCount + 1}>
                                <button className="btn-load-more" onClick={onLoadMore}>
                                    {loadMoreLabel}
                                </button>
                            </td>
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
}
