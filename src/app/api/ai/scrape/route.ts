import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json(
        { error: 'URL requerida' },
        { status: 400 }
      );
    }

    // Validar URL
    let validUrl: URL;
    try {
      validUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'URL inválida' },
        { status: 400 }
      );
    }

    // Fetch del contenido
    const response = await fetch(validUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Error al cargar la URL: ${response.statusText}` },
        { status: response.status }
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extraer información relevante
    const title = $('title').text() || $('h1').first().text() || '';
    const description = $('meta[name="description"]').attr('content') || '';
    
    // Extraer texto del body (limpio)
    $('script, style, nav, footer, header').remove();
    const bodyText = $('body').text()
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 3000); // Limitar a 3000 caracteres

    // Extraer precios si los hay
    const prices: string[] = [];
    $('*').each((_, el) => {
      const text = $(el).text();
      const priceMatch = text.match(/\$\s*[\d,]+\.?\d*/g);
      if (priceMatch) {
        prices.push(...priceMatch);
      }
    });

    // Extraer imágenes
    const images: string[] = [];
    $('img').each((_, el) => {
      const src = $(el).attr('src');
      if (src && src.startsWith('http')) {
        images.push(src);
      }
    });

    const content = {
      url: validUrl.toString(),
      title,
      description,
      bodyText,
      prices: [...new Set(prices)].slice(0, 10),
      images: images.slice(0, 5),
      summary: `${title}\n\n${description}\n\n${bodyText.substring(0, 500)}...`
    };

    return NextResponse.json({
      success: true,
      content
    });

  } catch (error) {
    console.error('Error scraping URL:', error);
    return NextResponse.json(
      { error: 'Error al procesar la URL' },
      { status: 500 }
    );
  }
}
