import { memo } from 'react';

interface Props {
    isLoading: boolean;
    progressPct: number | null;
    progressStats: string;
}

export default memo(function LoadingOverlay({ isLoading, progressPct, progressStats }: Props) {
    return (
        <div className="loading-overlay">
            <div className="loading-content">
                <div className="loading-title">
                    {isLoading ? 'CSV を読み込み中...' : 'Loading CSV...'}
                </div>
                <div className="loading-progress-track">
                    <div
                        className={`loading-progress-fill${progressPct !== null ? ' determinate' : ''}`}
                        style={progressPct !== null ? { '--pct': `${progressPct}%` } as React.CSSProperties : undefined}
                    />
                </div>
                <div className="loading-stats">{progressStats}</div>
            </div>
        </div>
    );
});
