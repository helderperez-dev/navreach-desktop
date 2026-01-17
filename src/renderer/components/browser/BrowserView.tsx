import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, RotateCw, X, Bug, Disc, StopCircle, Maximize2, Minimize2, ScanEye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBrowserStore } from '@/stores/browser.store';
import { useWorkspaceStore } from '@/stores/workspace.store';
import { useDebugStore } from '@/stores/debug.store';
import { useAppStore } from '@/stores/app.store';
import { useChatStore } from '@/stores/chat.store';
import { CircularLoader } from '@/components/ui/CircularLoader';

const INITIAL_URL = 'about:blank';

export function BrowserView() {
  const { currentWorkspace } = useWorkspaceStore();
  const { tabId, url, title, isLoading, setUrl, setTitle, setIsLoading, setWebContentsId, isRecording, setIsRecording } = useBrowserStore();
  const { isDebugPanelOpen, toggleDebugPanel } = useDebugStore();
  const { hasStarted, activeView, showPlaybookBrowser, playbookBrowserMaximized, togglePlaybookBrowserMaximized } = useAppStore();
  const { isStreaming } = useChatStore();
  const [urlInput, setUrlInput] = useState(url || '');
  const webviewRef = useRef<HTMLElement | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [showLoader, setShowLoader] = useState(true);
  const [pageLoaded, setPageLoaded] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  // Inspector State
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectedElement, setInspectedElement] = useState<any>(null);
  const [instruction, setInstruction] = useState('');

  // Minimum 2 second display time
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Hide loader when page has loaded AND minimum time has passed
  // OR if we are just on the welcome/blank page and NOT in the middle of a reset
  useEffect(() => {
    const isBlank = !url || url === 'about:blank';

    // 1. If we have a real URL and it's fully loaded (plus min time), hide loader
    if (!isBlank && pageLoaded && minTimeElapsed) {
      setShowLoader(false);
      return;
    }

    // 2. If we are on a blank page and NOT currently automated/streaming, hide loader
    // This allows the Welcome Screen/New Tab to be visible immediately.
    if (isBlank && !isStreaming) {
      setShowLoader(false);
      return;
    }

    // 3. Keep loader visible for:
    // - Real pages that are still loading
    // - Blank pages while an agent is streaming/running (preparing to navigate)
    // - During the minimum 2s branding duration
    setShowLoader(true);
  }, [pageLoaded, minTimeElapsed, url, isStreaming]);

  // Listen for store reset
  useEffect(() => {
    if (url === '') {
      setPageLoaded(false);
      setMinTimeElapsed(false);
      setShowLoader(true);

      const timer = setTimeout(() => {
        setMinTimeElapsed(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [url]); // Only trigger when transition TO empty happens

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
      // Mark page as loaded to hide the loader (only for real pages, not about:blank)
      const currentUrl = webview.getURL?.() || '';
      if (!pageLoaded && currentUrl && currentUrl !== 'about:blank') {
        setPageLoaded(true);
      }
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

  const toggleRecording = async () => {
    if (isRecording) {
      setIsRecording(false);
      await window.api.browser.stopRecording(tabId);
    } else {
      setIsRecording(true);
      await window.api.browser.startRecording(tabId);
    }
  };

  const toggleInspector = async () => {
    if (isInspecting) {
      setIsInspecting(false);
      await window.api.browser.stopInspector(tabId);
    } else {
      setIsInspecting(true);
      await window.api.browser.startInspector(tabId);
    }
  };

  useEffect(() => {
    const removeListener = window.api.browser.onInspectorAction((data: any) => {
      // We received an element click from the inspector script
      setInspectedElement(data);
      setIsInspecting(false); // Stop inspecting after selection
      window.api.browser.stopInspector(tabId);
    });
    return () => {
      removeListener();
      if (isInspecting) window.api.browser.stopInspector(tabId);
    };
  }, [tabId, isInspecting]);

  const handleIndexElement = async () => {
    // Structure the knowledge record to match database schema
    const knowledgeRecord = {
      domain: inspectedElement?.hostname,
      url: inspectedElement?.url,
      selector: inspectedElement?.selector,
      instruction: instruction,
      action: 'interact', // Default action to satisfy not-null constraint
      element_details: inspectedElement,
      is_active: true
    };

    // Save to the knowledge base (Supabase) via main process IPC
    try {
      const { error } = await window.api.settings.addPlatformKnowledge(knowledgeRecord);
      if (error) throw new Error(error);

      toast.success('Element added to Knowledge Base');
      console.log('[Knowledge Base] Record Saved:', knowledgeRecord);
    } catch (error: any) {
      toast.error(`Failed to save: ${error.message}`);
      console.error('[Knowledge Base] Error Saving:', error);
    }

    // For now just close
    setInspectedElement(null);
    setInstruction('');
  };

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {!showLoader && (
        <div className="flex items-center h-12 px-3 gap-2 border-b border-border bg-background z-20">
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
              className="h-8 text-sm focus-visible:ring-border focus-visible:ring-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${isDebugPanelOpen ? 'text-foreground bg-muted' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={toggleDebugPanel}
              title="Toggle debug panel"
            >
              <Bug className="h-4 w-4" />
            </Button>
          </form>

          <Button
            variant={isInspecting ? "destructive" : "ghost"}
            size="icon"
            className={`h-8 w-8 mr-2 ${isInspecting ? 'animate-pulse' : ''}`}
            onClick={toggleInspector}
            title={isInspecting ? "Cancel Inspector" : "Inspect Element"}
          >
            <ScanEye className="h-4 w-4" />
          </Button>

          {activeView === 'playbooks' && (
            <div className="flex items-center gap-1 border-l border-border pl-2">
              <Button
                variant={isRecording ? "destructive" : "ghost"}
                size="icon"
                className={`h-8 w-8 ${isRecording ? 'animate-pulse' : ''}`}
                onClick={toggleRecording}
                title={isRecording ? "Stop Recording" : "Record Playbook Step"}
              >
                {isRecording ? <StopCircle className="h-4 w-4" /> : <Disc className="h-4 w-4 text-red-500" />}
              </Button>

              {/* Maximize Button - Only visible in Playbook View */}
              {showPlaybookBrowser && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 ml-1"
                  onClick={togglePlaybookBrowserMaximized}
                  title={playbookBrowserMaximized ? "Restore Split View" : "Maximize Browser"}
                >
                  {playbookBrowserMaximized ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 relative">
        <AnimatePresence>
          {showLoader && (
            <motion.div
              className="absolute inset-0 z-10 flex items-center justify-center bg-background"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex flex-col items-center">
                <CircularLoader className="h-8 w-8" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <webview
          ref={webviewRef as any}
          key={currentWorkspace ? currentWorkspace.id : 'default'}
          src={INITIAL_URL}
          className="absolute inset-0 w-full h-full"
          // @ts-ignore - webview attributes
          partition={currentWorkspace ? `persist:workspace_${currentWorkspace.id}` : undefined}
          // @ts-ignore - webview attributes
          allowpopups="true"
          // @ts-ignore - webview attributes
          webpreferences="nativeWindowOpen=yes, backgroundThrottling=no"
        />
      </div>

      <Dialog open={!!inspectedElement} onOpenChange={(open) => !open && setInspectedElement(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Index Element & Add Instruction</DialogTitle>
            <DialogDescription>
              Teach the agent how to use this element for future tasks.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Selected Element</Label>
              <div className="p-2 bg-muted rounded text-xs font-mono break-all max-h-32 overflow-y-auto">
                <div><strong>Site:</strong> {inspectedElement?.hostname}</div>
                <div><strong>URL:</strong> {inspectedElement?.url}</div>
                <div><strong>Tag:</strong> {inspectedElement?.tagName}</div>
                <div><strong>Selector:</strong> {inspectedElement?.selector}</div>
                <div><strong>Path:</strong> {inspectedElement?.fullSelector}</div>
                <div><strong>Text:</strong> {inspectedElement?.innerText}</div>
                <div><strong>ARIA:</strong> {inspectedElement?.ariaLabel}</div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="instruction">Agent Instruction</Label>
              <Textarea
                id="instruction"
                placeholder="e.g., Use this button to submit the specific form..."
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInspectedElement(null)}>Cancel</Button>
            <Button onClick={handleIndexElement}>Index Element</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
