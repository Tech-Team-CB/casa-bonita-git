// proxy.js - Servidor proxy simple para evitar problemas de CORS
require('dotenv').config(); // Cargar variables de entorno desde .env
const http = require('http');
const https = require('https');
const url = require('url');

// CONFIGURACIÓN PARA PRODUCCIÓN - Leer desde variables de entorno
const PORT = process.env.PORT || 3002;
const X_API_KEY = process.env.X_API_KEY; // CRÍTICO: Configurar en el servidor
const X_SUBDOMAIN = process.env.X_SUBDOMAIN; // CRÍTICO: Configurar en el servidor

// Validar variables de entorno críticas para producción
if (!X_API_KEY || !X_SUBDOMAIN) {
  console.error('❌ ERROR: Variables de entorno faltantes');
  console.error('Configura X_API_KEY y X_SUBDOMAIN en tu servidor');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

// Cache para el token
let tokenCache = {
  token: null,
  expiresAt: null
};

// Función para obtener un token válido
async function getValidToken() {
  // Si el token está válido, devolverlo
  if (tokenCache.token && tokenCache.expiresAt && new Date() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  // Obtener nuevo token
  return new Promise((resolve, reject) => {
    const tokenOptions = {
      method: 'POST',
      headers: {
        'X-API-Key': X_API_KEY,
        'X-Subdomain': X_SUBDOMAIN,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const tokenReq = https.request('https://gw.logicwareperu.com/auth/external/token', tokenOptions, (tokenRes) => {
      let tokenData = '';
      
      tokenRes.on('data', (chunk) => {
        tokenData += chunk;
      });

      tokenRes.on('end', () => {
        try {
          const response = JSON.parse(tokenData);
          if (response.succeeded && response.data && response.data.accessToken) {
            tokenCache.token = response.data.accessToken;
            tokenCache.expiresAt = new Date(Date.now() + 55 * 60 * 1000); // 55 minutos
            resolve(tokenCache.token);
          } else {
            reject(new Error('Token response invalid'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    tokenReq.on('error', reject);
    tokenReq.end();
  });
}

const server = http.createServer(async (req, res) => {
  // Configurar CORS headers para permitir todas las solicitudes
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Subdomain, X-API-Key');

  // Manejar preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Solo permitir métodos GET y POST para este proxy
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // Parsear la URL
  const parsedUrl = url.parse(req.url, true);
  
  console.log(`Incoming request: ${req.method} ${req.url}`);
  
  try {
    // Manejar solicitudes de token directamente
    if (parsedUrl.pathname === '/auth/external/token') {
      const token = await getValidToken();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        succeeded: true,
        data: { accessToken: token }
      }));
      return;
    }
    
    // Para /api/units/stock, usar token automáticamente
    if (parsedUrl.pathname.startsWith('/api/units/stock')) {
      const token = await getValidToken();
      const apiUrl = 'https://gw.logicwareperu.com/external/units/stock' + (parsedUrl.search || '');
      
      console.log(`Proxying request to: ${apiUrl}`);
      
      const options = {
        method: req.method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Subdomain': X_SUBDOMAIN,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Casa-Bonita-Proxy/1.0'
        }
      };

  // Realizar la solicitud a la API
  const apiReq = https.request(apiUrl, options, (apiRes) => {
    let data = '';

    // Configurar headers de respuesta
    res.writeHead(apiRes.statusCode, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });

    // Recopilar datos
    apiRes.on('data', (chunk) => {
      data += chunk;
    });

    // Enviar respuesta cuando termine
    apiRes.on('end', () => {
      console.log(`API response status: ${apiRes.statusCode}`);
      if (apiRes.statusCode === 404) {
        console.log('❌ Error 404 - Endpoint no encontrado');
        console.log('📝 Verifica la URL y el código del proyecto');
        console.log(`📍 URL llamada: ${apiUrl}`);
      }
      if (data) {
        console.log('Response data preview:', data.substring(0, 200) + '...');
      }
      res.end(data);
    });
  });

  // Manejar errores de la API
  apiReq.on('error', (error) => {
    console.error('Error calling API:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to connect to API',
      details: error.message 
    }));
  });

  // Si es POST, leer el body y enviarlo
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      console.log('POST body:', body);
      apiReq.write(body);
      apiReq.end();
    });
  } else {
      // Para GET, finalizar inmediatamente
      apiReq.end();
    }
    return;
  }

  // Ruta no encontrada
  res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));

  } catch (error) {
    console.error('Error in proxy:', error);
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Proxy server running on port ${PORT}`);
  console.log(`📡 Proxying requests to Casa Bonita API`);
  console.log(`🔐 API Key configurada: ${X_API_KEY ? '✅' : '❌'}`);
  console.log(`🏢 Subdominio configurado: ${X_SUBDOMAIN ? '✅' : '❌'}`);
  console.log(`🔗 Use: http://localhost:${PORT}/api/units/stock?projectCode=CASABONITA`);
});

// Manejar cierre elegante
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down proxy server...');
  server.close(() => {
    console.log('✅ Proxy server closed');
    process.exit(0);
  });
});