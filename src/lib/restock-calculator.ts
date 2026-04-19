export interface RestockData {
  producto: string;
  restock_promedio_unid: number;
  restock_promedio_dinero: number;
  precio_unitario: number;
  [key: string]: any; // Para mantener las otras columnas originales
}

export interface RestockResults {
  rows: RestockData[];
  total_unidades: number;
  total_dinero: number;
}

export function processRestockExcel(jsonData: any[]): RestockResults {
  if (!jsonData || jsonData.length === 0) {
    return { rows: [], total_unidades: 0, total_dinero: 0 };
  }

  // Recopilar TODAS las columnas que existen en todo el documento
  // porque xlsx omite campos si están vacíos en la primera fila.
  const allKeys = new Set<string>();
  jsonData.forEach(row => {
    if (row && typeof row === 'object') {
      Object.keys(row).forEach(k => allKeys.add(k));
    }
  });
  
  // Función para normalizar quitando espacios, saltos de línea y guiones
  const normalizeKey = (k: string) => k.toLowerCase().replace(/[\n\r\s\-]/g, '');

  const keysArray = Array.from(allKeys);

  // 1. Columnas de SALIDA (Stricter: debe tener 'salida' y NO 'entrada')
  const salidaCols = keysArray.filter(key => {
    const norm = normalizeKey(key);
    return norm.includes('salida') && !norm.includes('entrada') && /w\d{1,2}/.test(norm);
  });

  // 2. Columna de STOCK ACTUAL (Unidades de cierre de la última semana)
  const stockColName = keysArray.find(key => {
    const norm = normalizeKey(key);
    return norm.includes('unidadesdecierre') || norm.includes('stockactual') || norm.includes('existencia');
  });

  // 3. Columna de CARGO TOTAL (Para sacar el precio unitario si no viene directo)
  const cargoColName = keysArray.find(key => {
    const norm = normalizeKey(key);
    return norm.includes('sumadecargototal') || norm.includes('ventatotal') || norm.includes('ingresototal');
  });

  // 4. Columna de PRECIO directo
  const precioColName = keysArray.find(key => {
    const norm = normalizeKey(key);
    return norm.includes('preciounitario') || norm === 'precio' || norm.includes('costounitario');
  });

  const productoColName = keysArray.find(key => {
    const norm = normalizeKey(key);
    return norm.includes('etiquetasdefila') || 
           norm.includes('artículo') || 
           norm.includes('producto') ||
           norm === 'item' ||
           norm === 'descripcion'
  }) || keysArray[0];

  let total_unidades = 0;
  let total_dinero = 0;

  const rows: RestockData[] = jsonData.map((row) => {
    let sumSalidas = 0;
    salidaCols.forEach(col => {
      let val = row[col];
      if (val === '-' || val === '' || val === null || val === undefined) val = 0;
      // Excel a veces pone paréntesis para negativos: (100) -> -100
      if (typeof val === 'string' && val.includes('(')) {
          val = -Number(val.replace(/[()]/g, ''));
      }
      sumSalidas += Number(val);
    });

    // 📊 Promedio exacto de 5 semanas (o las que existan)
    const divisor = 5; 
    const ventas_promedio_semanal = sumSalidas / divisor;

    // Lógica avanzada: Restock = (Promedio * 4 semanas de cobertura) - Stock Actual
    // Si no queremos restar stock aún y solo ver el promedio, usamos el promedio directo
    let stockActual = 0;
    if (stockColName) {
        let sVal = row[stockColName];
        if (sVal === '-' || !sVal) sVal = 0;
        stockActual = Number(sVal);
    }

    // Por ahora sigamos tu fórmula de Python: solo el promedio
    const restock_promedio_unid = ventas_promedio_semanal;

    // 💰 Obtener precio unitario
    let precio_unitario = 0;
    if (precioColName) {
      precio_unitario = Number(row[precioColName]) || 0;
    } else if (cargoColName && sumSalidas > 0) {
      // Si no hay precio, lo calculamos: Venta Total / Unidades Vendidas
      const cargoTotal = Number(row[cargoColName]) || 0;
      precio_unitario = cargoTotal / sumSalidas;
    }
    
    const restock_promedio_dinero = restock_promedio_unid * precio_unitario;

    total_unidades += restock_promedio_unid;
    total_dinero += restock_promedio_dinero;

    return {
      ...row,
      producto: row[productoColName] || 'Desconocido',
      restock_promedio_unid,
      restock_promedio_dinero,
      precio_unitario,
      stockActual // Lo guardamos por si quieres verlo luego
    };
  });

  return { rows, total_unidades, total_dinero };
}
