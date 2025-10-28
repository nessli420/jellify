/* Confirmation Modal */
class ConfirmationModal {
    constructor() {
        this.modal = null;
        this.resolveCallback = null;
        this.init();
    }

    init() {
        this.createModal();
        
        // Close on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible()) {
                this.cancel();
            }
        });
    }

    createModal() {
        const modal = document.createElement('div');
        modal.id = 'confirmation-modal';
        modal.className = 'modal-overlay confirmation-modal-overlay';
        modal.innerHTML = `
            <div class="modal-content confirmation-modal-content">
                <div class="confirmation-icon" id="confirmation-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                    </svg>
                </div>
                <h2 id="confirmation-title">Confirm Action</h2>
                <p id="confirmation-message">Are you sure you want to proceed?</p>
                <div class="confirmation-buttons">
                    <button class="btn-secondary" id="confirmation-cancel">Cancel</button>
                    <button class="btn-danger" id="confirmation-confirm">Delete</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        this.modal = modal;
        
        // Setup event listeners
        document.getElementById('confirmation-cancel').addEventListener('click', () => {
            this.cancel();
        });
        
        document.getElementById('confirmation-confirm').addEventListener('click', () => {
            this.confirm();
        });
        
        // Click outside to cancel
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal || e.target.classList.contains('modal-overlay')) {
                this.cancel();
            }
        });
    }

    show(title, message, confirmText = 'Delete', isDanger = true) {
        return new Promise((resolve) => {
            this.resolveCallback = resolve;
            
            // Update content
            document.getElementById('confirmation-title').textContent = title;
            document.getElementById('confirmation-message').textContent = message;
            
            const confirmBtn = document.getElementById('confirmation-confirm');
            confirmBtn.textContent = confirmText;
            
            // Update button style based on danger flag
            if (isDanger) {
                confirmBtn.className = 'btn-danger';
            } else {
                confirmBtn.className = 'btn-primary';
            }
            
            // Show modal
            this.modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Focus confirm button
            setTimeout(() => {
                confirmBtn.focus();
            }, 100);
        });
    }

    hide() {
        this.modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    isVisible() {
        return this.modal.classList.contains('active');
    }

    confirm() {
        this.hide();
        if (this.resolveCallback) {
            this.resolveCallback(true);
            this.resolveCallback = null;
        }
    }

    cancel() {
        this.hide();
        if (this.resolveCallback) {
            this.resolveCallback(false);
            this.resolveCallback = null;
        }
    }
}

/* Playlist Management Modal */

class PlaylistManagementModal {
    constructor() {
        this.modal = null;
        this.currentPlaylist = null;
        this.selectedTracks = new Set();
        this.confirmationModal = new ConfirmationModal();
        this.init();
    }

    init() {
        this.createModal();
        
        // Close on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible()) {
                this.hide();
            }
        });
    }

    createModal() {
        const modal = document.createElement('div');
        modal.id = 'playlist-management-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content large-modal playlist-modal">
                <button class="modal-close-floating" id="modal-close-btn">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
                
                <div class="playlist-modal-header">
                    <div class="playlist-modal-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
                        </svg>
                    </div>
                    <div class="playlist-modal-title-section">
                        <h2 id="modal-playlist-title">Manage Playlist</h2>
                        <p class="playlist-modal-subtitle">Customize your playlist settings</p>
                    </div>
                </div>
                
                <div class="modal-tabs-modern">
                    <button class="modal-tab-modern active" data-tab="details">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/></svg>
                        <span>Details</span>
                    </button>
                    <button class="modal-tab-modern" data-tab="songs">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
                        <span>Songs</span>
                    </button>
                </div>
                
                <div class="modal-body-modern">
                    <!-- Details Tab -->
                    <div class="modal-tab-content active" id="tab-details">
                        <div class="modern-section">
                            <div class="section-icon">
                                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                            </div>
                            <div class="section-content">
                                <label class="modern-label">Playlist Name</label>
                                <div class="input-with-button">
                                    <input type="text" id="playlist-name-input" class="modern-input" placeholder="Enter playlist name">
                                    <button class="btn-primary-inline" id="save-name-btn">
                                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
                                        Save
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="modern-section danger-section">
                            <div class="section-icon danger">
                                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                            </div>
                            <div class="section-content">
                                <label class="modern-label danger">Delete Playlist</label>
                                <p class="section-description">Permanently remove this playlist and all its contents.</p>
                                <button class="btn-danger-outline" id="delete-playlist-btn">
                                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                                    Delete Playlist
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Manage Songs Tab -->
                    <div class="modal-tab-content" id="tab-songs">
                        <div class="songs-toolbar-modern">
                            <div class="toolbar-left">
                                <button class="btn-toolbar" id="select-all-btn">
                                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                                    Select All
                                </button>
                                <button class="btn-toolbar" id="deselect-all-btn">
                                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>
                                    Clear
                                </button>
                            </div>
                            <button class="btn-danger-toolbar" id="delete-selected-btn" disabled>
                                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                                Remove <span id="selected-count">0</span> Song(s)
                            </button>
                        </div>
                        <div id="songs-list" class="songs-list-modern">
                            <div class="songs-loading">
                                <div class="loading-spinner"></div>
                                <p>Loading songs...</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        this.modal = modal;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Close button
        document.getElementById('modal-close-btn').addEventListener('click', () => {
            this.hide();
        });
        
        // Click outside to close (only if clicking the overlay itself)
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal || e.target.classList.contains('modal-overlay')) {
                this.hide();
            }
        });
        
        // Tab switching
        document.querySelectorAll('.modal-tab-modern').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.switchTab(tabName);
            });
        });
        
        // Save name
        document.getElementById('save-name-btn').addEventListener('click', () => {
            this.saveName();
        });
        
        // Selection toolbar
        document.getElementById('select-all-btn').addEventListener('click', () => {
            this.selectAll();
        });
        
        document.getElementById('deselect-all-btn').addEventListener('click', () => {
            this.deselectAll();
        });
        
        document.getElementById('delete-selected-btn').addEventListener('click', () => {
            this.deleteSelected();
        });
        
        // Cover art - Note: Removed because Jellyfin doesn't support custom playlist covers
        
        // Delete playlist
        document.getElementById('delete-playlist-btn').addEventListener('click', () => {
            this.deletePlaylist();
        });
    }

    async show(playlist) {
        this.currentPlaylist = playlist;
        this.selectedTracks.clear();
        
        // Update title
        document.getElementById('modal-playlist-title').textContent = `Manage "${playlist.title}"`;
        
        // Reset to Details tab
        this.switchTab('details');
        
        // Show modal first
        this.modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Set playlist name input value and make sure it's enabled
        const nameInput = document.getElementById('playlist-name-input');
        nameInput.value = playlist.title || '';
        nameInput.disabled = false;
        nameInput.readOnly = false;
        
        // Focus the input after a short delay to ensure modal is rendered
        setTimeout(() => {
            nameInput.focus();
            nameInput.select();
        }, 100);
        
        // Load songs
        await this.loadSongs();
    }

    hide() {
        this.modal.classList.remove('active');
        document.body.style.overflow = '';
        this.selectedTracks.clear();
        
        // Reset form state
        const nameInput = document.getElementById('playlist-name-input');
        if (nameInput) {
            nameInput.value = '';
            nameInput.disabled = false;
            nameInput.readOnly = false;
        }
    }

    isVisible() {
        return this.modal.classList.contains('active');
    }

    switchTab(tabName) {
        // Update active tab
        document.querySelectorAll('.modal-tab-modern').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        // Update active content
        document.querySelectorAll('.modal-tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabName}`);
        });
        
        // Load songs when switching to songs tab
        if (tabName === 'songs' && this.currentPlaylist) {
            this.loadSongs();
        }
    }

    async saveName() {
        const saveBtn = document.getElementById('save-name-btn');
        const newName = document.getElementById('playlist-name-input').value.trim();
        
        console.log('=== saveName called ===');
        console.log('New name:', newName);
        console.log('Current playlist:', this.currentPlaylist);
        
        if (!newName) {
            if (window.showToast) {
                window.showToast('Please enter a playlist name', 'error');
            }
            return;
        }
        
        // Disable button and show loading state
        saveBtn.disabled = true;
        saveBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor" style="animation: spin 0.8s linear infinite;">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" opacity=".3"/>
                <path d="M12 2C6.48 2 2 6.48 2 12h2c0-4.41 3.59-8 8-8s8 3.59 8 8 3.59 8 8 8c0 5.52-4.48 10-10 10z"/>
            </svg>
            Saving...
        `;
        
        try {
            console.log('Calling window.api.updatePlaylist with:', {
                playlistId: this.currentPlaylist.id,
                data: { name: newName }
            });
            
            const res = await window.api.updatePlaylist(this.currentPlaylist.id, { name: newName });
            
            console.log('Got response from updatePlaylist:', res);
            
            if (res && res.ok) {
                this.currentPlaylist.title = newName;
                document.getElementById('modal-playlist-title').textContent = `Manage "${newName}"`;
                
                if (window.showToast) {
                    window.showToast('Playlist name updated successfully!', 'success');
                }
                
                // Immediately refresh sidebar playlists
                if (typeof window.loadSidebarPlaylists === 'function') {
                    window.loadSidebarPlaylists();
                }
                
                // Refresh views and force page reload to update displayed playlists
                window.dispatchEvent(new CustomEvent('playlistUpdated', { detail: { playlistId: this.currentPlaylist.id, newName: newName } }));
                
                // Update the page based on current location
                const currentHash = window.location.hash;
                
                // If we're on the playlist's own page, update the header in real-time
                if (currentHash === `#playlist/${this.currentPlaylist.id}`) {
                    const pageTitle = document.querySelector('.hero .hero-meta .title');
                    if (pageTitle) {
                        pageTitle.textContent = newName;
                    }
                }
            } else {
                throw new Error(res?.error || 'Failed to update playlist name');
            }
        } catch (error) {
            console.error('=== Error in saveName ===');
            console.error('Error object:', error);
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
            
            if (window.showToast) {
                window.showToast('Failed to update name: ' + (error.message || 'Unknown error'), 'error');
            }
        } finally {
            // Re-enable button
            saveBtn.disabled = false;
            saveBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
                Save
            `;
        }
    }

    async loadSongs() {
        const songsList = document.getElementById('songs-list');
        songsList.innerHTML = `
            <div class="songs-loading">
                <div class="loading-spinner"></div>
                <p>Loading songs...</p>
            </div>
        `;
        
        try {
            const res = await window.api.getPlaylistTracks(this.currentPlaylist.id);
            if (res.ok && res.tracks) {
                if (res.tracks.length === 0) {
                    songsList.innerHTML = '<div class="songs-empty"><p>No songs in this playlist yet</p></div>';
                    return;
                }
                
                songsList.innerHTML = res.tracks.map((track, idx) => `
                    <div class="song-item-modern" data-track-id="${track.id}">
                        <div class="song-checkbox-wrapper">
                            <input type="checkbox" class="song-checkbox-modern" data-track-id="${track.id}" id="track-${track.id}">
                            <label for="track-${track.id}" class="checkbox-custom"></label>
                        </div>
                        <div class="song-number">${idx + 1}</div>
                        <div class="song-info-modern">
                            <div class="song-title-modern">${track.title || 'Untitled'}</div>
                            <div class="song-artist-modern">${track.artist || 'Unknown Artist'}</div>
                        </div>
                        <div class="song-duration-modern">${this.formatDuration(track.durationMs || 0)}</div>
                    </div>
                `).join('');
                
                // Add event listeners to checkboxes
                songsList.querySelectorAll('.song-checkbox-modern').forEach(checkbox => {
                    checkbox.addEventListener('change', () => {
                        this.toggleTrackSelection(checkbox.dataset.trackId, checkbox.checked);
                    });
                });
                
                // Make items clickable (but not when clicking inputs or buttons)
                songsList.querySelectorAll('.song-item-modern').forEach(item => {
                    item.addEventListener('click', (e) => {
                        // Don't interfere with checkboxes or other interactive elements
                        if (e.target.classList.contains('song-checkbox-modern') || 
                            e.target.classList.contains('checkbox-custom') ||
                            e.target.tagName === 'INPUT' || 
                            e.target.tagName === 'LABEL') {
                            return;
                        }
                        const checkbox = item.querySelector('.song-checkbox-modern');
                        checkbox.checked = !checkbox.checked;
                        this.toggleTrackSelection(checkbox.dataset.trackId, checkbox.checked);
                    });
                });
            }
        } catch (error) {
            console.error('Error loading songs:', error);
            songsList.innerHTML = '<div class="songs-error"><p>Failed to load songs. Please try again.</p></div>';
        }
    }

    toggleTrackSelection(trackId, selected) {
        if (selected) {
            this.selectedTracks.add(trackId);
        } else {
            this.selectedTracks.delete(trackId);
        }
        this.updateSelectionUI();
    }

    updateSelectionUI() {
        const count = this.selectedTracks.size;
        document.getElementById('selected-count').textContent = count;
        document.getElementById('delete-selected-btn').disabled = count === 0;
    }

    selectAll() {
        document.querySelectorAll('.song-checkbox-modern').forEach(checkbox => {
            checkbox.checked = true;
            this.selectedTracks.add(checkbox.dataset.trackId);
        });
        this.updateSelectionUI();
    }

    deselectAll() {
        document.querySelectorAll('.song-checkbox-modern').forEach(checkbox => {
            checkbox.checked = false;
        });
        this.selectedTracks.clear();
        this.updateSelectionUI();
    }

    async deleteSelected() {
        if (this.selectedTracks.size === 0) return;
        
        const count = this.selectedTracks.size;
        const songWord = count === 1 ? 'song' : 'songs';
        
        const confirmed = await this.confirmationModal.show(
            `Remove ${count} ${songWord}?`,
            `Are you sure you want to remove ${count} ${songWord} from "${this.currentPlaylist.title}"? This action cannot be undone.`,
            'Remove'
        );
        
        if (!confirmed) {
            return;
        }
        
        try {
            // Delete each track
            for (const trackId of this.selectedTracks) {
                await window.api.removeFromPlaylist(this.currentPlaylist.id, trackId);
            }
            
            if (window.showToast) {
                window.showToast(`Removed ${count} ${songWord}`, 'success');
            }
            
            // Reload songs
            this.selectedTracks.clear();
            await this.loadSongs();
            
            // Immediately refresh sidebar playlists
            if (typeof window.loadSidebarPlaylists === 'function') {
                window.loadSidebarPlaylists();
            }
            
            // Refresh views
            window.dispatchEvent(new CustomEvent('playlistUpdated', { detail: { playlistId: this.currentPlaylist.id } }));
        } catch (error) {
            console.error('Error deleting songs:', error);
            if (window.showToast) {
                window.showToast('Failed to delete some songs', 'error');
            }
        }
    }

    // Note: Cover management removed - Jellyfin doesn't support custom playlist covers

    async deletePlaylist() {
        if (!this.currentPlaylist) return;
        
        const confirmed = await this.confirmationModal.show(
            'Delete Playlist?',
            `Are you sure you want to permanently delete "${this.currentPlaylist.title}"? All songs will be removed from this playlist. This action cannot be undone.`,
            'Delete Playlist'
        );
        
        if (!confirmed) {
            return;
        }
        
        try {
            const res = await window.api.deletePlaylist(this.currentPlaylist.id);
            if (res.ok) {
                if (window.showToast) {
                    window.showToast(`Deleted "${this.currentPlaylist.title}"`, 'success');
                }
                
                // Close the modal
                this.hide();
                
                // Refresh views
                window.dispatchEvent(new CustomEvent('playlistDeleted', { detail: { playlistId: this.currentPlaylist.id } }));
                
                // Navigate away if we're on the deleted playlist's page
                if (window.location.hash === `#playlist/${this.currentPlaylist.id}`) {
                    window.location.hash = '#library';
                }
                
                // Re-render the current page to update playlist list
                if (typeof window.route === 'function') {
                    setTimeout(() => {
                        window.route();
                    }, 100);
                }
            }
        } catch (error) {
            console.error('Error deleting playlist:', error);
            if (window.showToast) {
                window.showToast('Failed to delete playlist', 'error');
            }
        }
    }

    formatDuration(ms) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    }
}

// Initialize and expose
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.playlistManagementModal = new PlaylistManagementModal();
        window.showPlaylistManagementModal = (playlist) => {
            window.playlistManagementModal.show(playlist);
        };
        
        // Listen for playlist updates to refresh sidebar
        window.addEventListener('playlistUpdated', () => {
            if (typeof window.loadSidebarPlaylists === 'function') {
                window.loadSidebarPlaylists();
            }
        });
        
        window.addEventListener('playlistDeleted', () => {
            if (typeof window.loadSidebarPlaylists === 'function') {
                window.loadSidebarPlaylists();
            }
        });
        
        // Listen for playlist updates to re-render current page
        window.addEventListener('playlistUpdated', () => {
            // Re-render the current page to show updated playlist names
            if (typeof window.route === 'function') {
                setTimeout(() => {
                    window.route();
                }, 50);
            }
        });
    });
} else {
    window.playlistManagementModal = new PlaylistManagementModal();
    window.showPlaylistManagementModal = (playlist) => {
        window.playlistManagementModal.show(playlist);
    };
    
    // Listen for playlist updates to refresh sidebar
    window.addEventListener('playlistUpdated', () => {
        if (typeof window.loadSidebarPlaylists === 'function') {
            window.loadSidebarPlaylists();
        }
    });
    
    window.addEventListener('playlistDeleted', () => {
        if (typeof window.loadSidebarPlaylists === 'function') {
            window.loadSidebarPlaylists();
        }
    });
    
    // Listen for playlist updates to re-render current page
    window.addEventListener('playlistUpdated', () => {
        // Re-render the current page to show updated playlist names
        if (typeof window.route === 'function') {
            setTimeout(() => {
                window.route();
            }, 50);
        }
    });
}

