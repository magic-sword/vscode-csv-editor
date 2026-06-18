import { useEffect, Dispatch, RefObject } from 'react';
import { AppAction } from '../state/AppState';
import { CellModalHandle } from '../components/modal/CellModal';
import { ExtMsg } from '../types';

export function useExtensionMessages(
    dispatch: Dispatch<AppAction>,
    modalRef: RefObject<CellModalHandle>,
): void {
    useEffect(() => {
        const handler = (event: MessageEvent<ExtMsg>) => {
            const data = event.data;
            switch (data.type) {
                case 'load':
                    dispatch(data);
                    modalRef.current?.clearCache();
                    break;
                case 'streamRows':
                case 'loadComplete':
                case 'appendRows':
                case 'searchResults':
                case 'searchError':
                case 'progress':
                case 'cellPreviewUpdated':
                    dispatch(data);
                    break;
                case 'cellContent':  modalRef.current?.handleCellContent(data);  break;
                case 'cellJsonNode': modalRef.current?.handleJsonNode(data);      break;
                case 'jsonScalar':   modalRef.current?.handleJsonScalar(data);    break;
            }
        };
        window.addEventListener('message', handler as EventListener);
        return () => window.removeEventListener('message', handler as EventListener);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
