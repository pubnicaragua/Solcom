'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, Mic, Send, X, Loader2, Volume2, StopCircle, Image, Link, Paperclip, Maximize2, Minimize2 } from 'lucide-react';
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

function renderMessageContent(content: string) {
  if (!content) return null;

  const parseInline = (text: string) => {
    // Escapar HTML
    let parsed = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
      
    // Bold **text**
    parsed = parsed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic *text*
    parsed = parsed.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Inline code `code`
    parsed = parsed.replace(/`(.*?)`/g, '<code style="background: rgba(255,255,255,0.15); padding: 2px 6px; borderRadius: 4px; font-family: monospace; font-size: 0.9em;">$1</code>');
    
    return parsed;
  };

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // 1. Detect Table
    if (line.startsWith('|') && line.endsWith('|')) {
      const tableRows: string[][] = [];
      let isHeaderSeparatorDefined = false;
      
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        const currentLine = lines[i].trim();
        // Check if separator line
        if (currentLine.replace(/[\s\-|:|]/g, '') === '') {
          isHeaderSeparatorDefined = true;
        } else {
          const cells = currentLine.split('|').slice(1, -1).map(c => c.trim());
          tableRows.push(cells);
        }
        i++;
      }
      
      elements.push(
        <div key={`table-container-${i}`} style={{ overflowX: 'auto', margin: '8px 0 16px 0', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: '#fff', minWidth: 400 }}>
            <thead>
              {tableRows.length > 0 && (
                <tr style={{ background: 'rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
                  {tableRows[0].map((cell, idx) => (
                    <th key={idx} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }} dangerouslySetInnerHTML={{ __html: parseInline(cell) }} />
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {tableRows.slice(1).map((row, rowIdx) => (
                <tr key={rowIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: rowIdx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                  {row.map((cell, idx) => (
                    <td key={idx} style={{ padding: '8px 12px' }} dangerouslySetInnerHTML={{ __html: parseInline(cell) }} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    
    // 2. Detect Lists
    if (line.startsWith('* ') || line.startsWith('- ') || line.startsWith('• ') || /^\d+\.\s/.test(line)) {
      const listItems: { text: string; number?: string }[] = [];
      while (i < lines.length && (
        lines[i].trim().startsWith('* ') || 
        lines[i].trim().startsWith('- ') || 
        lines[i].trim().startsWith('• ') ||
        /^\d+\.\s/.test(lines[i].trim())
      )) {
        const itemLine = lines[i].trim();
        const numMatch = itemLine.match(/^(\d+\.)\s(.*)/);
        if (numMatch) {
          listItems.push({ text: numMatch[2], number: numMatch[1] });
        } else {
          listItems.push({ text: itemLine.substring(2) });
        }
        i++;
      }
      
      const isOrdered = !!listItems[0].number;
      elements.push(
        isOrdered ? (
          <ol key={`list-${i}`} style={{ margin: '8px 0 12px 20px', padding: 0, listStyleType: 'decimal', color: '#fff' }}>
            {listItems.map((item, idx) => (
              <li key={idx} style={{ marginBottom: 6, paddingLeft: 4 }} dangerouslySetInnerHTML={{ __html: parseInline(item.text) }} />
            ))}
          </ol>
        ) : (
          <ul key={`list-${i}`} style={{ margin: '8px 0 12px 20px', padding: 0, listStyleType: 'disc', color: '#fff' }}>
            {listItems.map((item, idx) => (
              <li key={idx} style={{ marginBottom: 6 }} dangerouslySetInnerHTML={{ __html: parseInline(item.text) }} />
            ))}
          </ul>
        )
      );
      continue;
    }
    
    // 3. Normal paragraph or line break
    if (line.length > 0) {
      elements.push(
        <p key={`p-${i}`} style={{ margin: '0 0 8px 0', fontSize: 14, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: parseInline(line) }} />
      );
    } else {
      elements.push(<div key={`br-${i}`} style={{ height: 8 }} />);
    }
    i++;
  }
  
  return <div style={{ display: 'flex', flexDirection: 'column' }}>{elements}</div>;
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
      'reabastecer', 'reabastecimiento', 'restock', 'restockear', 'reestockear', 'reesctockear',
      'comprar', 'compra', 'reponer', 'sugier', 'recomiend', 'cuanto', 'cuánto'
    ];
    if (salesKeywords.some((kw) => q.includes(kw))) return true;
    
    // Detección flexible: palabras sueltas que juntas indican ventas
    const hasVendio = q.includes('vendió') || q.includes('vendio') || q.includes('vende') || q.includes('venta') || q.includes('ventas');
    const hasMas = q.includes('más') || q.includes('mas');
    const hasProducto = q.includes('producto') || q.includes('productos');
    const hasTiempo = q.includes('ayer') || q.includes('semana') || q.includes('mes') || q.includes('hoy') || q.includes('día') || q.includes('dia');
    if (hasVendio && (hasMas || hasTiempo)) return true;
    if (hasProducto && hasVendio) return true;

    // Si contiene raíces de stock/comprar/reabastecer
    const hasRestock = q.includes('stoc') || q.includes('stok') || q.includes('compr') || q.includes('reabast') || q.includes('repon') || q.includes('sugier');
    if (hasRestock) return true;

    return false;
  };
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
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
    
    // Historial corto (últimos 8 mensajes) para mantener tokens bajos
    if (hasConversationHistory) {
      context += 'Conversación reciente:\n';
      const recentMessages = messages.slice(-8);
      recentMessages.forEach(msg => {
        const preview = msg.content.length > 300 ? msg.content.substring(0, 300) + '...' : msg.content;
        context += `${msg.role === 'user' ? 'Usuario' : 'Asistente'}: ${preview}\n`;
      });
      context += '\n';
    }
    
    let hasStructuredData = false;
    
    if (restockData && restockData.length > 0) {
      hasStructuredData = true;
      const needsRestock = restockData.filter(r => r.restock_sugerido > 0);
      const criticalCount = restockData.filter(r => r.stock_total <= r.weekly_avg && r.restock_sugerido > 0).length;
      const totalBudget = restockData.reduce((sum, r) => sum + Number(r.presupuesto), 0);
      
      context += `Total de productos analizados: ${restockData.length}\n`;
      context += `Productos que necesitan restock: ${needsRestock.length}\n`;
      context += `Productos críticos (stock < 1 semana): ${criticalCount}\n`;
      context += `Presupuesto total estimado: C$ ${Math.round(totalBudget).toLocaleString('es-NI')}\n\n`;
      
      if (needsRestock.length > 0) {
        context += 'Productos que requieren reabastecimiento (priorizados):\n';
        // Priorizar primero los críticos y luego por presupuesto descendente
        const sorted = [...needsRestock].sort((a, b) => {
          const aCrit = a.stock_total <= a.weekly_avg ? 1 : 0;
          const bCrit = b.stock_total <= b.weekly_avg ? 1 : 0;
          if (aCrit !== bCrit) return bCrit - aCrit;
          return b.presupuesto - a.presupuesto;
        });

        // Limitar a los 40 prioritarios para evitar rate limits del plan gratis de Groq (12k tokens)
        sorted.slice(0, 40).forEach(p => {
          const isCritical = p.stock_total <= p.weekly_avg;
          context += `- [${isCritical ? 'CRÍTICO' : 'REQUERIDO'}] ${p.name} (SKU: ${p.sku}): Stock ${p.stock_total}, necesita ${p.restock_sugerido} uds, presupuesto C$ ${Math.round(p.presupuesto).toLocaleString('es-NI')}\n`;
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
      width: isExpanded ? 750 : 400,
      height: isExpanded ? 750 : 600,
      maxWidth: 'calc(100vw - 48px)',
      maxHeight: 'calc(100vh - 48px)',
      background: '#1a1a2e',
      borderRadius: 16,
      border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 1000,
      overflow: 'hidden',
      transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), height 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setIsExpanded(prev => !prev)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.8,
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
            title={isExpanded ? 'Contraer' : 'Expandir'}
          >
            {isExpanded ? <Minimize2 size={20} color="#fff" /> : <Maximize2 size={20} color="#fff" />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.8,
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
          >
            <X size={20} color="#fff" />
          </button>
        </div>
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
              maxWidth: isExpanded ? '90%' : '80%',
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
              {renderMessageContent(msg.content)}
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
