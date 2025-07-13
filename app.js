// Fire Extinguisher Locator Application
class FireExtinguisherApp {
    constructor() {
        this.map = null;
        this.markersLayer = null;
        this.fireExtinguishers = [];
        this.buildings = [];
        this.selectedExtinguisher = null;
        this.searchTimeout = null;
        this.blinkingMarker = null;
        
        // Map configuration
        this.MAP_WIDTH = 7972;
        this.MAP_HEIGHT = 5905;

        // Status colors
        this.statusColors = {
            good: '#4CAF50',
            inspection_due_soon: '#FF9800',
            overdue: '#F44336',
            maintenance_required: '#FF5722'
        };
        
        this.init();
    }
    
    async init() {
        try {
            console.log('Initializing Fire Extinguisher Locator...');
            await this.loadData();
            this.initMap();
            this.setupEventListeners();
            this.updateStats();
            this.populateBuildings();
            console.log('Fire Extinguisher Locator initialized successfully');
        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.showError('Failed to load application data');
        }
    }
    
    async loadData() {
        console.log('Loading fire extinguisher data...');
        
        try {
            // Try loading JSON first (primary data source)
            const data = await this.loadFromJSON();
            this.processLoadedData(data);
            console.log('Successfully loaded data from JSON file');
            return;
            
        } catch (jsonError) {
            console.warn('JSON loading failed:', jsonError.message);
            
            try {
                // Fallback to CSV file
                const data = await this.loadFromCSV();
                this.processLoadedData(data);
                console.log('Successfully loaded data from CSV backup');
                return;
                
            } catch (csvError) {
                console.error('Both JSON and CSV loading failed:', csvError.message);
                
                // No external data available - use empty arrays
                console.log('No external data files available - starting with empty dataset');
                this.buildings = [];
                this.fireExtinguishers = [];
            }
        }
    }

    async loadFromJSON() {
        const response = await fetch('fire-extinguishers.json');
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        return await response.json();
    }

    async loadFromCSV() {
        // First, ensure Papa Parse is available
        if (typeof Papa === 'undefined') {
            throw new Error('Papa Parse library not loaded');
        }
        
        const response = await fetch('backup.csv');
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const csvText = await response.text();
        
        return new Promise((resolve, reject) => {
            Papa.parse(csvText, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                complete: (results) => {
                    if (results.errors.length > 0) {
                        reject(new Error(`CSV parsing errors: ${results.errors.map(e => e.message).join(', ')}`));
                    } else {
                        resolve(this.convertCSVToJSON(results.data));
                    }
                },
                error: (error) => {
                    reject(new Error(`CSV parsing failed: ${error.message}`));
                }
            });
        });
    }

    convertCSVToJSON(csvData) {
        // Process CSV rows to match expected format
        const extinguishers = csvData.map(row => ({
            id: row.id || row.ID,
            building: parseInt(row.building) || parseInt(row.Building),
            x: parseFloat(row.x) || parseFloat(row.X),
            y: parseFloat(row.y) || parseFloat(row.Y),
            status: row.status || row.Status,
            type: row.type || row.Type,
            size: row.size || row.Size,
            manufacturer: row.manufacturer || row.Manufacturer,
            lastInspection: row.lastInspection || row['Last Inspection'],
            nextDue: row.nextDue || row['Next Due']
        }));
        
        // Dynamically create buildings from the data
        const buildingMap = new Map();
        extinguishers.forEach(ext => {
            if (!buildingMap.has(ext.building)) {
                buildingMap.set(ext.building, []);
            }
            buildingMap.get(ext.building).push(ext);
        });
        
        const buildingColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3'];
        const buildings = Array.from(buildingMap.entries()).map(([id, exts], index) => ({
            id,
            name: `Building-${id}`,
            extinguishers: exts.length,
            color: buildingColors[index % buildingColors.length]
        }));
        
        return {
            buildings,
            extinguishers
        };
    }

    processLoadedData(data) {
        this.buildings = data.buildings || [];
        
        // Add building metadata to each extinguisher
        this.fireExtinguishers = (data.extinguishers || []).map(ext => {
            const building = this.buildings.find(b => b.id === ext.building);
            return {
                ...ext,
                buildingName: building ? building.name : 'Unknown Building',
                buildingColor: building ? building.color : '#999999'
            };
        });
        
        console.log(`Loaded ${this.fireExtinguishers.length} fire extinguishers across ${this.buildings.length} buildings`);
    }
    
    initMap() {
        console.log('Initializing map...');
        
        // Create map with CRS.Simple for pixel-based coordinates
        this.map = L.map('map', {
            crs: L.CRS.Simple,
            minZoom: -3,
            maxZoom: 2,
            zoomControl: true,
            attributionControl: false,
            preferCanvas: true
        });
        
        // Load actual factory floor plan image
        const imageBounds = [[0, 0], [this.MAP_HEIGHT, this.MAP_WIDTH]];
        L.imageOverlay('map-layout.jpg', imageBounds).addTo(this.map);
        
        // Set initial view to fit the image
        this.map.fitBounds(imageBounds);
        
        // Create markers layer
        this.markersLayer = L.layerGroup().addTo(this.map);
        
        // Add markers for all fire extinguishers
        this.addMarkers();
        
        // Fit map to show all markers with padding
        setTimeout(() => {
            this.fitToMarkers();
        }, 100);
        
        console.log('Map initialized successfully');
    }
    
    addMarkers() {
        console.log(`Adding ${this.fireExtinguishers.length} markers...`);
        
        this.fireExtinguishers.forEach(extinguisher => {
            const marker = this.createMarker(extinguisher);
            this.markersLayer.addLayer(marker);
        });
        
        console.log('Markers added successfully');
    }
    
    createMarker(extinguisher) {
        // Direct coordinate mapping - no unproject needed for CRS.Simple with image overlay
    const latLng = [this.MAP_HEIGHT - extinguisher.y, extinguisher.x];
    
    // Create custom marker with status color
    const markerSize = 30;
    const color = this.statusColors[extinguisher.status] || '#999999';
    const textColor = this.getContrastColor(color);
    
    const markerHtml = `
        <div class="fire-extinguisher-marker marker-${extinguisher.status}" 
             style="width: ${markerSize}px; height: ${markerSize}px; background-color: ${color}; color: ${textColor}; 
                    border-radius: 50%; display: flex; align-items: center; justify-content: center; 
                    font-weight: bold; font-size: 10px; border: 2px solid white;">
            ${extinguisher.id.split('-')[1]}
        </div>
    `;
    
    const marker = L.marker(latLng, {
        icon: L.divIcon({
            html: markerHtml,
            className: 'custom-marker',
            iconSize: [markerSize, markerSize],
            iconAnchor: [markerSize / 2, markerSize / 2]
        })
    });
    
    // Add popup with detailed information
    const popupContent = this.createPopupContent(extinguisher);
    marker.bindPopup(popupContent, {
        maxWidth: 300,
        className: 'custom-popup'
    });
    
    // Add click handler
    marker.on('click', (e) => {
        this.selectedExtinguisher = extinguisher;
        marker.openPopup();
    });
    
    // Store reference to extinguisher data
    marker.extinguisher = extinguisher;
    
    return marker;
}
    
    getContrastColor(hexColor) {
        // Convert hex to RGB
        const hex = hexColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        
        // Calculate luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        
        return luminance > 0.5 ? '#000000' : '#FFFFFF';
    }
    
    createPopupContent(extinguisher) {
        const statusText = extinguisher.status.replace(/_/g, ' ').toUpperCase();
        const statusColor = this.statusColors[extinguisher.status] || '#999999';
        
        return `
            <div style="min-width: 200px; font-family: Arial, sans-serif;">
                <h3 style="margin: 0 0 8px 0; color: #333;">${extinguisher.id}</h3>
                <p style="margin: 0 0 4px 0;"><strong>Building:</strong> ${extinguisher.buildingName}</p>
                <p style="margin: 0 0 4px 0;"><strong>Type:</strong> ${extinguisher.type}</p>
                <p style="margin: 0 0 4px 0;"><strong>Size:</strong> ${extinguisher.size}</p>
                <p style="margin: 0 0 4px 0;"><strong>Manufacturer:</strong> ${extinguisher.manufacturer}</p>
                <p style="margin: 0 0 8px 0;"><strong>Status:</strong> 
                    <span style="color: ${statusColor}; font-weight: bold;">${statusText}</span>
                </p>
                <p style="margin: 0 0 8px 0; font-size: 12px; color: #666;">
                    Last: ${extinguisher.lastInspection} | Next: ${extinguisher.nextDue}
                </p>
                <button onclick="window.app.showExtinguisherDetails('${extinguisher.id}')" 
                        style="background: #007cba; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">
                    View Details
                </button>
            </div>
        `;
    }
    
    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // Search functionality
        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');
        const searchSuggestions = document.getElementById('searchSuggestions');
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.handleSearch(e.target.value);
                }, 200);
            });
            
            searchInput.addEventListener('focus', () => {
                if (searchInput.value.trim()) {
                    this.handleSearch(searchInput.value);
                }
            });
        }
        
        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                if (searchSuggestions) {
                    searchSuggestions.classList.remove('visible');
                }
            }
        });
        
        if (clearSearch) {
            clearSearch.addEventListener('click', () => {
                this.clearSearch();
            });
        }
        
        // FAB buttons
        const dashboardBtn = document.getElementById('dashboardBtn');
        const buildingsBtn = document.getElementById('buildingsBtn');
        const infoBtn = document.getElementById('infoBtn');
        const homeBtn = document.getElementById('homeBtn');
        
        if (dashboardBtn) {
            dashboardBtn.addEventListener('click', () => {
                console.log('Dashboard button clicked');
                this.showModal('dashboardModal');
            });
        }
        
        if (buildingsBtn) {
            buildingsBtn.addEventListener('click', () => {
                console.log('Buildings button clicked');
                this.showModal('buildingsModal');
            });
        }
        
        if (infoBtn) {
            infoBtn.addEventListener('click', () => {
                console.log('Info button clicked');
                if (this.selectedExtinguisher) {
                    this.showExtinguisherInfo(this.selectedExtinguisher);
                } else {
                    this.showModal('infoModal');
                }
            });
        }
        
        if (homeBtn) {
            homeBtn.addEventListener('click', () => {
                console.log('Home button clicked');
                this.clearSearch();
                this.fitToMarkers();
            });
        }
        
        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modalId = e.target.getAttribute('data-modal');
                this.hideModal(modalId);
            });
        });
        
        // Close modals when clicking outside
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });
        
        // Export buttons
        const exportCSV = document.getElementById('exportCSV');
        const exportJSON = document.getElementById('exportJSON');
        
        if (exportCSV) {
            exportCSV.addEventListener('click', () => {
                console.log('Export CSV clicked');
                this.exportData('csv');
            });
        }
        
        if (exportJSON) {
            exportJSON.addEventListener('click', () => {
                console.log('Export JSON clicked');
                this.exportData('json');
            });
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.clearSearch();
                this.hideAllModals();
            }
        });
        
        console.log('Event listeners set up successfully');
    }
    
    handleSearch(query) {
        const searchSuggestions = document.getElementById('searchSuggestions');
        
        if (!query.trim()) {
            if (searchSuggestions) {
                searchSuggestions.classList.remove('visible');
            }
            return;
        }
        
        // Find matching extinguishers (fuzzy search)
        const matches = this.fireExtinguishers.filter(ext => 
            ext.id.toLowerCase().includes(query.toLowerCase()) ||
            ext.buildingName.toLowerCase().includes(query.toLowerCase()) ||
            ext.type.toLowerCase().includes(query.toLowerCase()) ||
            ext.manufacturer.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 10);
        
        if (!searchSuggestions) return;
        
        if (matches.length === 0) {
            searchSuggestions.innerHTML = '<div class="suggestion-item">No results found</div>';
            searchSuggestions.classList.add('visible');
            return;
        }
        
        // Create suggestion items
        searchSuggestions.innerHTML = matches.map(ext => `
            <div class="suggestion-item" data-id="${ext.id}" tabindex="0">
                <strong>${ext.id}</strong> - ${ext.buildingName}
                <br><small style="color: #666;">${ext.type} (${ext.size}) - ${ext.manufacturer}</small>
            </div>
        `).join('');
        
        searchSuggestions.classList.add('visible');
        
        // Add click and keyboard handlers to suggestions
        searchSuggestions.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                const extinguisherId = item.getAttribute('data-id');
                if (extinguisherId) {
                    this.selectExtinguisher(extinguisherId);
                }
            });
            
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const extinguisherId = item.getAttribute('data-id');
                    if (extinguisherId) {
                        this.selectExtinguisher(extinguisherId);
                    }
                }
            });
        });
    }
    
    selectExtinguisher(extinguisherId) {
       const extinguisher = this.findExtinguisher(extinguisherId);
    if (!extinguisher) return;
    
    // Update search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = extinguisher.id;
    }
    
    const searchSuggestions = document.getElementById('searchSuggestions');
    if (searchSuggestions) {
        searchSuggestions.classList.remove('visible');
    }
    
    // Clear previous blinking marker
    this.clearBlinkingMarker();
    
    // Find and highlight the marker
    this.markersLayer.eachLayer(layer => {
        if (layer.extinguisher && layer.extinguisher.id === extinguisherId) {
            // Add blinking animation
            const markerElement = layer.getElement();
            if (markerElement) {
                const markerDiv = markerElement.querySelector('.fire-extinguisher-marker');
                if (markerDiv) {
                    markerDiv.classList.add('marker-blinking');
                    this.blinkingMarker = markerDiv;
                }
            }
            
            // Zoom to marker - FIXED coordinate transformation
            const latLng = [this.MAP_HEIGHT - extinguisher.y, extinguisher.x];
            this.map.setView(latLng, 1);
        }
    });
    
    this.selectedExtinguisher = extinguisher;
}
    
    clearSearch() {
        const searchInput = document.getElementById('searchInput');
        const searchSuggestions = document.getElementById('searchSuggestions');
        
        if (searchInput) {
            searchInput.value = '';
        }
        if (searchSuggestions) {
            searchSuggestions.classList.remove('visible');
        }
        this.clearBlinkingMarker();
    }
    
    clearBlinkingMarker() {
        if (this.blinkingMarker) {
            this.blinkingMarker.classList.remove('marker-blinking');
            this.blinkingMarker = null;
        }
    }
    
    findExtinguisher(id) {
        return this.fireExtinguishers.find(ext => ext.id === id);
    }
    
    fitToMarkers() {
        if (this.markersLayer.getLayers().length === 0) {
            // If no markers, just fit to the image bounds
            const imageBounds = [[0, 0], [this.MAP_HEIGHT, this.MAP_WIDTH]];
            this.map.fitBounds(imageBounds);
            return;
        }
        
        const group = new L.featureGroup(this.markersLayer.getLayers());
        this.map.fitBounds(group.getBounds().pad(0.1));
    }
    
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('visible');
            console.log(`Modal ${modalId} opened`);
        }
    }
    
    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('visible');
            console.log(`Modal ${modalId} closed`);
        }
    }
    
    hideAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('visible');
        });
    }
    
    updateStats() {
        const stats = {
            total: this.fireExtinguishers.length,
            good: 0,
            inspection_due_soon: 0,
            overdue: 0,
            maintenance_required: 0
        };
        
        this.fireExtinguishers.forEach(ext => {
            stats[ext.status] = (stats[ext.status] || 0) + 1;
        });
        
        const totalCount = document.getElementById('totalCount');
        const goodCount = document.getElementById('goodCount');
        const dueSoonCount = document.getElementById('dueSoonCount');
        const overdueCount = document.getElementById('overdueCount');
        const maintenanceCount = document.getElementById('maintenanceCount');
        
        if (totalCount) totalCount.textContent = stats.total;
        if (goodCount) goodCount.textContent = stats.good;
        if (dueSoonCount) dueSoonCount.textContent = stats.inspection_due_soon;
        if (overdueCount) overdueCount.textContent = stats.overdue;
        if (maintenanceCount) maintenanceCount.textContent = stats.maintenance_required;
    }
    
    populateBuildings() {
        const buildingsList = document.getElementById('buildingsList');
        
        if (!buildingsList) return;
        
        if (this.buildings.length === 0) {
            buildingsList.innerHTML = '<div class="building-item">No buildings available</div>';
            return;
        }
        
        buildingsList.innerHTML = this.buildings.map(building => `
            <div class="building-item" data-building="${building.id}" style="border-left: 4px solid ${building.color}; padding: 10px; margin: 5px 0; cursor: pointer;">
                <h3>${building.name}</h3>
                <p>${building.extinguishers} fire extinguishers</p>
                <small style="color: #666;">
                    ${this.getBuildingStats(building.id)}
                </small>
            </div>
        `).join('');
        
        // Add click handlers
        buildingsList.querySelectorAll('.building-item').forEach(item => {
            item.addEventListener('click', () => {
                const buildingId = parseInt(item.getAttribute('data-building'));
                this.focusOnBuilding(buildingId);
                this.hideModal('buildingsModal');
            });
        });
    }
    
    getBuildingStats(buildingId) {
        const buildingExtinguishers = this.fireExtinguishers.filter(ext => ext.building === buildingId);
        const statusCounts = {
            good: 0,
            inspection_due_soon: 0,
            overdue: 0,
            maintenance_required: 0
        };
        
        buildingExtinguishers.forEach(ext => {
            statusCounts[ext.status] = (statusCounts[ext.status] || 0) + 1;
        });
        
        return `${statusCounts.good} good, ${statusCounts.inspection_due_soon} due soon, ${statusCounts.overdue} overdue, ${statusCounts.maintenance_required} maintenance`;
    }
    
    focusOnBuilding(buildingId) {
        const buildingExtinguishers = this.fireExtinguishers.filter(ext => ext.building === buildingId);
    
    if (buildingExtinguishers.length === 0) return;
    
    // Calculate center and bounds
    const minX = Math.min(...buildingExtinguishers.map(ext => ext.x));
    const maxX = Math.max(...buildingExtinguishers.map(ext => ext.x));
    const minY = Math.min(...buildingExtinguishers.map(ext => ext.y));
    const maxY = Math.max(...buildingExtinguishers.map(ext => ext.y));
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // Convert to leaflet coordinates - FIXED
    const latLng = [this.MAP_HEIGHT - centerY, centerX];
    this.map.setView(latLng, 1);
}
    
    showExtinguisherDetails(extinguisherId) {
        const extinguisher = this.findExtinguisher(extinguisherId);
        if (extinguisher) {
            this.selectedExtinguisher = extinguisher;
            this.showExtinguisherInfo(extinguisher);
        }
    }
    
    showExtinguisherInfo(extinguisher) {
        const extinguisherInfo = document.getElementById('extinguisherInfo');
        
        if (!extinguisherInfo) return;
        
        if (!extinguisher) {
            extinguisherInfo.innerHTML = 
                '<p>No fire extinguisher selected. Click on a marker to view details.</p>';
            this.showModal('infoModal');
            return;
        }
        
        const statusText = extinguisher.status.replace(/_/g, ' ').toUpperCase();
        const statusColor = this.statusColors[extinguisher.status] || '#999999';
        
        extinguisherInfo.innerHTML = `
            <div class="extinguisher-details">
                <div class="detail-group">
                    <h3>Basic Information</h3>
                    <div class="detail-row">
                        <span class="detail-label">ID:</span>
                        <span class="detail-value">${extinguisher.id}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Building:</span>
                        <span class="detail-value">${extinguisher.buildingName}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Type:</span>
                        <span class="detail-value">${extinguisher.type}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Size:</span>
                        <span class="detail-value">${extinguisher.size}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Manufacturer:</span>
                        <span class="detail-value">${extinguisher.manufacturer}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Location:</span>
                        <span class="detail-value">${extinguisher.x}, ${extinguisher.y}</span>
                    </div>
                </div>
                
                <div class="detail-group">
                    <h3>Status & Inspection</h3>
                    <div class="detail-row">
                        <span class="detail-label">Status:</span>
                        <span class="detail-value" style="color: ${statusColor}; font-weight: bold;">${statusText}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Last Inspection:</span>
                        <span class="detail-value">${extinguisher.lastInspection}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Next Due:</span>
                        <span class="detail-value">${extinguisher.nextDue}</span>
                    </div>
                </div>
            </div>
        `;
        
        this.showModal('infoModal');
    }
    
    exportData(format) {
        const timestamp = new Date().toISOString().split('T')[0];
        
        if (format === 'csv') {
            const csv = this.convertToCSV(this.fireExtinguishers);
            this.downloadFile(csv, `fire_extinguishers_${timestamp}.csv`, 'text/csv');
        } else if (format === 'json') {
            const exportData = {
                exported_at: new Date().toISOString(),
                total_count: this.fireExtinguishers.length,
                buildings: this.buildings,
                fire_extinguishers: this.fireExtinguishers
            };
            const json = JSON.stringify(exportData, null, 2);
            this.downloadFile(json, `fire_extinguishers_${timestamp}.json`, 'application/json');
        }
    }
    
    convertToCSV(data) {
        const headers = ['id', 'building', 'buildingName', 'x', 'y', 'status', 'type', 'size', 'manufacturer', 'lastInspection', 'nextDue'];
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => `"${row[header] || ''}"`).join(','))
        ].join('\n');
        
        return csvContent;
    }
    
    downloadFile(content, filename, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
    
    showError(message) {
        console.error(message);
        alert(message);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    window.app = new FireExtinguisherApp();
});
