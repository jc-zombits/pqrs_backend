const pool = require('../db');

const getDataStats = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sis_catastro_tramites.gestion_pqrs_data'); // ← Cambia "tu_tabla"
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error al obtener datos:', error); // Mostrar error real
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Tarjetas de resumen
const getResumenStats = async (req, res) => {
  try {
    const monthNames = [
      'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
      'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
    ];

    const { cod_subsecretaria } = req.query;

    const ultimoPeriodo = await pool.query(`
      SELECT anio, mes
      FROM sis_catastro_tramites.gestion_pqrs_data
      ORDER BY anio DESC, mes DESC
      LIMIT 1
    `);

    if (!ultimoPeriodo.rows[0]) {
      return res.status(200).json({
        total: 0,
        oportuno: 0,
        no_oportuno: 0,
        a_tiempo: 0,
        abiertas: 0,
        finalizadas: 0,
        periodo: 'Sin datos',
        message: 'No hay datos disponibles'
      });
    }

    const { anio, mes } = ultimoPeriodo.rows[0];
    const periodoTexto = `${monthNames[mes - 1]}/${anio}`;

    const queryParams = [anio, mes];
    let filtro = 'anio = $1 AND mes = $2';

    if (cod_subsecretaria) {
      filtro += ' AND cod_subsecretaria = $3';
      queryParams.push(cod_subsecretaria);
    }

    const result = await pool.query(
      `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN oportunidad = 'OPORTUNO' THEN 1 END) as oportuno,
        COUNT(CASE WHEN oportunidad = 'NO OPORTUNO' THEN 1 END) as no_oportuno,
        COUNT(CASE WHEN oportunidad = 'A TIEMPO' THEN 1 END) as a_tiempo,
        COUNT(CASE WHEN estado = 'ABIERTO' THEN 1 END) as abiertas,
        COUNT(CASE WHEN estado = 'FINALIZADO' THEN 1 END) as finalizadas
      FROM sis_catastro_tramites.gestion_pqrs_data
      WHERE ${filtro}
      `,
      queryParams
    );

    const responseData = {
      total: Number(result.rows[0]?.total) || 0,
      oportuno: Number(result.rows[0]?.oportuno) || 0,
      no_oportuno: Number(result.rows[0]?.no_oportuno) || 0,
      a_tiempo: Number(result.rows[0]?.a_tiempo) || 0,
      abiertas: Number(result.rows[0]?.abiertas) || 0,
      finalizadas: Number(result.rows[0]?.finalizadas) || 0,
      periodo: periodoTexto,
      ultimo_mes: mes,
      ultimo_anio: anio
    };

    console.log('Datos enviados al frontend:', responseData);
    res.status(200).json(responseData);

  } catch (error) {
    console.error('Error detallado en getResumenStats:', {
      message: error.message,
      stack: error.stack,
      query: error.query
    });

    res.status(500).json({
      error: 'Error al obtener estadísticas de resumen',
      detalles: process.env.NODE_ENV === 'development' ? error.message : ''
    });
  }
};

const getCodigosSubsecretaria = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT cod_subsecretaria, subsecretaria
      FROM sis_catastro_tramites.gestion_pqrs_data
      WHERE cod_subsecretaria IS NOT NULL
      ORDER BY cod_subsecretaria
    `);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error al obtener códigos de subsecretaría:', error);
    res.status(500).json({ error: 'Error al obtener códigos de subsecretaría' });
  }
};


// Nueva consulta, estadísticas por estado
const getEstadoMesStats = async (req, res) => {
  const { year } = req.query;
  
  try {
    const result = await pool.query(`
      SELECT estado, mes, COUNT(*) AS cantidad
      FROM sis_catastro_tramites.gestion_pqrs_data
      WHERE (anio, mes) = (
        SELECT anio, mes
        FROM sis_catastro_tramites.gestion_pqrs_data
        ORDER BY anio DESC, mes DESC
        LIMIT 1
      )
      GROUP BY estado, mes
      ORDER BY estado, mes;
    `);

    // Encontrar el último mes con datos
    const ultimoMesConDatos = result.rows.length > 0 
      ? Math.max(...result.rows.map(row => row.mes)) 
      : 0;

    // Preparar datasets
    const estados = [...new Set(result.rows.map(row => row.estado))];
    const datasets = estados.map(estado => {
      const data = Array(12).fill(0);
      result.rows
        .filter(row => row.estado === estado)
        .forEach(row => data[row.mes - 1] = parseInt(row.cantidad));
      
      return {
        estado,
        data: year === new Date().getFullYear() 
          ? data.slice(0, ultimoMesConDatos) // Cortar para año actual
          : data // Mostrar completo para años pasados
      };
    });

    res.json({
      labels: Array.from(
        {length: year === new Date().getFullYear() ? ultimoMesConDatos : 12}, 
        (_, i) => (i + 1).toString()
      ),
      datasets
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error interno' });
  }
};

// nueva consulta - oportunidad
const getOportunidadPorDia = async (req, res) => {
  try {
    const { year, month } = req.query;
    
    let query = `
      SELECT
        fecha_de_ingreso::date AS fecha,
        COUNT(*) FILTER (WHERE oportunidad = 'OPORTUNO') AS oportuno,
        COUNT(*) FILTER (WHERE oportunidad = 'NO OPORTUNO') AS no_oportuno,
        COUNT(*) FILTER (WHERE oportunidad = 'A TIEMPO') AS a_tiempo
      FROM sis_catastro_tramites.gestion_pqrs_data
    `;
    
    const conditions = [];
    const params = [];
    
    // Agregar filtros si existen
    if (year && year !== 'all') {
      conditions.push(`EXTRACT(YEAR FROM fecha_de_ingreso) = $${params.length + 1}`);
      params.push(year);
    }
    
    if (month && month !== 'all') {
      conditions.push(`EXTRACT(MONTH FROM fecha_de_ingreso) = $${params.length + 1}`);
      params.push(month);
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    query += ` GROUP BY fecha_de_ingreso::date ORDER BY fecha;`;

    const result = await pool.query(query, params);
    res.json(result.rows);
    
  } catch (error) {
    console.error("Error al obtener estadísticas por oportunidad:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Nueva consuñta - tema por mes
const getTemaMesStats = async (req, res) => {
  try {
      const result = await pool.query(`
          SELECT 
              mes,
              tema,
              COUNT(*) AS cantidad
          FROM sis_catastro_tramites.gestion_pqrs_data
          GROUP BY mes, tema
          ORDER BY mes ASC, cantidad DESC;
      `);

      // Reorganizamos los datos por mes
      const data = {};

      result.rows.forEach(row => {
          const { mes, tema, cantidad } = row;
          if (!data[mes]) {
              data[mes] = [];
          }
          data[mes].push({ tema, cantidad: parseInt(cantidad) });
      });

      res.json(data);
  } catch (error) {
      console.error("Error al obtener estadísticas por tema y mes:", error);
      res.status(500).json({ error: "Error interno del servidor" });
  }
};

// nueva consulta - tema-estado
const getTemaEstadoStats = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT tema, estado, COUNT(*) as cantidad
      FROM sis_catastro_tramites.gestion_pqrs_data
      WHERE (anio, mes) = (
        SELECT anio, mes
        FROM sis_catastro_tramites.gestion_pqrs_data
        ORDER BY anio DESC, mes DESC
        LIMIT 1
      )
      GROUP BY tema, estado
      ORDER BY tema, estado;
    `);

    res.json(result.rows);

  } catch (error) {
    console.error("Error al obtener estadísticas por tema y estado:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// nueva consulta - mes-fecha de ingreso (cantidad)
const getIngresosPorDiaPorMes = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        EXTRACT(MONTH FROM fecha_de_ingreso::date) AS mes,
        TO_CHAR(fecha_de_ingreso::date, 'YYYY-MM-DD') AS fecha_de_ingreso,
        COUNT(*) AS cantidad
      FROM sis_catastro_tramites.gestion_pqrs_data
      GROUP BY mes, fecha_de_ingreso
      ORDER BY mes, fecha_de_ingreso
    `);
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener ingresos por día por mes:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// nueva consulta - ultimo estado en ruta por mes y tema
const getEstadoRutaPorMesYTema = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        mes,
        tema,
        ultimo_estado_en_ruta,
        COUNT(*) AS cantidad
      FROM sis_catastro_tramites.gestion_pqrs_data
      GROUP BY mes, tema, ultimo_estado_en_ruta
      ORDER BY mes, tema, ultimo_estado_en_ruta
    `);
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener estadísticas por mes, tema y estado en ruta:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Nueva consulta: Cantidad de temas por estado
const getCantidadTemasPorEstado = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        mes,
        tema, 
        estado, 
        COUNT(*) AS cantidad
      FROM sis_catastro_tramites.gestion_pqrs_data
      WHERE estado IN ('ABIERTO', 'FINALIZADO')
      GROUP BY mes, tema, estado
      ORDER BY mes, tema, estado;
    `);

    // Crear un array para almacenar los resultados en el formato que deseas
    const data = [];

    // Reorganizar los datos
    result.rows.forEach(row => {
      const mes = row.mes; // Mes
      const tema = row.tema; // Tema
      const estado = row.estado; // Estado
      const cantidad = parseInt(row.cantidad); // Cantidad

      // Buscar si el tema ya existe para el mes
      const existingEntry = data.find(entry => entry.tema === tema && entry.mes === mes);

      if (existingEntry) {
        // Si existe, actualizar la cantidad para el estado correspondiente
        existingEntry[`Estado_${estado}`] = cantidad;
      } else {
        // Si no existe, agregar un nuevo objeto con los valores correspondientes
        const newEntry = {
          tema: tema,
          Estado_ABIERTO: estado === 'ABIERTO' ? cantidad : 0,
          Estado_FINALIZADO: estado === 'FINALIZADO' ? cantidad : 0,
          mes: mes
        };
        data.push(newEntry);
      }
    });

    // Devolver los resultados en formato JSON
    res.json(data);
  } catch (error) {
    console.error("Error al obtener cantidad de temas por estado:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};


module.exports = { getDataStats, getEstadoMesStats, getOportunidadPorDia, getTemaMesStats, getTemaEstadoStats, getIngresosPorDiaPorMes, getEstadoRutaPorMesYTema, getCantidadTemasPorEstado, getResumenStats, getCodigosSubsecretaria };
