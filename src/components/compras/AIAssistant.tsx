'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, Mic, Send, X, Loader2, Volume2, StopCircle } from 'lucide-react';
import Button from '@/components/ui/Button';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIAssistantProps {
  restockData?: any[];
  topSales?: any[];
  openSignal?: number;
}

export default function AIAssistant({ restockData = [], topSales = [], openSignal = 0 }: AIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '¡Hola! Soy Mía, tu asistente de compras de Solcom AI. Puedo ayudarte a analizar qué productos necesitas comprar, revisar el inventario y darte recomendaciones. ¿En qué puedo ayudarte?',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

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
    
    return hasStructuredData ? context : '';
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = {
      role: 'user',
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const context = buildContext();
      
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          context,
          agentId: 'audit'
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
    setIsLoading(true);
    try {
      // Aquí usarías Whisper API o similar para transcribir
      // Por ahora, simulamos con Web Speech API
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setIsLoading(false);
        alert('Tu navegador no soporta reconocimiento de voz. Usa el chat escrito para continuar.');
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'es-ES';
      recognition.continuous = false;
      
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        sendMessage(transcript);
      };
      
      recognition.onerror = () => {
        setIsLoading(false);
        alert('Error al transcribir el audio. Intenta escribir tu mensaje.');
      };
      
      // Nota: Web Speech API no acepta Blob directamente
      // En producción, enviarías el audioBlob a un endpoint de transcripción
      recognition.start();
    } catch (error) {
      console.error('Error transcribing audio:', error);
      setIsLoading(false);
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

      {/* Input */}
      <div style={{
        padding: 16,
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        gap: 8,
        alignItems: 'center'
      }}>
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
            onClick={isRecording ? stopRecording : startRecording}
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
          onKeyPress={(e) => e.key === 'Enter' && sendMessage(input)}
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
          onClick={() => sendMessage(input)}
          disabled={isLoading || !input.trim() || isRecording}
          style={{
            padding: 10,
            background: input.trim() && !isLoading && !isRecording
              ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)'
              : 'rgba(255,255,255,0.05)',
            border: 'none',
            borderRadius: 8,
            cursor: input.trim() && !isLoading && !isRecording ? 'pointer' : 'not-allowed',
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
