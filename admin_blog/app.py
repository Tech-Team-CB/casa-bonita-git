from flask import Flask, jsonify
from flask import render_template, request, redirect, url_for, session, g
from flask_cors import CORS
import pymysql  # pip install PyMySQL
import os
import uuid
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
import cloudinary
import cloudinary.uploader

# Cargar variables de entorno desde archivo .env
load_dotenv()

app = Flask(__name__, template_folder='templates')
app.secret_key = os.getenv('SECRET_KEY', 'CasaBonita_Blog_Important')

# Configurar Cloudinary para almacenamiento de imágenes
cloudinary.config(
    cloud_name=os.getenv('CLOUDINARY_CLOUD_NAME'),
    api_key=os.getenv('CLOUDINARY_API_KEY'),
    api_secret=os.getenv('CLOUDINARY_API_SECRET'),
    secure=True
)

# Habilitar CORS en todas las rutas API (permitir peticiones desde el frontend estático)
CORS(app)

# Configuración MySQL desde variables de entorno
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', ''),
    'database': os.getenv('DB_NAME', 'casabonita_blogs'),
    'port': int(os.getenv('DB_PORT', 3306)),
    'cursorclass': pymysql.cursors.DictCursor,
    'autocommit': True
}

# Configuración de uploads (imagenes)
ALLOWED_EXTENSIONS = set(os.getenv('ALLOWED_EXTENSIONS', 'png,jpg,jpeg,gif,webp').split(','))
app.config['UPLOAD_FOLDER'] = os.path.join(
    os.path.dirname(__file__), 
    os.getenv('UPLOAD_FOLDER', 'static/uploads')
)
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def save_image(file_storage):
    if not file_storage or file_storage.filename == '':
        return None
    if not allowed_file(file_storage.filename):
        return None
    
    try:
        # Subir imagen a Cloudinary
        result = cloudinary.uploader.upload(
            file_storage,
            folder="casabonita_blogs",
            resource_type="auto"
        )
        # Retornar URL completa de Cloudinary
        return result['secure_url']
    except Exception as e:
        print(f"Error uploading to Cloudinary: {e}")
        return None

def get_db():
    if 'db' not in g:
        try:
            g.db = pymysql.connect(**DB_CONFIG)
        except Exception as e:
            g.db = None
            g.db_error = str(e)
    return g.db

@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop('db', None)
    if db is not None:
        try:
            db.close()
        except Exception:
            pass


@app.route('/admin')
def home():
    return render_template('login.html')


@app.route('/blog_dashboard')
def blog_dashboard():
    if not session.get('logueado'):
        return redirect(url_for('home'))
    return render_template('blog_dashboard.html')


@app.route('/acceso_login', methods=["POST"])
def login():
    if 'txtCorreo' not in request.form or 'txtPassword' not in request.form:
        return render_template('login.html', mensaje="Faltan datos")

    _correo = request.form['txtCorreo']
    _password = request.form['txtPassword']

    conn = get_db()
    if conn is None:
        err = getattr(g, 'db_error', 'No se pudo abrir conexión')
        return render_template('login.html', mensaje=f"Conexión fallida: {err}")
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT * FROM usuarios WHERE username = %s AND password = %s', (_correo, _password))
            account = cur.fetchone()
    except Exception as e:
        return render_template('login.html', mensaje=f"Error BD: {e}")

    if account:
        # limpiar sesión previa por seguridad (evitar session fixation)
        session.clear()
        session['logueado'] = True
        session['id'] = account['id']
        return redirect(url_for('blog_dashboard'))
    return render_template('login.html', mensaje="Credenciales incorrectas")

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('home'))

@app.route('/ping_db')
def ping_db():
    conn = get_db()
    if conn is None:
        return f"Sin conexión: {getattr(g, 'db_error', 'error desconocido')}"
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 AS ok")
            return f"Ping OK: {cur.fetchone()['ok']}"
    except Exception as e:
        return f"Ping fallo: {e}", 500

@app.route('/debug_mysql')
def debug_mysql():
    conn = getattr(g, 'db', None)
    return {
        'connection_is_none': conn is None,
        'session_logueado': session.get('logueado', False),
        'db_error': getattr(g, 'db_error', None)
    }



@app.route('/api/blogs', methods=['GET'])
def api_get_blogs():
    conn = get_db()
    if conn is None:
        return {'ok': False, 'error': 'No DB connection'}

    # Obtener parámetros de paginación para el dashboard
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 6, type=int)  # Por defecto 6 blogs por página
    dashboard = request.args.get('dashboard', False, type=bool)  # Indicador si es para dashboard
    
    try:
        with conn.cursor() as cur:
            if dashboard:
                # Para el dashboard: paginado y ordenado por fecha
                offset = (page - 1) * per_page
                cur.execute('SELECT * FROM blog ORDER BY fecha DESC LIMIT %s OFFSET %s', (per_page, offset))
                blogs = cur.fetchall()
                
                # Contar total de blogs para el dashboard
                cur.execute('SELECT COUNT(*) as total FROM blog')
                total_count = cur.fetchone()['total']
                total_pages = (total_count + per_page - 1) // per_page  # Redondeo hacia arriba
                
                return {
                    'ok': True, 
                    'blogs': blogs,
                    'pagination': {
                        'current_page': page,
                        'per_page': per_page,
                        'total_pages': total_pages,
                        'total_count': total_count
                    }
                }
            else:
                # Para el frontend público: todos los blogs
                cur.execute('SELECT * FROM blog ORDER BY fecha DESC')
                blogs = cur.fetchall()
                return {'ok': True, 'blogs': blogs}
                
    except Exception as e:
        return {'ok': False, 'error': str(e)}


@app.route ('/api/blogs', methods=['POST'])
def api_create_blog():
    titulo = request.form.get('titulo')
    resumen = request.form.get('resumen')
    contenido = request.form.get('contenido')
    categoria = request.form.get('categoria')
    imagen = request.files.get('imagen')
    fecha = request.form.get('fecha')

    if not titulo or not resumen or not contenido or not categoria or not imagen or not fecha:
        return {'ok': False, 'error': 'faltan datos'}

    # Guardar la imagen en el servidor
    imagen_path = None
    if imagen:
        imagen_path = save_image(imagen)

    conn = get_db()
    if conn is None:
        return {'ok': False, 'error': 'no DB connection'}

    try:
        with conn.cursor() as cur:
            cur.execute(
                'INSERT INTO blog(titulo,resumen,contenido,categoria,imagen,fecha) VALUES (%s,%s,%s,%s,%s,%s)',
                (titulo,resumen, contenido, categoria, imagen_path, fecha),
            )
            conn.commit()
            return {'ok': True, 'message': 'blog agregado de manera correcta'}
    except Exception as e:
        return {'ok': False, 'error': str(e)}


@app.route('/api/blogs/<int:id>', methods=['PUT'])
def api_update_blog(id):
    titulo = request.form.get('titulo')
    resumen = request.form.get('resumen')
    contenido = request.form.get('contenido')
    categoria = request.form.get('categoria')
    imagen = request.files.get('imagen')
    fecha = request.form.get('fecha')

    if not titulo and not resumen and not contenido and not categoria and not imagen and not fecha:
        return {'ok': False, 'error': 'no se modifico ningun dato'}

    conn = get_db()
    if conn is None:
        return {'ok': False, 'error': 'no DB connection'}

    try:
        with conn.cursor() as cur:
            # Si hay una nueva imagen, obtener la imagen anterior para eliminarla
            if imagen:
                # Obtener la imagen anterior
                cur.execute('SELECT imagen FROM blog WHERE id = %s', (id,))
                old_blog = cur.fetchone()
                old_image_path = old_blog['imagen'] if old_blog else None
                
                # Guardar la nueva imagen
                imagen_path = save_image(imagen)
                
                # Eliminar la imagen anterior si existe
                if old_image_path:
                    old_image_file = old_image_path.replace('/static/uploads/', '')
                    full_old_path = os.path.join(app.config['UPLOAD_FOLDER'], old_image_file)
                    if os.path.exists(full_old_path):
                        try:
                            os.remove(full_old_path)
                            print(f"Imagen anterior eliminada: {full_old_path}")
                        except OSError as e:
                            print(f"Error al eliminar imagen anterior {full_old_path}: {e}")
                
                # Actualizar con la nueva imagen
                cur.execute(
                    'UPDATE blog SET titulo=%s, resumen=%s, contenido=%s, categoria=%s, imagen=%s, fecha=%s WHERE id=%s',
                    (titulo, resumen, contenido, categoria, imagen_path, fecha, id),
                )
            else:
                # Si no hay nueva imagen, actualizar todo excepto el campo imagen
                cur.execute(
                    'UPDATE blog SET titulo=%s, resumen=%s, contenido=%s, categoria=%s, fecha=%s WHERE id=%s',
                    (titulo, resumen, contenido, categoria, fecha, id),
                )
            
            affected = cur.rowcount
            if affected == 0:
                return {'ok': False, 'error': 'no se encontró el blog'}, 404

        conn.commit()

        return {'ok': True, 'message': 'Blog actualizado correctamente'}
    except Exception as e:
        return {'ok': False, 'error': str(e)}


@app.route('/api/blogs/<int:id>', methods=['DELETE'])
def api_delete_blog(id):
    conn = get_db()
    if conn is None:
        return {'ok': False, 'error': 'No DB connection'}
    try:
        with conn.cursor() as cur:
            # Primero obtener la información del blog para conseguir la ruta de la imagen
            cur.execute('SELECT imagen FROM blog WHERE id = %s', (id,))
            blog = cur.fetchone()
            
            if not blog:
                return {'ok': False, 'error': 'Blog no encontrado'}, 404
            
            # Eliminar el archivo de imagen si existe
            if blog['imagen']:
                # La imagen se guarda como "/static/uploads/filename", necesitamos la ruta física
                image_path = blog['imagen'].replace('/static/uploads/', '')
                full_image_path = os.path.join(app.config['UPLOAD_FOLDER'], image_path)
                
                # Verificar si el archivo existe y eliminarlo
                if os.path.exists(full_image_path):
                    try:
                        os.remove(full_image_path)
                        print(f"Imagen eliminada: {full_image_path}")
                    except OSError as e:
                        print(f"Error al eliminar imagen {full_image_path}: {e}")
            
            # Ahora eliminar el registro de la base de datos
            cur.execute('DELETE FROM blog WHERE id = %s', (id,))
            affected = cur.rowcount

            if affected == 0:
                return {'ok': False, 'error': 'No se pudo eliminar el blog'}, 404

        conn.commit()
        return {'ok': True, 'message': 'Blog e imagen eliminados correctamente'}
    except Exception as e:
        return {'ok': False, 'message': str(e)}


@app.route('/api/cleanup-images', methods=['POST'])
def cleanup_orphaned_images():
    """Función para limpiar imágenes huérfanas que no están referenciadas en la BD"""
    if not session.get('logueado'):
        return {'ok': False, 'error': 'No autorizado'}, 401
    
    conn = get_db()
    if conn is None:
        return {'ok': False, 'error': 'No DB connection'}
    
    try:
        # Obtener todas las imágenes referenciadas en la BD
        with conn.cursor() as cur:
            cur.execute('SELECT imagen FROM blog WHERE imagen IS NOT NULL')
            referenced_images = cur.fetchall()
        
        # Crear conjunto de nombres de archivos referenciados
        referenced_files = set()
        for img in referenced_images:
            if img['imagen']:
                filename = img['imagen'].replace('/static/uploads/', '')
                referenced_files.add(filename)
        
        # Obtener todos los archivos en el directorio uploads
        upload_dir = app.config['UPLOAD_FOLDER']
        if os.path.exists(upload_dir):
            existing_files = set(os.listdir(upload_dir))
            
            # Encontrar archivos huérfanos
            orphaned_files = existing_files - referenced_files
            
            # Eliminar archivos huérfanos
            deleted_count = 0
            for orphaned_file in orphaned_files:
                file_path = os.path.join(upload_dir, orphaned_file)
                try:
                    os.remove(file_path)
                    deleted_count += 1
                    print(f"Archivo huérfano eliminado: {file_path}")
                except OSError as e:
                    print(f"Error al eliminar archivo huérfano {file_path}: {e}")
            
            return {
                'ok': True, 
                'message': f'Limpieza completada. {deleted_count} archivo(s) huérfano(s) eliminado(s)',
                'deleted_count': deleted_count,
                'orphaned_files': list(orphaned_files)
            }
        else:
            return {'ok': False, 'error': 'Directorio uploads no encontrado'}
            
    except Exception as e:
        return {'ok': False, 'error': str(e)}
    

# ...existing code...

@app.route('/api/blogs/<int:blog_id>', methods=['GET'])
def get_blog_by_id(blog_id):
    """Obtener un blog específico por ID desde la base de datos"""
    conn = get_db()
    if conn is None:
        return jsonify({
            'ok': False, 
            'error': 'No hay conexión a la base de datos'
        }), 500
    
    try:
        with conn.cursor() as cur:
            # Consulta para obtener el blog específico usando los nombres correctos de columna
            cur.execute(
                'SELECT id, titulo, resumen, contenido, categoria, imagen, fecha FROM blog WHERE id = %s', 
                (blog_id,)
            )
            blog = cur.fetchone()
        
        if blog:
            return jsonify({
                'ok': True,
                'blog': {
                    'id': blog['id'],
                    'titulo': blog['titulo'],
                    'resumen': blog['resumen'],
                    'contenido': blog['contenido'], 
                    'categoria': blog['categoria'],
                    'imagen': blog['imagen'],
                    'fecha': blog['fecha']
                }
            })
        else:
            return jsonify({
                'ok': False,
                'error': 'Blog no encontrado'
            }), 404
            
    except Exception as e:
            return jsonify({
                'ok': False,
                'error': f'Error al obtener el blog: {str(e)}'
            }), 500

# Nueva ruta para obtener blogs populares
@app.route('/api/blogs/populares', methods=['GET'])
def api_get_blogs_populares():
    """Obtener los blogs marcados como populares (máximo 3)"""
    conn = get_db()
    if conn is None:
        return {'ok': False, 'error': 'No DB connection'}

    try:
        with conn.cursor() as cur:
            cur.execute('SELECT * FROM blog WHERE es_popular = TRUE ORDER BY fecha DESC LIMIT 3')
            blogs = cur.fetchall()
        return {'ok': True, 'blogs': blogs}
    except Exception as e:
        return {'ok': False, 'error': str(e)}

# Nueva ruta para marcar/desmarcar blog como popular
@app.route('/api/blogs/<int:id>/popular', methods=['PUT'])
def api_toggle_blog_popular(id):
    """Marcar o desmarcar un blog como popular"""
    if not session.get('logueado'):
        return {'ok': False, 'error': 'No autorizado'}, 401
    
    es_popular = request.json.get('es_popular', False)
    
    conn = get_db()
    if conn is None:
        return {'ok': False, 'error': 'No DB connection'}

    try:
        with conn.cursor() as cur:
            # Si se está marcando como popular, verificar que no haya más de 3
            if es_popular:
                cur.execute('SELECT COUNT(*) as count FROM blog WHERE es_popular = TRUE')
                count_result = cur.fetchone()
                count = count_result['count'] if count_result else 0
                
                if count >= 3:
                    return {'ok': False, 'error': 'Solo se pueden tener máximo 3 blogs populares'}
            
            # Actualizar el estado del blog
            cur.execute('UPDATE blog SET es_popular = %s WHERE id = %s', (es_popular, id))
            conn.commit()
            
            return {'ok': True, 'message': f'Blog {"marcado" if es_popular else "desmarcado"} como popular'}
    except Exception as e:
        return {'ok': False, 'error': str(e)}

# Ruta para obtener categorías existentes
@app.route('/api/categorias', methods=['GET'])
def api_get_categorias():
    """Obtener todas las categorías únicas de los blogs existentes"""
    conn = get_db()
    if conn is None:
        return {'ok': False, 'error': 'No DB connection'}

    try:
        with conn.cursor() as cur:
            cur.execute('SELECT DISTINCT categoria FROM blog WHERE categoria IS NOT NULL AND categoria != "" ORDER BY categoria')
            categorias = cur.fetchall()
            # Convertir a lista simple
            categorias_lista = [cat['categoria'] for cat in categorias]
            return {'ok': True, 'categorias': categorias_lista}
    except Exception as e:
        return {'ok': False, 'error': str(e)}
 
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)
