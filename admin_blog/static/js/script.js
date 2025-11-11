// Variables globales
let currentImageFile = null;
let currentPage = 1;
let totalPages = 1;

// Funciones básicas para el modal
function openModal() {
    loadCategories(); // Cargar categorías disponibles
    setupCategoryEvents(); // Configurar eventos
    document.getElementById('blogModal').classList.add('active');
}

function closeModal() {
    document.getElementById('blogModal').classList.remove('active');
    // Limpiar formulario
    document.getElementById('blogTitle').value = '';
    document.getElementById('blogResume').value='';
    
    // Limpiar campos de categoría
    document.getElementById('categorySelect').value = '';
    document.getElementById('blogCategory').value = '';
    document.getElementById('blogCategory').style.display = 'none';
    document.getElementById('blogCategory').classList.remove('show');
    
    document.getElementById('blogImage').value = '';
    document.getElementById('blogDate').value = '';
    
    // Limpiar TinyMCE correctamente
    if(tinymce.get("blogContent")){
        tinymce.get("blogContent").setContent('');
    }
    
    // Limpiar preview de imagen
    const preview = document.getElementById('imagePreview');
    const previewImage = document.getElementById('previewImage');
    preview.style.display = 'none';
    previewImage.src = '#';
    preview.dataset.existingImage = '';
    
    currentImageFile = null;

    // Restaurar botón al estado original
    const saveButton = document.querySelector('#blogModal .btn-primary');
    if (saveButton) {
        saveButton.onclick = saveBlog;
        saveButton.textContent = 'Guardar';
    }
}

// Cerrar modal con Escape
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        closeModal();
    }
});


async function loadBlogs(page = 1) {
    try {
        const response = await fetch(`api/blogs?dashboard=true&page=${page}&per_page=6`);
        const result = await response.json();

        if (result.ok) {
            const blogs = result.blogs;
            const pagination = result.pagination;

            // Actualizar variables globales de paginación
            currentPage = pagination.current_page;
            totalPages = pagination.total_pages;

            const tbody = document.getElementById('blogsTableBody');
            tbody.innerHTML = '';

            blogs.forEach(blog => {
                const tr = document.createElement('tr');
                const esPopular = blog.es_popular || false;
                tr.innerHTML = `
            <td>${blog.titulo}</td>
            <td>${blog.categoria}</td>
            <td>${blog.fecha}</td>
            <td class="popular-column">
                <input type="checkbox" class="popular-checkbox" ${esPopular ? 'checked' : ''} 
                       onchange="togglePopular(${blog.id}, this.checked)"
                       title="Marcar como popular (máx. 3)">
                <span class="popular-status">${esPopular ? '⭐' : ''}</span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn-action btn-edit" onclick="editBlog(${blog.id})">
                        <svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                        </svg>
                        Editar
                    </button>
                    <button class="btn-action btn-delete" onclick="deleteBlog(${blog.id})">
                        <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M9 3v1H4v2h16V4h-5V3a2 2 0 00-2-2h-2a2 2 0 00-2 2zM6 7v13a2 2 0 002 2h8a2 2 0 002-2V7H6zm3 3h2v8H9V10zm4 0h2v8h-2V10z" />
                        </svg>
                        Eliminar
                    </button>
                </div>
            </td>
            `
                tbody.appendChild(tr);
            });

            // Actualizar la paginación
            updateDashboardPagination(pagination);
        } else {
            showErrorMessage('Error al cargar los blogs: ' + result.error);
        }
    } catch (error) {
        showErrorMessage('Error de conexión: ' + error);
    }
}
window.onload = function() {
    loadBlogs();
    loadCategories(); // Cargar categorías al inicio
};


async function saveBlog() {
    const title = document.getElementById('blogTitle').value;
    const resume = document.getElementById('blogResume').value;
    const content = tinymce.get("blogContent").getContent();
    const category = getCategoryValue(); // Usar la nueva función
    const date = document.getElementById('blogDate').value;
    const imageInput = document.getElementById('blogImage');

    const formData = new FormData();

    formData.append('titulo', title);
    formData.append('resumen', resume);
    formData.append('contenido', content);
    formData.append('categoria', category);
    formData.append('fecha', date);


    if (imageInput.files[0]) {
        formData.append('imagen', imageInput.files[0]);
    }

    // Enviar los datos al backend Flask usando fetch
    try {
        const response = await fetch('api/blogs', { method: 'POST', body: formData });

        const result = await response.json();
        if (result.ok) {
            showSuccessMessage('Blog creado exitosamente');
            closeModal();
            loadBlogs(1);  // Ir a la primera página después de crear
        } else {
            showErrorMessage('Error al crear blog: ' + (result.error || 'error desconocido'));
        }
    } catch (error) {
        showErrorMessage('Error de conexión: ' + error);
    }
}

async function editBlog(id) {
    // Cargar categorías disponibles antes de abrir el modal
    await loadCategories();
    
    try{
        const response = await fetch(`api/blogs/${id}`);
        const result = await response.json();

        if (result.ok){

            const blog= result.blog;

            document.getElementById('blogTitle').value=blog.titulo;
            document.getElementById('blogResume').value=blog.resumen;
            
            // Configurar categoría en el formulario de edición
            const categorySelect = document.getElementById('categorySelect');
            const categoryInput = document.getElementById('blogCategory');
            
            // Buscar si la categoría existe en las opciones
            let categoryExists = false;
            for (let option of categorySelect.options) {
                if (option.value === blog.categoria) {
                    categoryExists = true;
                    break;
                }
            }
            
            if (categoryExists) {
                // Seleccionar categoría existente
                categorySelect.value = blog.categoria;
                categoryInput.style.display = 'none';
                categoryInput.value = blog.categoria;
            } else {
                // Categoría no existe, usar input de texto
                categorySelect.value = 'nueva';
                categoryInput.style.display = 'block';
                categoryInput.classList.add('show');
                categoryInput.value = blog.categoria;
            }
            
            setupCategoryEvents(); // Configurar eventos después de establecer valores

            if(blog.fecha){
                let fechaParaInput = '';
                
                // Si viene en formato GMT: "Thu, 04 Sep 2025 00:00:00 GMT"
                if(blog.fecha.includes('GMT') || blog.fecha.includes('UTC')){
                    // Convertir a objeto Date y extraer formato YYYY-MM-DD
                    const fechaObj = new Date(blog.fecha);
                    if(!isNaN(fechaObj.getTime())){
                        const year = fechaObj.getUTCFullYear();
                        const month = String(fechaObj.getUTCMonth() + 1).padStart(2, '0');
                        const day = String(fechaObj.getUTCDate()).padStart(2, '0');
                        fechaParaInput = `${year}-${month}-${day}`;
                    }
                }
                // Si viene como timestamp normal: "2024-12-25 10:30:00" o "2024-12-25T10:30:00"
                else if(blog.fecha.includes(' ') || blog.fecha.includes('T')){
                    fechaParaInput = blog.fecha.split(' ')[0].split('T')[0];
                }
                // Si ya viene en formato correcto
                else {
                    fechaParaInput = blog.fecha;
                }
                
                document.getElementById('blogDate').value = fechaParaInput;
                console.log('Fecha original:', blog.fecha, 'Fecha formateada:', fechaParaInput);
            }


            
            if(tinymce.get("blogContent")){
                tinymce.get("blogContent").setContent(blog.contenido);
            }

            if(blog.imagen){
                const preview = document.getElementById('imagePreview');
                const previewImage = document.getElementById('previewImage');
                previewImage.src = blog.imagen;
                preview.style.display = 'block';
                console.log('Imagen cargada:', blog.imagen);
                
                // Guardar la URL de la imagen existente para referencia
                preview.dataset.existingImage = blog.imagen;
            }else {
                document.getElementById('imagePreview').style.display = 'none';
            }

            const saveButton= document.querySelector('#blogModal .btn-primary');
            if(saveButton){
                saveButton.onclick= ()=> updateBlog(blog.id);
                saveButton.textContent= 'Actualizar Blog';
            }

            openModal();

        }else{
            alert('Error al obtener el blog: ' + (result.error || 'error desconocido'));
        }

    }catch(error){
       alert('Error de conexión: ' + error);
    }
}


async function updateBlog(id){
    const title = document.getElementById('blogTitle').value;
    const resume = document.getElementById('blogResume').value;
    const content = tinymce.get('blogContent').getContent();
    const category = getCategoryValue(); // Usar la nueva función
    const date = document.getElementById('blogDate').value;
    const imageInput = document.getElementById('blogImage');

    const formData = new FormData();

    formData.append('titulo',title)
    formData.append('resumen',resume)
    formData.append('contenido',content)
    formData.append('categoria',category)
    formData.append('fecha',date)

    if(imageInput.files[0]){
        formData.append('imagen',imageInput.files[0]);
    }

    try {
        const response = await fetch(`api/blogs/${id}`,{method: 'PUT', body:formData})
        const result = await response.json();

        if(result.ok){
            showSuccessMessage('Blog actualizado exitosamente');
            closeModal();
            loadBlogs(currentPage);
        }else{
            showErrorMessage('Error al actualizar blog: ' + (result.error || 'error desconocido'));
        }

    } catch (error) {
        showErrorMessage('Error de conexión: ' + error);
    }

}

async function deleteBlog(id) {
    // Obtener el título del blog para mostrarlo en la confirmación
    const row = event.target.closest('tr');
    const titulo = row.querySelector('td:first-child').textContent;
    const deleteButton = event.target.closest('.btn-delete');
    
    // Crear modal de confirmación personalizado
    const confirmDelete = await showConfirmDialog(
        'Confirmar eliminación',
        `¿Estás seguro de que quieres eliminar el blog "${titulo}"?`,
        'Esta acción no se puede deshacer.',
        'Eliminar',
        'Cancelar'
    );
    
    if (confirmDelete) {
        // Mostrar loading en el botón
        const originalHTML = deleteButton.innerHTML;
        deleteButton.innerHTML = `
            <svg class="btn-icon loading-spin" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 2v2a6 6 0 100 12v2a8 8 0 110-16z"/>
            </svg>
            Eliminando...
        `;
        deleteButton.disabled = true;
        
        try {
            const response = await fetch(`api/blogs/${id}`, { method: 'DELETE' });
            const result = await response.json();
            
            if (result.ok) {
                showSuccessMessage('Blog eliminado exitosamente');
                loadBlogs(currentPage);
            } else {
                showErrorMessage('Error al eliminar blog: ' + (result.error || 'error desconocido'));
            }
        } catch (error) {   
            showErrorMessage('Error de conexión: ' + error);
        } finally {
            // Restaurar botón
            deleteButton.innerHTML = originalHTML;
            deleteButton.disabled = false;
        }
    }
}

// Función para mostrar diálogo de confirmación personalizado
function showConfirmDialog(title, message, subtitle, confirmText, cancelText) {
    return new Promise((resolve) => {
        // Crear elementos del modal
        const modal = document.createElement('div');
        modal.className = 'confirm-modal';
        modal.innerHTML = `
            <div class="confirm-modal-content">
                <div class="confirm-modal-header">
                    <h3>${title}</h3>
                </div>
                <div class="confirm-modal-body">
                    <p class="confirm-message">${message}</p>
                    <p class="confirm-subtitle">${subtitle}</p>
                </div>
                <div class="confirm-modal-footer">
                    <button class="btn-confirm-cancel">${cancelText}</button>
                    <button class="btn-confirm-delete">${confirmText}</button>
                </div>
            </div>
        `;
        
        // Agregar estilos inline
        const style = document.createElement('style');
        style.textContent = `
            .confirm-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                animation: fadeIn 0.3s ease;
            }
            
            .confirm-modal-content {
                background: white;
                border-radius: 12px;
                padding: 0;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                animation: slideIn 0.3s ease;
            }
            
            .confirm-modal-header {
                padding: 20px 24px 16px;
                border-bottom: 1px solid #eee;
            }
            
            .confirm-modal-header h3 {
                margin: 0;
                color: #333;
                font-size: 18px;
                font-weight: 600;
            }
            
            .confirm-modal-body {
                padding: 20px 24px;
            }
            
            .confirm-message {
                margin: 0 0 8px 0;
                color: #333;
                font-size: 16px;
                font-weight: 500;
            }
            
            .confirm-subtitle {
                margin: 0;
                color: #666;
                font-size: 14px;
            }
            
            .confirm-modal-footer {
                padding: 16px 24px 24px;
                display: flex;
                gap: 12px;
                justify-content: flex-end;
            }
            
            .btn-confirm-cancel, .btn-confirm-delete {
                padding: 10px 20px;
                border: none;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .btn-confirm-cancel {
                background: #f5f5f5;
                color: #666;
            }
            
            .btn-confirm-cancel:hover {
                background: #e9e9e9;
            }
            
            .btn-confirm-delete {
                background: #f44336;
                color: white;
            }
            
            .btn-confirm-delete:hover {
                background: #d32f2f;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            @keyframes slideIn {
                from { transform: translateY(-20px) scale(0.95); opacity: 0; }
                to { transform: translateY(0) scale(1); opacity: 1; }
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(modal);
        
        // Event listeners
        modal.querySelector('.btn-confirm-cancel').onclick = () => {
            document.body.removeChild(modal);
            document.head.removeChild(style);
            resolve(false);
        };
        
        modal.querySelector('.btn-confirm-delete').onclick = () => {
            document.body.removeChild(modal);
            document.head.removeChild(style);
            resolve(true);
        };
        
        // Cerrar con escape o click fuera del modal
        const closeModal = () => {
            document.body.removeChild(modal);
            document.head.removeChild(style);
            resolve(false);
        };
        
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };
        
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', escHandler);
                closeModal();
            }
        });
    });
}

// Funciones para mostrar mensajes de éxito y error
function showSuccessMessage(message) {
    showToast(message, 'success');
}

function showErrorMessage(message) {
    showToast(message, 'error');
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
            <span class="toast-message">${message}</span>
        </div>
    `;
    
    const toastStyle = document.createElement('style');
    toastStyle.textContent = `
        .toast {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 16px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10001;
            animation: toastSlideIn 0.3s ease;
            max-width: 400px;
        }
        
        .toast-success { background: #4CAF50; }
        .toast-error { background: #f44336; }
        .toast-info { background: #2196F3; }
        
        .toast-content {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .toast-icon {
            font-size: 18px;
            font-weight: bold;
        }
        
        @keyframes toastSlideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes toastSlideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    
    document.head.appendChild(toastStyle);
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'toastSlideOut 0.3s ease';
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
                document.head.removeChild(toastStyle);
            }
        }, 300);
    }, 3000);
}

// Event listener para preview de imagen cuando se selecciona un archivo
document.addEventListener('DOMContentLoaded', function() {
    const imageInput = document.getElementById('blogImage');
    const preview = document.getElementById('imagePreview');
    const previewImage = document.getElementById('previewImage');
    
    if (imageInput) {
        imageInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    previewImage.src = e.target.result;
                    preview.style.display = 'block';
                    // Remover referencia a imagen existente ya que se seleccionó una nueva
                    preview.dataset.existingImage = '';
                };
                reader.readAsDataURL(file);
            } else {
                // Si no hay archivo, ocultar preview a menos que haya una imagen existente
                if (!preview.dataset.existingImage) {
                    preview.style.display = 'none';
                    previewImage.src = '#';
                } else {
                    // Restaurar imagen existente
                    previewImage.src = preview.dataset.existingImage;
                    preview.style.display = 'block';
                }
            }
        });
    }
});

// Función para marcar/desmarcar blog como popular
async function togglePopular(blogId, esPopular) {
    try {
        const response = await fetch(`api/blogs/${blogId}/popular`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                es_popular: esPopular
            })
        });

        const result = await response.json();
        
        if (result.ok) {
            // Recargar la tabla para mostrar los cambios
            loadBlogs(currentPage);
            showSuccessMessage(result.message);
        } else {
            showErrorMessage('Error: ' + result.error);
            // Revertir el checkbox si hubo un error
            loadBlogs();
        }
    } catch (error) {
        showErrorMessage('Error de conexión: ' + error);
        // Recargar la tabla en caso de error
        loadBlogs(currentPage);
    }
}

// Función para actualizar la paginación del dashboard
function updateDashboardPagination(pagination) {
    const paginationContainer = document.getElementById('dashboard-pagination');
    
    if (!paginationContainer) {
        // Crear el contenedor de paginación si no existe
        const tableContainer = document.querySelector('.main-panel');
        const paginationDiv = document.createElement('div');
        paginationDiv.id = 'dashboard-pagination';
        paginationDiv.className = 'dashboard-pagination';
        tableContainer.appendChild(paginationDiv);
    }
    
    const container = document.getElementById('dashboard-pagination');
    
    if (pagination.total_pages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let paginationHTML = '<div class="pagination-controls">';
    
    // Información de la página
    paginationHTML += `<div class="pagination-info">Página ${pagination.current_page} de ${pagination.total_pages} (${pagination.total_count} blogs)</div>`;
    
    paginationHTML += '<div class="pagination-buttons">';
    
    // Botón Anterior
    if (pagination.current_page > 1) {
        paginationHTML += `<button class="pagination-btn" onclick="loadBlogs(${pagination.current_page - 1})">‹ Anterior</button>`;
    }
    
    // Números de página
    for (let i = 1; i <= pagination.total_pages; i++) {
        const isActive = i === pagination.current_page;
        paginationHTML += `<button class="pagination-btn ${isActive ? 'active' : ''}" onclick="loadBlogs(${i})">${i}</button>`;
    }
    
    // Botón Siguiente
    if (pagination.current_page < pagination.total_pages) {
        paginationHTML += `<button class="pagination-btn" onclick="loadBlogs(${pagination.current_page + 1})">Siguiente ›</button>`;
    }
    
    paginationHTML += '</div></div>';
    
    container.innerHTML = paginationHTML;
}

// ============ FUNCIONES PARA GESTIÓN DE CATEGORÍAS ============

// Cargar categorías disponibles y actualizar el select
async function loadCategories() {
    try {
        const response = await fetch('/api/categorias');
        const result = await response.json();
        
        if (result.ok) {
            updateCategorySelect(result.categorias);
        } else {
            console.error('Error al cargar categorías:', result.error);
        }
    } catch (error) {
        console.error('Error de conexión al cargar categorías:', error);
    }
}

// Actualizar el select con las categorías disponibles
function updateCategorySelect(categorias) {
    const select = document.getElementById('categorySelect');
    if (!select) return;
    
    // Limpiar opciones existentes excepto las dos primeras
    while (select.children.length > 2) {
        select.removeChild(select.lastChild);
    }
    
    // Agregar cada categoría como una opción
    categorias.forEach(categoria => {
        const option = document.createElement('option');
        option.value = categoria;
        option.textContent = categoria;
        select.appendChild(option);
    });
}

// Configurar eventos para el manejo de categorías
function setupCategoryEvents() {
    const select = document.getElementById('categorySelect');
    const input = document.getElementById('blogCategory');
    
    if (select && input) {
        select.addEventListener('change', function() {
            if (select.value === 'nueva') {
                // Mostrar input para nueva categoría
                input.style.display = 'block';
                input.classList.add('show');
                input.focus();
                input.value = '';
            } else if (select.value === '') {
                // Ocultar input si se selecciona la opción vacía
                input.style.display = 'none';
                input.classList.remove('show');
                input.value = '';
            } else {
                // Usar categoría existente
                input.style.display = 'none';
                input.classList.remove('show');
                input.value = select.value;
            }
        });
    }
}

// Obtener el valor de la categoría seleccionada/escrita
function getCategoryValue() {
    const select = document.getElementById('categorySelect');
    const input = document.getElementById('blogCategory');
    
    if (select.value === 'nueva' || select.value === '') {
        return input.value.trim();
    } else {
        return select.value;
    }
}