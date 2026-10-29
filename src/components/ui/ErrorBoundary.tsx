import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Game UI failed to load', error, info.componentStack); }
  render() {
    if (this.state.error) return <main className="loading-page"><span className="eyebrow">RUNTIME INTERRUPTED</span><h1>训练终端加载失败。</h1><p>检查点保留在浏览器中。请重新加载；如果仍无法启动，请查看开发控制台中的错误。</p><button className="primary-button mt-6" onClick={() => window.location.reload()}>重新加载 ↗</button></main>;
    return this.props.children;
  }
}
