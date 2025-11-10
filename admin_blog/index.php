
<?php
session_start();

// Configuración de la base de datos
define('DB_HOST', 'casabonita.pe');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_NAME', 'casabonita_blogs');

// Configuración de uploads
define('UPLOAD_DIR', __DIR__ . '/static/uploads/');
define('ALLOWED_EXTENSIONS', ['png', 'jpg', 'jpeg', 'gif', 'webp']);

// Crear directorio de uploads si no existe
if (!is_dir(UPLOAD_DIR)) {
    mkdir(UPLOAD_DIR, 0755, true);
}

// Función para conectar a la base de datos
function getDB() {
    try {
        $pdo = new PDO(
            "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
            DB_USER,
            DB_PASS,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
        return $pdo;
    } catch (PDOException $e) {
        return null;
    }
}

// Función para verificar archivos permitidos
function allowedFile($filename) {
    $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    return in_array($extension, ALLOWED_EXTENSIONS);
}

// Función para guardar imagen
function saveImage($file) {
    if (!$file || $file['error'] !== UPLOAD_ERR_OK) {
        return null;
    }
    
    if (!allowedFile($file['name'])) {
        return null;
    }
    
    $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = uniqid() . '_' . basename($file['name']);
    $filepath = UPLOAD_DIR . $filename;
    
    if (move_uploaded_file($file['tmp_name'], $filepath)) {
        return "/static/uploads/" . $filename;
    }
    
    return null;
}

// Función para eliminar imagen
function deleteImage($imagePath) {
    if ($imagePath) {
        $filename = str_replace('/static/uploads/', '', $imagePath);
        $fullPath = UPLOAD_DIR . $filename;
        if (file_exists($fullPath)) {
            unlink($fullPath);
        }
    }
}

// Función para responder JSON
function jsonResponse($data, $status = 200) {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

// Función para parsear FormData en peticiones PUT
function parseFormData() {
    $data = [];
    $files = [];
    
    if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
        // Para PUT, intentar obtener datos del cuerpo
        $input = file_get_contents('php://input');
        
        // Si es FormData, PHP no lo parsea automáticamente en PUT
        // Intentar parsear como query string para datos simples
        if (strpos($_SERVER['CONTENT_TYPE'], 'application/x-www-form-urlencoded') !== false) {
            parse_str($input, $data);
        } else {
            // Para multipart/form-data en PUT, necesitamos $_POST y $_FILES si están disponibles
            $data = $_POST;
            $files = $_FILES;
        }
    } else {
        $data = $_POST;
        $files = $_FILES;
    }
    
    return ['data' => $data, 'files' => $files];
}

// Obtener método HTTP y ruta
$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = str_replace('/admin_blog', '', $path); // Remover prefijo si existe

// Debug temporal - eliminar después
if (strpos($_SERVER['REQUEST_URI'], 'api/blogs') !== false) {
    error_log("DEBUG: method=$method, original_uri={$_SERVER['REQUEST_URI']}, parsed_path=$path");
}

// Router principal
switch (true) {
    // Servir archivos estáticos
    case preg_match('/^\/static\/(.+)$/', $path, $matches):
        serveStaticFile($matches[1]);
        break;
    // Páginas HTML
    case $path === '/' || $path === '/admin':
        include 'templates/login.html';
        break;
        
    case $path === '/blog_dashboard':
        if (!isset($_SESSION['logueado']) || !$_SESSION['logueado']) {
            header('Location: /admin_blog/admin');
            exit;
        }
        include 'templates/blog_dashboard.html';
        break;
    
    // Login
    case $path === '/acceso_login' && $method === 'POST':
        handleLogin();
        break;
    
    // Logout
    case $path === '/logout':
        handleLogout();
        break;
    
    // API Endpoints
    case $path === '/api/blogs' && $method === 'GET':
        apiGetBlogs();
        break;
        
    case $path === '/api/blogs' && $method === 'POST':
        apiCreateBlog();
        break;
        
    case preg_match('/^\/api\/blogs\/(\d+)$/', $path, $matches) && $method === 'GET':
        apiGetBlogById($matches[1]);
        break;
        
    case preg_match('/^\/api\/blogs\/(\d+)$/', $path, $matches) && $method === 'PUT':
        apiUpdateBlog($matches[1]);
        break;
        
    case preg_match('/^\/api\/blogs\/(\d+)\/update$/', $path, $matches) && $method === 'POST':
        apiUpdateBlog($matches[1]);
        break;
        
    case preg_match('/^\/api\/blogs\/(\d+)$/', $path, $matches) && $method === 'DELETE':
        apiDeleteBlog($matches[1]);
        break;
        
    case preg_match('/^\/api\/blogs\/(\d+)\/popular$/', $path, $matches) && $method === 'PUT':
        apiToggleBlogPopular($matches[1]);
        break;
        
    case $path === '/api/blogs/populares' && $method === 'GET':
        apiGetBlogsPopulares();
        break;
        
    case $path === '/api/categorias' && $method === 'GET':
        apiGetCategorias();
        break;
        
    case $path === '/api/cleanup-images' && $method === 'POST':
        apiCleanupImages();
        break;
    
    // Debug endpoints
    case $path === '/ping_db':
        pingDB();
        break;
        
    case $path === '/debug_mysql':
        debugMySQL();
        break;
        
    case $path === '/debug_path':
        jsonResponse([
            'method' => $method,
            'original_uri' => $_SERVER['REQUEST_URI'],
            'parsed_path' => $path,
            'query_string' => $_SERVER['QUERY_STRING'] ?? '',
            'all_server' => $_SERVER
        ]);
        break;
    
    default:
        // Debug para ver qué ruta no se encontró
        error_log("DEBUG: Ruta no encontrada - method=$method, path=$path, original_uri={$_SERVER['REQUEST_URI']}");
        
        http_response_code(404);
        if (strpos($path, '/api/') === 0) {
            // Si es una ruta de API, devolver JSON
            jsonResponse(['ok' => false, 'error' => "Ruta de API no encontrada: $path"], 404);
        } else {
            // Si es una página HTML, devolver HTML
            echo "Página no encontrada";
        }
        break;
}

// Función para servir archivos estáticos
function serveStaticFile($relativePath) {
    $staticDir = __DIR__ . '/static/';
    $filePath = $staticDir . $relativePath;
    
    // Verificar que el archivo existe y está dentro del directorio static
    if (!file_exists($filePath) || !str_starts_with(realpath($filePath), realpath($staticDir))) {
        http_response_code(404);
        echo "Archivo no encontrado";
        return;
    }
    
    // Determinar el tipo MIME
    $extension = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
    $mimeTypes = [
        'css' => 'text/css',
        'js' => 'application/javascript',
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
        'svg' => 'image/svg+xml',
        'ico' => 'image/x-icon'
    ];
    
    $mimeType = $mimeTypes[$extension] ?? 'application/octet-stream';
    
    // Establecer headers apropiados
    header('Content-Type: ' . $mimeType);
    header('Cache-Control: public, max-age=3600'); // Cache por 1 hora
    header('Content-Length: ' . filesize($filePath));
    
    // Servir el archivo
    readfile($filePath);
    exit;
}

// Función de login
function handleLogin() {
    if (!isset($_POST['txtCorreo']) || !isset($_POST['txtPassword'])) {
        $mensaje = "Faltan datos";
        include 'templates/login.html';
        return;
    }
    
    $correo = $_POST['txtCorreo'];
    $password = $_POST['txtPassword'];
    
    $db = getDB();
    if (!$db) {
        $mensaje = "Conexión fallida: No se pudo conectar a la base de datos";
        include 'templates/login.html';
        return;
    }
    
    try {
        $stmt = $db->prepare('SELECT * FROM usuarios WHERE username = ? AND password = ?');
        $stmt->execute([$correo, $password]);
        $account = $stmt->fetch();
        
        if ($account) {
            session_regenerate_id(true); // Prevenir session fixation
            $_SESSION['logueado'] = true;
            $_SESSION['id'] = $account['id'];
            header('Location: /admin_blog/blog_dashboard');
            exit;
        } else {
            $mensaje = "Credenciales incorrectas";
            include 'templates/login.html';
        }
    } catch (PDOException $e) {
        $mensaje = "Error BD: " . $e->getMessage();
        include 'templates/login.html';
    }
}

// Función de logout
function handleLogout() {
    session_destroy();
    header('Location: /admin_blog/admin');
    exit;
}

// API: Obtener blogs
function apiGetBlogs() {
    $db = getDB();
    if (!$db) {
        jsonResponse(['ok' => false, 'error' => 'No DB connection']);
        return;
    }
    
    $page = intval($_GET['page'] ?? 1);
    $perPage = intval($_GET['per_page'] ?? 6);
    $dashboard = filter_var($_GET['dashboard'] ?? false, FILTER_VALIDATE_BOOLEAN);
    
    try {
        if ($dashboard) {
            // Para dashboard: paginado
            $offset = ($page - 1) * $perPage;
            $stmt = $db->prepare('SELECT * FROM blog ORDER BY fecha DESC LIMIT ? OFFSET ?');
            $stmt->execute([$perPage, $offset]);
            $blogs = $stmt->fetchAll();
            
            // Contar total
            $countStmt = $db->query('SELECT COUNT(*) as total FROM blog');
            $totalCount = $countStmt->fetch()['total'];
            $totalPages = ceil($totalCount / $perPage);
            
            jsonResponse([
                'ok' => true,
                'blogs' => $blogs,
                'pagination' => [
                    'current_page' => $page,
                    'per_page' => $perPage,
                    'total_pages' => $totalPages,
                    'total_count' => $totalCount
                ]
            ]);
        } else {
            // Para frontend público: todos los blogs
            $stmt = $db->query('SELECT * FROM blog ORDER BY fecha DESC');
            $blogs = $stmt->fetchAll();
            jsonResponse(['ok' => true, 'blogs' => $blogs]);
        }
    } catch (PDOException $e) {
        jsonResponse(['ok' => false, 'error' => $e->getMessage()]);
    }
}

// API: Crear blog
function apiCreateBlog() {
    $titulo = $_POST['titulo'] ?? '';
    $resumen = $_POST['resumen'] ?? '';
    $contenido = $_POST['contenido'] ?? '';
    $categoria = $_POST['categoria'] ?? '';
    $fecha = $_POST['fecha'] ?? '';
    
    if (!$titulo || !$resumen || !$contenido || !$categoria || !$fecha) {
        jsonResponse(['ok' => false, 'error' => 'faltan datos']);
    }
    
    // Guardar imagen
    $imagenPath = null;
    if (isset($_FILES['imagen'])) {
        $imagenPath = saveImage($_FILES['imagen']);
        if (!$imagenPath) {
            jsonResponse(['ok' => false, 'error' => 'Error al guardar la imagen']);
        }
    }
    
    $db = getDB();
    if (!$db) {
        jsonResponse(['ok' => false, 'error' => 'no DB connection']);
    }
    
    try {
        $stmt = $db->prepare('INSERT INTO blog(titulo, resumen, contenido, categoria, imagen, fecha) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->execute([$titulo, $resumen, $contenido, $categoria, $imagenPath, $fecha]);
        
        jsonResponse(['ok' => true, 'message' => 'blog agregado de manera correcta']);
    } catch (PDOException $e) {
        jsonResponse(['ok' => false, 'error' => $e->getMessage()]);
    }
}

// API: Obtener blog por ID
function apiGetBlogById($id) {
    $db = getDB();
    if (!$db) {
        jsonResponse(['ok' => false, 'error' => 'No hay conexión a la base de datos'], 500);
    }
    
    try {
        $stmt = $db->prepare('SELECT id, titulo, resumen, contenido, categoria, imagen, fecha FROM blog WHERE id = ?');
        $stmt->execute([$id]);
        $blog = $stmt->fetch();
        
        if ($blog) {
            jsonResponse(['ok' => true, 'blog' => $blog]);
        } else {
            jsonResponse(['ok' => false, 'error' => 'Blog no encontrado'], 404);
        }
    } catch (PDOException $e) {
        jsonResponse(['ok' => false, 'error' => 'Error al obtener el blog: ' . $e->getMessage()], 500);
    }
}

// API: Actualizar blog
function apiUpdateBlog($id) {
    // Con POST, $_POST y $_FILES funcionan normalmente
    $titulo = $_POST['titulo'] ?? '';
    $resumen = $_POST['resumen'] ?? '';
    $contenido = $_POST['contenido'] ?? '';
    $categoria = $_POST['categoria'] ?? '';
    $fecha = $_POST['fecha'] ?? '';
    
    // Debug: log para ver qué datos llegan
    error_log("DEBUG updateBlog: ID=$id");
    error_log("DEBUG updateBlog: titulo='$titulo', resumen='$resumen', categoria='$categoria', fecha='$fecha'");
    
    if (!$titulo && !$resumen && !$contenido && !$categoria && !$fecha && !isset($_FILES['imagen'])) {
        jsonResponse(['ok' => false, 'error' => 'no se modifico ningun dato']);
    }
    
    $db = getDB();
    if (!$db) {
        jsonResponse(['ok' => false, 'error' => 'no DB connection']);
    }
    
    try {
        if (isset($_FILES['imagen']) && $_FILES['imagen']['error'] === UPLOAD_ERR_OK) {
            // Obtener imagen anterior
            $stmt = $db->prepare('SELECT imagen FROM blog WHERE id = ?');
            $stmt->execute([$id]);
            $oldBlog = $stmt->fetch();
            $oldImagePath = $oldBlog['imagen'] ?? null;
            
            // Guardar nueva imagen
            $imagenPath = saveImage($_FILES['imagen']);
            if (!$imagenPath) {
                jsonResponse(['ok' => false, 'error' => 'Error al guardar la imagen']);
            }
            
            // Eliminar imagen anterior
            if ($oldImagePath) {
                deleteImage($oldImagePath);
            }
            
            // Actualizar con nueva imagen
            $stmt = $db->prepare('UPDATE blog SET titulo=?, resumen=?, contenido=?, categoria=?, imagen=?, fecha=? WHERE id=?');
            $stmt->execute([$titulo, $resumen, $contenido, $categoria, $imagenPath, $fecha, $id]);
        } else {
            // Actualizar sin cambiar imagen
            $stmt = $db->prepare('UPDATE blog SET titulo=?, resumen=?, contenido=?, categoria=?, fecha=? WHERE id=?');
            $stmt->execute([$titulo, $resumen, $contenido, $categoria, $fecha, $id]);
        }
        
        if ($stmt->rowCount() == 0) {
            jsonResponse(['ok' => false, 'error' => 'no se encontró el blog'], 404);
        }
        
        jsonResponse(['ok' => true, 'message' => 'Blog actualizado correctamente']);
    } catch (PDOException $e) {
        jsonResponse(['ok' => false, 'error' => $e->getMessage()]);
    }
}

// API: Eliminar blog
function apiDeleteBlog($id) {
    $db = getDB();
    if (!$db) {
        jsonResponse(['ok' => false, 'error' => 'No DB connection']);
    }
    
    try {
        // Obtener información del blog
        $stmt = $db->prepare('SELECT imagen FROM blog WHERE id = ?');
        $stmt->execute([$id]);
        $blog = $stmt->fetch();
        
        if (!$blog) {
            jsonResponse(['ok' => false, 'error' => 'Blog no encontrado'], 404);
        }
        
        // Eliminar imagen si existe
        if ($blog['imagen']) {
            deleteImage($blog['imagen']);
        }
        
        // Eliminar registro de la BD
        $stmt = $db->prepare('DELETE FROM blog WHERE id = ?');
        $stmt->execute([$id]);
        
        if ($stmt->rowCount() == 0) {
            jsonResponse(['ok' => false, 'error' => 'No se pudo eliminar el blog'], 404);
        }
        
        jsonResponse(['ok' => true, 'message' => 'Blog e imagen eliminados correctamente']);
    } catch (PDOException $e) {
        jsonResponse(['ok' => false, 'message' => $e->getMessage()]);
    }
}

// API: Toggle blog popular
function apiToggleBlogPopular($id) {
    if (!isset($_SESSION['logueado']) || !$_SESSION['logueado']) {
        jsonResponse(['ok' => false, 'error' => 'No autorizado'], 401);
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    $esPopular = $input['es_popular'] ?? false;
    
    $db = getDB();
    if (!$db) {
        jsonResponse(['ok' => false, 'error' => 'No DB connection']);
    }
    
    try {
        // Verificar límite de blogs populares
        if ($esPopular) {
            $stmt = $db->query('SELECT COUNT(*) as count FROM blog WHERE es_popular = TRUE');
            $count = $stmt->fetch()['count'];
            
            if ($count >= 3) {
                jsonResponse(['ok' => false, 'error' => 'Solo se pueden tener máximo 3 blogs populares']);
            }
        }
        
        // Actualizar estado
        $stmt = $db->prepare('UPDATE blog SET es_popular = ? WHERE id = ?');
        $stmt->execute([$esPopular ? 1 : 0, $id]);
        
        $message = $esPopular ? 'marcado' : 'desmarcado';
        jsonResponse(['ok' => true, 'message' => "Blog {$message} como popular"]);
    } catch (PDOException $e) {
        jsonResponse(['ok' => false, 'error' => $e->getMessage()]);
    }
}

// API: Obtener blogs populares
function apiGetBlogsPopulares() {
    $db = getDB();
    if (!$db) {
        jsonResponse(['ok' => false, 'error' => 'No DB connection']);
    }
    
    try {
        $stmt = $db->query('SELECT * FROM blog WHERE es_popular = TRUE ORDER BY fecha DESC LIMIT 3');
        $blogs = $stmt->fetchAll();
        jsonResponse(['ok' => true, 'blogs' => $blogs]);
    } catch (PDOException $e) {
        jsonResponse(['ok' => false, 'error' => $e->getMessage()]);
    }
}

// API: Obtener categorías
function apiGetCategorias() {
    $db = getDB();
    if (!$db) {
        jsonResponse(['ok' => false, 'error' => 'No DB connection']);
    }
    
    try {
        $stmt = $db->query('SELECT DISTINCT categoria FROM blog WHERE categoria IS NOT NULL AND categoria != "" ORDER BY categoria');
        $categorias = $stmt->fetchAll();
        $categoriasList = array_column($categorias, 'categoria');
        jsonResponse(['ok' => true, 'categorias' => $categoriasList]);
    } catch (PDOException $e) {
        jsonResponse(['ok' => false, 'error' => $e->getMessage()]);
    }
}

// API: Limpiar imágenes huérfanas
function apiCleanupImages() {
    if (!isset($_SESSION['logueado']) || !$_SESSION['logueado']) {
        jsonResponse(['ok' => false, 'error' => 'No autorizado'], 401);
    }
    
    $db = getDB();
    if (!$db) {
        jsonResponse(['ok' => false, 'error' => 'No DB connection']);
    }
    
    try {
        // Obtener imágenes referenciadas en BD
        $stmt = $db->query('SELECT imagen FROM blog WHERE imagen IS NOT NULL');
        $referencedImages = $stmt->fetchAll();
        
        $referencedFiles = [];
        foreach ($referencedImages as $img) {
            if ($img['imagen']) {
                $filename = str_replace('/static/uploads/', '', $img['imagen']);
                $referencedFiles[] = $filename;
            }
        }
        
        // Obtener archivos existentes
        $existingFiles = [];
        if (is_dir(UPLOAD_DIR)) {
            $existingFiles = array_diff(scandir(UPLOAD_DIR), ['.', '..']);
        }
        
        // Encontrar archivos huérfanos
        $orphanedFiles = array_diff($existingFiles, $referencedFiles);
        
        // Eliminar archivos huérfanos
        $deletedCount = 0;
        foreach ($orphanedFiles as $orphanedFile) {
            $filePath = UPLOAD_DIR . $orphanedFile;
            if (unlink($filePath)) {
                $deletedCount++;
            }
        }
        
        jsonResponse([
            'ok' => true,
            'message' => "Limpieza completada. {$deletedCount} archivo(s) huérfano(s) eliminado(s)",
            'deleted_count' => $deletedCount,
            'orphaned_files' => array_values($orphanedFiles)
        ]);
    } catch (Exception $e) {
        jsonResponse(['ok' => false, 'error' => $e->getMessage()]);
    }
}

// Debug: Ping DB
function pingDB() {
    $db = getDB();
    if (!$db) {
        echo "Sin conexión: Error desconocido";
        return;
    }
    
    try {
        $stmt = $db->query("SELECT 1 AS ok");
        $result = $stmt->fetch();
        echo "Ping OK: " . $result['ok'];
    } catch (PDOException $e) {
        http_response_code(500);
        echo "Ping fallo: " . $e->getMessage();
    }
}

// Debug: MySQL info
function debugMySQL() {
    header('Content-Type: application/json');
    echo json_encode([
        'connection_is_none' => getDB() === null,
        'session_logueado' => $_SESSION['logueado'] ?? false,
        'db_error' => null
    ]);
}
?>
