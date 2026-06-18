import { memo } from 'react';

interface Props {
    statusText: string;
    isLoading: boolean;
}

export default memo(function Toolbar({ statusText, isLoading }: Props) {
    return (
        <div id="toolbar">
            <span id="status">
                {statusText}
                {isLoading && <span className="loading-indicator"> 読み込み中...</span>}
            </span>
        </div>
    );
});
