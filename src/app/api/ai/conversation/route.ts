import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Endpoint para guardar y cargar conversaciones
export async function POST(request: NextRequest) {
  try {
    const { action, userId, sessionId, message, limit = 200 } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'userId requerido' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (action === 'save') {
      // Guardar mensaje en historial
      const { data, error } = await supabase
        .from('conversation_history')
        .insert({
          user_id: userId,
          session_id: sessionId || 'default',
          role: message.role,
          content: message.content,
          image_url: message.image || null,
          url_analyzed: message.url || null,
          metadata: message.metadata || null,
          expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 días
        })
        .select()
        .single();

      if (error) {
        console.error('Error guardando mensaje:', error);
        // Si la tabla no existe, devolver éxito silencioso (el mensaje se guarda en memoria del componente)
        if (error.message.includes('does not exist') || error.code === 'PGRST116') {
          console.log('⚠️  Tabla conversation_history no existe. Mensaje no persistido (solo en memoria).');
          return NextResponse.json({ success: true, data: null });
        }
        return NextResponse.json(
          { error: 'Error guardando mensaje', details: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, data });

    } else if (action === 'load') {
      // Cargar historial de conversación
      const { data, error } = await supabase
        .from('conversation_history')
        .select('id, role, content, image_url, url_analyzed, created_at')
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error cargando historial:', error);
        // Si la tabla no existe, devolver array vacío en lugar de error
        if (error.message.includes('does not exist') || error.code === 'PGRST116') {
          console.log('⚠️  Tabla conversation_history no existe. Devolviendo historial vacío.');
          return NextResponse.json({ success: true, messages: [] });
        }
        return NextResponse.json(
          { error: 'Error cargando historial', details: error.message },
          { status: 500 }
        );
      }

      // Invertir para que los más antiguos estén primero
      const messages = (data || []).reverse().map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: new Date(msg.created_at),
        image: msg.image_url || undefined,
        url: msg.url_analyzed || undefined
      }));

      return NextResponse.json({ success: true, messages });

    } else if (action === 'clear') {
      // Limpiar historial de un usuario
      const { error } = await supabase
        .from('conversation_history')
        .delete()
        .eq('user_id', userId);

      if (error) {
        return NextResponse.json(
          { error: 'Error limpiando historial' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: 'Acción no válida' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Error en conversation API:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// GET para obtener estadísticas
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId requerido' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { count, error } = await supabase
      .from('conversation_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString());

    if (error) {
      return NextResponse.json(
        { error: 'Error obteniendo estadísticas' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      totalMessages: count || 0
    });

  } catch (error) {
    console.error('Error en GET conversation:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
