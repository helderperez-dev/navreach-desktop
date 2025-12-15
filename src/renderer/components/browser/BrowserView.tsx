import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, X, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBrowserStore } from '@/stores/browser.store';
import { useDebugStore } from '@/stores/debug.store';

const INITIAL_URL = 'https://www.google.com';

export function BrowserView() {
  const { tabId, url, title, isLoading, setUrl, setTitle, setIsLoading, setWebContentsId } = useBrowserStore();
  const { isDebugPanelOpen, toggleDebugPanel } = useDebugStore();
  const [urlInput, setUrlInput] = useState(url || INITIAL_URL);
  const webviewRef = useRef<HTMLElement | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Navigate programmatically when url changes (after webview is ready)
  useEffect(() => {
    const webview = webviewRef.current as any;
    if (isReady && webview && url && webview.loadURL) {
      // Only navigate if URL is different from current
      const currentWebviewUrl = webview.getURL?.() || '';
      if (url !== currentWebviewUrl) {
        webview.loadURL(url).catch((err: any) => {
          // ERR_ABORTED on redirects is normal - ignore it
          if (err.code !== 'ERR_ABORTED' && err.errno !== -3) {
            console.error('Navigation error:', err);
          }
        });
      }
    }
    setUrlInput(url || INITIAL_URL);
  }, [url, isReady]);

  useEffect(() => {
    const webview = webviewRef.current as any;
    if (!webview) return;

    const handleDomReady = async () => {
      if (!isRegistered && webview.getWebContentsId) {
        const webContentsId = webview.getWebContentsId();
        setWebContentsId(webContentsId);
        try {
          await window.api.browser.registerWebview(tabId, webContentsId);
        } catch (e) {
          console.error('Failed to register webview:', e);
        }
        setIsRegistered(true);
        setIsReady(true);
      }
    };

    const handleStartLoading = () => {
      setIsLoading(true);
    };

    const handleStopLoading = () => {
      setIsLoading(false);
    };

    const handleTitleUpdate = (e: any) => {
      setTitle(e.title);
    };

    const handleNavigateEvent = (e: any) => {
      setUrl(e.url);
      setUrlInput(e.url);
    };

    // Allow all navigation like a regular browser - just update the URL bar
    const handleWillNavigate = (e: any) => {
      console.log('Navigation to:', e.url);
      setUrlInput(e.url);
    };

    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-start-loading', handleStartLoading);
    webview.addEventListener('did-stop-loading', handleStopLoading);
    webview.addEventListener('page-title-updated', handleTitleUpdate);
    webview.addEventListener('did-navigate', handleNavigateEvent);
    webview.addEventListener('did-navigate-in-page', handleNavigateEvent);
    webview.addEventListener('will-navigate', handleWillNavigate);

    return () => {
      webview.removeEventListener('dom-ready', handleDomReady);
      webview.removeEventListener('did-start-loading', handleStartLoading);
      webview.removeEventListener('will-navigate', handleWillNavigate);
      webview.removeEventListener('did-stop-loading', handleStopLoading);
      webview.removeEventListener('page-title-updated', handleTitleUpdate);
      webview.removeEventListener('did-navigate', handleNavigateEvent);
      webview.removeEventListener('did-navigate-in-page', handleNavigateEvent);
    };
  }, [tabId, isRegistered, setUrl, setTitle, setIsLoading, setWebContentsId]);

  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    let newUrl = urlInput.trim();
    if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
      if (newUrl.includes('.') && !newUrl.includes(' ')) {
        newUrl = `https://${newUrl}`;
      } else {
        newUrl = `https://www.google.com/search?q=${encodeURIComponent(newUrl)}`;
      }
    }
    
    setUrlInput(newUrl);
    setUrl(newUrl);
    setIsLoading(true);
  };

  const handleGoBack = () => {
    const webview = webviewRef.current as any;
    if (webview?.goBack) webview.goBack();
  };

  const handleGoForward = () => {
    const webview = webviewRef.current as any;
    if (webview?.goForward) webview.goForward();
  };

  const handleReload = () => {
    const webview = webviewRef.current as any;
    if (webview?.reload) webview.reload();
  };

  const handleStop = () => {
    const webview = webviewRef.current as any;
    if (webview?.stop) webview.stop();
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center h-12 px-3 gap-2 border-b border-border">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleGoBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleGoForward}>
            <ArrowRight className="h-4 w-4" />
          </Button>
          {isLoading ? (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleStop}>
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleReload}>
              <RotateCw className="h-4 w-4" />
            </Button>
          )}
        </div>

        <form onSubmit={handleNavigate} className="flex-1 flex items-center gap-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Enter URL or search..."
            className="h-8 text-sm"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${isDebugPanelOpen ? 'text-primary' : ''}`}
            onClick={toggleDebugPanel}
            title="Toggle debug panel"
          >
            <Bug className="h-4 w-4" />
          </Button>
        </form>
      </div>

      <div className="flex-1 relative">
        <webview
          ref={webviewRef as any}
          src={INITIAL_URL}
          className="absolute inset-0 w-full h-full"
          // @ts-ignore - webview attributes
          allowpopups="true"
        />
      </div>
    </div>
  );
}
