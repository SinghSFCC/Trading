import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Bot, Send, Loader2, Copy, ThumbsUp, ThumbsDown, MoreVertical, X, Download, Trash2, RotateCcw, Search } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast, Toaster } from 'react-hot-toast';

export default function TitanChat({ symbol, zones = [], structure = "" }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [inputHistory, setInputHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [messageMenuOpen, setMessageMenuOpen] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Trading term suggestions for auto-complete
  const tradingTerms = [
    'support', 'resistance', 'trend', 'pattern', 'momentum',
    'RSI', 'EMA', 'volume', 'buy', 'sell', 'target', 'stop loss',
    'breakout', 'breakdown', 'pullback', 'retracement', 'fibonacci',
    'double top', 'double bottom', 'head and shoulders', 'flag', 'pennant'
  ];

  // Generate context-aware suggested questions
  const generateSuggestedQuestions = useCallback(() => {
    const symbolName = symbol?.replace('.NS', '').replace('.BO', '') || 'this stock';
    const questions = [];
    
    // Basic questions
    questions.push(`What is the current trend for ${symbolName}?`);
    questions.push(`What are the key support and resistance levels?`);
    
    // Structure-based questions
    if (structure) {
      if (structure.includes('BULLISH')) {
        questions.push(`Explain the BULLISH structure for ${symbolName}`);
      } else if (structure.includes('BEARISH')) {
        questions.push(`Explain the BEARISH structure for ${symbolName}`);
      }
    }
    
    // Zone-based questions
    if (zones && zones.length > 0) {
      const resistanceZones = zones.filter(z => z.type === 'RESISTANCE');
      const supportZones = zones.filter(z => z.type === 'SUPPORT');
      
      if (resistanceZones.length > 0) {
        questions.push(`Where is the nearest resistance zone?`);
      }
      if (supportZones.length > 0) {
        questions.push(`Where is the nearest support zone?`);
      }
      questions.push(`Analyze the supply and demand zones`);
    }
    
    // Technical questions
    questions.push(`What is the RSI indicating?`);
    questions.push(`Should I buy or sell ${symbolName}?`);
    questions.push(`What are the entry and exit points?`);
    
    return questions.slice(0, 4); // Return top 4 questions
  }, [symbol, zones, structure]);

  const [suggestedQuestions, setSuggestedQuestions] = useState([]);

  // Update suggested questions when symbol/zones/structure change
  useEffect(() => {
    setSuggestedQuestions(generateSuggestedQuestions());
  }, [generateSuggestedQuestions]);

  // Load chat history from localStorage when symbol changes
  useEffect(() => {
    if (symbol) {
      const historyKey = `titan_chat_${symbol}`;
      const savedHistory = localStorage.getItem(historyKey);
      if (savedHistory) {
        try {
          const parsed = JSON.parse(savedHistory);
          // Only load if it's recent (within last 7 days)
          const messages = parsed.messages || [];
          const validMessages = messages.filter(msg => {
            const msgDate = new Date(msg.timestamp);
            const daysDiff = (Date.now() - msgDate.getTime()) / (1000 * 60 * 60 * 24);
            return daysDiff < 7;
          });
          setMessages(validMessages);
        } catch (e) {
          console.error('Failed to load chat history:', e);
        }
      } else {
        setMessages([]);
      }
    }
  }, [symbol]);

  // Save chat history to localStorage whenever messages change
  useEffect(() => {
    if (symbol && messages.length > 0) {
      const historyKey = `titan_chat_${symbol}`;
      // Limit to last 50 messages
      const messagesToSave = messages.slice(-50);
      localStorage.setItem(historyKey, JSON.stringify({
        symbol,
        messages: messagesToSave,
        lastUpdated: new Date().toISOString()
      }));
    }
  }, [messages, symbol]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingText]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl/Cmd + K: Focus input
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      
      // Ctrl/Cmd + Enter: Send message
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!loading && inputText.trim()) {
          handleSend();
        }
      }
      
      // Escape: Clear input or close menus
      if (e.key === 'Escape') {
        if (messageMenuOpen !== null) {
          setMessageMenuOpen(null);
        } else if (showSearch) {
          setShowSearch(false);
        } else {
          setInputText('');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, inputText, messageMenuOpen, showSearch]);

  // Format relative time
  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return '';
    const now = new Date();
    const msgTime = new Date(timestamp);
    const diffMs = now - msgTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return msgTime.toLocaleDateString();
  };

  // Copy message to clipboard
  const handleCopyMessage = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard!');
    } catch (e) {
      toast.error('Failed to copy');
    }
  };

  // Handle feedback
  const handleFeedback = (messageIndex, feedback) => {
    const feedbackKey = `titan_feedback_${symbol}_${messageIndex}`;
    localStorage.setItem(feedbackKey, feedback);
    toast.success(feedback === 'up' ? 'Thanks for the feedback!' : 'Feedback recorded');
  };

  // Handle suggestion click
  const handleSuggestionClick = (question) => {
    setInputText(question);
    inputRef.current?.focus();
    setTimeout(() => handleSend(), 100);
  };

  // Auto-complete suggestions
  useEffect(() => {
    if (inputText.trim().length > 0) {
      const matches = tradingTerms.filter(term => 
        term.toLowerCase().includes(inputText.toLowerCase())
      ).slice(0, 5);
      setSuggestions(matches);
      setShowSuggestions(matches.length > 0);
      setSelectedSuggestion(0);
    } else {
      setShowSuggestions(false);
      setSuggestions([]);
    }
  }, [inputText]);

  // Handle input history navigation
  const handleInputKeyDown = (e) => {
    if (e.key === 'ArrowUp' && inputHistory.length > 0) {
      e.preventDefault();
      if (historyIndex === -1) {
        setHistoryIndex(inputHistory.length - 1);
        setInputText(inputHistory[inputHistory.length - 1]);
      } else if (historyIndex > 0) {
        setHistoryIndex(historyIndex - 1);
        setInputText(inputHistory[historyIndex - 1]);
      }
    } else if (e.key === 'ArrowDown' && historyIndex !== -1) {
      e.preventDefault();
      if (historyIndex < inputHistory.length - 1) {
        setHistoryIndex(historyIndex + 1);
        setInputText(inputHistory[historyIndex + 1]);
      } else {
        setHistoryIndex(-1);
        setInputText('');
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showSuggestions && suggestions.length > 0) {
        // Select suggestion
        setInputText(suggestions[selectedSuggestion]);
        setShowSuggestions(false);
      } else {
        handleSend();
      }
    } else if (e.key === 'ArrowDown' && showSuggestions && suggestions.length > 0) {
      e.preventDefault();
      setSelectedSuggestion(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp' && showSuggestions && suggestions.length > 0) {
      e.preventDefault();
      setSelectedSuggestion(prev => Math.max(prev - 1, 0));
    }
  };

  // Handle send message
  const handleSend = async () => {
    if (!inputText.trim() || loading) return;

    const userMessage = {
      type: 'user',
      text: inputText.trim(),
      timestamp: new Date().toISOString(),
      id: Date.now()
    };

    // Add to input history
    const newHistory = [...inputHistory, inputText.trim()].slice(-10);
    setInputHistory(newHistory);
    localStorage.setItem(`titan_input_history_${symbol}`, JSON.stringify(newHistory));

    // Add user message immediately
    setMessages(prev => [...prev, userMessage]);
    const question = inputText.trim();
    setInputText('');
    setStreamingText('');
    setHistoryIndex(-1);
    setShowSuggestions(false);
    setLoading(true);

    // Abort any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      // Try streaming first, fallback to regular if not supported
      const response = await fetch('http://127.0.0.1:8000/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: symbol,
          question: question
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error('Streaming not available, falling back to regular');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              break;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                accumulatedText += parsed.text;
                setStreamingText(accumulatedText);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }

      // Finalize message
      const aiMessage = {
        type: 'ai',
        text: accumulatedText || 'No response received.',
        timestamp: new Date().toISOString(),
        id: Date.now() + 1
      };

      setMessages(prev => [...prev, aiMessage]);
      setStreamingText('');
    } catch (error) {
      // Fallback to regular API
      if (error.name === 'AbortError') {
        return;
      }

      try {
        const response = await axios.post('http://127.0.0.1:8000/api/chat', {
          symbol: symbol,
          question: question
        });

        const aiMessage = {
          type: 'ai',
          text: response.data.reply || 'No response received.',
          timestamp: new Date().toISOString(),
          id: Date.now() + 1,
          error: false
        };

        setMessages(prev => [...prev, aiMessage]);
      } catch (apiError) {
        console.error('Chat error:', apiError);
        const errorMessage = {
          type: 'ai',
          text: apiError.response?.data?.reply || `❌ Error: ${apiError.message}. Please try again.`,
          timestamp: new Date().toISOString(),
          id: Date.now() + 1,
          error: true
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } finally {
      setLoading(false);
      setStreamingText('');
      abortControllerRef.current = null;
    }
  };

  // Retry failed message
  const handleRetry = (messageIndex) => {
    const failedMessage = messages[messageIndex];
    if (failedMessage && failedMessage.type === 'user') {
      // Find the user message before the failed AI response
      const userMsg = messages[messageIndex];
      if (userMsg) {
        setInputText(userMsg.text);
        // Remove the failed AI message
        setMessages(prev => prev.filter((_, idx) => idx !== messageIndex + 1));
        setTimeout(() => handleSend(), 100);
      }
    }
  };

  // Delete message
  const handleDeleteMessage = (index) => {
    setMessages(prev => prev.filter((_, idx) => idx !== index));
    setMessageMenuOpen(null);
  };

  // Clear chat history
  const handleClearHistory = () => {
    if (window.confirm('Clear all chat history for this stock?')) {
      setMessages([]);
      if (symbol) {
        localStorage.removeItem(`titan_chat_${symbol}`);
      }
      toast.success('Chat history cleared');
    }
  };

  // Export chat history
  const handleExportChat = (format) => {
    if (!symbol || messages.length === 0) {
      toast.error('No messages to export');
      return;
    }

    const symbolName = symbol.replace('.NS', '').replace('.BO', '');
    let content = '';
    let filename = '';
    let mimeType = '';

    if (format === 'txt') {
      content = `Titan Chat Export - ${symbolName}\n`;
      content += `Exported: ${new Date().toLocaleString()}\n\n`;
      messages.forEach(msg => {
        const time = new Date(msg.timestamp).toLocaleString();
        content += `[${time}] ${msg.type === 'user' ? 'You' : 'AI'}: ${msg.text}\n\n`;
      });
      filename = `titan_chat_${symbolName}_${Date.now()}.txt`;
      mimeType = 'text/plain';
    } else if (format === 'md') {
      content = `# Titan Chat Export - ${symbolName}\n\n`;
      content += `**Exported:** ${new Date().toLocaleString()}\n\n`;
      content += '---\n\n';
      messages.forEach(msg => {
        const time = new Date(msg.timestamp).toLocaleString();
        content += `## [${time}] ${msg.type === 'user' ? 'You' : 'AI'}\n\n`;
        content += `${msg.text}\n\n---\n\n`;
      });
      filename = `titan_chat_${symbolName}_${Date.now()}.md`;
      mimeType = 'text/markdown';
    } else if (format === 'json') {
      content = JSON.stringify({
        symbol,
        symbolName,
        exported: new Date().toISOString(),
        messages
      }, null, 2);
      filename = `titan_chat_${symbolName}_${Date.now()}.json`;
      mimeType = 'application/json';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported as ${format.toUpperCase()}`);
  };

  // Filter messages by search query
  const filteredMessages = searchQuery.trim()
    ? messages.filter(msg => 
        msg.text.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  return (
    <div className="flex flex-col h-full bg-[#0A0A0A] border border-[#1A1A1A] rounded relative">
      <Toaster 
        position="top-right"
        toastOptions={{
          style: {
            background: '#1A1A1A',
            color: '#E0E0E0',
            border: '1px solid #333',
          },
        }}
      />
      
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A1A1A] flex-shrink-0">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-[#00CCFF]" />
          <span className="text-xs font-bold text-[#E0E0E0] uppercase tracking-wider">
            TITAN AI ASSISTANT
          </span>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <>
              <button
                onClick={() => setShowSearch(!showSearch)}
                className="p-1.5 hover:bg-[#1A1A1A] rounded transition-colors text-[#666] hover:text-[#E0E0E0]"
                title="Search messages"
              >
                <Search size={14} />
              </button>
              <div className="relative">
                <button
                  onClick={() => setMessageMenuOpen(messageMenuOpen === 'export' ? null : 'export')}
                  className="p-1.5 hover:bg-[#1A1A1A] rounded transition-colors text-[#666] hover:text-[#E0E0E0]"
                  title="Export chat"
                >
                  <Download size={14} />
                </button>
                {messageMenuOpen === 'export' && (
                  <div className="absolute right-0 top-full mt-1 bg-[#1A1A1A] border border-[#333] rounded shadow-lg z-50 min-w-[120px]">
                    <button
                      onClick={() => { handleExportChat('txt'); setMessageMenuOpen(null); }}
                      className="w-full text-left px-3 py-2 text-xs text-[#E0E0E0] hover:bg-[#2A2A2A] flex items-center gap-2"
                    >
                      Export as TXT
                    </button>
                    <button
                      onClick={() => { handleExportChat('md'); setMessageMenuOpen(null); }}
                      className="w-full text-left px-3 py-2 text-xs text-[#E0E0E0] hover:bg-[#2A2A2A] flex items-center gap-2"
                    >
                      Export as MD
                    </button>
                    <button
                      onClick={() => { handleExportChat('json'); setMessageMenuOpen(null); }}
                      className="w-full text-left px-3 py-2 text-xs text-[#E0E0E0] hover:bg-[#2A2A2A] flex items-center gap-2"
                    >
                      Export as JSON
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={handleClearHistory}
                className="p-1.5 hover:bg-[#1A1A1A] rounded transition-colors text-[#666] hover:text-[#E0E0E0]"
                title="Clear history"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <div className="px-4 py-2 border-b border-[#1A1A1A] bg-[#0F0F0F]">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages..."
              className="flex-1 bg-[#1A1A1A] border border-[#333] text-[#E0E0E0] px-3 py-1.5 rounded text-xs focus:outline-none focus:border-[#00CCFF]"
              autoFocus
            />
            <button
              onClick={() => { setShowSearch(false); setSearchQuery(''); }}
              className="p-1.5 hover:bg-[#1A1A1A] rounded text-[#666] hover:text-[#E0E0E0]"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Message Area */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
      >
        {filteredMessages.length === 0 && !loading ? (
          <div className="text-center py-8">
            <div className="text-sm text-[#888] mb-4">
              Ready to analyze {symbol?.replace('.NS', '').replace('.BO', '') || 'stock'}...
            </div>
            {/* Proactive Suggestions */}
            {suggestedQuestions.length > 0 && (
              <div className="space-y-2 mt-4">
                <div className="text-xs text-[#666] uppercase tracking-wider mb-2">Suggested Questions</div>
                {suggestedQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(q)}
                    className="block w-full text-left px-4 py-2 bg-[#1A1A1A] hover:bg-[#2A2A2A] border border-[#333] hover:border-[#00CCFF] rounded-lg text-xs text-[#E0E0E0] transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          filteredMessages.map((msg, index) => {
            const isUser = msg.type === 'user';
            const isError = msg.error === true;
            
            return (
              <div
                key={msg.id || index}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'} group animate-fadeIn`}
                style={{ animation: 'fadeIn 0.3s ease-in' }}
              >
                <div className="max-w-[90%] relative">
                  <div
                    className={`rounded-lg px-4 py-2.5 text-sm shadow-lg ${
                      isUser
                        ? 'bg-[#0066AA] text-white'
                        : isError
                        ? 'bg-[#4A1A1A] text-[#FF6666] border border-[#FF4444]/30'
                        : 'bg-[#1A1A1A] text-[#E0E0E0]'
                    }`}
                  >
                    {!isUser && (
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Bot size={12} className="text-[#00CCFF]" />
                          <span className="text-[10px] text-[#666] uppercase">AI</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleCopyMessage(msg.text)}
                            className="p-1 hover:bg-[#2A2A2A] rounded transition-colors"
                            title="Copy"
                          >
                            <Copy size={12} className="text-[#888] hover:text-[#E0E0E0]" />
                          </button>
                          {!isError && (
                            <>
                              <button
                                onClick={() => handleFeedback(index, 'up')}
                                className="p-1 hover:bg-[#2A2A2A] rounded transition-colors"
                                title="Helpful"
                              >
                                <ThumbsUp size={12} className="text-[#888] hover:text-[#00FF00]" />
                              </button>
                              <button
                                onClick={() => handleFeedback(index, 'down')}
                                className="p-1 hover:bg-[#2A2A2A] rounded transition-colors"
                                title="Not helpful"
                              >
                                <ThumbsDown size={12} className="text-[#888] hover:text-[#FF4444]" />
                              </button>
                            </>
                          )}
                          <div className="relative">
                            <button
                              onClick={() => setMessageMenuOpen(messageMenuOpen === index ? null : index)}
                              className="p-1 hover:bg-[#2A2A2A] rounded transition-colors"
                              title="More options"
                            >
                              <MoreVertical size={12} className="text-[#888] hover:text-[#E0E0E0]" />
                            </button>
                            {messageMenuOpen === index && (
                              <div className="absolute right-0 top-full mt-1 bg-[#1A1A1A] border border-[#333] rounded shadow-lg z-50 min-w-[120px]">
                                <button
                                  onClick={() => { handleCopyMessage(msg.text); setMessageMenuOpen(null); }}
                                  className="w-full text-left px-3 py-2 text-xs text-[#E0E0E0] hover:bg-[#2A2A2A] flex items-center gap-2"
                                >
                                  <Copy size={12} /> Copy
                                </button>
                                {isError && (
                                  <button
                                    onClick={() => { handleRetry(index); setMessageMenuOpen(null); }}
                                    className="w-full text-left px-3 py-2 text-xs text-[#E0E0E0] hover:bg-[#2A2A2A] flex items-center gap-2"
                                  >
                                    <RotateCcw size={12} /> Retry
                                  </button>
                                )}
                                <button
                                  onClick={() => { handleDeleteMessage(index); }}
                                  className="w-full text-left px-3 py-2 text-xs text-[#FF4444] hover:bg-[#2A2A2A] flex items-center gap-2"
                                >
                                  <Trash2 size={12} /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div className="prose prose-invert prose-sm max-w-none">
                      {isUser ? (
                        <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                      ) : (
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                            strong: ({ children }) => <strong className="text-[#00CCFF] font-bold">{children}</strong>,
                            em: ({ children }) => <em className="text-[#FFAA00] italic">{children}</em>,
                            code: ({ children, className }) => {
                              const isInline = !className;
                              return isInline ? (
                                <code className="bg-[#0A0A0A] px-1.5 py-0.5 rounded text-[#00FF00] text-xs font-mono">{children}</code>
                              ) : (
                                <code className="block bg-[#0A0A0A] p-2 rounded text-[#00FF00] text-xs font-mono overflow-x-auto">{children}</code>
                              );
                            },
                            ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                            li: ({ children }) => <li className="text-[#E0E0E0]">{children}</li>,
                            table: ({ children }) => (
                              <div className="overflow-x-auto my-2">
                                <table className="min-w-full border-collapse border border-[#333]">
                                  {children}
                                </table>
                              </div>
                            ),
                            th: ({ children }) => (
                              <th className="border border-[#333] px-2 py-1 bg-[#0A0A0A] text-[#00CCFF] text-xs font-bold">
                                {children}
                              </th>
                            ),
                            td: ({ children }) => (
                              <td className="border border-[#333] px-2 py-1 text-xs text-[#E0E0E0]">
                                {children}
                              </td>
                            ),
                            a: ({ href, children }) => (
                              <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#00CCFF] hover:underline">
                                {children}
                              </a>
                            ),
                          }}
                        >
                          {msg.text}
                        </ReactMarkdown>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[9px] text-[#666]">
                        {formatRelativeTime(msg.timestamp)}
                      </span>
                      {isError && (
                        <button
                          onClick={() => handleRetry(index)}
                          className="text-[9px] text-[#FF4444] hover:text-[#FF6666] flex items-center gap-1"
                        >
                          <RotateCcw size={10} /> Retry
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        
        {/* Streaming text */}
        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[90%] bg-[#1A1A1A] text-[#E0E0E0] rounded-lg px-4 py-2.5 text-sm shadow-lg">
              <div className="flex items-center gap-2 mb-1">
                <Bot size={12} className="text-[#00CCFF]" />
                <span className="text-[10px] text-[#666] uppercase">AI</span>
              </div>
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong className="text-[#00CCFF] font-bold">{children}</strong>,
                  }}
                >
                  {streamingText}
                </ReactMarkdown>
              </div>
              <span className="inline-block w-2 h-4 bg-[#00CCFF] animate-pulse ml-1">|</span>
            </div>
          </div>
        )}
        
        {loading && !streamingText && (
          <div className="flex justify-start">
            <div className="bg-[#1A1A1A] text-[#E0E0E0] rounded-lg px-4 py-2.5 text-sm flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-[#00CCFF] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 bg-[#00CCFF] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 bg-[#00CCFF] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
              <span>Thinking...</span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Reply Buttons */}
      {messages.length > 0 && !loading && suggestedQuestions.length > 0 && (
        <div className="px-4 py-2 border-t border-[#1A1A1A] bg-[#0F0F0F] flex flex-wrap gap-2">
          {suggestedQuestions.slice(0, 3).map((q, idx) => (
            <button
              key={idx}
              onClick={() => handleSuggestionClick(q)}
              className="px-3 py-1.5 bg-[#1A1A1A] hover:bg-[#2A2A2A] border border-[#333] hover:border-[#00CCFF] rounded-full text-xs text-[#E0E0E0] transition-all"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div 
        className="flex flex-col gap-2 p-4 border-t border-[#1A1A1A] flex-shrink-0 bg-[#0A0A0A]"
        style={{ zIndex: 200 }}
      >
        {/* Auto-complete Suggestions */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="bg-[#1A1A1A] border border-[#333] rounded shadow-lg max-h-40 overflow-y-auto">
            {suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setInputText(suggestion);
                  setShowSuggestions(false);
                  inputRef.current?.focus();
                }}
                className={`w-full text-left px-3 py-2 text-xs text-[#E0E0E0] hover:bg-[#2A2A2A] ${
                  idx === selectedSuggestion ? 'bg-[#2A2A2A]' : ''
                }`}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Ask about this stock... (Ctrl+K to focus, Ctrl+Enter to send)"
            disabled={loading || !symbol}
            maxLength={500}
            className="flex-1 bg-[#1A1A1A] border border-[#333] text-[#E0E0E0] px-3 py-2 rounded text-sm focus:outline-none focus:border-[#00CCFF] disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={loading || !inputText.trim() || !symbol}
            className="bg-[#00CCFF] hover:bg-[#00AAFF] disabled:bg-[#333] disabled:text-[#666] disabled:cursor-not-allowed text-black px-4 py-2 rounded text-sm font-bold flex items-center gap-2 transition-colors"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
          </button>
        </div>
        {inputText.length > 400 && (
          <div className="text-[10px] text-[#FFAA00] text-right">
            {inputText.length}/500 characters
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-in;
        }
      `}</style>
    </div>
  );
}
