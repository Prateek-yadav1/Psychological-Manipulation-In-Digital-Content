import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Link as LinkIcon, Upload, AlertTriangle, Newspaper, Mail,
  Globe, Calendar, User, ExternalLink, AlertCircle, X, FileText, ShieldCheck,
} from 'lucide-react';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { toast } from 'sonner';
import { analyzeContent, fetchArticlePreview } from '../../services/analysisService';
import { useAppContext } from '../../context/AppContext';
import type { AnalysisMode, InputMethod, ArticlePreview } from '../../types';

const EXAMPLE_TEXTS: Record<AnalysisMode, string> = {
  news:   'BREAKING: Experts reveal shocking truth about new policy that EVERYONE must know!',
  email:  'URGENT: Your account will be suspended in 24 hours unless you verify immediately!',
};

const MIN_TEXT_LENGTH = 20;
const MAX_TEXT_LENGTH = 50000;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const SUPPORTED_FILE_EXTENSIONS = new Set(['.txt', '.eml', '.pdf', '.md', '.csv', '.html', '.htm']);

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });

  try {
    const pdf = await loadingTask.promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items
        .filter((item) => 'str' in item)
        .map((item) => item.str)
        .join(' '));
      if (pages.join('\n').length > MAX_TEXT_LENGTH) break;
    }
    return pages.join('\n');
  } finally {
    await loadingTask.destroy();
  }
}

function extractHtmlText(markup: string): string {
  const document = new DOMParser().parseFromString(markup, 'text/html');
  document.querySelectorAll('script, style, noscript').forEach((element) => element.remove());
  return document.body.textContent ?? '';
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function AnalyzerPage() {
  const navigate = useNavigate();
  const { setCurrentResult, addToHistory } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<AnalysisMode>('news');
  const [inputMethod, setInputMethod] = useState<InputMethod>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [articlePreview, setArticlePreview] = useState<ArticlePreview | null>(null);
  const [urlError, setUrlError] = useState('');
  const [textError, setTextError] = useState('');
  const [analyzeError, setAnalyzeError] = useState('');

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const validateText = (value: string): string => {
    if (!value.trim()) return 'Please enter some text to analyze.';
    if (value.trim().length < MIN_TEXT_LENGTH) return `Text must be at least ${MIN_TEXT_LENGTH} characters.`;
    if (value.length > MAX_TEXT_LENGTH) return `Text must be under ${MAX_TEXT_LENGTH} characters.`;
    return '';
  };

  const validateUrl = (value: string): string => {
    if (!value.trim()) return 'Please enter a URL.';
    if (!isValidUrl(value.trim())) return 'Please enter a valid URL (must start with http:// or https://).';
    return '';
  };

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleModeChange = (newMode: AnalysisMode) => {
    setMode(newMode);
    if (!text || Object.values(EXAMPLE_TEXTS).includes(text)) {
      setText(EXAMPLE_TEXTS[newMode]);
      setTextError('');
    }
  };

  const handleTextChange = (value: string) => {
    setText(value);
    if (textError && value.trim().length >= MIN_TEXT_LENGTH) setTextError('');
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    if (urlError) setUrlError('');
  };

  const handleUrlFetch = async () => {
    const err = validateUrl(url);
    if (err) { setUrlError(err); return; }
    setUrlError('');
    setIsFetchingUrl(true);
    setArticlePreview(null);
    try {
      const preview = await fetchArticlePreview(url.trim());
      setArticlePreview(preview);
      toast.success('Article preview loaded');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch article preview.';
      setUrlError(msg);
      toast.error(msg);
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

    if (!SUPPORTED_FILE_EXTENSIONS.has(extension)) {
      toast.error('Unsupported file type. Choose a PDF, .txt, .eml, .md, .csv, or HTML file.');
      input.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File too large. Maximum size is 10 MB.');
      input.value = '';
      return;
    }

    try {
      const fileContent = extension === '.pdf'
        ? await extractPdfText(file)
        : await file.text();
      const content = extension === '.html' || extension === '.htm'
        ? extractHtmlText(fileContent)
        : fileContent;

      if (!content.trim()) {
        toast.error(extension === '.pdf'
          ? 'No selectable text was found in this PDF. Scanned PDFs need OCR before they can be analyzed.'
          : 'This file does not contain readable text.');
        input.value = '';
        return;
      }
      if (content.length > MAX_TEXT_LENGTH) {
        toast.error(`Extracted text exceeds the ${MAX_TEXT_LENGTH.toLocaleString()} character limit. Upload a shorter document.`);
        input.value = '';
        return;
      }

      setText(content);
      setUploadedFileName(file.name);
      setTextError('');
      setInputMethod('upload');
      toast.success(`File "${file.name}" loaded (${content.length.toLocaleString()} characters)`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown file parsing error.';
      toast.error(`Could not read "${file.name}": ${reason}`);
      input.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
      fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  const handleAnalyze = async () => {
    setAnalyzeError('');

    // Validate
    if (inputMethod === 'text' || inputMethod === 'upload') {
      const err = validateText(text);
      if (err) { setTextError(err); return; }
    }
    if (inputMethod === 'url') {
      const err = validateUrl(url);
      if (err) { setUrlError(err); return; }
    }

    // For URL mode: prefer real extracted body text from Firecrawl over just the headline
    const contentToAnalyze = inputMethod === 'url'
      ? (articlePreview?.bodyText || articlePreview?.headline || url)
      : text;

    setIsAnalyzing(true);

    try {
      const result = await analyzeContent(
        contentToAnalyze,
        mode,
        inputMethod,
        inputMethod === 'url' ? url : undefined,
      );
      setCurrentResult(result);
      addToHistory(result);
      navigate('/results');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Analysis failed. Please try again.';
      setAnalyzeError(msg);
      toast.error(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClear = () => {
    setText('');
    setUrl('');
    setArticlePreview(null);
    setTextError('');
    setUrlError('');
    setAnalyzeError('');
    setUploadedFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const analyzeButtonDisabled =
    isAnalyzing ||
    (inputMethod === 'text' && !text.trim()) ||
    (inputMethod === 'upload' && !text.trim()) ||
    (inputMethod === 'url' && !url.trim());

  const modes: Array<{ id: AnalysisMode; label: string; icon: typeof Newspaper }> = [
    { id: 'news',   label: 'News Article',  icon: Newspaper    },
    { id: 'email',  label: 'Email',          icon: Mail         },
  ];

  return (
    <>
      <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Main Analyzer Section */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header */}
          <div className="text-center lg:text-left mb-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              A clearer read on what you’re reading
            </p>
            <h1 className="mb-4 text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
              Read between<br className="hidden sm:block" /> the lines.
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg max-w-2xl">
              Review a news story or email for pressure tactics, emotional framing, and signals worth a second look.
            </p>
          </div>

          {/* Mode Selector */}
          <div className="glass-card rounded-xl p-6">
            <label className="text-sm text-muted-foreground mb-3 block">
              What would you like to review?
            </label>
            <div className="grid grid-cols-2 gap-3">
              {modes.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => handleModeChange(m.id)}
                    className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                      mode === m.id
                        ? 'bg-accent text-accent-foreground border-primary/40'
                        : 'bg-secondary/30 text-muted-foreground hover:text-foreground hover:bg-secondary/50 border border-border'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Input Method Tabs */}
          <div className="glass-card rounded-xl p-6 space-y-4">
            <div className="flex gap-2 border-b border-border pb-3 flex-wrap">
              {[
                { id: 'text' as InputMethod,   icon: FileText, label: 'Paste Text'   },
                { id: 'url'  as InputMethod,   icon: LinkIcon,  label: 'Paste URL'    },
                { id: 'upload' as InputMethod, icon: Upload,    label: 'Upload File'  },
              ].map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => { setInputMethod(id); setAnalyzeError(''); }}
                  className={`px-4 py-2 rounded-t-lg transition-all text-sm ${
                    inputMethod === id
                      ? 'bg-primary/20 text-primary border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4 inline mr-2" />
                  {label}
                </button>
              ))}
            </div>

            {/* Text Input */}
            {(inputMethod === 'text' || inputMethod === 'upload') && (
              <div className="space-y-3">
                {uploadedFileName && inputMethod === 'upload' && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/10 border border-primary/30 text-sm">
                    <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-primary flex-1 truncate">{uploadedFileName}</span>
                    <button onClick={() => { setUploadedFileName(null); setText(''); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <textarea
                  value={text}
                  onChange={(e) => handleTextChange(e.target.value)}
                  placeholder={`Paste ${mode === 'news' ? 'article' : 'email content'} text here…`}
                  className={`w-full min-h-[280px] bg-input-background border rounded-lg p-4 
                           text-foreground placeholder:text-muted-foreground resize-y
                           focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                           transition-all ${textError ? 'border-destructive' : 'border-input'}`}
                />
                {textError && (
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{textError}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm text-muted-foreground font-mono">
                  <span>{text.length.toLocaleString()} chars | {wordCount} words</span>
                  {text.length > MAX_TEXT_LENGTH * 0.9 && (
                    <span className="text-warning">{(MAX_TEXT_LENGTH - text.length).toLocaleString()} chars remaining</span>
                  )}
                </div>
              </div>
            )}

            {/* URL Input */}
            {inputMethod === 'url' && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleUrlFetch()}
                    placeholder="https://example.com/article"
                    className={`flex-1 bg-input-background border rounded-lg px-4 py-3
                             text-foreground placeholder:text-muted-foreground
                             focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                             transition-all ${urlError ? 'border-destructive' : 'border-input'}`}
                  />
                  <button
                    onClick={handleUrlFetch}
                    disabled={isFetchingUrl || !url.trim()}
                    className="px-6 py-3 rounded-lg bg-secondary hover:bg-secondary/80 border border-border
                             transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isFetchingUrl ? (
                      <div className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
                    ) : (
                      <Globe className="w-4 h-4" />
                    )}
                    {isFetchingUrl ? 'Fetching…' : 'Fetch'}
                  </button>
                </div>
                {urlError && (
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{urlError}</span>
                  </div>
                )}

                {/* Article Preview Panel */}
                {articlePreview && (
                  <div className="glass-card rounded-lg p-5 border-l-4 border-primary">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h4 className="text-lg mb-2 leading-tight">{articlePreview.headline}</h4>
                        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Newspaper className="w-3 h-3" />
                            {articlePreview.source}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {articlePreview.author}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {articlePreview.publishDate}
                          </span>
                          <span className="flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {articlePreview.domain}
                          </span>
                        </div>
                      </div>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80 transition-all"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                    <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-destructive" />
                          Headline Risk Assessment
                        </span>
                        <span className="text-2xl font-mono text-destructive neon-text">
                          {articlePreview.headlineRisk}%
                        </span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden mb-3">
                        <div
                          className="h-full bg-gradient-to-r from-warning to-destructive neon-glow transition-all"
                          style={{ width: `${articlePreview.headlineRisk}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {articlePreview.tags.map((tag, i) => (
                          <span
                            key={i}
                            className={`px-2 py-1 rounded-full text-xs border font-mono ${
                              articlePreview.headlineRisk > 60
                                ? 'bg-destructive/20 text-destructive border-destructive/40'
                                : 'bg-warning/20 text-warning border-warning/40'
                            }`}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* File Upload */}
            {inputMethod === 'upload' && !uploadedFileName && (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-all"
              >
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-2">Drop file here or click to upload</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Supports PDF, TXT, EML, Markdown, CSV, and HTML (max 10 MB). Scanned PDFs require OCR.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.eml,.md,.csv,.html,.htm"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 border border-border cursor-pointer transition-all"
                >
                  <Upload className="w-4 h-4" />
                  Select File
                </label>
              </div>
            )}

            {/* Global error */}
            {analyzeError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{analyzeError}</span>
              </div>
            )}

            {/* Analyze Button */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <button
                onClick={handleClear}
                className="px-4 py-2 text-sm rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
              >
                Clear
              </button>
              <button
                onClick={handleAnalyze}
                disabled={analyzeButtonDisabled}
                className="px-6 py-3 rounded-lg bg-primary text-primary-foreground 
                         hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all neon-glow flex items-center gap-2 group"
              >
                {isAnalyzing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    Analyze {mode === 'news' ? 'Article' : 'Email'}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick Examples */}
          <div className="glass-card rounded-xl p-5">
            <label className="text-sm text-muted-foreground uppercase tracking-wider mb-3 block">
              Try an example
            </label>
            <div className="space-y-2">
              {Object.entries(EXAMPLE_TEXTS).map(([key, example]) => (
                <button
                  key={key}
                  onClick={() => {
                    setMode(key as AnalysisMode);
                    setText(example);
                    setInputMethod('text');
                    setTextError('');
                    setAnalyzeError('');
                  }}
                  className="w-full text-left p-3 rounded-lg border border-border hover:border-primary/50 
                           bg-secondary/30 hover:bg-secondary/50 text-sm transition-all group"
                >
                  <span className="text-xs text-primary uppercase tracking-wider block mb-1">
                    {key === 'news' ? 'News' : 'Email'}
                  </span>
                  <span className="text-foreground group-hover:text-primary transition-colors">
                    {example}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className="glass-card h-fit rounded-xl p-6 lg:sticky lg:top-24">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">A practical second opinion</p>
          <h2 className="mb-3 text-2xl font-medium">What gets reviewed</h2>
          <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
            The review looks for language patterns that may deserve closer attention. It cannot confirm whether a sender, claim, or story is genuine.
          </p>
          <ul className="divide-y divide-border">
            {[
              'Urgency and pressure to act',
              'Fear-based or emotional language',
              'Claims of authority or identity',
              'Requests involving money or credentials',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 py-3 text-sm text-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {item}
              </li>
            ))}
          </ul>
          {isAnalyzing && (
            <div className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-sm text-muted-foreground" role="status">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
              Reviewing your content…
            </div>
          )}
        </aside>
      </div>
      </div>
    </>
  );
}
