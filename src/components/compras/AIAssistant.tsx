'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, Mic, Send, X, Loader2, Volume2, StopCircle, Image, Link, Paperclip } from 'lucide-react';
import Button from '@/components/ui/Button';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  image?: string;
  url?: string;
}

interface AIAssistantProps {
  restockData?: any[];
  topSales?: any[];
  openSignal?: number;
}

export default function AIAssistant({ restockData = [], topSales = [], openSignal = 0 }: AIAssistantProps) {
  // Detección local de intención de ventas para elegir agentId dinámicamente
  const detectSalesIntent = (text: string): boolean => {
    const q = text.toLowerCase();
    const salesKeywords = [
      'más vendido', 'mas vendido', 'más vendidos', 'mas vendidos',
      'se vendió más', 'se vendio mas', 'se vende más', 'se vende mas',
      'top ventas', 'top productos', 'análisis de ventas', 'analisis de ventas',
      'productos críticos', 'productos criticos', 'stock crítico', 'stock critico',
      'cobertura de stock', 'semanas de cobertura', 'semanas de stock',
      'productos sanos', 'productos agotados', 'sin stock',
      'ventas por categoría', 'ventas por categoria', 'ventas por marca',
      'velocidad de venta', 'tendencia de ventas',
      'qué comprar', 'que comprar', 'prioridad de compra',
      'presupuesto de restock', 'reporte de ventas',
      'cuánto va a durar', 'cuanto va a durar',
      'cuántas semanas', 'cuantas semanas',
    ];
    if (salesKeywords.some((kw) => q.includes(kw))) return true;
    // Detección flexible: palabras sueltas que juntas indican ventas
    const hasVendio = q.includes('vendió') || q.includes('vendio') || q.includes('vende') || q.includes('venta') || q.includes('ventas');
    const hasMas = q.includes('más') || q.includes('mas');
    const hasProducto = q.includes('producto') || q.includes('productos');
    const hasTiempo = q.includes('ayer') || q.includes('semana') || q.includes('mes') || q.includes('hoy') || q.includes('día') || q.includes('dia');
    if (hasVendio && (hasMas || hasTiempo)) return true;
    if (hasProducto && hasVendio) return true;
    return false;
  };
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userId, setUserId] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [urlToAnalyze, setUrlToAnalyze] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
      
      // Generar o recuperar userId y sessionId
      let storedUserId = localStorage.getItem('mia_user_id');
      let storedSessionId = localStorage.getItem('mia_session_id');
      
      if (!storedUserId) {
        storedUserId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('mia_user_id', storedUserId);
      }
      
      if (!storedSessionId) {
        storedSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('mia_session_id', storedSessionId);
      }
      
      setUserId(storedUserId);
      setSessionId(storedSessionId);
      
      // Cargar historial de conversación
      loadConversationHistory(storedUserId);
    }
  }, []);
  
  const loadConversationHistory = async (uid: string) => {
    try {
      const response = await fetch('/api/ai/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'load',
          userId: uid,
          limit: 200
        })
      });
      
      const data = await response.json();
      
      if (data.success && data.messages && data.messages.length > 0) {
        setMessages(data.messages);
      } else {
        // Mensaje de bienvenida si no hay historial
        setMessages([{
          role: 'assistant',
          content: 'Hola! Soy Mía, tu asistente de compras de Solcom AI. Puedo ayudarte a analizar qué productos necesitas comprar, revisar el inventario y darte recomendaciones. ¿En qué puedo ayudarte?',
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      console.error('Error cargando historial:', error);
      setMessages([{
        role: 'assistant',
        content: 'Hola! Soy Mía, tu asistente de compras de Solcom AI. ¿En qué puedo ayudarte?',
        timestamp: new Date()
      }]);
    } finally {
      setIsLoadingHistory(false);
    }
  };
  
  const saveMessageToHistory = async (message: Message) => {
    if (!userId) return;
    
    try {
      await fetch('/api/ai/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          userId,
          sessionId,
          message: {
            role: message.role,
            content: message.content,
            image: message.image,
            url: message.url,
            metadata: {
              timestamp: message.timestamp.toISOString()
            }
          }
        })
      });
    } catch (error) {
      console.error('Error guardando mensaje:', error);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (openSignal > 0) {
      setIsOpen(true);
    }
  }, [openSignal]);

  const buildContext = () => {
    let context = 'Contexto del módulo de Compras:\n\n';
    const hasConversationHistory = messages.length > 1;
    
    // Agregar historial COMPLETO de conversación (hasta 200 mensajes)
    if (hasConversationHistory) {
      context += 'Historial completo de conversación:\n';
      const recentMessages = messages.slice(-50); // Últimos 50 para contexto (balance entre memoria y tokens)
      recentMessages.forEach(msg => {
        const preview = msg.content.length > 600 ? msg.content.substring(0, 600) + '...' : msg.content;
        context += `${msg.role === 'user' ? 'Usuario' : 'Asistente'}: ${preview}\n`;
      });
      context += '\n';
    }
    
    let hasStructuredData = false;
    
    if (restockData && restockData.length > 0) {
      hasStructuredData = true;
      const needsRestock = restockData.filter(r => r.restock_sugerido > 0);
      const critical = restockData.filter(r => r.stock_total <= r.weekly_avg && r.restock_sugerido > 0);
      const totalBudget = restockData.reduce((sum, r) => sum + Number(r.presupuesto), 0);
      
      context += `Total de productos analizados: ${restockData.length}\n`;
      context += `Productos que necesitan restock: ${needsRestock.length}\n`;
      context += `Productos críticos (stock < 1 semana): ${critical.length}\n`;
      context += `Presupuesto total estimado: C$ ${Math.round(totalBudget).toLocaleString('es-NI')}\n\n`;
      
      if (critical.length > 0) {
        context += 'Productos CRÍTICOS (prioridad alta):\n';
        critical.slice(0, 5).forEach(p => {
          context += `- ${p.name} (SKU: ${p.sku}): Stock actual ${p.stock_total}, necesita ${p.restock_sugerido} unidades, presupuesto C$ ${Math.round(p.presupuesto).toLocaleString('es-NI')}\n`;
        });
        context += '\n';
      }
      
      if (needsRestock.length > 0) {
        context += 'Top 10 productos por presupuesto requerido:\n';
        const sorted = [...needsRestock].sort((a, b) => b.presupuesto - a.presupuesto);
        sorted.slice(0, 10).forEach(p => {
          context += `- ${p.name}: ${p.restock_sugerido} unidades, C$ ${Math.round(p.presupuesto).toLocaleString('es-NI')}\n`;
        });
      }
    }
    
    if (topSales && topSales.length > 0) {
      context += '\nProductos con mayor salida HOY:\n';
      topSales.slice(0, 5).forEach(p => {
        context += `- ${p.name}: ${p.sales_sum} unidades vendidas\n`;
      });
    }
    
    return (hasStructuredData || hasConversationHistory || (topSales && topSales.length > 0)) ? context : '';
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona una imagen válida');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const sendMessage = async (text: string, imageData?: string, url?: string) => {
    if (!text.trim() && !imageData && !url) return;

    const userMessage: Message = {
      role: 'user',
      content: text || (imageData ? '[Imagen adjunta]' : '') || (url ? `[URL: ${url}]` : ''),
      timestamp: new Date(),
      image: imageData,
      url: url
    };

    setMessages(prev => [...prev, userMessage]);
    
    // Guardar mensaje del usuario en BD
    saveMessageToHistory(userMessage);
    setInput('');
    setUploadedImage(null);
    setUrlToAnalyze('');
    setShowUrlInput(false);
    setIsLoading(true);

    try {
      const context = buildContext();
      
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          context,
          agentId: detectSalesIntent(text) ? 'sales-analyst' : 'audit',
          image: imageData,
          url: url,
          useAI: !!(imageData || url)
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo obtener respuesta del asistente');
      }

      if (data.answer) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: data.answer,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
        
        // Guardar respuesta del asistente en BD
        saveMessageToHistory(assistantMessage);
        
        speakText(data.answer);
      } else {
        throw new Error('El asistente no devolvió una respuesta válida');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Lo siento, hubo un error al procesar tu mensaje. Por favor intenta de nuevo.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('No se pudo acceder al micrófono. Por favor verifica los permisos.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    // No usamos Whisper - Web Speech API es suficiente y gratis
    alert('Usa el botón de micrófono para hablar directamente (reconocimiento de voz en tiempo real)');
  };

  const startVoiceRecognition = () => {
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        alert('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.');
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'es-ES';
      recognition.continuous = false;
      recognition.interimResults = false;
      
      recognition.onstart = () => {
        setIsRecording(true);
      };
      
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsRecording(false);
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        if (event.error === 'no-speech') {
          alert('No se detectó voz. Intenta de nuevo.');
        } else {
          alert('Error al transcribir. Intenta escribir tu mensaje.');
        }
      };
      
      recognition.onend = () => {
        setIsRecording(false);
      };
      
      recognition.start();
    } catch (error) {
      console.error('Error starting voice recognition:', error);
      setIsRecording(false);
      alert('Error al iniciar reconocimiento de voz.');
    }
  };

  const speakText = (text: string) => {
    if (!synthRef.current) return;
    
    // Cancelar cualquier speech en progreso
    synthRef.current.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    synthRef.current.speak(utterance);
  };

  const stopSpeaking = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
          border: 'none',
          boxShadow: '0 4px 20px rgba(220, 38, 38, 0.4)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          transition: 'transform 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
      >
        <Bot size={28} color="#fff" />
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      width: 400,
      height: 600,
      background: '#1a1a2e',
      borderRadius: 16,
      border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 1000,
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: 16,
        background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Bot size={24} color="#fff" />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
              Mía - Asistente de Compras
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }}>
              Solcom AI
            </div>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 4
          }}
        >
          <X size={20} color="#fff" />
        </button>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
            }}
          >
            <div style={{
              maxWidth: '80%',
              padding: 12,
              borderRadius: 12,
              background: msg.role === 'user' 
                ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)'
                : 'rgba(255,255,255,0.05)',
              color: '#fff',
              fontSize: 14,
              lineHeight: 1.5
            }}>
              {msg.image && (
                <img 
                  src={msg.image} 
                  alt="Uploaded" 
                  style={{ 
                    maxWidth: '100%', 
                    borderRadius: 8, 
                    marginBottom: 8 
                  }} 
                />
              )}
              {msg.url && (
                <div style={{ 
                  fontSize: 11, 
                  opacity: 0.8, 
                  marginBottom: 8,
                  wordBreak: 'break-all'
                }}>
                  🔗 {msg.url}
                </div>
              )}
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: 12,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.05)',
              display: 'flex',
              gap: 8,
              alignItems: 'center'
            }}>
              <Loader2 size={16} className="animate-spin" color="#fff" />
              <span style={{ fontSize: 14, color: '#fff' }}>Pensando...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Preview de imagen o URL */}
      {(uploadedImage || showUrlInput) && (
        <div style={{
          padding: 12,
          borderTop: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.02)'
        }}>
          {uploadedImage && (
            <div style={{ position: 'relative' }}>
              <img 
                src={uploadedImage} 
                alt="Preview" 
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: 150, 
                  borderRadius: 8 
                }} 
              />
              <button
                onClick={() => setUploadedImage(null)}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  background: 'rgba(0,0,0,0.7)',
                  border: 'none',
                  borderRadius: '50%',
                  width: 24,
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <X size={14} color="#fff" />
              </button>
            </div>
          )}
          {showUrlInput && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={urlToAnalyze}
                onChange={(e) => setUrlToAnalyze(e.target.value)}
                placeholder="Pega la URL aquí..."
                style={{
                  flex: 1,
                  padding: 8,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  color: '#fff',
                  fontSize: 12
                }}
              />
              <button
                onClick={() => {
                  setShowUrlInput(false);
                  setUrlToAnalyze('');
                }}
                style={{
                  background: 'rgba(239,68,68,0.2)',
                  border: '1px solid #ef4444',
                  borderRadius: 6,
                  padding: '4px 8px',
                  cursor: 'pointer',
                  color: '#ef4444',
                  fontSize: 11
                }}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: 16,
        borderTop: uploadedImage || showUrlInput ? 'none' : '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        gap: 8,
        alignItems: 'center'
      }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          style={{ display: 'none' }}
        />
        
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || uploadedImage !== null}
          title="Adjuntar imagen"
          style={{
            padding: 10,
            background: uploadedImage ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)',
            border: uploadedImage ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            cursor: isLoading || uploadedImage ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Image size={18} color={uploadedImage ? '#22c55e' : '#fff'} />
        </button>

        <button
          onClick={() => setShowUrlInput(!showUrlInput)}
          disabled={isLoading}
          title="Analizar URL"
          style={{
            padding: 10,
            background: showUrlInput ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
            border: showUrlInput ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Link size={18} color={showUrlInput ? '#3b82f6' : '#fff'} />
        </button>

        {isSpeaking ? (
          <button
            onClick={stopSpeaking}
            style={{
              padding: 10,
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid #ef4444',
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <StopCircle size={20} color="#ef4444" />
          </button>
        ) : (
          <button
            onClick={startVoiceRecognition}
            disabled={isLoading}
            style={{
              padding: 10,
              background: isRecording ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)',
              border: isRecording ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Mic size={20} color={isRecording ? '#ef4444' : '#fff'} />
          </button>
        )}
        
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              sendMessage(
                input || (uploadedImage ? 'Analiza esta imagen' : urlToAnalyze ? `Analiza esta URL: ${urlToAnalyze}` : ''),
                uploadedImage || undefined,
                urlToAnalyze || undefined
              );
            }
          }}
          placeholder="Escribe tu pregunta..."
          disabled={isLoading || isRecording}
          style={{
            flex: 1,
            padding: '10px 12px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            color: '#fff',
            fontSize: 14,
            outline: 'none'
          }}
        />
        
        <button
          onClick={() => sendMessage(
            input || (uploadedImage ? 'Analiza esta imagen' : urlToAnalyze ? `Analiza esta URL: ${urlToAnalyze}` : ''),
            uploadedImage || undefined,
            urlToAnalyze || undefined
          )}
          disabled={isLoading || (!input.trim() && !uploadedImage && !urlToAnalyze) || isRecording}
          style={{
            padding: 10,
            background: (input.trim() || uploadedImage || urlToAnalyze) && !isLoading && !isRecording
              ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)'
              : 'rgba(255,255,255,0.05)',
            border: 'none',
            borderRadius: 8,
            cursor: (input.trim() || uploadedImage || urlToAnalyze) && !isLoading && !isRecording ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Send size={20} color="#fff" />
        </button>
      </div>
    </div>
  );
}
