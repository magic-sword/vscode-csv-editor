import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';

class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { error: Error | null }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error: Error) { return { error }; }
    render() {
        if (this.state.error) {
            return (
                <div style={{ padding: 20, color: '#f48771', fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: 12 }}>
                    <strong>Webview Error:</strong>{'\n'}{this.state.error.message}{'\n\n'}{this.state.error.stack}
                </div>
            );
        }
        return this.props.children;
    }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);
