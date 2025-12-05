import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Bot, Send, Loader2 } from 'lucide-react';

export default function TitanChat({ symbol }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Reset messages when symbol changes
  useEffect(() => {
    setMessages([]);
    setInputText('');
  }, [symbol]);

  const handleSend = async () => {
    if (!inputText.trim() || loading) return;

    const userMessage = {
      type: 'user',
      text: inputText.trim(),
      timestamp: new Date()
    };

    // Add user message immediately
    setMessages(prev => [...prev, userMessage]);
    const question = inputText.trim();
    setInputText('');
    setLoading(true);

    try {
      const response = await axios.post('http://127.0.0.1:8000/api/chat', {
        symbol: symbol,
        question: question
      });

      const aiMessage = {
        type: 'ai',
        text: response.data.reply || 'No response received.',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = {
        type: 'ai',
        text: error.response?.data?.reply || `❌ Error: ${error.message}. Please try again.`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0A0A0A] border border-[#1A1A1A] rounded">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1A1A1A] flex-shrink-0">
        <Bot size={18} className="text-[#00CCFF]" />
        <span className="text-xs font-bold text-[#E0E0E0] uppercase tracking-wider">
          TITAN AI ASSISTANT
        </span>
      </div>

      {/* Message Area */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
      >
        {messages.length === 0 ? (
          <div className="text-sm text-[#888] text-center py-8">
            Ready to analyze {symbol?.replace('.NS', '').replace('.BO', '') || 'stock'}...
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[90%] rounded-lg px-4 py-2 text-sm ${
                  msg.type === 'user'
                    ? 'bg-[#0066AA] text-white'
                    : 'bg-[#1A1A1A] text-[#E0E0E0]'
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{msg.text}</div>
              </div>
            </div>
          ))
        )}
        
        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#1A1A1A] text-[#E0E0E0] rounded-lg px-4 py-2 text-sm flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-[#00CCFF]" />
              <span>Thinking...</span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex gap-2 p-4 border-t border-[#1A1A1A] flex-shrink-0">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask about this stock..."
          disabled={loading || !symbol}
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
    </div>
  );
}

