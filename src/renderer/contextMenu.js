/* Context Menu for Songs */

class SongContextMenu {
    constructor() {
        this.menu = null;
        this.currentTrack = null;
        this.currentPlaylist = null;
        this.init();
    }

    init() {
        // Create context menu HTML structure
        this.createMenu();
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.song-context-menu')) {
                this.hide();
            }
        });
        
        // Close menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hide();
            }
        });
    }

    createMenu() {
        const menu = document.createElement('div');
        menu.id = 'song-context-menu';
        menu.className = 'song-context-menu';
        menu.innerHTML = `
            <div class="context-menu-item" id="ctx-add-to-queue">
                <svg class="context-menu-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
                </svg>
                <span>Add to queue</span>
            </div>
            <div class="context-menu-item" id="ctx-play-next">
                <svg class="context-menu-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                </svg>
                <span>Play next</span>
            </div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" id="ctx-add-to-playlist">
                <svg class="context-menu-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
                <span>Add to playlist</span>
                <svg class="context-menu-arrow" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                </svg>
            </div>
            <div class="context-menu-item" id="ctx-toggle-favorite">
                <svg class="context-menu-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
                <span class="ctx-favorite-text">Add to favourites</span>
            </div>
            <div class="context-menu-item" id="ctx-toggle-hide">
                <svg class="context-menu-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
                </svg>
                <span class="ctx-hide-text">Hide song</span>
            </div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item context-menu-item-danger" id="ctx-remove-from-playlist">
                <svg class="context-menu-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
                <span>Remove from playlist</span>
            </div>
        `;
        
        document.body.appendChild(menu);
        this.menu = menu;
        
        // Add event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Add to queue
        document.getElementById('ctx-add-to-queue').addEventListener('click', (e) => {
            e.stopPropagation();
            this.addToQueue();
            this.hide();
        });
        
        // Play next
        document.getElementById('ctx-play-next').addEventListener('click', (e) => {
            e.stopPropagation();
            this.playNext();
            this.hide();
        });
        
        // Add to playlist (will show submenu)
        document.getElementById('ctx-add-to-playlist').addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.showPlaylistSubmenu(e);
        });
        
        // Toggle favorite
        document.getElementById('ctx-toggle-favorite').addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.toggleFavorite();
            this.hide();
        });
        
        // Toggle hide
        document.getElementById('ctx-toggle-hide').addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.toggleHide();
            this.hide();
        });
        
        // Remove from playlist
        document.getElementById('ctx-remove-from-playlist').addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.removeFromPlaylist();
            this.hide();
        });
    }

    show(x, y, track, playlistId = null) {
        this.currentTrack = track;
        this.currentPlaylist = playlistId;
        
        // Update menu items based on context
        const removeFromPlaylistItem = document.getElementById('ctx-remove-from-playlist');
        const favoriteItem = document.getElementById('ctx-toggle-favorite');
        const favoriteText = favoriteItem.querySelector('.ctx-favorite-text');
        const favoriteIcon = favoriteItem.querySelector('.context-menu-icon');
        const hideItem = document.getElementById('ctx-toggle-hide');
        const hideText = hideItem.querySelector('.ctx-hide-text');
        const hideIcon = hideItem.querySelector('.context-menu-icon');
        
        // Show/hide "Remove from playlist" option
        if (playlistId) {
            removeFromPlaylistItem.style.display = 'flex';
        } else {
            removeFromPlaylistItem.style.display = 'none';
        }
        
        // Update favorite button text and icon
        if (track.isFavorite) {
            favoriteText.textContent = 'Remove from favourites';
            favoriteIcon.innerHTML = '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>';
            favoriteItem.classList.add('is-favorite');
        } else {
            favoriteText.textContent = 'Add to favourites';
            favoriteIcon.innerHTML = '<path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/>';
            favoriteItem.classList.remove('is-favorite');
        }
        
        // Update hide button text and icon
        const isHidden = window.isHidden ? window.isHidden(track.id) : false;
        if (isHidden) {
            hideText.textContent = 'Unhide song';
            hideIcon.innerHTML = '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
        } else {
            hideText.textContent = 'Hide song';
            hideIcon.innerHTML = '<path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>';
        }
        
        // Position the menu
        this.menu.style.display = 'block';
        this.menu.style.left = `${x}px`;
        this.menu.style.top = `${y}px`;
        
        // Adjust position if menu would go off screen
        const menuRect = this.menu.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        if (menuRect.right > windowWidth) {
            this.menu.style.left = `${windowWidth - menuRect.width - 10}px`;
        }
        
        if (menuRect.bottom > windowHeight) {
            this.menu.style.top = `${windowHeight - menuRect.height - 10}px`;
        }
    }

    hide() {
        if (this.menu) {
            this.menu.style.display = 'none';
        }
        // Remove any submenu
        const submenu = document.getElementById('playlist-submenu');
        if (submenu) {
            submenu.remove();
        }
    }

    async addToQueue() {
        if (!this.currentTrack || !window.player) return;
        
        // Add track to queue using player method
        window.player.addToQueue(this.currentTrack);
        
        // Show toast notification
        if (window.showToast) {
            window.showToast(`Added "${this.currentTrack.title}" to queue`, 'success');
        }
    }

    async playNext() {
        if (!this.currentTrack || !window.player) return;
        
        // Insert after current track in queue
        window.player.insertNext(this.currentTrack);
        
        // Show toast notification
        if (window.showToast) {
            window.showToast(`"${this.currentTrack.title}" will play next`, 'success');
        }
    }

    async showPlaylistSubmenu(event) {
        // Remove existing submenu if any
        const existingSubmenu = document.getElementById('playlist-submenu');
        if (existingSubmenu) {
            existingSubmenu.remove();
        }
        
        // Create submenu
        const submenu = document.createElement('div');
        submenu.id = 'playlist-submenu';
        submenu.className = 'context-submenu';
        submenu.innerHTML = '<div class="context-menu-loading">Loading playlists...</div>';
        
        // Position submenu next to parent item
        const parentRect = event.target.closest('.context-menu-item').getBoundingClientRect();
        submenu.style.left = `${parentRect.right - 5}px`;
        submenu.style.top = `${parentRect.top}px`;
        
        document.body.appendChild(submenu);
        
        // Load playlists
        try {
            const res = await window.api.listPlaylists(0, 100);
            const playlists = res.items || [];
            
            if (playlists.length === 0) {
                submenu.innerHTML = '<div class="context-menu-empty">No playlists found</div>';
            } else {
                submenu.innerHTML = playlists.map(playlist => `
                    <div class="context-menu-item" data-playlist-id="${playlist.id}">
                        <svg class="context-menu-icon" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
                        </svg>
                        <span>${playlist.title}</span>
                    </div>
                `).join('');
                
                // Add click handlers to playlist items
                submenu.querySelectorAll('.context-menu-item').forEach(item => {
                    item.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const playlistId = item.dataset.playlistId;
                        await this.addToPlaylist(playlistId);
                        this.hide();
                    });
                });
            }
            
            // Adjust position if submenu would go off screen
            const submenuRect = submenu.getBoundingClientRect();
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            
            if (submenuRect.right > windowWidth) {
                submenu.style.left = `${parentRect.left - submenuRect.width + 5}px`;
            }
            
            if (submenuRect.bottom > windowHeight) {
                submenu.style.top = `${windowHeight - submenuRect.height - 10}px`;
            }
        } catch (error) {
            console.error('Failed to load playlists:', error);
            submenu.innerHTML = '<div class="context-menu-error">Failed to load playlists</div>';
        }
    }

    async addToPlaylist(playlistId) {
        if (!this.currentTrack || !playlistId) return;
        
        try {
            const res = await window.api.addToPlaylist(playlistId, this.currentTrack.id);
            if (res.ok) {
                if (window.showToast) {
                    window.showToast(`Added "${this.currentTrack.title}" to playlist`, 'success');
                }
            } else {
                throw new Error(res.error || 'Failed to add to playlist');
            }
        } catch (error) {
            console.error('Error adding to playlist:', error);
            if (window.showToast) {
                window.showToast(`Failed to add to playlist: ${error.message}`, 'error');
            }
        }
    }

    async toggleFavorite() {
        if (!this.currentTrack) return;
        
        try {
            const isFavorite = this.currentTrack.isFavorite || false;
            let res;
            
            if (isFavorite) {
                res = await window.api.unmarkFavorite(this.currentTrack.id);
            } else {
                res = await window.api.markFavorite(this.currentTrack.id);
            }
            
            if (res.ok) {
                // Update track's favorite state
                this.currentTrack.isFavorite = !isFavorite;
                
                // Dispatch event to update UI
                window.dispatchEvent(new CustomEvent('favoriteChanged', { 
                    detail: { trackId: this.currentTrack.id, isFavorite: !isFavorite } 
                }));
                
                if (window.showToast) {
                    const message = !isFavorite ? 
                        `Added "${this.currentTrack.title}" to favourites` : 
                        `Removed "${this.currentTrack.title}" from favourites`;
                    window.showToast(message, 'success');
                }
            } else {
                throw new Error(res.error || 'Failed to update favorite');
            }
        } catch (error) {
            console.error('Error toggling favorite:', error);
            if (window.showToast) {
                window.showToast(`Failed to update favorite: ${error.message}`, 'error');
            }
        }
    }

    async removeFromPlaylist() {
        if (!this.currentTrack || !this.currentPlaylist) return;
        
        try {
            const res = await window.api.removeFromPlaylist(this.currentPlaylist, this.currentTrack.id);
            if (res.ok) {
                if (window.showToast) {
                    window.showToast(`Removed "${this.currentTrack.title}" from playlist`, 'success');
                }
                
                // Dispatch event to refresh playlist view
                window.dispatchEvent(new CustomEvent('playlistChanged', { 
                    detail: { playlistId: this.currentPlaylist } 
                }));
                
                // Reload the current view if we're on a playlist page
                if (location.hash.includes('playlist/')) {
                    setTimeout(() => {
                        window.location.reload();
                    }, 500);
                }
            } else {
                throw new Error(res.error || 'Failed to remove from playlist');
            }
        } catch (error) {
            console.error('Error removing from playlist:', error);
            if (window.showToast) {
                window.showToast(`Failed to remove from playlist: ${error.message}`, 'error');
            }
        }
    }
    
    async toggleHide() {
        if (!this.currentTrack) return;
        
        // Use global functions from renderer.js
        if (window.toggleHideSong) {
            const newHiddenState = await window.toggleHideSong(this.currentTrack.id);
            
            if (window.showToast) {
                const message = newHiddenState ? 
                    `Hidden "${this.currentTrack.title}"` : 
                    `Unhidden "${this.currentTrack.title}"`;
                window.showToast(message, 'success');
            }
            
            // Update track visibility instantly without reload
            const currentHash = window.location.hash;
            if (currentHash.startsWith('#album/') || currentHash.startsWith('#playlist/')) {
                // Re-render the current page to update hidden state
                window.dispatchEvent(new CustomEvent('hiddenSongsChanged'));
            }
        }
    }
}

/* Playlist Context Menu */

class PlaylistContextMenu {
    constructor() {
        this.menu = null;
        this.currentPlaylist = null;
        this.init();
    }

    init() {
        // Create context menu HTML structure
        this.createMenu();
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.playlist-context-menu')) {
                this.hide();
            }
        });
        
        // Close menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hide();
            }
        });
    }

    createMenu() {
        const menu = document.createElement('div');
        menu.id = 'playlist-context-menu';
        menu.className = 'playlist-context-menu';
        menu.innerHTML = `
            <div class="context-menu-item" id="ctx-playlist-favorite">
                <svg class="context-menu-icon ctx-favorite-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/>
                </svg>
                <span class="ctx-favorite-text">Add to favourites</span>
            </div>
            <div class="context-menu-item" id="ctx-playlist-pin">
                <svg class="context-menu-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/>
                </svg>
                <span class="ctx-pin-text">Pin playlist</span>
            </div>
            <div class="context-menu-item" id="ctx-playlist-open">
                <svg class="context-menu-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
                </svg>
                <span>Open playlist</span>
            </div>
        `;
        
        document.body.appendChild(menu);
        this.menu = menu;
        
        // Add event listeners
        this.setupEventListeners();
    }

	setupEventListeners() {
		// Favorite/Unfavorite playlist
		document.getElementById('ctx-playlist-favorite').addEventListener('click', async (e) => {
			e.stopPropagation();
			await this.toggleFavorite();
			this.hide();
		});
		
		// Pin/Unpin playlist
		document.getElementById('ctx-playlist-pin').addEventListener('click', async (e) => {
			e.stopPropagation();
			await this.togglePin();
			this.hide();
		});
		
		// Open playlist
		document.getElementById('ctx-playlist-open').addEventListener('click', (e) => {
			e.stopPropagation();
			this.openPlaylist();
			this.hide();
		});
	}

    async show(x, y, playlist) {
        this.currentPlaylist = playlist;
        
        // Ensure we have userId before checking pin status
        if (window.ensureUserId) {
            await window.ensureUserId();
        }
        
        // Update favorite menu item
        const favoriteItem = document.getElementById('ctx-playlist-favorite');
        const favoriteText = favoriteItem.querySelector('.ctx-favorite-text');
        const favoriteIcon = favoriteItem.querySelector('.ctx-favorite-icon path');
        
        const isFavorite = playlist.isFavorite || false;
        
        if (isFavorite) {
            favoriteText.textContent = 'Remove from favourites';
            // Filled heart (green)
            favoriteIcon.setAttribute('d', 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z');
            favoriteIcon.parentElement.style.color = '#1DB954';
            favoriteItem.classList.add('is-favorite');
        } else {
            favoriteText.textContent = 'Add to favourites';
            // Hollow heart
            favoriteIcon.setAttribute('d', 'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z');
            favoriteIcon.parentElement.style.color = '';
            favoriteItem.classList.remove('is-favorite');
        }
        
        // Update menu items based on pin state
        const pinItem = document.getElementById('ctx-playlist-pin');
        const pinText = pinItem.querySelector('.ctx-pin-text');
        const pinIcon = pinItem.querySelector('.context-menu-icon');
        
        const isPinned = window.isPinned ? window.isPinned(playlist.id) : false;
        
        if (isPinned) {
            pinText.textContent = 'Unpin playlist';
            pinIcon.style.color = '#1DB954';
            pinItem.classList.add('is-pinned');
        } else {
            pinText.textContent = 'Pin playlist';
            pinIcon.style.color = '';
            pinItem.classList.remove('is-pinned');
        }
        
        // Position the menu
        this.menu.style.display = 'block';
        this.menu.style.left = `${x}px`;
        this.menu.style.top = `${y}px`;
        
        // Adjust position if menu would go off screen
        const menuRect = this.menu.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        if (menuRect.right > windowWidth) {
            this.menu.style.left = `${windowWidth - menuRect.width - 10}px`;
        }
        
        if (menuRect.bottom > windowHeight) {
            this.menu.style.top = `${windowHeight - menuRect.height - 10}px`;
        }
    }

    hide() {
        if (this.menu) {
            this.menu.style.display = 'none';
        }
    }

	async togglePin() {
		if (!this.currentPlaylist) return;
		
		const newPinnedState = await window.togglePin(this.currentPlaylist.id);
		
		if (window.showToast) {
			const message = newPinnedState ? 
				`Pinned "${this.currentPlaylist.title}"` : 
				`Unpinned "${this.currentPlaylist.title}"`;
			window.showToast(message, 'success');
		}
		
		// Refresh views after a short delay to allow toast to show
            setTimeout(() => {
			// Refresh the current view to update pin indicators
			const hash = window.location.hash || '';
			if (hash === '#library' || hash === 'library') {
				// Trigger a re-render of library page
				window.dispatchEvent(new CustomEvent('playlistPinChanged'));
			}
		}, 100);
	}

    openPlaylist() {
        if (!this.currentPlaylist) return;
        window.location.hash = `playlist/${this.currentPlaylist.id}`;
    }
    
    async toggleFavorite() {
        if (!this.currentPlaylist) return;
        
        const isFavorite = this.currentPlaylist.isFavorite || false;
        
        try {
            // Update favorite state immediately
            this.currentPlaylist.isFavorite = !isFavorite;
            
            // Update menu display instantly
            const favoriteItem = document.getElementById('ctx-playlist-favorite');
            const favoriteText = favoriteItem.querySelector('.ctx-favorite-text');
            const favoriteIcon = favoriteItem.querySelector('.ctx-favorite-icon path');
            
            if (!isFavorite) {
                favoriteText.textContent = 'Remove from favourites';
                // Filled heart (green)
                favoriteIcon.setAttribute('d', 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z');
                favoriteIcon.parentElement.style.color = '#1DB954';
                favoriteItem.classList.add('is-favorite');
            } else {
                favoriteText.textContent = 'Add to favourites';
                // Hollow heart
                favoriteIcon.setAttribute('d', 'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z');
                favoriteIcon.parentElement.style.color = '';
                favoriteItem.classList.remove('is-favorite');
            }
            
            // Then send API request in background
            if (isFavorite) {
                await window.api.unmarkFavorite(this.currentPlaylist.id);
                if (window.showToast) {
                    window.showToast(`Removed "${this.currentPlaylist.title}" from favourites`, 'success');
                }
            } else {
                await window.api.markFavorite(this.currentPlaylist.id);
                if (window.showToast) {
                    window.showToast(`Added "${this.currentPlaylist.title}" to favourites`, 'success');
                }
            }
            
            // Notify that favorites have changed so library can refresh
            window.dispatchEvent(new CustomEvent('favoritesChanged', { detail: { itemId: this.currentPlaylist.id, itemType: 'playlist' } }));
        } catch (error) {
            // Revert on error
            this.currentPlaylist.isFavorite = isFavorite;
            console.error('Error toggling favorite:', error);
            if (window.showToast) {
                window.showToast('Failed to update favourite', 'error');
            }
        }
    }
}

// Album Context Menu
class AlbumContextMenu {
    constructor() {
        this.menu = null;
        this.currentAlbum = null;
        this.init();
    }

    init() {
        this.createMenu();
        
        // Hide menu when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.album-context-menu')) {
                this.hide();
            }
        });
        
        // Hide menu on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hide();
            }
        });
    }

    createMenu() {
        const menu = document.createElement('div');
        menu.id = 'album-context-menu';
        menu.className = 'album-context-menu';
        menu.innerHTML = `
            <div class="context-menu-item" id="ctx-album-favorite">
                <svg class="context-menu-icon ctx-favorite-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/>
                </svg>
                <span class="ctx-favorite-text">Add to favourites</span>
            </div>
            <div class="context-menu-item" id="ctx-album-open">
                <svg class="context-menu-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
                </svg>
                <span>Open album</span>
            </div>
        `;
        
        document.body.appendChild(menu);
        this.menu = menu;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('ctx-album-favorite').addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.toggleFavorite();
            this.hide();
        });
        
        document.getElementById('ctx-album-open').addEventListener('click', (e) => {
            e.stopPropagation();
            this.openAlbum();
            this.hide();
        });
    }

    async show(x, y, album) {
        this.currentAlbum = album;
        
        // Update favorite menu item
        const favoriteItem = document.getElementById('ctx-album-favorite');
        const favoriteText = favoriteItem.querySelector('.ctx-favorite-text');
        const favoriteIcon = favoriteItem.querySelector('.ctx-favorite-icon path');
        
        const isFavorite = album.isFavorite || false;
        
        if (isFavorite) {
            favoriteText.textContent = 'Remove from favourites';
            // Filled heart (green)
            favoriteIcon.setAttribute('d', 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z');
            favoriteIcon.parentElement.style.color = '#1DB954';
            favoriteItem.classList.add('is-favorite');
        } else {
            favoriteText.textContent = 'Add to favourites';
            // Hollow heart
            favoriteIcon.setAttribute('d', 'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z');
            favoriteIcon.parentElement.style.color = '';
            favoriteItem.classList.remove('is-favorite');
        }
        
        // Position the menu
        this.menu.style.display = 'block';
        this.menu.style.left = `${x}px`;
        this.menu.style.top = `${y}px`;
        
        // Adjust position if menu would go off screen
        const menuRect = this.menu.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        if (menuRect.right > windowWidth) {
            this.menu.style.left = `${windowWidth - menuRect.width - 10}px`;
        }
        
        if (menuRect.bottom > windowHeight) {
            this.menu.style.top = `${windowHeight - menuRect.height - 10}px`;
        }
    }

    hide() {
        if (this.menu) {
            this.menu.style.display = 'none';
        }
    }

    openAlbum() {
        if (!this.currentAlbum) return;
        window.location.hash = `album/${this.currentAlbum.id}`;
    }
    
    async toggleFavorite() {
        if (!this.currentAlbum) return;
        
        const isFavorite = this.currentAlbum.isFavorite || false;
        
        try {
            // Update favorite state immediately
            this.currentAlbum.isFavorite = !isFavorite;
            
            // Update menu display instantly
            const favoriteItem = document.getElementById('ctx-album-favorite');
            const favoriteText = favoriteItem.querySelector('.ctx-favorite-text');
            const favoriteIcon = favoriteItem.querySelector('.ctx-favorite-icon path');
            
            if (!isFavorite) {
                favoriteText.textContent = 'Remove from favourites';
                // Filled heart (green)
                favoriteIcon.setAttribute('d', 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z');
                favoriteIcon.parentElement.style.color = '#1DB954';
                favoriteItem.classList.add('is-favorite');
            } else {
                favoriteText.textContent = 'Add to favourites';
                // Hollow heart
                favoriteIcon.setAttribute('d', 'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z');
                favoriteIcon.parentElement.style.color = '';
                favoriteItem.classList.remove('is-favorite');
            }
            
            // Then send API request in background
            if (isFavorite) {
                await window.api.unmarkFavorite(this.currentAlbum.id);
                if (window.showToast) {
                    window.showToast(`Removed "${this.currentAlbum.title}" from favourites`, 'success');
                }
            } else {
                await window.api.markFavorite(this.currentAlbum.id);
                if (window.showToast) {
                    window.showToast(`Added "${this.currentAlbum.title}" to favourites`, 'success');
                }
            }
            
            // Notify that favorites have changed so library can refresh
            window.dispatchEvent(new CustomEvent('favoritesChanged', { detail: { itemId: this.currentAlbum.id, itemType: 'album' } }));
        } catch (error) {
            // Revert on error
            this.currentAlbum.isFavorite = isFavorite;
            console.error('Error toggling favorite:', error);
            if (window.showToast) {
                window.showToast('Failed to update favourite', 'error');
            }
        }
    }
}

// Initialize context menus when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.songContextMenu = new SongContextMenu();
        window.playlistContextMenu = new PlaylistContextMenu();
        window.albumContextMenu = new AlbumContextMenu();
    });
} else {
    window.songContextMenu = new SongContextMenu();
    window.playlistContextMenu = new PlaylistContextMenu();
    window.albumContextMenu = new AlbumContextMenu();
}

