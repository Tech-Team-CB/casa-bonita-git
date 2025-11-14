document.addEventListener('DOMContentLoaded', function() {
    // Elementos del DOM
    const blogGrid = document.querySelector('.blog-grid');
    let blogCards = [];
    let allBlogs = []; // Array para almacenar todos los blogs desde la API
    const searchInput = document.querySelector('.search-form input[type="text"]');
    const searchForm = document.querySelector('.search-form');
    const clearFiltersBtn = document.getElementById('clear-filters');
    const activeFiltersContainer = document.getElementById('active-filters');
    const paginationContainer = document.querySelector('.pagination .page-numbers');
    
    // Variables de paginación
    const postsPerPage = 6;
    let currentPage = 1;
    let filteredBlogCards = [];
    
    // URL base de la API - Detecta automáticamente el entorno
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const API_BASE_URL = isLocal 
        ? 'http://localhost:5000'  // Desarrollo local
        : 'https://api-blog-casabonita.onrender.com';  // Producción - Nuevo repo API
    
    console.log('Entorno:', isLocal ? 'Local' : 'Producción');
    console.log('API_BASE_URL:', API_BASE_URL);
    
    // Filtros activos
    let activeFilters = {
        category: 'all',
        tags: []
    };

    // Función para cargar blogs desde la API
    async function loadBlogs() {
        try {
            showLoader(true);
            const response = await fetch(`${API_BASE_URL}/api/blogs`);
            const data = await response.json();
            
            if (data.ok && data.blogs) {
                allBlogs = data.blogs;
                renderBlogs(allBlogs);
                // Actualizar los filtros de categoría y tags basados en los datos
                updateFiltersFromData();
            } else {
                console.error('Error al cargar blogs:', data.error);
                showErrorMessage('Error al cargar los blogs. Por favor, intenta más tarde.');
            }
        } catch (error) {
            console.error('Error de conexión:', error);
            showErrorMessage('Error de conexión. Verifica que el servidor esté funcionando.');
        } finally {
            showLoader(false);
        }
    }

    // Función para mostrar un loader mientras cargan los datos
    function showLoader(show) {
        if (show) {
            blogGrid.innerHTML = '<div class="blog-loader"><div class="loader-spinner"></div><p>Cargando blogs...</p></div>';
        }
    }

    // Función para mostrar mensajes de error
    function showErrorMessage(message) {
        blogGrid.innerHTML = `<div class="blog-error"><p>${message}</p></div>`;
    }

    // Función para renderizar los blogs en el DOM
    function renderBlogs(blogs) {
        blogGrid.innerHTML = '';
        
        if (blogs.length === 0) {
            blogGrid.innerHTML = '<div class="no-blogs"><p>No se encontraron blogs.</p></div>';
            return;
        }

        blogs.forEach(blog => {
            const blogCard = createBlogCard(blog);
            blogGrid.appendChild(blogCard);
        });

        // Actualizar la lista de cards para la paginación y filtros
        blogCards = Array.from(blogGrid.querySelectorAll('.blog-card'));
        filteredBlogCards = blogCards;
        
        // Reinicializar paginación
        currentPage = 1;
        updatePagination();
        showCurrentPage();
        
        // Actualizar la visualización de filtros (se ocultará si no hay filtros activos)
        updateActiveFiltersDisplay();
    }

    // Función para crear una card de blog
    function createBlogCard(blog) {
        const article = document.createElement('article');
        article.className = 'blog-card';
        article.setAttribute('data-category', blog.categoria || 'General');
        article.setAttribute('data-id', blog.id);

        // Formatear la fecha
        const formattedDate = formatDate(blog.fecha);
        
        // Usar URL de imagen (ya sea de Cloudinary o local)
        const imageUrl = blog.imagen || 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80';

        article.innerHTML = `
            <div class="blog-image-container">
                <img src="${imageUrl}" alt="${blog.titulo}" class="blog-image" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1600585154340-be6161a56a0c?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80'">
            </div>
            <div class="blog-content">
                <div class="blog-category">${blog.categoria || 'General'}</div>
                <h2 class="blog-title">${blog.titulo}</h2>
                <p class="blog-excerpt">${blog.resumen}</p>
                <div class="blog-meta">
                    <span class="blog-date"><i class="far fa-calendar-alt"></i> ${formattedDate}</span>
                    <a href="blog-article.html?id=${blog.id}" class="read-more">Leer más <i class="fas fa-arrow-right"></i></a>
                </div>
            </div>
        `;

        return article;
    }

    // Función para formatear la fecha
    function formatDate(dateString) {
        if (!dateString) return 'Fecha no disponible';
        
        try {
            const date = new Date(dateString);
            const options = { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric'
            };
            return date.toLocaleDateString('es-ES', options);
        } catch (error) {
            return dateString; // Retornar la fecha original si hay error al formatear
        }
    }

    // Función para actualizar filtros basados en los datos de la API
    function updateFiltersFromData() {
        // Obtener categorías únicas
        const categories = [...new Set(allBlogs.map(blog => blog.categoria).filter(cat => cat))];
        
        // Actualizar el menú de categorías si existe
        const categoriesList = document.getElementById('categories-list');
        if (categoriesList) {
            // Mantener el "Todos"
            const allCategoriesLink = categoriesList.querySelector('[data-filter="all"]');
            categoriesList.innerHTML = '';
            if (allCategoriesLink) {
                categoriesList.appendChild(allCategoriesLink);
            }
            
            // Agregar las nuevas categorías
            categories.forEach(category => {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = '#';
                a.setAttribute('data-filter', category);
                a.textContent = category;
                li.appendChild(a);
                categoriesList.appendChild(li);
            });
        }
    }

    // Función para filtrar por categoría
    function filterByCategory(category, element) {
        // Actualizar filtros activos
        activeFilters.category = category;
        
        // Actualizar UI de categorías
        document.querySelectorAll('#categories-list a').forEach(link => {
            link.classList.remove('active');
        });
        element.classList.add('active');
        
        // Aplicar filtros
        applyFilters();
        updateActiveFiltersDisplay();
    }

    // Mostrar filtros activos
    function updateActiveFiltersDisplay() {
        if (!activeFiltersContainer) return;
        
        activeFiltersContainer.innerHTML = '';
        
        // Mostrar categoría activa
        if (activeFilters.category !== 'all') {
            const categoryTag = document.createElement('span');
            categoryTag.className = 'active-filter-tag';
            categoryTag.innerHTML = `
                Categoría: ${activeFilters.category}
                <button type="button" data-type="category" data-value="${activeFilters.category}">
                    <i class="fas fa-times"></i>
                </button>
            `;
            activeFiltersContainer.appendChild(categoryTag);
        }
        
        // Mostrar etiquetas activas
        activeFilters.tags.forEach(tag => {
            const tagElement = document.createElement('span');
            tagElement.className = 'active-filter-tag';
            tagElement.innerHTML = `
                ${tag}
                <button type="button" data-type="tag" data-value="${tag}">
                    <i class="fas fa-times"></i>
                </button>
            `;
            activeFiltersContainer.appendChild(tagElement);
        });
        
        // Mostrar u ocultar el contenedor de filtros activos
        const filtersContainer = document.querySelector('.filters-container');
        if (filtersContainer) {
            if (activeFilters.category === 'all' && activeFilters.tags.length === 0) {
                filtersContainer.style.display = 'none';
            } else {
                filtersContainer.style.display = 'flex';
            }
        }
    }
    
    // Limpiar todos los filtros
    function clearAllFilters() {
        // Restablecer filtros
        activeFilters = {
            category: 'all',
            tags: []
        };
        
        // Actualizar UI
        updateActiveFiltersDisplay();
        
        // Restablecer categoría activa
        const allCategories = document.querySelectorAll('#categories-list a');
        allCategories.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('data-filter') === 'all') {
                link.classList.add('active');
            }
        });
        
        // Restablecer búsqueda
        if (searchInput) {
            searchInput.value = '';
        }
        
        // Aplicar filtros (sin ninguna categoría o etiqueta)
        applyFilters();
    }
    
    // Actualizar la visualización de la paginación
    function updatePagination() {
        if (!paginationContainer) return;
        
        const totalPages = Math.ceil(filteredBlogCards.length / postsPerPage);
        let paginationHTML = '';
        
        // Botón Anterior
        if (currentPage > 1) {
            paginationHTML += `
                <li><a href="#" class="prev"><i class="fas fa-chevron-left"></i></a></li>
            `;
        }
        
        // Páginas
        const maxVisiblePages = 3;
        let startPage = Math.max(1, currentPage - 1);
        let endPage = Math.min(startPage + maxVisiblePages - 1, totalPages);
        
        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }
        
        // Primera página y puntos suspensivos si es necesario
        if (startPage > 1) {
            paginationHTML += `
                <li><a href="#" data-page="1">1</a></li>
                ${startPage > 2 ? '<li><span class="dots">...</span></li>' : ''}
            `;
        }
        
        // Páginas visibles
        for (let i = startPage; i <= endPage; i++) {
            if (i === currentPage) {
                paginationHTML += `<li><span class="current">${i}</span></li>`;
            } else {
                paginationHTML += `<li><a href="#" data-page="${i}">${i}</a></li>`;
            }
        }
        
        // Última página y puntos suspensivos si es necesario
        if (endPage < totalPages) {
            paginationHTML += `
                ${endPage < totalPages - 1 ? '<li><span class="dots">...</span></li>' : ''}
                <li><a href="#" data-page="${totalPages}">${totalPages}</a></li>
            `;
        }
        
        // Botón Siguiente
        if (currentPage < totalPages) {
            paginationHTML += `
                <li><a href="#" class="next"><i class="fas fa-chevron-right"></i></a></li>
            `;
        }
        
        paginationContainer.innerHTML = paginationHTML;
        
        // Agregar event listeners para paginación
        paginationContainer.addEventListener('click', function(e) {
            e.preventDefault();
            const target = e.target.closest('a');
            if (!target) return;
            
            if (target.classList.contains('next')) {
                if (currentPage < Math.ceil(filteredBlogCards.length / postsPerPage)) {
                    currentPage++;
                    showCurrentPage();
                    updatePagination();
                }
            } else if (target.classList.contains('prev')) {
                if (currentPage > 1) {
                    currentPage--;
                    showCurrentPage();
                    updatePagination();
                }
            } else if (target.textContent && !isNaN(target.textContent)) {
                currentPage = parseInt(target.textContent);
                showCurrentPage();
                updatePagination();
            }
            
            // Desplazarse suavemente hacia arriba
            if (blogGrid) {
                window.scrollTo({   
                    top:450,
                    behavior: 'smooth'
                });
            }
        });
    }

    // Aplicar todos los filtros
    function applyFilters() {
        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
        
        filteredBlogCards = Array.from(blogCards).filter(card => {
            const cardCategory = card.getAttribute('data-category');
            
            // Filtrar por categoría
            const categoryMatch = activeFilters.category === 'all' || cardCategory === activeFilters.category;
            
            // Filtrar por etiquetas
            let tagsMatch = true;
            if (activeFilters.tags.length > 0) {
                tagsMatch = activeFilters.tags.some(tag => cardTags.includes(tag));
            }
            
            // Filtrar por búsqueda (título y resumen)
            let searchMatch = true;
            if (searchTerm) {
                const title = card.querySelector('.blog-title').textContent.toLowerCase();
                const excerpt = card.querySelector('.blog-excerpt').textContent.toLowerCase();
                const category = cardCategory.toLowerCase();
                
                searchMatch = title.includes(searchTerm) || 
                             excerpt.includes(searchTerm) || 
                             category.includes(searchTerm);
            }
            
            return categoryMatch && tagsMatch && searchMatch;
        });
        
        // Actualizar la paginación y mostrar las publicaciones
        currentPage = 1; // Volver a la primera página al aplicar nuevos filtros
        updatePagination();
        showCurrentPage();
    }

    // Función para mostrar la página actual
    function showCurrentPage() {
        const startIndex = (currentPage - 1) * postsPerPage;
        const endIndex = startIndex + postsPerPage;
        const visiblePosts = filteredBlogCards.slice(startIndex, endIndex);
        
        // Ocultar todas las publicaciones
        blogCards.forEach(card => {
            card.style.display = 'none';
        });
        
        // Mostrar solo las publicaciones de la página actual
        visiblePosts.forEach(card => {
            if (card) card.style.display = 'block';
        });
        
        // Mostrar mensaje si no hay resultados
        if (filteredBlogCards.length === 0) {
            if (!document.querySelector('.no-results')) {
                const noResults = document.createElement('div');
                noResults.className = 'no-results';
                noResults.innerHTML = '<p>No se encontraron blogs que coincidan con los filtros aplicados.</p>';
                blogGrid.appendChild(noResults);
            }
        } else {
            const noResults = document.querySelector('.no-results');
            if (noResults) {
                noResults.remove();
            }
        }
    }

    // Inicializar la aplicación
    function init() {
        // Ocultar contenedor de filtros al inicio
        const filtersContainer = document.querySelector('.filters-container');
        if (filtersContainer) {
            filtersContainer.style.display = 'none';
        }
        
        // Inicializar la visualización de filtros activos
        updateActiveFiltersDisplay();
        
        loadBlogs();
        
        // Event listeners
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', clearAllFilters);
        }
        
        // Event delegation para filtros de categoría dinámicos
        const categoriesList = document.getElementById('categories-list');
        if (categoriesList) {
            categoriesList.addEventListener('click', function(e) {
                if (e.target.tagName === 'A') {
                    e.preventDefault();
                    const filter = e.target.getAttribute('data-filter');
                    filterByCategory(filter, e.target);
                }
            });
        }
        
        // Búsqueda
        if (searchForm) {
            searchForm.addEventListener('submit', function(e) {
                e.preventDefault();
                applyFilters();
            });
        }

        if (searchInput) {
            searchInput.addEventListener('input', function() {
                applyFilters();
            });
        }

        // Event delegation para eliminar filtros activos
        if (activeFiltersContainer) {
            activeFiltersContainer.addEventListener('click', function(e) {
                const button = e.target.closest('button');
                if (!button) return;
                
                const type = button.getAttribute('data-type');
                const value = button.getAttribute('data-value');
                
                if (type === 'category') {
                    activeFilters.category = 'all';
                    // Actualizar UI de categorías
                    document.querySelectorAll('#categories-list a').forEach(link => {
                        link.classList.remove('active');
                        if (link.getAttribute('data-filter') === 'all') {
                            link.classList.add('active');
                        }
                    });
                } 
                updateActiveFiltersDisplay();
                applyFilters();
            });
        }
    }

    // Función para cargar blogs populares
    async function loadPopularBlogs() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/blogs/populares`);
            const data = await response.json();
            
            if (data.ok && data.blogs) {
                renderPopularBlogs(data.blogs);
            } else {
                console.error('Error al cargar blogs populares:', data.error);
            }
        } catch (error) {
            console.error('Error de conexión al cargar blogs populares:', error);
        }
    }

    // Función para renderizar blogs populares en el sidebar
    function renderPopularBlogs(blogs) {
        const popularPostsWidget = document.querySelector('.sidebar-widget.popular-posts');
        if (!popularPostsWidget) return;

        // Mantener el título del widget
        const widgetTitle = popularPostsWidget.querySelector('.widget-title');
        popularPostsWidget.innerHTML = '';
        
        if (widgetTitle) {
            popularPostsWidget.appendChild(widgetTitle);
        }

        if (blogs.length === 0) {
            const noPostsMessage = document.createElement('p');
            noPostsMessage.textContent = 'No hay artículos populares disponibles.';
            noPostsMessage.style.textAlign = 'center';
            noPostsMessage.style.color = '#666';
            popularPostsWidget.appendChild(noPostsMessage);
            return;
        }

        // Crear elementos para cada blog popular
        blogs.forEach(blog => {
            const postItem = document.createElement('div');
            postItem.className = 'post-item';
            
            // Formatear fecha
            const fecha = new Date(blog.fecha).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });

            // Usar URL de imagen (Cloudinary o placeholder)
            const imagenUrl = blog.imagen || 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80';

            postItem.innerHTML = `
                <img src="${imagenUrl}" alt="${blog.titulo}" class="post-image" loading="lazy" 
                     onerror="this.src='https://images.unsplash.com/photo-1600585154340-be6161a56a0c?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80'">
                <div class="post-content">
                    <h4 class="post-title" title="${blog.titulo}">${blog.titulo}</h4>
                    <span class="post-date">${fecha}</span>
                </div>
            `;

            // Agregar evento de click para navegar al artículo
            postItem.style.cursor = 'pointer';
            postItem.addEventListener('click', () => {
                // Aquí puedes agregar la navegación al artículo completo
                window.location.href = `blog-article.html?id=${blog.id}`;
            });

            popularPostsWidget.appendChild(postItem);
        });
    }

    // Llamar a la función de inicialización
    init();
    
    // Cargar blogs populares
    loadPopularBlogs();

});
