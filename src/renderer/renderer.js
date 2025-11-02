/* globals api */

const app = document.getElementById('app');
const loginOverlay = document.getElementById('login');
const layout = document.getElementById('layout');

// Playlist pinning management - account specific
let currentUserId = null;

async function ensureUserId() {
	if (!currentUserId) {
		const userRes = await window.api.getCurrentUser();
		if (userRes.ok && userRes.user) {
			currentUserId = userRes.user.Id;
		}
	}
	return currentUserId;
}

function getPinnedPlaylists() {
	try {
		if (!currentUserId) return [];
		const pinned = localStorage.getItem(`pinnedPlaylists_${currentUserId}`);
		return pinned ? JSON.parse(pinned) : [];
	} catch (e) {
		return [];
	}
}

function isPinned(playlistId) {
	return getPinnedPlaylists().includes(playlistId);
}

async function togglePin(playlistId) {
	await ensureUserId();
	const pinned = getPinnedPlaylists();
	const index = pinned.indexOf(playlistId);
	
	if (index >= 0) {
		pinned.splice(index, 1);
	} else {
		pinned.push(playlistId);
	}
	
	localStorage.setItem(`pinnedPlaylists_${currentUserId}`, JSON.stringify(pinned));
	
	// Refresh sidebar
	if (typeof loadSidebarPlaylists === 'function') {
		loadSidebarPlaylists();
	}
	
	return index < 0; // Return new pinned state
}

// Hidden songs management - account specific
function getHiddenSongs() {
	try {
		if (!currentUserId) return [];
		const hidden = localStorage.getItem(`hiddenSongs_${currentUserId}`);
		return hidden ? JSON.parse(hidden) : [];
	} catch (e) {
		return [];
	}
}

function isHidden(trackId) {
	return getHiddenSongs().includes(trackId);
}

// Format total duration for albums/playlists
function formatTotalDuration(tracks) {
	if (!tracks || !tracks.length) return '';
	
	const totalMs = tracks.reduce((sum, track) => sum + (track.durationMs || 0), 0);
	const totalMinutes = Math.floor(totalMs / 60000);
	const totalHours = Math.floor(totalMinutes / 60);
	const remainingMinutes = totalMinutes % 60;
	
	if (totalHours > 0) {
		// Format as "X hr Y min"
		return `${totalHours} hr ${remainingMinutes} min`;
	} else {
		// Format as "X min Y sec"
		const seconds = Math.floor((totalMs % 60000) / 1000);
		return `${totalMinutes} min ${seconds} sec`;
	}
}

async function toggleHideSong(trackId) {
	await ensureUserId();
	const hidden = getHiddenSongs();
	const index = hidden.indexOf(trackId);
	
	if (index >= 0) {
		hidden.splice(index, 1);
	} else {
		hidden.push(trackId);
	}
	
	localStorage.setItem(`hiddenSongs_${currentUserId}`, JSON.stringify(hidden));
	return index < 0; // Return new hidden state
}

function filterHiddenSongs(tracks) {
	// Don't filter out hidden songs - just mark them
	return tracks.map(track => ({
		...track,
		isHidden: getHiddenSongs().includes(track.id)
	}));
}

function el(tag, attrs = {}, children = []) {
	const node = document.createElement(tag);
	Object.entries(attrs).forEach(([k, v]) => {
		if (k === 'class') node.className = v;
		else if (k === 'onclick') node.addEventListener('click', v);
		else node.setAttribute(k, v);
	});
	(children || []).forEach((c) => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
	return node;
}

// Helper function for creating SVG elements
function svgEl(tag, attrs = {}, children = []) {
	const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
	Object.entries(attrs).forEach(([k, v]) => {
		node.setAttribute(k, v);
	});
	(children || []).forEach((c) => {
		if (typeof c === 'string') {
			node.appendChild(document.createTextNode(c));
		} else {
			node.appendChild(c);
		}
	});
	return node;
}

function showLoginError(message) {
	// Find or create error message element
	let errorEl = document.getElementById('login-error-message');
	if (!errorEl) {
		errorEl = document.createElement('div');
		errorEl.id = 'login-error-message';
		errorEl.className = 'login-error-message';
		const loginBody = document.querySelector('#panel-login') || document.querySelector('#panel-server');
		if (loginBody) {
			loginBody.insertBefore(errorEl, loginBody.firstChild);
		}
	}
	
	errorEl.textContent = message;
	errorEl.style.display = 'block';
	
	// Auto-hide after 5 seconds
	setTimeout(() => {
		if (errorEl) {
			errorEl.style.display = 'none';
		}
	}, 5000);
}

function renderLogin() {
	// Hook login overlay elements
	const tabServer = document.getElementById('tab-server');
	const tabLogin = document.getElementById('tab-login');
	const panelServer = document.getElementById('panel-server');
	const panelLogin = document.getElementById('panel-login');
	const serverInput = document.getElementById('lf-server');
	const continueBtn = document.getElementById('lf-continue');
	const userInput = document.getElementById('lf-user');
	const passInput = document.getElementById('lf-pass');
	const toggleBtn = document.getElementById('lf-toggle');
	const submitBtn = document.getElementById('lf-submit');

	function switchTab(which) {
		if (which === 'server') {
			tabServer.classList.add('active');
			tabLogin.classList.remove('active');
			panelServer.classList.remove('hidden');
			panelLogin.classList.add('hidden');
		} else {
			tabLogin.classList.add('active');
			tabServer.classList.remove('active');
			panelLogin.classList.remove('hidden');
			panelServer.classList.add('hidden');
		}
	}

	tabServer.onclick = () => switchTab('server');
	tabLogin.onclick = () => switchTab('login');

	continueBtn.onclick = () => switchTab('login');

	toggleBtn.onclick = () => {
		const t = passInput.getAttribute('type') === 'password' ? 'text' : 'password';
		passInput.setAttribute('type', t);
	};

	submitBtn.onclick = async () => {
		submitBtn.disabled = true;
		submitBtn.textContent = 'Logging in…';
		try {
			const server = serverInput.value.trim();
			const user = userInput.value.trim();
			const pass = passInput.value;
			const res = await window.api.login(server, user, pass);
			if (!res.ok) throw new Error(res.error || 'Login failed');
			// Set the current user ID
			if (res.user && res.user.Id) {
				currentUserId = res.user.Id;
			}
			// Save credentials for auto-login
			await window.api.saveCredentials(server, user, pass);
			loginOverlay.classList.add('hidden');
			layout.classList.remove('hidden');
			await loadUserProfile();
			// Dispatch login event
			window.dispatchEvent(new CustomEvent('login', { detail: { serverUrl: server } }));
			route();
		} catch (e) {
			// Show error message in a non-blocking way
			showLoginError(e.message || String(e));
			submitBtn.disabled = false;
			submitBtn.textContent = 'Sign In';
		}
	};
	
	// Try auto-login on init
	(async () => {
		// Check if auto-login is enabled
		const autoLoginEnabled = localStorage.getItem('autoLoginEnabled') !== 'false';
		
		if (!autoLoginEnabled) {
			return; // Skip auto-login
		}
		
		const creds = await window.api.loadCredentials();
		if (creds.ok && creds.credentials) {
			const { serverUrl, username, password } = creds.credentials;
			serverInput.value = serverUrl;
			userInput.value = username;
			passInput.value = password;
			// Auto-login
			submitBtn.disabled = true;
			submitBtn.textContent = 'Auto-logging in…';
			try {
				const res = await window.api.login(serverUrl, username, password);
				if (res.ok) {
					// Set the current user ID
					if (res.user && res.user.Id) {
						currentUserId = res.user.Id;
					}
					loginOverlay.classList.add('hidden');
					layout.classList.remove('hidden');
					await loadUserProfile();
					// Dispatch login event
					window.dispatchEvent(new CustomEvent('login', { detail: { serverUrl } }));
					route();
				} else {
					submitBtn.disabled = false;
					submitBtn.textContent = 'LOG IN';
				}
			} catch (e) {
				submitBtn.disabled = false;
				submitBtn.textContent = 'LOG IN';
			}
		}
	})();
}

function handleImageError(imgWrapper, img) {
	// Check if image src is empty or invalid
	if (!img.src || img.src.endsWith('/') || img.src === window.location.href) {
		imgWrapper.classList.add('no-image');
		return;
	}
	
	// Handle image load error
	img.addEventListener('error', () => {
		imgWrapper.classList.add('no-image');
	});
	
	// Handle successful image load
	img.addEventListener('load', () => {
		// Ensure no-image class is removed if image loads successfully
		imgWrapper.classList.remove('no-image');
	});
}

function gridSection(title, items, onClick, type = 'album') {
	return el('div', { class: 'section' }, [
		el('h2', {}, [title]),
		el('div', { class: 'grid' }, items.map((it) => {
			const imgWrapper = el('div', { class: 'card-image-wrapper' });
			imgWrapper.setAttribute('data-type', type);
			
			const img = el('img', { src: it.image || '', alt: it.title });
			const playBtn = createPlayButton(() => onClick(it));
			
			imgWrapper.appendChild(img);
			imgWrapper.appendChild(playBtn);
			
			// Handle missing images
			handleImageError(imgWrapper, img);
			
			const card = el('div', { class: 'card' }, [
				imgWrapper,
					el('div', { class: 'meta' }, [
						el('div', { class: 'title' }, [it.title || 'Untitled']),
						el('div', { class: 'subtitle' }, [it.subtitle || ''])
					])
			]);
			card.addEventListener('click', (e) => {
				if (!e.target.closest('.card-play-btn')) {
					onClick(it);
				}
			});
			return card;
		}))
	]);
}

function getGreeting(username = '') {
	const hour = new Date().getHours();
	let greeting = '';
	if (hour < 12) greeting = 'Good morning';
	else if (hour < 18) greeting = 'Good afternoon';
	else greeting = 'Good evening';
	
	return username ? `${greeting}, ${username}` : greeting;
}

function getGreetingGradient() {
	const hour = new Date().getHours();
	if (hour < 12) {
		// Morning - warm sunrise colors
		return 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
	} else if (hour < 18) {
		// Afternoon - bright sky colors
		return 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)';
	} else {
		// Evening - sunset/night colors
		return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
	}
}

// Reusable virtual scrolling system for grids with optional API fetching
function createVirtualGrid(items, createCardFn, options = {}) {
	const {
		initialBatch = 40,
		batchSize = 40,
		containerClass = 'grid',
		onLoadMore = null // Optional callback to fetch more data from API
	} = options;
	
	const grid = el('div', { class: containerClass });
	let renderedCount = 0;
	let allRendered = false;
	let isLoadingMore = false;
	const renderedCards = new Map(); // Track which cards are rendered
	
	const sentinel = el('div', { 
		class: 'virtual-scroll-sentinel',
		style: 'height: 1px; width: 100%; visibility: hidden; grid-column: 1 / -1;'
	});
	
	function renderBatch(startIdx, endIdx, append = false) {
		const fragment = document.createDocumentFragment();
		
		for (let idx = startIdx; idx < endIdx && idx < items.length; idx++) {
			if (!renderedCards.has(idx)) {
				const card = createCardFn(items[idx], idx);
				renderedCards.set(idx, card);
				fragment.appendChild(card);
			}
		}
		
		if (append) {
			grid.appendChild(fragment);
		} else {
			grid.replaceChildren(fragment);
		}
		
		renderedCount = Math.max(renderedCount, Math.min(endIdx, items.length));
		
		if (renderedCount >= items.length) {
			allRendered = true;
			sentinel.remove();
		} else if (append) {
			grid.appendChild(sentinel);
		}
	}
	
	async function loadMore() {
		if (allRendered || isLoadingMore) return;
		
		// Check if we need to fetch more from API
		if (onLoadMore && renderedCount >= items.length * 0.4) {
			// When we've rendered 40% of available items, fetch more from API (earlier trigger for fast scrolling)
			isLoadingMore = true;
			try {
				await onLoadMore();
				// After fetching, updateItems will be called to update the grid
				// But we need to wait a bit for the DOM to update
				setTimeout(() => {
					isLoadingMore = false;
					// If items array was updated externally, reset allRendered
					if (renderedCount < items.length) {
						allRendered = false;
						if (!grid.contains(sentinel)) {
							grid.appendChild(sentinel);
						}
					}
				}, 100);
			} catch (error) {
				console.error('Error loading more items:', error);
				isLoadingMore = false;
			}
		} else {
			// Just render more from existing items
			const nextBatchEnd = Math.min(renderedCount + batchSize, items.length);
			renderBatch(renderedCount, nextBatchEnd, true);
		}
	}
	
	// Initial render
	if (items.length <= initialBatch) {
		renderBatch(0, items.length, false);
	} else {
		renderBatch(0, initialBatch, false);
		grid.appendChild(sentinel);
		
		// Use IntersectionObserver for automatic loading
		const observer = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				if (entry.isIntersecting && !allRendered && !isLoadingMore) {
					loadMore();
				}
			});
		}, {
			root: null,
			rootMargin: '1500px',
			threshold: 0.01
		});
		
		observer.observe(sentinel);
		
		// Clean up observer when all loaded
		const checkComplete = () => {
			if (allRendered && !onLoadMore) {
				observer.disconnect();
			} else {
				setTimeout(checkComplete, 1000);
			}
		};
		setTimeout(checkComplete, 1000);
	}
	
	// Return cleanup function and update function
	return {
		grid,
		updateItems: (newItems) => {
			// Update the items array and re-render if needed
			const oldLength = items.length;
			items = newItems;
			
			// If we have more items now, continue rendering
			if (items.length > oldLength) {
				allRendered = false;
				if (renderedCount < items.length) {
					// Render more items
					const nextBatchEnd = Math.min(renderedCount + batchSize, items.length);
					renderBatch(renderedCount, nextBatchEnd, true);
					// Re-add sentinel if needed
					if (!grid.contains(sentinel)) {
						grid.appendChild(sentinel);
					}
				}
			}
		},
		cleanup: () => {
			renderedCards.clear();
		}
	};
}

function createCardElement(item, onClick, type = 'album') {
	const imgWrapper = el('div', { class: 'card-image-wrapper' });
	imgWrapper.setAttribute('data-type', type);
	
	const img = el('img', { src: item.image || '', alt: item.title });
	const playBtn = createPlayButton(() => onClick(item));
	
	imgWrapper.appendChild(img);
	imgWrapper.appendChild(playBtn);
	handleImageError(imgWrapper, img);
	
	const card = el('div', { class: 'card' }, [
		imgWrapper,
		el('div', { class: 'meta' }, [
			el('div', { class: 'title' }, [item.title || 'Untitled']),
			el('div', { class: 'subtitle' }, [item.subtitle || ''])
		])
	]);
	
	card.addEventListener('click', (e) => {
		if (!e.target.closest('.card-play-btn')) {
			onClick(item);
		}
	});
	
	// Add context menus
	if (type === 'playlist') {
		card.addEventListener('contextmenu', async (e) => {
			e.preventDefault();
			if (window.playlistContextMenu) {
				await window.playlistContextMenu.show(e.clientX, e.clientY, item);
			}
		});
	} else if (type === 'album') {
		card.addEventListener('contextmenu', async (e) => {
			e.preventDefault();
			if (window.albumContextMenu) {
				await window.albumContextMenu.show(e.clientX, e.clientY, item);
			}
		});
	} else if (type === 'artist') {
		card.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			if (window.artistContextMenu) {
				window.artistContextMenu.show(e.clientX, e.clientY, item);
			}
		});
	}
	
	return card;
}

function homeSection(title, items, onClick, type = 'album') {
	const { grid } = createVirtualGrid(
		items,
		(item) => createCardElement(item, onClick, type),
		{ initialBatch: 20, batchSize: 20 }
	);
	
	return el('div', { class: 'home-section' }, [
		el('div', { class: 'section-header' }, [
			el('h2', {}, [title])
		]),
		grid
	]);
}

function createPlayButton(onPlay) {
	const btn = el('button', { class: 'card-play-btn' }, []);
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('fill', 'currentColor');
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('d', 'M8 5v14l11-7z');
	svg.appendChild(path);
	btn.appendChild(svg);
	btn.addEventListener('click', (e) => {
		e.stopPropagation();
		onPlay();
	});
	return btn;
}

async function renderHome() {
	const loadingContainer = el('div', { class: 'home-loading' }, ['Loading your music…']);
	app.replaceChildren(loadingContainer);
	
	const res = await window.api.getHome();
	if (!res.ok) {
		app.replaceChildren(el('div', { class: 'home-error' }, ['Failed to load home: ', res.error || 'unknown error']));
		return;
	}

	// Get current user for personalized greeting
	const userRes = await window.api.getCurrentUser();
	const username = (userRes.ok && userRes.user) ? userRes.user.Name : '';

	function openAlbum(album) { location.hash = `album/${album.id}`; }
	function openPlaylist(pl) { location.hash = `playlist/${pl.id}`; }
	function openArtist(ar) { location.hash = `artist/${ar.id}`; }

	const allAlbums = res.albums || [];
	const recentAlbums = allAlbums.slice(0, 8);
	const moreAlbums = allAlbums.slice(8, 16);
	const evenMoreAlbums = allAlbums.slice(16, 24);
	const playlists = (res.playlists || []).slice(0, 8);
	const artists = (res.artists || []).slice(0, 8);

	// Create home container with gradient background
	const homeContainer = el('div', { class: 'home-container' });
	
	// Hero section with greeting
	const heroSection = el('div', { class: 'home-hero' });
	heroSection.style.background = getGreetingGradient();
	
	const greetingText = el('h1', { class: 'home-greeting-text' }, [getGreeting(username)]);
	const greetingSubtext = el('p', { class: 'home-greeting-subtext' }, ['What would you like to listen to today?']);
	
	heroSection.appendChild(greetingText);
	heroSection.appendChild(greetingSubtext);
	
	homeContainer.appendChild(heroSection);
	
	// Content sections with improved spacing
	const contentWrapper = el('div', { class: 'home-content' });
	
	if (recentAlbums.length > 0) contentWrapper.appendChild(homeSection('Recently Added', recentAlbums, openAlbum, 'album'));
	if (playlists.length > 0) contentWrapper.appendChild(homeSection('Your Playlists', playlists, openPlaylist, 'playlist'));
	if (moreAlbums.length > 0) contentWrapper.appendChild(homeSection('Popular Albums', moreAlbums, openAlbum, 'album'));
	if (artists.length > 0) contentWrapper.appendChild(homeSection('Your Favorite Artists', artists, openArtist, 'artist'));
	if (evenMoreAlbums.length > 0) contentWrapper.appendChild(homeSection('More Albums', evenMoreAlbums, openAlbum, 'album'));
	
	homeContainer.appendChild(contentWrapper);
	
	app.replaceChildren(homeContainer);
}

async function renderList(title, fetchPage, onOpen, type = 'album') {
	const pageSize = 60;
	let startIndex = 0;
	let total = 0;
	const grid = el('div', { class: 'grid' }, []);
	const moreBtn = el('button', { onclick: loadMore, class: 'btn-primary' }, ['Load More']);
	const container = el('div', { class: 'container' }, [
		el('h2', { style: 'margin-bottom: 24px; font-size: 32px; font-weight: 800;' }, [title]), 
		grid, 
		el('div', { style: 'margin-top: 32px; text-align: center;' }, [moreBtn])
	]);

	async function loadMore() {
		moreBtn.disabled = true;
		moreBtn.textContent = 'Loading…';
		const res = await fetchPage(startIndex, pageSize);
		if (!res.ok) {
			alert(res.error || 'Failed to load');
			moreBtn.disabled = false;
			moreBtn.textContent = 'Load More';
			return;
		}
		res.items.forEach((it) => {
			const imgWrapper = el('div', { class: 'card-image-wrapper' });
			imgWrapper.setAttribute('data-type', type);
			
			const img = el('img', { src: it.image || '', alt: it.title });
			const playBtn = createPlayButton(() => onOpen(it));
			
			imgWrapper.appendChild(img);
			imgWrapper.appendChild(playBtn);
			
			// Handle missing images
			handleImageError(imgWrapper, img);
			
			const card = el('div', { class: 'card' }, [
				imgWrapper,
				el('div', { class: 'meta' }, [
					el('div', { class: 'title' }, [it.title || 'Untitled']), 
					el('div', { class: 'subtitle' }, [it.subtitle || ''])
				])
			]);
			card.addEventListener('click', (e) => {
				if (!e.target.closest('.card-play-btn')) {
					onOpen(it);
				}
			});
			grid.appendChild(card);
		});
		startIndex += res.items.length;
		total = res.total;
		moreBtn.disabled = startIndex >= total;
		moreBtn.textContent = startIndex >= total ? 'All Loaded' : 'Load More';
	}

	await loadMore();
	return container;
}

async function renderAlbumsPage() {
	const view = await renderList('Albums', (start, limit) => window.api.listAlbums(start, limit), (album) => {
		location.hash = `album/${album.id}`;
	}, 'album');
	app.replaceChildren(view);
}

async function renderPlaylistsPage() {
	const view = await renderList('Playlists', (start, limit) => window.api.listPlaylists(start, limit), (pl) => {
		location.hash = `playlist/${pl.id}`;
	}, 'playlist');
	app.replaceChildren(view);
}

async function renderArtistsPage() {
	const view = await renderList('Artists', (start, limit) => window.api.listArtists(start, limit), (artist) => {
		location.hash = `artist/${artist.id}`;
	}, 'artist');
	app.replaceChildren(view);
}

function tracksList(title, tracks, onSelect, playlistId = null, isAlbumView = false, onLoadMore = null) {
	const tbody = el('tbody', {});
	let renderedCount = 0;
	const INITIAL_BATCH = 100; // Render first 100 tracks immediately
	const BATCH_SIZE = 100; // Load 100 more at a time
	let isLoading = false;
	let isLoadingMore = false;
	let allRendered = false;
	let currentTracks = tracks; // Store reference to tracks array
	let sentinelObserver = null; // Store observer reference
	
	// Store scroll position before updates
	function saveScrollPosition() {
		// Find the scrollable container (usually the main content area)
		const scrollContainer = tbody.closest('.library-section')?.parentElement || 
		                       tbody.closest('.tracks-section')?.parentElement ||
		                       document.querySelector('.main-content') ||
		                       document.documentElement;
		return {
			scrollTop: scrollContainer.scrollTop,
			scrollHeight: scrollContainer.scrollHeight,
			container: scrollContainer
		};
	}
	
	function restoreScrollPosition(savedPos) {
		if (!savedPos || !savedPos.container) return;
		const container = savedPos.container;
		
		// Wait for DOM to update, then restore scroll position
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				// Since we're appending content at the end, scroll position should remain the same
				// The user's current view should stay where it is
				container.scrollTop = savedPos.scrollTop;
			});
		});
	}
	
	function renderBatch(startIdx, endIdx, append = false) {
		const currentTrack = window.player?.getCurrentTrack?.();
		const currentTrackId = currentTrack ? currentTrack.id : null;
		
		const fragment = document.createDocumentFragment();
		
		for (let idx = startIdx; idx < endIdx && idx < currentTracks.length; idx++) {
			const t = currentTracks[idx];
			if (!t) continue;
			
			const row = createTrackRow(t, idx, currentTrackId, playlistId, isAlbumView, onSelect);
			fragment.appendChild(row);
		}
		
		if (append) {
			tbody.appendChild(fragment);
		} else {
			tbody.replaceChildren(fragment);
		}
		
		renderedCount = endIdx;
		// Only set allRendered if we've rendered all tracks AND there's no API loading possible
		if (renderedCount >= currentTracks.length) {
			allRendered = !onLoadMore; // If we have onLoadMore, don't mark as all rendered yet - more might come
			
			// If we've rendered all tracks and have API loading, trigger it immediately
			if (onLoadMore && !isLoadingMore) {
				// Small delay to ensure DOM is updated
				setTimeout(() => {
					if (!isLoadingMore && !allRendered) {
						loadMoreTracks();
					}
				}, 100);
			}
		}
	}
	
	function renderTracks(fullRefresh = false) {
		const currentTrack = window.player?.getCurrentTrack?.();
		const currentTrackId = currentTrack ? currentTrack.id : null;
		
		// For small lists without API loading, render everything
		if (currentTracks.length <= 100 && !onLoadMore) {
			const fragment = document.createDocumentFragment();
			currentTracks.forEach((t, idx) => {
				const row = createTrackRow(t, idx, currentTrackId, playlistId, isAlbumView, onSelect);
				fragment.appendChild(row);
			});
			tbody.replaceChildren(fragment);
			renderedCount = currentTracks.length;
			allRendered = true;
		} else {
			// For large lists or when using API loading, use progressive rendering
			renderBatch(0, Math.min(INITIAL_BATCH, currentTracks.length), false);
		}
	}
	
	async function loadMoreTracks() {
		if (isLoading || isLoadingMore) return;
		
		// If we've rendered all tracks but have API loading, still allow loading
		if (allRendered && !onLoadMore) return;
		
		// Check if we need to fetch more from API
		// Trigger API call when we've rendered a significant portion OR when we've rendered all available tracks
		const shouldFetchFromAPI = onLoadMore && (
			renderedCount >= Math.max(currentTracks.length * 0.4, currentTracks.length - 20) || 
			renderedCount >= currentTracks.length ||
			allRendered
		);
		
		if (shouldFetchFromAPI) {
			// When we've rendered 40% of available tracks, or within 20 tracks of the end, or all tracks, fetch more from API
			isLoadingMore = true;
			try {
				await onLoadMore();
				// After fetching, tracks array will be updated and updateTracks will be called
				// So we don't need to manually update here
				isLoadingMore = false;
			} catch (error) {
				console.error('Error loading more tracks:', error);
				isLoadingMore = false;
			}
			return;
		}
		
		// Just render more from existing tracks
		if (currentTracks.length <= 100 && !onLoadMore) return;
		if (renderedCount >= currentTracks.length) {
			// If we've rendered all tracks and no API loading, we're done
			if (!onLoadMore) {
				allRendered = true;
				return;
			}
			// If we have onLoadMore but haven't triggered it yet, trigger it now
			if (onLoadMore && !isLoadingMore) {
				isLoadingMore = true;
				try {
					await onLoadMore();
					isLoadingMore = false;
				} catch (error) {
					console.error('Error loading more tracks:', error);
					isLoadingMore = false;
				}
			}
			return;
		}
		
		isLoading = true;
		const nextBatchEnd = Math.min(renderedCount + BATCH_SIZE, currentTracks.length);
		
		// Use requestAnimationFrame for smooth rendering
		requestAnimationFrame(() => {
			renderBatch(renderedCount, nextBatchEnd, true);
			isLoading = false;
			
			// Move sentinel to end if using progressive loading
			if ((currentTracks.length > 100 || onLoadMore) && !allRendered) {
				const sentinel = tbody.querySelector('.load-more-sentinel');
				if (sentinel) {
					tbody.appendChild(sentinel);
				}
			}
		});
	}
	
	// Function to update tracks array and continue rendering
	function updateTracks(newTracks) {
		const savedPos = saveScrollPosition();
		const oldLength = currentTracks.length;
		currentTracks = newTracks;
		
		// If we have more tracks now, continue rendering from where we left off
		if (currentTracks.length > oldLength) {
			allRendered = false;
			isLoadingMore = false; // Reset loading flag so we can continue loading
			
			// Render more tracks - append only new ones
			if (renderedCount < currentTracks.length) {
				const nextBatchEnd = Math.min(renderedCount + BATCH_SIZE, currentTracks.length);
				renderBatch(renderedCount, nextBatchEnd, true);
			}
			
			// Always ensure sentinel is present and observed if we might have more tracks
			const hasMore = onLoadMore; // If onLoadMore exists, assume there might be more
			if (!allRendered || hasMore) {
				let sentinel = tbody.querySelector('.load-more-sentinel');
				if (!sentinel) {
					sentinel = el('tr', { class: 'load-more-sentinel', style: 'height: 1px; visibility: hidden;' }, [
						el('td', { colspan: '5' }, [])
					]);
					tbody.appendChild(sentinel);
				}
				
				// Ensure sentinel is at the end
				if (sentinel.parentNode) {
					sentinel.parentNode.appendChild(sentinel);
				}
				
				// Re-observe the sentinel if observer exists
				if (sentinelObserver) {
					sentinelObserver.disconnect();
				}
				// Create new observer
				sentinelObserver = new IntersectionObserver((entries) => {
					entries.forEach(entry => {
						if (entry.isIntersecting && !allRendered && !isLoadingMore) {
							loadMoreTracks();
						}
					});
				}, {
					root: null,
					rootMargin: '2000px',
					threshold: 0.01
				});
				sentinelObserver.observe(sentinel);
			}
			
			// Restore scroll position after DOM updates
			restoreScrollPosition(savedPos);
		}
	}
	
	function createTrackRow(t, idx, currentTrackId, playlistId, isAlbumView, onSelect) {
			const mins = Math.floor((t.durationMs || 0) / 60000);
			const secs = Math.floor(((t.durationMs || 0) % 60000) / 1000).toString().padStart(2, '0');
			const isPlaying = t.id === currentTrackId;
			const isHidden = t.isHidden || false;
			
		const numberCell = el('td', { class: 'track-number' });
		if (isPlaying) {
			// Show animated equalizer for currently playing track
			numberCell.innerHTML = `
				<div class="equalizer">
					<span class="bar"></span>
					<span class="bar"></span>
					<span class="bar"></span>
					<span class="bar"></span>
				</div>
			`;
			numberCell.classList.add('playing');
		} else {
			numberCell.textContent = String(idx + 1);
		}
		
		// Album art cell
		const artCell = el('td', { class: 'track-art-cell' });
		// Check if image URL is valid (not empty, not just whitespace, not ending with '/')
		const isValidImage = t.image && t.image.trim() !== '' && !t.image.endsWith('/') && t.image !== window.location.href;
		
		if (isValidImage) {
			const img = el('img', { class: 'track-art', src: t.image, alt: t.title || 'Track' });
			// Handle image load error - replace with placeholder if image fails to load
			img.addEventListener('error', () => {
				img.remove();
				const placeholder = el('div', { class: 'track-art-placeholder' });
				placeholder.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
				artCell.appendChild(placeholder);
			});
			artCell.appendChild(img);
		} else {
			const placeholder = el('div', { class: 'track-art-placeholder' });
			placeholder.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
			artCell.appendChild(placeholder);
		}
		
		const titleCell = el('td', { class: 'track-info-cell' }, [
			el('div', { class: 'track-text-info' }, [
				el('div', { class: 'track-title' }, [t.title || 'Untitled']),
				t.artist ? el('div', { class: 'track-artist' }, [t.artist]) : null
			].filter(Boolean))
		]);
		
		// Duration cell with optional hidden icon on the right
		const durationCell = el('td', { class: 'track-duration' });
		if (isHidden) {
			durationCell.innerHTML = `
				<span class="duration-time">${mins}:${secs}</span>
				<svg viewBox="0 0 24 24" fill="currentColor" class="hidden-icon">
					<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/>
				</svg>
			`;
		} else {
			durationCell.innerHTML = `<span class="duration-time">${mins}:${secs}</span>`;
		}
		
		// Build row based on view type
		const rowCells = [numberCell, artCell, titleCell];
		if (!isAlbumView) {
			rowCells.push(el('td', {}, [t.album || '']));
		}
		rowCells.push(durationCell);
		
		const row = el('tr', { 
			onclick: () => {
				if (!isHidden) {
					onSelect(idx);
				}
			} 
		}, rowCells);
			
			if (isHidden) {
				row.classList.add('track-hidden');
			}
			
			if (isPlaying) {
				row.classList.add('playing');
			}
			
			// Add context menu handler
			row.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				if (window.songContextMenu) {
					window.songContextMenu.show(e.clientX, e.clientY, t, playlistId);
				}
			});
			
			return row;
	}
	
	// Initial render
	renderTracks();
	
	// Create a sentinel element for intersection observer
	const sentinel = el('tr', { class: 'load-more-sentinel', style: 'height: 1px; visibility: hidden;' }, [
		el('td', { colspan: '5' }, [])
	]);
	
	// Add scroll listener for progressive loading (for large lists or when using API loading)
	if (currentTracks.length > 100 || onLoadMore) {
		tbody.appendChild(sentinel);
		
		// Use IntersectionObserver for reliable loading trigger
		sentinelObserver = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				if (entry.isIntersecting && !allRendered && !isLoadingMore) {
					loadMoreTracks();
				}
			});
		}, {
			root: null,
			rootMargin: '2000px',
			threshold: 0.01
		});
		
		sentinelObserver.observe(sentinel);
		
		// Clean up sentinel when all loaded and no more API data
		const checkComplete = setInterval(() => {
			if (allRendered && !onLoadMore) {
				sentinel.remove();
				if (sentinelObserver) {
					sentinelObserver.disconnect();
					sentinelObserver = null;
				}
				clearInterval(checkComplete);
			}
		}, 500);
	}
	
	// Re-render when track changes (only update rendered rows)
	const updatePlayingState = () => {
		const currentTrack = window.player?.getCurrentTrack?.();
		const currentTrackId = currentTrack ? currentTrack.id : null;
		const rows = tbody.querySelectorAll('tr');
		rows.forEach(row => {
			const trackId = currentTracks[Array.from(tbody.children).indexOf(row)]?.id;
			if (trackId === currentTrackId) {
				row.classList.add('playing');
			} else {
				row.classList.remove('playing');
			}
		});
	};
	
	window.addEventListener('trackChanged', updatePlayingState);
	
	// Re-render when favorites change
	window.addEventListener('favoriteChanged', () => renderTracks(true));
	
	// Build table headers based on view type
	const headers = [
		el('th', {}, ['#']),
		el('th', {}, ['']),
		el('th', {}, ['Title'])
	];
	if (!isAlbumView) {
		headers.push(el('th', {}, ['Album']));
	}
	headers.push(el('th', {}, ['Duration']));
	
	const table = el('table', { class: 'tracks' }, [
		el('thead', {}, [
			el('tr', {}, headers)
		]),
		tbody
	]);
	
	if (isAlbumView) {
		table.classList.add('tracks-album-view');
	}
	
	const container = el('div', { class: 'tracks-section' }, [table]);
	
	// For library page, return object with update function
	// For other pages (album, playlist, etc.), return container directly for backwards compatibility
	if (onLoadMore) {
		// Store update function for library page
		container._updateTracks = updateTracks;
		return container;
	}
	
	return container;
}

async function renderAlbumDetail(id) {
	// Store references for instant re-render
	let albumData = null;
	
	const loadAndRender = async () => {
		const [meta, tracks] = await Promise.all([
			window.api.getItem(id),
			window.api.getAlbumTracks(id)
		]);
		if (!meta.ok) return app.replaceChildren(el('div', { class: 'container' }, [meta.error || 'Failed to load album']));
		if (!tracks.ok) return app.replaceChildren(el('div', { class: 'container' }, [tracks.error || 'Failed to load tracks']));
		const item = meta.item;
		
		albumData = { item, tracks: tracks.tracks };
	
	// Mark hidden songs but keep them in the list
	const allTracks = filterHiddenSongs(tracks.tracks);
	const visibleTracks = allTracks.filter(t => !t.isHidden);
	
	let filteredTracks = allTracks;
	
	const onSelect = (i) => { 
		// Find the actual index in visibleTracks based on the track at position i in filteredTracks
		const track = filteredTracks[i];
		const visibleIndex = visibleTracks.findIndex(t => t.id === track.id);
		if (visibleIndex >= 0) {
			window.player.loadQueue(visibleTracks); 
			window.player.playIndex(visibleIndex);
		}
	};
	
	const onShufflePlay = () => {
		window.player.loadQueue(visibleTracks, true);
		window.player.playIndex(0);
	};
	
	const playAllBtn = el('button', { class: 'btn-play-hero' }, []);
	const playSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	playSvg.setAttribute('viewBox', '0 0 24 24');
	playSvg.setAttribute('fill', 'currentColor');
	const playPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	playPath.setAttribute('d', 'M8 5v14l11-7z');
	playSvg.appendChild(playPath);
	playAllBtn.appendChild(playSvg);
	playAllBtn.addEventListener('click', () => onSelect(0));
	
	const shuffleBtn = el('button', { class: 'btn-shuffle-hero' }, []);
	const shuffleSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	shuffleSvg.setAttribute('viewBox', '0 0 24 24');
	shuffleSvg.setAttribute('fill', 'currentColor');
	const shufflePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	shufflePath.setAttribute('d', 'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z');
	shuffleSvg.appendChild(shufflePath);
	shuffleBtn.appendChild(shuffleSvg);
	shuffleBtn.addEventListener('click', onShufflePlay);
	
	// Favorite button
	const favoriteBtn = el('button', { class: 'btn-favorite-hero' }, []);
	const favoriteSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	favoriteSvg.setAttribute('viewBox', '0 0 24 24');
	favoriteSvg.setAttribute('fill', 'currentColor');
	const favoritePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	
	// Check if album is favorited
	const isFavorited = item.UserData && item.UserData.IsFavorite;
	if (isFavorited) {
		favoriteBtn.classList.add('is-favorite');
		favoritePath.setAttribute('d', 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z');
	} else {
		favoritePath.setAttribute('d', 'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z');
	}
	
	favoriteSvg.appendChild(favoritePath);
	favoriteBtn.appendChild(favoriteSvg);
	favoriteBtn.addEventListener('click', async () => {
		const currentState = favoriteBtn.classList.contains('is-favorite');
		try {
			if (currentState) {
				await window.api.unmarkFavorite(id);
				favoriteBtn.classList.remove('is-favorite');
				favoritePath.setAttribute('d', 'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z');
				window.showToast('Removed from favourites', 'success');
			} else {
				await window.api.markFavorite(id);
				favoriteBtn.classList.add('is-favorite');
				favoritePath.setAttribute('d', 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z');
				window.showToast('Added to favourites', 'success');
			}
		} catch (error) {
			console.error('Error toggling favorite:', error);
			window.showToast('Failed to update favourite', 'error');
		}
		
		// Notify that favorites have changed so library can refresh
		window.dispatchEvent(new CustomEvent('favoritesChanged', { detail: { itemId: id, itemType: 'album' } }));
	});
	
	const metaInfoParts = [];
	if (item.AlbumArtist) metaInfoParts.push(el('span', {}, [item.AlbumArtist]));
	if (item.ProductionYear) metaInfoParts.push(el('span', {}, [String(item.ProductionYear)]));
	if (visibleTracks && visibleTracks.length) {
		const songText = visibleTracks.length === 1 ? 'song' : 'songs';
		metaInfoParts.push(el('span', {}, [`${visibleTracks.length} ${songText}`]));
	}
	const totalDuration = formatTotalDuration(visibleTracks);
	if (totalDuration) {
		metaInfoParts.push(el('span', {}, [totalDuration]));
	}
	
	const hero = el('div', { class: 'hero' });
	hero.setAttribute('data-type', 'album');
	
	const heroImg = el('img', { src: item.image || '', alt: item.Name });
	const heroMeta = el('div', { class: 'hero-meta' }, [
		el('div', { class: 'type' }, ['ALBUM']),
			el('div', { class: 'title' }, [item.Name || 'Album']),
		metaInfoParts.length > 0 ? el('div', { class: 'meta-info' }, metaInfoParts) : null,
		el('div', { class: 'hero-actions' }, [playAllBtn, shuffleBtn, favoriteBtn])
	].filter(Boolean));
	
	hero.appendChild(heroImg);
	hero.appendChild(heroMeta);
	
	// Handle missing hero image
	if (!item.image || item.image === '' || item.image.endsWith('/')) {
		hero.classList.add('no-image');
	} else {
		heroImg.addEventListener('error', () => {
			hero.classList.add('no-image');
		});
		heroImg.addEventListener('load', () => {
			hero.classList.remove('no-image');
		});
	}
	
	// Search bar with expandable button
	const searchBar = el('div', { class: 'search-bar-container' });
	const searchButton = el('button', { class: 'search-button-toggle' });
	const searchIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	searchIcon.setAttribute('viewBox', '0 0 24 24');
	searchIcon.setAttribute('fill', 'currentColor');
	const searchIconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	searchIconPath.setAttribute('d', 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z');
	searchIcon.appendChild(searchIconPath);
	searchButton.appendChild(searchIcon);
	
	const searchInputWrapper = el('div', { class: 'search-input-wrapper-collapsed' });
	const searchInput = el('input', { type: 'text', class: 'search-bar', placeholder: 'Search by title or artist...' });
	searchInputWrapper.appendChild(searchInput);
	
	const tracksContainer = el('div', {});
	
	function updateTracksDisplay() {
		tracksContainer.replaceChildren(tracksList('', filteredTracks, (i) => {
			// Find the actual index in visibleTracks based on the track at position i in filteredTracks
			const track = filteredTracks[i];
			const visibleIndex = visibleTracks.findIndex(t => t.id === track.id);
			if (visibleIndex >= 0) {
				window.player.loadQueue(visibleTracks); 
				window.player.playIndex(visibleIndex);
			}
		}, null, true));
	}
	
	searchInput.addEventListener('input', (e) => {
		const query = e.target.value.toLowerCase();
		filteredTracks = query ? allTracks.filter(t => 
			(t.title || '').toLowerCase().includes(query) || 
			(t.artist || '').toLowerCase().includes(query)
		) : allTracks;
		updateTracksDisplay();
	});
	
	let isExpanded = false;
	searchButton.addEventListener('click', (e) => {
		e.stopPropagation();
		isExpanded = !isExpanded;
		if (isExpanded) {
			searchInputWrapper.classList.remove('search-input-wrapper-collapsed');
			searchInputWrapper.classList.add('search-input-wrapper-expanded');
			setTimeout(() => searchInput.focus(), 100);
		} else {
			searchInputWrapper.classList.remove('search-input-wrapper-expanded');
			searchInputWrapper.classList.add('search-input-wrapper-collapsed');
			searchInput.value = '';
			filteredTracks = allTracks;
			updateTracksDisplay();
		}
	});
	
	// Close search when clicking outside
	const handleClickOutside = (e) => {
		if (isExpanded && !searchBar.contains(e.target)) {
			isExpanded = false;
			searchInputWrapper.classList.remove('search-input-wrapper-expanded');
			searchInputWrapper.classList.add('search-input-wrapper-collapsed');
			searchInput.value = '';
			filteredTracks = allTracks;
			updateTracksDisplay();
		}
	};
	
	searchInput.addEventListener('click', (e) => {
		e.stopPropagation();
	});
	
	document.addEventListener('click', handleClickOutside);
	
	searchBar.appendChild(searchButton);
	searchBar.appendChild(searchInputWrapper);
	updateTracksDisplay();
	
		app.replaceChildren(el('div', {}, [hero, searchBar, tracksContainer]));
	};
	
	// Listen for hidden songs changes to re-render instantly
	const hiddenSongsListener = () => {
		if (albumData && window.location.hash === `#album/${id}`) {
			loadAndRender();
		}
	};
	window.addEventListener('hiddenSongsChanged', hiddenSongsListener);
	
	// Clean up listener when navigating away
	window.addEventListener('hashchange', () => {
		window.removeEventListener('hiddenSongsChanged', hiddenSongsListener);
	}, { once: true });
	
	await loadAndRender();
}

async function renderPlaylistDetail(id) {
	// Store references for instant re-render
	let playlistData = null;
	
	const loadAndRender = async () => {
		const [meta, res] = await Promise.all([window.api.getItem(id), window.api.getPlaylistTracks(id)]);
		if (!meta.ok) return app.replaceChildren(el('div', { class: 'container' }, [meta.error || 'Failed to load playlist']));
		if (!res.ok) return app.replaceChildren(el('div', { class: 'container' }, [res.error || 'Failed to load tracks']));
		const item = meta.item;
		
		playlistData = { item, tracks: res.tracks };
	
	// Mark hidden songs but keep them in the list
	const allTracks = filterHiddenSongs(res.tracks);
	const visibleTracks = allTracks.filter(t => !t.isHidden);
	
	let filteredTracks = allTracks;
	
	const onSelect = (i) => {
		// Find the actual index in visibleTracks based on the track at position i in filteredTracks
		const track = filteredTracks[i];
		const visibleIndex = visibleTracks.findIndex(t => t.id === track.id);
		if (visibleIndex >= 0) {
			window.player.loadQueue(visibleTracks); 
			window.player.playIndex(visibleIndex);
		}
	};
	
	const onShufflePlay = () => {
		window.player.loadQueue(visibleTracks, true);
		window.player.playIndex(0);
	};
	
	const playAllBtn = el('button', { class: 'btn-play-hero' }, []);
	const playSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	playSvg.setAttribute('viewBox', '0 0 24 24');
	playSvg.setAttribute('fill', 'currentColor');
	const playPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	playPath.setAttribute('d', 'M8 5v14l11-7z');
	playSvg.appendChild(playPath);
	playAllBtn.appendChild(playSvg);
	playAllBtn.addEventListener('click', () => onSelect(0));
	
	const shuffleBtn = el('button', { class: 'btn-shuffle-hero' }, []);
	const shuffleSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	shuffleSvg.setAttribute('viewBox', '0 0 24 24');
	shuffleSvg.setAttribute('fill', 'currentColor');
	const shufflePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	shufflePath.setAttribute('d', 'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z');
	shuffleSvg.appendChild(shufflePath);
	shuffleBtn.appendChild(shuffleSvg);
	shuffleBtn.addEventListener('click', onShufflePlay);
	
	// Favorite button
	const favoriteBtn = el('button', { class: 'btn-favorite-hero' }, []);
	const favoriteSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	favoriteSvg.setAttribute('viewBox', '0 0 24 24');
	favoriteSvg.setAttribute('fill', 'currentColor');
	const favoritePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	
	// Check if playlist is favorited
	const isFavorited = item.UserData && item.UserData.IsFavorite;
	if (isFavorited) {
		favoriteBtn.classList.add('is-favorite');
		favoritePath.setAttribute('d', 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z');
	} else {
		favoritePath.setAttribute('d', 'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z');
	}
	
	favoriteSvg.appendChild(favoritePath);
	favoriteBtn.appendChild(favoriteSvg);
	favoriteBtn.addEventListener('click', async () => {
		const currentState = favoriteBtn.classList.contains('is-favorite');
		try {
			if (currentState) {
				await window.api.unmarkFavorite(id);
				favoriteBtn.classList.remove('is-favorite');
				favoritePath.setAttribute('d', 'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z');
				window.showToast('Removed from favourites', 'success');
			} else {
				await window.api.markFavorite(id);
				favoriteBtn.classList.add('is-favorite');
				favoritePath.setAttribute('d', 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z');
				window.showToast('Added to favourites', 'success');
			}
		} catch (error) {
			console.error('Error toggling favorite:', error);
			window.showToast('Failed to update favourite', 'error');
		}
		
		// Notify that favorites have changed so library can refresh
		window.dispatchEvent(new CustomEvent('favoritesChanged', { detail: { itemId: id, itemType: 'playlist' } }));
	});
	
	// Create pin button
	const pinBtn = el('button', { class: 'btn-pin-hero' }, []);
	const pinSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	pinSvg.setAttribute('viewBox', '0 0 24 24');
	pinSvg.setAttribute('fill', 'currentColor');
	const pinPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	pinPath.setAttribute('d', 'M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z');
	pinSvg.appendChild(pinPath);
	pinBtn.appendChild(pinSvg);
	
	// Ensure userId is available before checking pin status
	await ensureUserId();
	const pinned = isPinned(id);
	if (pinned) {
		pinBtn.classList.add('pinned');
	}
	
	pinBtn.addEventListener('click', async () => {
		const newPinnedState = await togglePin(id);
		if (newPinnedState) {
			pinBtn.classList.add('pinned');
		} else {
			pinBtn.classList.remove('pinned');
		}
	});
	
	// Create manage playlist button
	const manageBtn = el('button', { class: 'btn-manage-hero' }, []);
	const manageSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	manageSvg.setAttribute('viewBox', '0 0 24 24');
	manageSvg.setAttribute('fill', 'currentColor');
	const managePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	managePath.setAttribute('d', 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z');
	manageSvg.appendChild(managePath);
	manageBtn.appendChild(manageSvg);
	manageBtn.addEventListener('click', () => {
		if (window.showPlaylistManagementModal) {
			window.showPlaylistManagementModal({
				id: item.Id,
				title: item.Name,
				image: item.image
			});
		}
	});
	
	const metaInfoParts = [];
	
	// Show playlist creator with profile picture
	if (item.OwnerName) {
		const ownerContainer = el('span', { class: 'owner-info' });
		if (item.OwnerImage) {
			const ownerImg = el('img', { 
				src: item.OwnerImage, 
				alt: item.OwnerName,
				class: 'owner-avatar'
			});
			ownerContainer.appendChild(ownerImg);
		}
		ownerContainer.appendChild(document.createTextNode(item.OwnerName));
		metaInfoParts.push(ownerContainer);
	}
	
	if (visibleTracks && visibleTracks.length) {
		const songText = visibleTracks.length === 1 ? 'song' : 'songs';
		metaInfoParts.push(el('span', {}, [`${visibleTracks.length} ${songText}`]));
	}
	
	const totalDuration = formatTotalDuration(visibleTracks);
	if (totalDuration) {
		metaInfoParts.push(el('span', {}, [totalDuration]));
	}
	
	const hero = el('div', { class: 'hero' });
	hero.setAttribute('data-type', 'playlist');
	
	const heroImg = el('img', { src: item.image || '', alt: item.Name });
	const heroMeta = el('div', { class: 'hero-meta' }, [
		el('div', { class: 'type' }, ['PLAYLIST']),
		el('div', { class: 'title' }, [item.Name || 'Playlist']),
		metaInfoParts.length > 0 ? el('div', { class: 'meta-info' }, metaInfoParts) : null,
		el('div', { class: 'hero-actions' }, [playAllBtn, shuffleBtn, favoriteBtn, pinBtn, manageBtn])
	].filter(Boolean));
	
	hero.appendChild(heroImg);
	hero.appendChild(heroMeta);
	
	// Handle missing hero image
	if (!item.image || item.image === '' || item.image.endsWith('/')) {
		hero.classList.add('no-image');
	} else {
		heroImg.addEventListener('error', () => {
			hero.classList.add('no-image');
		});
		heroImg.addEventListener('load', () => {
			hero.classList.remove('no-image');
		});
	}
	
	// Search bar with expandable button
	const searchBar = el('div', { class: 'search-bar-container' });
	const searchButton = el('button', { class: 'search-button-toggle' });
	const searchIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	searchIcon.setAttribute('viewBox', '0 0 24 24');
	searchIcon.setAttribute('fill', 'currentColor');
	const searchIconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	searchIconPath.setAttribute('d', 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z');
	searchIcon.appendChild(searchIconPath);
	searchButton.appendChild(searchIcon);
	
	const searchInputWrapper = el('div', { class: 'search-input-wrapper-collapsed' });
	const searchInput = el('input', { type: 'text', class: 'search-bar', placeholder: 'Search by title or artist...' });
	searchInputWrapper.appendChild(searchInput);
	
	const tracksContainer = el('div', {});
	
	function updateTracksDisplay() {
		tracksContainer.replaceChildren(tracksList('', filteredTracks, (i) => {
			// Find the actual index in visibleTracks based on the track at position i in filteredTracks
			const track = filteredTracks[i];
			const visibleIndex = visibleTracks.findIndex(t => t.id === track.id);
			if (visibleIndex >= 0) {
				window.player.loadQueue(visibleTracks); 
				window.player.playIndex(visibleIndex);
			}
		}, id));
	}
	
	searchInput.addEventListener('input', (e) => {
		const query = e.target.value.toLowerCase();
		filteredTracks = query ? allTracks.filter(t => 
			(t.title || '').toLowerCase().includes(query) || 
			(t.artist || '').toLowerCase().includes(query)
		) : allTracks;
		updateTracksDisplay();
	});
	
	let isExpanded = false;
	searchButton.addEventListener('click', (e) => {
		e.stopPropagation();
		isExpanded = !isExpanded;
		if (isExpanded) {
			searchInputWrapper.classList.remove('search-input-wrapper-collapsed');
			searchInputWrapper.classList.add('search-input-wrapper-expanded');
			setTimeout(() => searchInput.focus(), 100);
		} else {
			searchInputWrapper.classList.remove('search-input-wrapper-expanded');
			searchInputWrapper.classList.add('search-input-wrapper-collapsed');
			searchInput.value = '';
			filteredTracks = allTracks;
			updateTracksDisplay();
		}
	});
	
	// Close search when clicking outside
	const handleClickOutside = (e) => {
		if (isExpanded && !searchBar.contains(e.target)) {
			isExpanded = false;
			searchInputWrapper.classList.remove('search-input-wrapper-expanded');
			searchInputWrapper.classList.add('search-input-wrapper-collapsed');
			searchInput.value = '';
			filteredTracks = allTracks;
			updateTracksDisplay();
		}
	};
	
	searchInput.addEventListener('click', (e) => {
		e.stopPropagation();
	});
	
	document.addEventListener('click', handleClickOutside);
	
	searchBar.appendChild(searchButton);
	searchBar.appendChild(searchInputWrapper);
	updateTracksDisplay();
	
		app.replaceChildren(el('div', {}, [hero, searchBar, tracksContainer]));
	};
	
	// Listen for hidden songs changes to re-render instantly
	const hiddenSongsListener = () => {
		if (playlistData && window.location.hash === `#playlist/${id}`) {
			loadAndRender();
		}
	};
	window.addEventListener('hiddenSongsChanged', hiddenSongsListener);
	
	// Clean up listener when navigating away
	window.addEventListener('hashchange', () => {
		window.removeEventListener('hiddenSongsChanged', hiddenSongsListener);
	}, { once: true });
	
	await loadAndRender();
}

async function renderArtistDetail(id) {
	const [meta, res, albumsRes] = await Promise.all([
		window.api.getItem(id), 
		window.api.getArtistSongs(id),
		window.api.getArtistAlbums(id)
	]);
	if (!meta.ok) return app.replaceChildren(el('div', { class: 'container' }, [meta.error || 'Failed to load artist']));
	if (!res.ok) return app.replaceChildren(el('div', { class: 'container' }, [res.error || 'Failed to load songs']));
	const item = meta.item;
	const albums = albumsRes.ok ? albumsRes.albums : [];
	
	const onSelect = (i) => { 
		window.player.loadQueue(res.tracks); 
		window.player.playIndex(i); 
	};
	
	const onShufflePlay = () => {
		window.player.loadQueue(res.tracks, true);
		window.player.playIndex(0);
	};
	
	const playAllBtn = el('button', { class: 'btn-play-hero' }, []);
	const playSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	playSvg.setAttribute('viewBox', '0 0 24 24');
	playSvg.setAttribute('fill', 'currentColor');
	const playPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	playPath.setAttribute('d', 'M8 5v14l11-7z');
	playSvg.appendChild(playPath);
	playAllBtn.appendChild(playSvg);
	playAllBtn.addEventListener('click', () => onSelect(0));
	
	const shuffleBtn = el('button', { class: 'btn-shuffle-hero' }, []);
	const shuffleSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	shuffleSvg.setAttribute('viewBox', '0 0 24 24');
	shuffleSvg.setAttribute('fill', 'currentColor');
	const shufflePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	shufflePath.setAttribute('d', 'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z');
	shuffleSvg.appendChild(shufflePath);
	shuffleBtn.appendChild(shuffleSvg);
	shuffleBtn.addEventListener('click', onShufflePlay);
	
	const metaInfoParts = [];
	if (res.tracks && res.tracks.length) {
		metaInfoParts.push(el('span', {}, [`${res.tracks.length} songs`]));
	}
	
	const hero = el('div', { class: 'hero' });
	hero.setAttribute('data-type', 'artist');
	
	const heroImg = el('img', { src: item.image || '', alt: item.Name });
	const heroMeta = el('div', { class: 'hero-meta' }, [
		el('div', { class: 'type' }, ['ARTIST']),
		el('div', { class: 'title' }, [item.Name || 'Artist']),
		metaInfoParts.length > 0 ? el('div', { class: 'meta-info' }, metaInfoParts) : null,
		el('div', { class: 'hero-actions' }, [playAllBtn, shuffleBtn])
	].filter(Boolean));
	
	hero.appendChild(heroImg);
	hero.appendChild(heroMeta);
	
	// Handle missing hero image
	if (!item.image || item.image === '' || item.image.endsWith('/')) {
		hero.classList.add('no-image');
	} else {
		heroImg.addEventListener('error', () => {
			hero.classList.add('no-image');
		});
		heroImg.addEventListener('load', () => {
			hero.classList.remove('no-image');
		});
	}
	
	const content = [hero];
	
	// Add albums section if any albums exist
	if (albums && albums.length > 0) {
		const { grid: albumsGrid } = createVirtualGrid(
			albums,
			(album) => {
				const card = createCardElement(album, (album) => {
					location.hash = `album/${album.id}`;
				}, 'album');
				
				card.addEventListener('contextmenu', async (e) => {
					e.preventDefault();
					if (window.albumContextMenu) {
						await window.albumContextMenu.show(e.clientX, e.clientY, album);
					}
				});
				
				return card;
			},
			{ initialBatch: 20, batchSize: 20 }
		);
		
		const albumsSection = el('div', { class: 'home-section', style: 'padding: 0 32px 32px;' }, [
			el('div', { class: 'section-header' }, [
				el('h2', {}, ['Albums'])
			]),
			albumsGrid
		]);
		
		content.push(albumsSection);
	}
	
	// Add tracks section with header
	if (res.tracks && res.tracks.length > 0) {
		const songsSection = el('div', { style: 'margin-top: 24px;' }, [
			el('div', { class: 'section-header', style: 'padding: 0 32px; margin-bottom: 0;' }, [
				el('h2', {}, ['Popular Songs'])
			]),
			tracksList('', res.tracks, onSelect)
		]);
		content.push(songsSection);
	}
	
	app.replaceChildren(el('div', {}, content));
}

async function renderSearch(initialQuery = '') {
	const searchContainer = el('div', { class: 'search-page' });
	
	const searchIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	searchIcon.setAttribute('class', 'search-icon');
	searchIcon.setAttribute('viewBox', '0 0 24 24');
	searchIcon.setAttribute('fill', 'currentColor');
	const searchIconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	searchIconPath.setAttribute('d', 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z');
	searchIcon.appendChild(searchIconPath);
	
	const searchInputWrapper = el('div', { class: 'search-input-wrapper' });
	searchInputWrapper.appendChild(searchIcon);
	searchInputWrapper.appendChild(el('input', { 
		type: 'text', 
		class: 'search-input', 
		placeholder: 'What do you want to listen to?',
		value: initialQuery,
		id: 'search-input'
	}));
	
	const searchHeader = el('div', { class: 'search-header' }, [
		el('h1', {}, ['Search']),
		searchInputWrapper
	]);
	
	const resultsContainer = el('div', { class: 'search-results', id: 'search-results' });
	
	searchContainer.appendChild(searchHeader);
	searchContainer.appendChild(resultsContainer);
	
	app.replaceChildren(searchContainer);
	
	const searchInput = document.getElementById('search-input');
	let searchTimeout;
	
	async function performSearch(query) {
		if (!query || query.trim().length < 2) {
			resultsContainer.replaceChildren(el('div', { class: 'search-empty' }, [
				el('p', {}, ['Start typing to search for songs, albums, artists, playlists, and users'])
			]));
			return;
		}
		
		resultsContainer.replaceChildren(el('div', { class: 'search-loading' }, ['Searching...']));
		
		const res = await window.api.search(query);
		if (!res.ok) {
			resultsContainer.replaceChildren(el('div', { class: 'search-error' }, [res.error || 'Search failed']));
			return;
		}
		
		const { songs, albums, artists, playlists, users } = res;
		const hasResults = songs.length > 0 || albums.length > 0 || artists.length > 0 || playlists.length > 0 || users.length > 0;
		
		if (!hasResults) {
			resultsContainer.replaceChildren(el('div', { class: 'search-empty' }, [
				el('h3', {}, ['No results found']),
				el('p', {}, [`Try searching with different keywords`])
			]));
			return;
		}
		
		const sections = [];
		
		// Users section
		if (users.length > 0) {
			sections.push(
				el('div', { class: 'search-section' }, [
					el('h2', { class: 'search-section-title' }, ['Users']),
					el('div', { class: 'search-grid' }, users.slice(0, 8).map((user) => {
						const imgWrapper = el('div', { class: 'card-image-wrapper user-avatar-wrapper' });
						
						const img = el('img', { src: user.image || '', alt: user.name, class: 'user-avatar-card' });
						img.addEventListener('error', () => {
							img.style.display = 'none';
							const placeholder = el('div', { class: 'user-avatar-placeholder-card' }, [
								user.name.charAt(0).toUpperCase()
							]);
							imgWrapper.appendChild(placeholder);
						});
						
						imgWrapper.appendChild(img);
						
						const card = el('div', { class: 'card user-card' }, [
							imgWrapper,
							el('div', { class: 'meta' }, [
								el('div', { class: 'title' }, [user.name || 'User']),
								el('div', { class: 'subtitle' }, [
									user.isAdministrator ? '👑 Administrator' : '👤 Member'
								])
		])
	]);
						card.addEventListener('click', () => {
							location.hash = `user/${user.id}`;
						});
						return card;
					}))
				])
			);
		}
		
		// Songs section
		if (songs.length > 0) {
			const onSelect = (i) => { 
				window.player.loadQueue(songs); 
				window.player.playIndex(i); 
			};
			sections.push(
				el('div', { class: 'search-section' }, [
					el('h2', { class: 'search-section-title' }, ['Songs']),
					tracksList('', songs, onSelect)
				])
			);
		}
		
		// Albums section
		if (albums.length > 0) {
			const { grid: albumsGrid } = createVirtualGrid(
				albums,
				(album) => {
					const card = createCardElement(album, (album) => {
						location.hash = `album/${album.id}`;
					}, 'album');
					
					card.addEventListener('contextmenu', async (e) => {
						e.preventDefault();
						if (window.albumContextMenu) {
							await window.albumContextMenu.show(e.clientX, e.clientY, album);
						}
					});
					
					return card;
				},
				{ initialBatch: 20, batchSize: 20, containerClass: 'search-grid' }
			);
			
			sections.push(
				el('div', { class: 'search-section' }, [
					el('h2', { class: 'search-section-title' }, ['Albums']),
					albumsGrid
				])
			);
		}
	
	// Artists section
		if (artists.length > 0) {
			const { grid: artistsGrid } = createVirtualGrid(
				artists,
				(artist) => {
					const card = createCardElement(artist, (artist) => {
						location.hash = `artist/${artist.id}`;
					}, 'artist');
					
					card.addEventListener('contextmenu', (e) => {
						e.preventDefault();
						if (window.artistContextMenu) {
							window.artistContextMenu.show(e.clientX, e.clientY, artist);
						}
					});
					
					return card;
				},
				{ initialBatch: 20, batchSize: 20, containerClass: 'search-grid' }
			);
			
			sections.push(
				el('div', { class: 'search-section' }, [
					el('h2', { class: 'search-section-title' }, ['Artists']),
					artistsGrid
				])
			);
		}
		
		// Playlists section
		if (playlists.length > 0) {
			const { grid: playlistsGrid } = createVirtualGrid(
				playlists,
				(playlist) => {
					const card = createCardElement(playlist, (playlist) => {
						location.hash = `playlist/${playlist.id}`;
					}, 'playlist');
					
					return card;
				},
				{ initialBatch: 20, batchSize: 20, containerClass: 'search-grid' }
			);
			
			sections.push(
				el('div', { class: 'search-section' }, [
					el('h2', { class: 'search-section-title' }, ['Playlists']),
					playlistsGrid
				])
			);
		}
		
		resultsContainer.replaceChildren(...sections);
	}
	
	if (searchInput) {
		searchInput.addEventListener('input', (e) => {
			clearTimeout(searchTimeout);
			searchTimeout = setTimeout(() => {
				performSearch(e.target.value);
			}, 300);
		});
		
		// Focus input
		searchInput.focus();
		
		// Perform initial search if query provided
		if (initialQuery) {
			performSearch(initialQuery);
		} else {
			resultsContainer.replaceChildren(el('div', { class: 'search-empty' }, [
				el('p', {}, ['Start typing to search for songs, albums, artists, playlists, and users'])
			]));
		}
	}
}

async function renderLikedSongs() {
	const res = await window.api.getFavoriteSongs();
	if (!res.ok) {
		return app.replaceChildren(el('div', { class: 'container' }, [res.error || 'Failed to load liked songs']));
	}
	
	// Reverse tracks so newest liked songs show first
	const tracks = res.tracks.slice().reverse();
	
	const onSelect = (i) => { 
		window.player.loadQueue(tracks); 
		window.player.playIndex(i); 
	};
	
	const onShufflePlay = () => {
		window.player.loadQueue(tracks, true);
		window.player.playIndex(0);
	};
	
	// Create hero section
	const playAllBtn = el('button', { class: 'btn-play-hero' }, []);
	const playSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	playSvg.setAttribute('viewBox', '0 0 24 24');
	playSvg.setAttribute('fill', 'currentColor');
	const playPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	playPath.setAttribute('d', 'M8 5v14l11-7z');
	playSvg.appendChild(playPath);
	playAllBtn.appendChild(playSvg);
	playAllBtn.addEventListener('click', () => onSelect(0));
	
	const shuffleBtn = el('button', { class: 'btn-shuffle-hero' }, []);
	const shuffleSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	shuffleSvg.setAttribute('viewBox', '0 0 24 24');
	shuffleSvg.setAttribute('fill', 'currentColor');
	const shufflePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	shufflePath.setAttribute('d', 'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z');
	shuffleSvg.appendChild(shufflePath);
	shuffleBtn.appendChild(shuffleSvg);
	shuffleBtn.addEventListener('click', onShufflePlay);
	
	const hero = el('div', { class: 'hero liked-songs-hero' });
	
	// Create heart icon
	const heartIcon = el('div', { class: 'liked-songs-icon' });
	heartIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
	
	const allTracks = tracks;
	let filteredTracks = allTracks;
	
	const heroMeta = el('div', { class: 'hero-meta' }, [
		el('div', { class: 'type' }, ['PLAYLIST']),
		el('div', { class: 'title' }, ['Liked Songs']),
		el('div', { class: 'meta-info' }, [
			el('span', {}, [`${allTracks.length} songs`])
		]),
		el('div', { class: 'hero-actions' }, [playAllBtn, shuffleBtn])
	]);
	
	hero.appendChild(heartIcon);
	hero.appendChild(heroMeta);
	
	// Search bar with expandable button
	const searchBar = el('div', { class: 'search-bar-container' });
	const searchButton = el('button', { class: 'search-button-toggle' });
	const searchIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	searchIcon.setAttribute('viewBox', '0 0 24 24');
	searchIcon.setAttribute('fill', 'currentColor');
	const searchIconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	searchIconPath.setAttribute('d', 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z');
	searchIcon.appendChild(searchIconPath);
	searchButton.appendChild(searchIcon);
	
	const searchInputWrapper = el('div', { class: 'search-input-wrapper-collapsed' });
	const searchInput = el('input', { type: 'text', class: 'search-bar', placeholder: 'Search by title or artist...' });
	searchInputWrapper.appendChild(searchInput);
	
	const tracksContainer = el('div', {});
	
	function updateTracksDisplay() {
		tracksContainer.replaceChildren(tracksList('', filteredTracks, (i) => {
			window.player.loadQueue(filteredTracks);
			window.player.playIndex(i);
		}));
	}
	
	searchInput.addEventListener('input', (e) => {
		const query = e.target.value.toLowerCase();
		filteredTracks = query ? allTracks.filter(t => 
			(t.title || '').toLowerCase().includes(query) || 
			(t.artist || '').toLowerCase().includes(query)
		) : allTracks;
		updateTracksDisplay();
	});
	
	let isExpanded = false;
	searchButton.addEventListener('click', (e) => {
		e.stopPropagation();
		isExpanded = !isExpanded;
		if (isExpanded) {
			searchInputWrapper.classList.remove('search-input-wrapper-collapsed');
			searchInputWrapper.classList.add('search-input-wrapper-expanded');
			setTimeout(() => searchInput.focus(), 100);
		} else {
			searchInputWrapper.classList.remove('search-input-wrapper-expanded');
			searchInputWrapper.classList.add('search-input-wrapper-collapsed');
			searchInput.value = '';
			filteredTracks = allTracks;
			updateTracksDisplay();
		}
	});
	
	// Close search when clicking outside
	const handleClickOutside = (e) => {
		if (isExpanded && !searchBar.contains(e.target)) {
			isExpanded = false;
			searchInputWrapper.classList.remove('search-input-wrapper-expanded');
			searchInputWrapper.classList.add('search-input-wrapper-collapsed');
			searchInput.value = '';
			filteredTracks = allTracks;
			updateTracksDisplay();
		}
	};
	
	searchInput.addEventListener('click', (e) => {
		e.stopPropagation();
	});
	
	document.addEventListener('click', handleClickOutside);
	
	searchBar.appendChild(searchButton);
	searchBar.appendChild(searchInputWrapper);
	updateTracksDisplay();
	
	app.replaceChildren(el('div', {}, [hero, searchBar, tracksContainer]));
}

async function renderLibrary() {
	console.log('Rendering library page...');
	const container = el('div', { class: 'library-page' });
	
	// Header with filters
	const header = el('div', { class: 'library-header' }, [
		el('h1', {}, ['Your Library'])
	]);
	
	// Filter controls
	const filterBar = el('div', { class: 'library-filters' });
	
	// Type filter tabs
	const typeTabs = el('div', { class: 'library-tabs' }, [
		el('button', { class: 'library-tab active', 'data-type': 'all' }, ['All']),
		el('button', { class: 'library-tab', 'data-type': 'albums' }, ['Albums']),
		el('button', { class: 'library-tab', 'data-type': 'artists' }, ['Artists']),
		el('button', { class: 'library-tab', 'data-type': 'playlists' }, ['Playlists']),
		el('button', { class: 'library-tab', 'data-type': 'songs' }, ['Songs']),
		el('button', { class: 'library-tab', 'data-type': 'favourites' }, ['Favourites'])
	]);
	
	// Search and sort controls
	const controls = el('div', { class: 'library-controls' });
	
	const searchInput = el('input', {
		type: 'text',
		class: 'library-search',
		placeholder: 'Filter by name...',
		id: 'library-search'
	});
	
	const genreSelect = el('select', { class: 'library-select', id: 'library-genre' });
	genreSelect.appendChild(el('option', { value: '' }, ['All Genres']));
	
	const creatorSelect = el('select', { class: 'library-select', id: 'library-creator' });
	creatorSelect.appendChild(el('option', { value: '' }, ['All Creators']));
	
	const sortSelect = el('select', { class: 'library-select', id: 'library-sort' }, [
		el('option', { value: 'SortName' }, ['Name (A-Z)']),
		el('option', { value: 'DateCreated' }, ['Recently Added']),
		el('option', { value: 'PremiereDate' }, ['Release Date']),
		el('option', { value: 'Random' }, ['Random'])
	]);
	
	controls.appendChild(searchInput);
	controls.appendChild(genreSelect);
	controls.appendChild(creatorSelect);
	controls.appendChild(sortSelect);
	
	filterBar.appendChild(typeTabs);
	filterBar.appendChild(controls);
	
	// Results container
	const resultsContainer = el('div', { class: 'library-results', id: 'library-results' });
	
	container.appendChild(header);
	container.appendChild(filterBar);
	container.appendChild(resultsContainer);
	
	app.replaceChildren(container);
	
	// State
	let currentType = 'all';
	let currentSort = 'SortName';
	let currentGenre = '';
	let currentCreator = '';
	let allData = { albums: [], artists: [], playlists: [], songs: [] };
	let genres = [];
	let allUsers = []; // All users on the Jellyfin server
	
	// Load genres
	const genresRes = await window.api.getGenres();
	if (genresRes.ok) {
		genres = genresRes.genres;
		genres.forEach(g => {
			genreSelect.appendChild(el('option', { value: g.name }, [g.name]));
		});
	}
	
	// Load all users from Jellyfin server
	const usersRes = await window.api.getAllUsers();
	if (usersRes.ok) {
		allUsers = usersRes.users;
		// Populate creator dropdown with all users
		allUsers.sort((a, b) => a.name.localeCompare(b.name));
		allUsers.forEach(user => {
			creatorSelect.appendChild(el('option', { value: user.id }, [user.name]));
		});
	}
	
	// Progressive fetching state
	let libraryFetchState = {
		startIndex: 0,
		limit: 100,
		isLoading: false,
		hasMore: true,
		currentLoadType: null
	};
	
	// Separate fetch states for "all" tab (one per type)
	let allTabFetchStates = {
		albums: { startIndex: 0, limit: 100, isLoading: false, hasMore: true },
		artists: { startIndex: 0, limit: 100, isLoading: false, hasMore: true },
		playlists: { startIndex: 0, limit: 100, isLoading: false, hasMore: true },
		songs: { startIndex: 0, limit: 100, isLoading: false, hasMore: true }
	};
	
	// Store grid update functions so we can update them instead of recreating
	let gridUpdateFunctions = {
		albums: null,
		artists: null,
		playlists: null
	};
	
	// Store tracksList update function and container
	let tracksListUpdate = null;
	let tracksListContainer = null;
	let tracksListTbody = null;
	
	// Load and filter function with progressive fetching
	async function loadLibrary(reset = false) {
		if (reset) {
			libraryFetchState = {
				startIndex: 0,
				limit: 100,
				isLoading: false,
				hasMore: true,
				currentLoadType: null
			};
			// Reset all tab fetch states too
			allTabFetchStates = {
				albums: { startIndex: 0, limit: 100, isLoading: false, hasMore: true },
				artists: { startIndex: 0, limit: 100, isLoading: false, hasMore: true },
				playlists: { startIndex: 0, limit: 100, isLoading: false, hasMore: true },
				songs: { startIndex: 0, limit: 100, isLoading: false, hasMore: true }
			};
			allData = { albums: [], artists: [], playlists: [], songs: [] };
			totalCounts = { albums: 0, artists: 0, playlists: 0, songs: 0 };
			// Reset tracksList references
			tracksListUpdate = null;
			tracksListContainer = null;
			tracksListTbody = null;
			resultsContainer.replaceChildren(el('div', { class: 'library-loading' }, ['Loading...']));
		}
		
		// For favourites, we need to load all types to filter them
		const loadType = currentType === 'favourites' ? 'all' : currentType;
		
		// Don't fetch if already loading or if type changed
		if (libraryFetchState.isLoading) return;
		if (libraryFetchState.currentLoadType !== loadType && !reset) {
			// Type changed, reset and reload
			await loadLibrary(true);
			return;
		}
		
		libraryFetchState.isLoading = true;
		libraryFetchState.currentLoadType = loadType;
		
		// For initial load, show loading indicator
		if (reset || libraryFetchState.startIndex === 0) {
			if (resultsContainer.children.length === 0 || resultsContainer.querySelector('.library-loading')) {
				resultsContainer.replaceChildren(el('div', { class: 'library-loading' }, ['Loading...']));
			}
		}
		
		try {
			const res = await window.api.getLibrary({ 
				type: loadType, 
				sortBy: currentSort, 
				limit: libraryFetchState.limit,
				startIndex: libraryFetchState.startIndex 
			});
			
			if (!res.ok) {
				if (reset) {
					resultsContainer.replaceChildren(el('div', { class: 'library-error' }, [res.error || 'Failed to load library']));
				}
				libraryFetchState.isLoading = false;
				return;
			}
			
			// Merge new data with existing data
			if (reset) {
				allData = res;
				totalCounts = res.totalCounts || { albums: 0, artists: 0, playlists: 0, songs: 0 };
				
				// If loading "all" type, initialize fetch states with hasMore based on counts
				if (loadType === 'all') {
					allTabFetchStates.albums.hasMore = res.albums.length >= libraryFetchState.limit;
					allTabFetchStates.artists.hasMore = res.artists.length >= libraryFetchState.limit;
					allTabFetchStates.playlists.hasMore = res.playlists.length >= libraryFetchState.limit;
					allTabFetchStates.songs.hasMore = res.songs.length >= libraryFetchState.limit;
					// Set startIndex for each type based on what we received
					allTabFetchStates.albums.startIndex = res.albums.length;
					allTabFetchStates.artists.startIndex = res.artists.length;
					allTabFetchStates.playlists.startIndex = res.playlists.length;
					allTabFetchStates.songs.startIndex = res.songs.length;
				}
			} else {
				// Append new items, avoiding duplicates
				const existingIds = {
					albums: new Set(allData.albums.map(a => a.id)),
					artists: new Set(allData.artists.map(a => a.id)),
					playlists: new Set(allData.playlists.map(p => p.id)),
					songs: new Set(allData.songs.map(s => s.id))
				};
				
				allData.albums = allData.albums.concat(res.albums.filter(a => !existingIds.albums.has(a.id)));
				allData.artists = allData.artists.concat(res.artists.filter(a => !existingIds.artists.has(a.id)));
				allData.playlists = allData.playlists.concat(res.playlists.filter(p => !existingIds.playlists.has(p.id)));
				allData.songs = allData.songs.concat(res.songs.filter(s => !existingIds.songs.has(s.id)));
				
				// Update total counts if provided (use max to handle cases where totals might change)
				if (res.totalCounts) {
					totalCounts.albums = Math.max(totalCounts.albums, res.totalCounts.albums || 0);
					totalCounts.artists = Math.max(totalCounts.artists, res.totalCounts.artists || 0);
					totalCounts.playlists = Math.max(totalCounts.playlists, res.totalCounts.playlists || 0);
					totalCounts.songs = Math.max(totalCounts.songs, res.totalCounts.songs || 0);
				}
			}
			
			// Check if we got fewer items than requested (means no more data)
			const totalReceived = res.albums.length + res.artists.length + res.playlists.length + res.songs.length;
			if (totalReceived < libraryFetchState.limit) {
				libraryFetchState.hasMore = false;
			}
			
			// Update fetch state
			libraryFetchState.startIndex += libraryFetchState.limit;
			
			// Add owner names to playlists from the allUsers list
			allData.playlists.forEach(playlist => {
				if (playlist.ownerId && !playlist.ownerName) {
					const owner = allUsers.find(u => u.id === playlist.ownerId);
					playlist.ownerName = owner ? owner.name : '';
				}
			});
			
			console.log('Library data loaded:', {
				startIndex: libraryFetchState.startIndex,
				albums: allData.albums.length,
				playlists: allData.playlists.length,
				hasMore: libraryFetchState.hasMore
			});
			
			// Update existing tracksList if songs were loaded and we're on songs tab
			if (loadType === 'songs' && tracksListUpdate && tracksListContainer && currentType === 'songs' && !reset) {
				const filteredSongs = allData.songs;
				tracksListUpdate(filteredSongs);
				// Update the count in the title
				const titleEl = tracksListContainer.querySelector('.library-section-title');
				if (titleEl) {
					const songCount = totalCounts.songs > 0 ? totalCounts.songs : filteredSongs.length;
					titleEl.textContent = `Songs (${songCount})`;
				}
				// Don't call filterAndDisplay - we've updated in place
				return;
			}
			
			// For other types or initial load, use filterAndDisplay
			filterAndDisplay();
		} catch (error) {
			console.error('Error loading library:', error);
			if (reset) {
				resultsContainer.replaceChildren(el('div', { class: 'library-error' }, ['Failed to load library']));
			}
		} finally {
			libraryFetchState.isLoading = false;
		}
	}
	
	// Function to load more library data when scrolling
	async function loadMoreLibraryData(type = null) {
		// If type is specified and we're on "all" tab, load that specific type
		if (currentType === 'all' && type) {
			await loadMoreLibraryDataForType(type);
			return;
		}
		
		// Otherwise use the shared fetch state
		if (!libraryFetchState.hasMore || libraryFetchState.isLoading) return;
		await loadLibrary(false);
	}
	
	// Load more data for a specific type when on "all" tab
	async function loadMoreLibraryDataForType(type) {
		const state = allTabFetchStates[type];
		if (!state || !state.hasMore || state.isLoading) return;
		
		state.isLoading = true;
		try {
			const res = await window.api.getLibrary({ 
				type: type, 
				sortBy: currentSort, 
				limit: state.limit,
				startIndex: state.startIndex 
			});
			
			if (!res.ok) {
				state.isLoading = false;
				return;
			}
			
			// Merge new data with existing data
			const existingIds = new Set(allData[type].map(item => item.id));
			allData[type] = allData[type].concat(res[type].filter(item => !existingIds.has(item.id)));
			
			// Update total counts
			if (res.totalCounts && res.totalCounts[type]) {
				totalCounts[type] = Math.max(totalCounts[type], res.totalCounts[type]);
			}
			
			// Check if we got fewer items than requested (means no more data)
			if (res[type].length < state.limit) {
				state.hasMore = false;
			}
			
			// Update fetch state
			state.startIndex += state.limit;
			
			// Add owner names to playlists if needed
			if (type === 'playlists') {
				res.playlists.forEach(playlist => {
					if (playlist.ownerId && !playlist.ownerName) {
						const owner = allUsers.find(u => u.id === playlist.ownerId);
						playlist.ownerName = owner ? owner.name : '';
					}
				});
			}
			
			// Re-render to show new items
			// Instead of calling filterAndDisplay which recreates everything,
			// update the specific grid that was loaded
			if (gridUpdateFunctions[type]) {
				// Update the grid with new items
				const filteredItems = allData[type];
				gridUpdateFunctions[type](filteredItems);
			} else {
				// Fallback to full re-render if grid update function not available
				filterAndDisplay();
			}
		} catch (error) {
			console.error(`Error loading more ${type}:`, error);
		} finally {
			state.isLoading = false;
		}
	}
	
	function filterAndDisplay() {
		const searchTerm = searchInput.value.toLowerCase().trim();
		
		// Combine all items
		let items = [];
		
		if (currentType === 'favourites') {
			// Only show favorited albums and playlists (not songs)
			const favAlbums = allData.albums.filter(item => item.isFavorite);
			const favPlaylists = allData.playlists.filter(item => item.isFavorite);
			console.log('Filtering favourites:', { favAlbums: favAlbums.length, favPlaylists: favPlaylists.length });
			items = items.concat(favAlbums, favPlaylists);
		} else if (currentType === 'all') {
			items = items.concat(allData.albums, allData.artists, allData.playlists, allData.songs);
		} else if (currentType === 'albums') {
			items = items.concat(allData.albums);
		} else if (currentType === 'artists') {
			items = items.concat(allData.artists);
		} else if (currentType === 'playlists') {
			items = items.concat(allData.playlists);
		} else if (currentType === 'songs') {
			items = items.concat(allData.songs);
		}
		
		// Apply filters
		if (searchTerm) {
			items = items.filter(item => 
				item.title.toLowerCase().includes(searchTerm) ||
				(item.subtitle && item.subtitle.toLowerCase().includes(searchTerm)) ||
				(item.artist && item.artist.toLowerCase().includes(searchTerm))
			);
		}
		
		if (currentGenre) {
			items = items.filter(item => 
				item.genres && item.genres.includes(currentGenre)
			);
		}
		
		if (currentCreator) {
			items = items.filter(item => 
				item.type === 'playlist' && item.ownerId === currentCreator
			);
		}
		
		if (items.length === 0) {
			resultsContainer.replaceChildren(el('div', { class: 'library-empty' }, [
				el('p', {}, ['No items found with the selected filters'])
			]));
			return;
		}
		
		// Render items
		const sections = [];
		
		// If showing songs, use tracklist
		const songs = items.filter(i => i.type === 'song');
		if (songs.length > 0 || currentType === 'songs') {
			const onSelect = (i) => { 
				window.player.loadQueue(songs); 
				window.player.playIndex(i); 
			};
			
			// Use total count if available, otherwise use loaded count
			const songCount = totalCounts.songs > 0 ? totalCounts.songs : songs.length;
			
			// If tracksList already exists, update it instead of recreating
			if (tracksListUpdate && tracksListContainer && currentType === 'songs') {
				tracksListUpdate(songs);
				// Update the count in the title
				const titleEl = tracksListContainer.querySelector('.library-section-title');
				if (titleEl) {
					titleEl.textContent = `Songs (${songCount})`;
				}
			} else {
				const tracksListContainerEl = tracksList('', songs, onSelect, null, false, (currentType === 'songs') && libraryFetchState.hasMore ? loadMoreLibraryData : null);
				tracksListUpdate = tracksListContainerEl._updateTracks;
				tracksListContainer = el('div', { class: 'library-section' }, [
					el('h2', { class: 'library-section-title' }, [`Songs (${songCount})`]),
					tracksListContainerEl
				]);
				sections.push(tracksListContainer);
			}
		}
		
		// Albums grid
		const albums = items.filter(i => i.type === 'album');
		if (albums.length > 0 || currentType === 'albums' || currentType === 'all') {
			const { grid: albumsGrid, updateItems: updateAlbums } = createVirtualGrid(
				albums,
				(album) => {
					const card = createCardElement(album, (album) => {
						location.hash = `album/${album.id}`;
					}, 'album');
					
					// Add album context menu
					card.addEventListener('contextmenu', async (e) => {
						e.preventDefault();
						if (window.albumContextMenu) {
							await window.albumContextMenu.show(e.clientX, e.clientY, album);
						}
					});
					
					return card;
				},
				{ 
					initialBatch: 40, 
					batchSize: 40, 
					containerClass: 'library-grid',
					onLoadMore: (currentType === 'albums' || currentType === 'all') && (currentType === 'all' ? allTabFetchStates.albums.hasMore : libraryFetchState.hasMore) ? () => loadMoreLibraryData('albums') : null
				}
			);
			
			// Store update function for later use
			gridUpdateFunctions.albums = updateAlbums;
			
			// Use total count if available, otherwise use loaded count
			const albumCount = totalCounts.albums > 0 ? totalCounts.albums : albums.length;
			
			// Store update function for later use
			if (albums.length === 0) {
				// Create empty grid that will populate when data loads
				sections.push(
					el('div', { class: 'library-section' }, [
						el('h2', { class: 'library-section-title' }, [`Albums (${albumCount})`]),
						albumsGrid
					])
				);
			} else {
				sections.push(
					el('div', { class: 'library-section' }, [
						el('h2', { class: 'library-section-title' }, [`Albums (${albumCount})`]),
						albumsGrid
					])
				);
			}
		}
	
	// Artists grid
	const artists = items.filter(i => i.type === 'artist');
		if (artists.length > 0 || currentType === 'artists' || currentType === 'all') {
			const { grid: artistsGrid, updateItems: updateArtists } = createVirtualGrid(
				artists,
				(artist) => {
					const card = createCardElement(artist, (artist) => {
						location.hash = `artist/${artist.id}`;
					}, 'artist');
					
					card.addEventListener('contextmenu', (e) => {
						e.preventDefault();
						if (window.artistContextMenu) {
							window.artistContextMenu.show(e.clientX, e.clientY, artist);
						}
					});
					
					return card;
				},
				{ 
					initialBatch: 40, 
					batchSize: 40, 
					containerClass: 'library-grid',
					onLoadMore: (currentType === 'artists' || currentType === 'all') && (currentType === 'all' ? allTabFetchStates.artists.hasMore : libraryFetchState.hasMore) ? () => loadMoreLibraryData('artists') : null
				}
			);
			
			// Store update function for later use
			gridUpdateFunctions.artists = updateArtists;
			
			// Use total count if available, otherwise use loaded count
			const artistCount = totalCounts.artists > 0 ? totalCounts.artists : artists.length;
			
			sections.push(
				el('div', { class: 'library-section' }, [
					el('h2', { class: 'library-section-title' }, [`Artists (${artistCount})`]),
					artistsGrid
				])
			);
		}
		
		// Playlists grid
		const playlists = items.filter(i => i.type === 'playlist');
		if (playlists.length > 0 || currentType === 'playlists' || currentType === 'all') {
			const { grid: playlistsGrid, updateItems: updatePlaylists } = createVirtualGrid(
				playlists,
				(playlist) => {
					const imgWrapper = el('div', { class: 'card-image-wrapper' });
					imgWrapper.setAttribute('data-type', 'playlist');
					
					const img = el('img', { src: playlist.image || '', alt: playlist.title });
					const playBtn = createPlayButton(() => {
						location.hash = `playlist/${playlist.id}`;
					});
					
					imgWrapper.appendChild(img);
					imgWrapper.appendChild(playBtn);
					
					// Add pin indicator if playlist is pinned
					if (isPinned(playlist.id)) {
						const pinIndicator = el('div', { class: 'card-pin-indicator' });
						const pinSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
						pinSvg.setAttribute('viewBox', '0 0 24 24');
						pinSvg.setAttribute('fill', 'currentColor');
						const pinPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
						pinPath.setAttribute('d', 'M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z');
						pinSvg.appendChild(pinPath);
						pinIndicator.appendChild(pinSvg);
						imgWrapper.appendChild(pinIndicator);
					}
					
					handleImageError(imgWrapper, img);
					
					const card = el('div', { class: 'card' }, [
						imgWrapper,
						el('div', { class: 'meta' }, [
							el('div', { class: 'title' }, [playlist.title || 'Untitled'])
						])
					]);
					card.addEventListener('click', (e) => {
						if (!e.target.closest('.card-play-btn')) {
							location.hash = `playlist/${playlist.id}`;
						}
					});
					
					card.addEventListener('contextmenu', async (e) => {
						e.preventDefault();
						if (window.playlistContextMenu) {
							await window.playlistContextMenu.show(e.clientX, e.clientY, playlist);
						}
					});
					
					return card;
				},
				{ 
					initialBatch: 40, 
					batchSize: 40, 
					containerClass: 'library-grid',
					onLoadMore: (currentType === 'playlists' || currentType === 'all') && (currentType === 'all' ? allTabFetchStates.playlists.hasMore : libraryFetchState.hasMore) ? () => loadMoreLibraryData('playlists') : null
				}
			);
			
			// Store update function for later use
			gridUpdateFunctions.playlists = updatePlaylists;
			
			// Use total count if available, otherwise use loaded count
			const playlistCount = totalCounts.playlists > 0 ? totalCounts.playlists : playlists.length;
			
			sections.push(
				el('div', { class: 'library-section' }, [
					el('h2', { class: 'library-section-title' }, [`Playlists (${playlistCount})`]),
					playlistsGrid
				])
			);
		}
		
		resultsContainer.replaceChildren(...sections);
	}
	
	// Event listeners for filters
	const tabs = container.querySelectorAll('.library-tab');
	tabs.forEach(tab => {
		tab.addEventListener('click', () => {
			tabs.forEach(t => t.classList.remove('active'));
			tab.classList.add('active');
			currentType = tab.getAttribute('data-type');
			
			// Show/hide creator filter based on type
			if (currentType === 'playlists' || currentType === 'all') {
				creatorSelect.style.display = '';
			} else {
				creatorSelect.style.display = 'none';
				currentCreator = ''; // Reset creator filter
			}
			
			loadLibrary(true);
		});
	});
	
	searchInput.addEventListener('input', () => {
		filterAndDisplay();
	});
	
	genreSelect.addEventListener('change', (e) => {
		currentGenre = e.target.value;
		filterAndDisplay();
	});
	
	creatorSelect.addEventListener('change', (e) => {
		currentCreator = e.target.value;
		filterAndDisplay();
	});
	
	sortSelect.addEventListener('change', (e) => {
		currentSort = e.target.value;
		loadLibrary(true);
	});
	
	// Initial load
	// Initialize creator filter visibility
	if (currentType === 'playlists' || currentType === 'all') {
		creatorSelect.style.display = '';
	} else {
		creatorSelect.style.display = 'none';
	}
	await loadLibrary(true);
	
	// Listen for playlist pin changes to refresh the view
	window.addEventListener('playlistPinChanged', () => {
		filterAndDisplay();
	});
	
	// Listen for favorite changes to update library silently
	window.addEventListener('favoritesChanged', async (e) => {
		console.log('Favorites changed, updating library data silently...');
		// Only reload if we're on the favourites tab
		if (currentType === 'favourites') {
			await loadLibrary(true);
		}
	});
}

async function renderProfile(userId = null) {
	const container = el('div', { class: 'profile-page' });
	const isCurrentUser = !userId;
	
	// Show loading state
	container.appendChild(el('div', { class: 'profile-loading' }, ['Loading profile...']));
	app.replaceChildren(container);
	
	// Fetch all data in parallel
	const fetchPromises = isCurrentUser ? [
		window.api.getUserProfile(),
		window.api.getRecentlyPlayed({ limit: 50 }),
		window.api.getPlaybackInfo(),
		window.api.getUserStats()
	] : [
		window.api.getUserById(userId),
		window.api.getUserRecentlyPlayed(userId, { limit: 50 }),
		Promise.resolve({ ok: true, playing: null }),
		Promise.resolve({ ok: false })
	];
	
	const [profileRes, recentlyPlayedRes, playbackInfoRes, statsRes] = await Promise.all(fetchPromises);
	
	if (!profileRes.ok) {
		container.replaceChildren(el('div', { class: 'profile-error' }, ['Failed to load profile: ', profileRes.error]));
		return;
	}
	
	const profile = profileRes.profile;
	let recentlyPlayed = recentlyPlayedRes.ok ? recentlyPlayedRes.tracks : [];
	let nowPlaying = playbackInfoRes.ok ? playbackInfoRes.playing : null;
	let stats = statsRes.ok ? statsRes.stats : { totalPlays: 0, lastActivityDate: null, lastLoginDate: null };
	
	// Clear loading
	container.replaceChildren();
	
	// Profile Header with gradient
	const profileHeader = el('div', { class: 'profile-header' });
	
	const avatarWrapper = el('div', { class: 'profile-avatar-wrapper' });
	const avatar = el('img', { 
		class: 'profile-avatar', 
		src: profile.imageUrl || '', 
		alt: profile.name 
	});
	avatar.addEventListener('error', () => {
		avatar.style.display = 'none';
		const placeholder = el('div', { class: 'profile-avatar-placeholder' }, [
			profile.name.charAt(0).toUpperCase()
		]);
		avatarWrapper.appendChild(placeholder);
	});
	avatarWrapper.appendChild(avatar);
	
	// Create status badge (only update in real-time for current user)
	const statusBadge = el('span', { class: 'profile-status' });
	if (isCurrentUser) {
		// Get current track from player (more reliable than API for current playback)
		const currentPlayerTrack = window.player.getCurrentTrack();
		if (currentPlayerTrack) {
			const trackTitle = currentPlayerTrack.title.length > 30 ? currentPlayerTrack.title.substring(0, 30) + '...' : currentPlayerTrack.title;
			statusBadge.textContent = `🎵 ${trackTitle}`;
			statusBadge.title = currentPlayerTrack.title;
		} else {
			statusBadge.textContent = '💤 Idle';
		}
	} else {
		// For other users, show last activity
		statusBadge.textContent = profile.lastActivityDate ? 
			`Last active ${new Date(profile.lastActivityDate).toLocaleDateString()}` : 
			'Activity unknown';
	}
	
	const profileInfo = el('div', { class: 'profile-info' }, [
		el('div', { class: 'profile-label' }, ['Profile']),
		el('h1', { class: 'profile-name' }, [profile.name]),
		el('div', { class: 'profile-meta' }, [
			el('span', { class: 'profile-badge' }, [
				profile.policy.isAdministrator ? '👑 Administrator' : '👤 Member'
			]),
			statusBadge
		])
	]);
	
	profileHeader.appendChild(avatarWrapper);
	profileHeader.appendChild(profileInfo);
	container.appendChild(profileHeader);
	
	// Main content wrapper
	const contentWrapper = el('div', { class: 'profile-content' });
	
	// Currently Playing Section (will be updated dynamically)
	const nowPlayingSection = el('div', { class: 'profile-section' });
	let nowPlayingCard = null;
	
	function updateNowPlaying(track) {
		// Update status badge
		if (track) {
			const trackTitle = track.title.length > 30 ? track.title.substring(0, 30) + '...' : track.title;
			statusBadge.textContent = `🎵 ${trackTitle}`;
			statusBadge.title = track.title; // Full title on hover
		} else {
			statusBadge.textContent = '💤 Idle';
			statusBadge.title = '';
		}
		
		// Update now playing section
		if (track) {
			if (!nowPlayingCard) {
				nowPlayingSection.replaceChildren(
					el('h2', { class: 'profile-section-title' }, ['Currently Playing'])
				);
				
				// Create image or placeholder
				let imageElement;
				if (track.image) {
					imageElement = el('img', { 
						class: 'now-playing-image', 
						src: track.image, 
						alt: track.title 
					});
				} else {
					imageElement = el('div', { class: 'now-playing-image-placeholder' });
					imageElement.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
				}
				
				nowPlayingCard = el('div', { class: 'now-playing-card' }, [
					imageElement,
					el('div', { class: 'now-playing-info' }, [
						el('div', { class: 'now-playing-title' }, [track.title]),
						el('div', { class: 'now-playing-artist' }, [track.artist]),
						el('div', { class: 'now-playing-status' }, [
							el('span', { class: 'status-playing' }, ['▶️ Playing'])
						])
					])
				]);
				
				nowPlayingSection.appendChild(nowPlayingCard);
				
				// Insert at the beginning of content wrapper if not already there
				if (!contentWrapper.contains(nowPlayingSection)) {
					contentWrapper.insertBefore(nowPlayingSection, contentWrapper.firstChild);
				}
			} else {
				// Update existing card - need to replace image/placeholder based on track
				const existingImage = nowPlayingCard.querySelector('.now-playing-image');
				const existingPlaceholder = nowPlayingCard.querySelector('.now-playing-image-placeholder');
				const title = nowPlayingCard.querySelector('.now-playing-title');
				const artist = nowPlayingCard.querySelector('.now-playing-artist');
				
				// Remove existing image or placeholder
				if (existingImage) existingImage.remove();
				if (existingPlaceholder) existingPlaceholder.remove();
				
				// Add new image or placeholder
				let imageElement;
				if (track.image) {
					imageElement = el('img', { 
						class: 'now-playing-image', 
						src: track.image, 
						alt: track.title 
					});
				} else {
					imageElement = el('div', { class: 'now-playing-image-placeholder' });
					imageElement.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
				}
				nowPlayingCard.insertBefore(imageElement, nowPlayingCard.firstChild);
				
				if (title) title.textContent = track.title;
				if (artist) artist.textContent = track.artist;
			}
		} else {
			// Remove now playing section if no track
			if (nowPlayingCard) {
				nowPlayingSection.remove();
				nowPlayingCard = null;
			}
		}
	}
	
	// Initial update and real-time updates (only for current user)
	if (isCurrentUser) {
		const currentTrack = window.player.getCurrentTrack();
		updateNowPlaying(currentTrack);
		
		// Listen for track changes
		const trackChangeHandler = (e) => {
			updateNowPlaying(e.detail.track);
		};
		window.addEventListener('trackChanged', trackChangeHandler);
		
		// Cleanup on navigation
		const cleanupHandler = () => {
			window.removeEventListener('trackChanged', trackChangeHandler);
			window.removeEventListener('hashchange', cleanupHandler);
		};
		window.addEventListener('hashchange', cleanupHandler, { once: true });
	}
	
	// Recently Played Section
	const recentSection = el('div', { class: 'profile-section' }, [
		el('h2', { class: 'profile-section-title' }, ['Recently Played'])
	]);
	const recentTracksContainer = el('div', { class: 'recent-tracks-container' });
	
	function updateRecentlyPlayedSection() {
		recentTracksContainer.replaceChildren();
		if (recentlyPlayed.length > 0) {
			const recentTracksTable = tracksList('', recentlyPlayed.slice(0, 20), (idx) => {
				const track = recentlyPlayed[idx];
				window.player.loadQueue([track]);
				window.player.playIndex(0);
			});
			recentTracksContainer.appendChild(recentTracksTable);
		} else {
			recentTracksContainer.innerHTML = '<p style="text-align: center; color: rgba(255, 255, 255, 0.5); padding: 24px;">No recently played tracks</p>';
		}
	}
	
	updateRecentlyPlayedSection();
	recentSection.appendChild(recentTracksContainer);
	contentWrapper.appendChild(recentSection);
	
	// Activity Stats Section
	const statsSection = el('div', { class: 'profile-section' }, [
		el('h2', { class: 'profile-section-title' }, ['Account Information'])
	]);
	
	const totalPlaysValue = el('div', { class: 'stat-value' }, [stats.totalPlays.toString()]);
	const lastActivityValue = el('div', { class: 'stat-value' }, [
		stats.lastActivityDate ? 
			new Date(stats.lastActivityDate).toLocaleDateString() : 
			'N/A'
	]);
	
	const statsGrid = el('div', { class: 'profile-stats-grid' }, [
		el('div', { class: 'profile-stat-card' }, [
			el('div', { class: 'stat-icon' }, ['🎵']),
			el('div', { class: 'stat-info' }, [
				totalPlaysValue,
				el('div', { class: 'stat-label' }, ['Total Plays'])
			])
		]),
		el('div', { class: 'profile-stat-card' }, [
			el('div', { class: 'stat-icon' }, ['📅']),
			el('div', { class: 'stat-info' }, [
				lastActivityValue,
				el('div', { class: 'stat-label' }, ['Last Active'])
			])
		]),
		el('div', { class: 'profile-stat-card' }, [
			el('div', { class: 'stat-icon' }, [profile.policy.isAdministrator ? '🔑' : '👤']),
			el('div', { class: 'stat-info' }, [
				el('div', { class: 'stat-value' }, [
					profile.policy.isAdministrator ? 'Admin' : 'User'
				]),
				el('div', { class: 'stat-label' }, ['Account Type'])
			])
		]),
		el('div', { class: 'profile-stat-card' }, [
			el('div', { class: 'stat-icon' }, ['🔒']),
			el('div', { class: 'stat-info' }, [
				el('div', { class: 'stat-value' }, [
					profile.hasConfiguredPassword ? 'Yes' : 'No'
				]),
				el('div', { class: 'stat-label' }, ['Password Set'])
			])
		])
	]);
	
	statsSection.appendChild(statsGrid);
	contentWrapper.appendChild(statsSection);
	
	container.appendChild(contentWrapper);
	app.replaceChildren(container);
	
	// Set up real-time updates (only for current user)
	if (isCurrentUser) {
		const trackCompletedHandler = async (e) => {
			// Refresh stats and recently played
			try {
				const [newStatsRes, newRecentlyPlayedRes] = await Promise.all([
					window.api.getUserStats(),
					window.api.getRecentlyPlayed({ limit: 50 })
				]);
				
				if (newStatsRes.ok) {
					stats = newStatsRes.stats;
					totalPlaysValue.textContent = stats.totalPlays.toString();
					lastActivityValue.textContent = stats.lastActivityDate ? 
						new Date(stats.lastActivityDate).toLocaleDateString() : 
						'N/A';
				}
				
				if (newRecentlyPlayedRes.ok) {
					recentlyPlayed = newRecentlyPlayedRes.tracks;
					updateRecentlyPlayedSection();
				}
			} catch (err) {
				console.error('Failed to refresh profile stats:', err);
			}
		};
		
		window.addEventListener('trackCompleted', trackCompletedHandler);
		
		// Cleanup handler when leaving profile page
		const cleanupHandler = () => {
			window.removeEventListener('trackCompleted', trackCompletedHandler);
			window.removeEventListener('hashchange', cleanupHandler);
		};
		window.addEventListener('hashchange', cleanupHandler, { once: true });
	}
}

// Default settings
const DEFAULT_SETTINGS = {
	musicStreamingTranscodingBitrate: 320000, // 320 kbps
	maxStreamingBitrate: 140000000, // 140 Mbps
	maxStaticBitrate: 140000000,
	enableDirectPlay: true,
	enableDirectStream: true,
	enableTranscoding: true,
	crossfadeDuration: 0, // 0 = disabled
	equalizer: {
		enabled: false,
		bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] // 10 bands, -12 to +12 dB
	}
};

function getPlaybackSettings() {
	if (!currentUserId) return DEFAULT_SETTINGS;
	const stored = localStorage.getItem(`playbackSettings_${currentUserId}`);
	if (stored) {
		try {
			return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
		} catch (e) {
			return DEFAULT_SETTINGS;
		}
	}
	return DEFAULT_SETTINGS;
}

function savePlaybackSettings(settings) {
	if (!currentUserId) return;
	localStorage.setItem(`playbackSettings_${currentUserId}`, JSON.stringify(settings));
}

async function renderSettings() {
	try {
		const container = el('div', { class: 'settings-page' });
		
		// Get current settings from localStorage
		const settings = getPlaybackSettings();
		container.replaceChildren();
		
		// Header
		const header = el('div', { class: 'settings-header' }, [
		el('div', { class: 'settings-header-icon' }, [
			svgEl('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
				svgEl('path', { d: 'M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z' }, [])
			])
		]),
		el('div', { class: 'settings-header-text' }, [
			el('h1', {}, ['Settings']),
			el('p', { class: 'settings-subtitle' }, ['Customize your music experience. All settings are saved locally on this device.'])
		])
	]);
	
	container.appendChild(header);
	
	// Content wrapper
	const contentWrapper = el('div', { class: 'settings-content' });
	
	// Audio Quality Section
	const audioSection = el('div', { class: 'settings-section' }, [
		el('div', { class: 'settings-section-header' }, [
			el('div', { class: 'settings-section-icon' }, [
				svgEl('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
					svgEl('path', { d: 'M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z' }, [])
				])
			]),
			el('div', {}, [
				el('h2', { class: 'settings-section-title' }, ['Audio Quality']),
				el('p', { class: 'settings-section-desc' }, ['Configure streaming and playback quality'])
			])
		])
	]);
	
	// Music Streaming Bitrate
	const bitrateOptions = [
		{ value: 64000, label: '64 kbps - Low Quality' },
		{ value: 96000, label: '96 kbps - Good' },
		{ value: 128000, label: '128 kbps - Better' },
		{ value: 192000, label: '192 kbps - High' },
		{ value: 256000, label: '256 kbps - Very High' },
		{ value: 320000, label: '320 kbps - Maximum' }
	];
	
	const bitrateSelect = el('select', { class: 'settings-select', id: 'music-bitrate' });
	bitrateOptions.forEach(opt => {
		const option = el('option', { value: opt.value }, [opt.label]);
		if (opt.value === settings.musicStreamingTranscodingBitrate) {
			option.selected = true;
		}
		bitrateSelect.appendChild(option);
	});
	
	const bitrateGroup = el('div', { class: 'settings-group' }, [
		el('label', { class: 'settings-label' }, ['Music Streaming Quality']),
		el('p', { class: 'settings-description' }, ['Select the audio quality for music playback. Higher quality uses more bandwidth.']),
		bitrateSelect
	]);
	
	audioSection.appendChild(bitrateGroup);
	
	// Playback Options Section
	const playbackSection = el('div', { class: 'settings-section' }, [
		el('div', { class: 'settings-section-header' }, [
			el('div', { class: 'settings-section-icon' }, [
				svgEl('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
					svgEl('path', { d: 'M8 5v14l11-7z' }, [])
				])
			]),
			el('div', {}, [
				el('h2', { class: 'settings-section-title' }, ['Playback Options']),
				el('p', { class: 'settings-section-desc' }, ['Control how media is streamed and played'])
			])
		])
	]);
	
	// Direct Play checkbox
	const directPlayCheckbox = el('input', { type: 'checkbox', id: 'direct-play', class: 'settings-checkbox' });
	directPlayCheckbox.checked = settings.enableDirectPlay;
	
	const directPlayGroup = el('div', { class: 'settings-group' }, [
		el('label', { class: 'settings-checkbox-label' }, [
			directPlayCheckbox,
			el('span', {}, ['Enable Direct Play'])
		]),
		el('p', { class: 'settings-description' }, ['Play media files directly without modification. Recommended for best quality.'])
	]);
	
	// Direct Stream checkbox
	const directStreamCheckbox = el('input', { type: 'checkbox', id: 'direct-stream', class: 'settings-checkbox' });
	directStreamCheckbox.checked = settings.enableDirectStream;
	
	const directStreamGroup = el('div', { class: 'settings-group' }, [
		el('label', { class: 'settings-checkbox-label' }, [
			directStreamCheckbox,
			el('span', {}, ['Enable Direct Stream'])
		]),
		el('p', { class: 'settings-description' }, ['Stream media without transcoding when possible. Saves server resources.'])
	]);
	
	// Transcoding checkbox
	const transcodingCheckbox = el('input', { type: 'checkbox', id: 'transcoding', class: 'settings-checkbox' });
	transcodingCheckbox.checked = settings.enableTranscoding;
	
	const transcodingGroup = el('div', { class: 'settings-group' }, [
		el('label', { class: 'settings-checkbox-label' }, [
			transcodingCheckbox,
			el('span', {}, ['Enable Transcoding'])
		]),
		el('p', { class: 'settings-description' }, ['Allow server to transcode media when direct play is not possible.'])
	]);
	
	playbackSection.appendChild(directPlayGroup);
	playbackSection.appendChild(directStreamGroup);
	playbackSection.appendChild(transcodingGroup);
	
	contentWrapper.appendChild(audioSection);
	contentWrapper.appendChild(playbackSection);
	
	// Crossfade Section
	const crossfadeSection = el('div', { class: 'settings-section' }, [
		el('div', { class: 'settings-section-header' }, [
			el('div', { class: 'settings-section-icon' }, [
				svgEl('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
					svgEl('path', { d: 'M7.58 16.89l5.77-4.07c.56-.4.56-1.24 0-1.63L7.58 7.11C6.91 6.65 6 7.12 6 7.93v8.14c0 .81.91 1.28 1.58.82zM16 7v10c0 .55.45 1 1 1s1-.45 1-1V7c0-.55-.45-1-1-1s-1 .45-1 1z' }, [])
				])
			]),
			el('div', {}, [
				el('h2', { class: 'settings-section-title' }, ['Crossfade']),
				el('p', { class: 'settings-section-desc' }, ['Smoothly transition between tracks'])
			])
		])
	]);
	
	const crossfadeOptions = [
		{ value: 0, label: 'Off' },
		{ value: 2, label: '2 seconds' },
		{ value: 4, label: '4 seconds' },
		{ value: 6, label: '6 seconds' },
		{ value: 8, label: '8 seconds' },
		{ value: 10, label: '10 seconds' },
		{ value: 12, label: '12 seconds' }
	];
	
	const crossfadeSelect = el('select', { class: 'settings-select', id: 'crossfade-duration' });
	crossfadeOptions.forEach(opt => {
		const option = el('option', { value: opt.value }, [opt.label]);
		if (opt.value === settings.crossfadeDuration) {
			option.selected = true;
		}
		crossfadeSelect.appendChild(option);
	});
	
	const crossfadeGroup = el('div', { class: 'settings-group' }, [
		el('label', { class: 'settings-label' }, ['Crossfade Duration']),
		el('p', { class: 'settings-description' }, ['Smoothly fade between tracks. The current track fades out while the next track starts.']),
		crossfadeSelect
	]);
	
	crossfadeSection.appendChild(crossfadeGroup);
	contentWrapper.appendChild(crossfadeSection);
	
	// Equalizer Section
	const eqSection = el('div', { class: 'settings-section settings-section-eq' }, [
		el('div', { class: 'settings-section-header' }, [
			el('div', { class: 'settings-section-icon' }, [
				svgEl('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
					svgEl('path', { d: 'M7 18h2V6H7v12zm4 4h2V2h-2v20zm-8-8h2v-4H3v4zm12 4h2V6h-2v12zm4-8v4h2v-4h-2z' }, [])
				])
			]),
			el('div', {}, [
				el('h2', { class: 'settings-section-title' }, ['Equalizer']),
				el('p', { class: 'settings-section-desc' }, ['Fine-tune your audio with a 10-band equalizer'])
			])
		])
	]);
	
	const eqEnabled = settings.equalizer && settings.equalizer.enabled;
	const eqBands = settings.equalizer && settings.equalizer.bands ? settings.equalizer.bands : [0,0,0,0,0,0,0,0,0,0];
	
	// EQ Presets
	const EQ_PRESETS = {
		'Flat': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		'Rock': [5, 4, 3, 1, -1, 1, 3, 4, 5, 5],
		'Pop': [2, 4, 5, 3, 0, -1, -2, -2, 1, 2],
		'Jazz': [4, 3, 1, 2, -1, -1, 0, 1, 3, 4],
		'Classical': [4, 3, 2, 0, -1, -1, 0, 2, 3, 4],
		'Bass Boost': [8, 6, 4, 2, 0, 0, 0, 0, 0, 0],
		'Treble Boost': [0, 0, 0, 0, 0, 2, 4, 6, 8, 10],
		'Vocal Boost': [-1, -2, -1, 1, 4, 4, 3, 1, 0, -1],
		'Electronic': [5, 4, 1, 0, -2, 2, 1, 2, 4, 5],
		'Acoustic': [4, 4, 3, 1, 2, 2, 3, 3, 3, 2]
	};
	
	const eqEnableCheckbox = el('input', { type: 'checkbox', id: 'eq-enabled', class: 'settings-checkbox' });
	eqEnableCheckbox.checked = eqEnabled;
	
	const eqEnableGroup = el('div', { class: 'settings-group' }, [
		el('div', { class: 'eq-top-controls' }, [
			el('label', { class: 'settings-checkbox-label' }, [
				eqEnableCheckbox,
				el('span', {}, ['Enable Equalizer'])
			]),
			el('p', { class: 'settings-description' }, ['Adjust audio frequencies to customize your sound. Changes apply instantly to playback.'])
		])
	]);
	
	eqSection.appendChild(eqEnableGroup);
	
	// Presets selector
	const presetsContainer = el('div', { class: 'eq-presets-container' }, [
		el('label', { class: 'eq-presets-label' }, ['Presets']),
		el('div', { class: 'eq-presets-grid', id: 'eq-presets-grid' })
	]);
	
	const presetsGrid = presetsContainer.querySelector('#eq-presets-grid');
	Object.keys(EQ_PRESETS).forEach(presetName => {
		const presetBtn = el('button', { class: 'eq-preset-btn', type: 'button' }, [presetName]);
		presetBtn.addEventListener('click', () => {
			// Apply preset
			const presetValues = EQ_PRESETS[presetName];
			eqSliders.forEach((slider, i) => {
				slider.value = presetValues[i];
				slider.nextElementSibling.textContent = `${presetValues[i]}dB`;
			});
			
			// Update active state
			presetsGrid.querySelectorAll('.eq-preset-btn').forEach(btn => btn.classList.remove('active'));
			presetBtn.classList.add('active');
			
			// Apply in real-time if enabled
			if (eqEnableCheckbox.checked && window.player) {
				window.player.applyEqualizerSettings({ enabled: true, bands: presetValues });
			}
		});
		presetsGrid.appendChild(presetBtn);
	});
	
	eqSection.appendChild(presetsContainer);
	
	// EQ Bands (10-band)
	const frequencies = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'];
	const eqSlidersContainer = el('div', { class: 'eq-sliders-container' });
	const eqSliders = [];
	
	// Add zero line indicator
	const zeroLineContainer = el('div', { class: 'eq-zero-line-container' }, [
		el('div', { class: 'eq-zero-line' }),
		el('span', { class: 'eq-zero-label' }, ['0 dB'])
	]);
	
	frequencies.forEach((freq, i) => {
		const slider = el('input', { 
			type: 'range', 
			min: '-12', 
			max: '12', 
			step: '1',
			value: eqBands[i] || 0,
			class: 'eq-slider',
			id: `eq-slider-${i}`
		});
		
		const valueDisplay = el('span', { class: 'eq-value' }, [`${eqBands[i] || 0}dB`]);
		
		// Visual bar for current value
		const visualBar = el('div', { class: 'eq-visual-bar' });
		const updateVisualBar = () => {
			const value = parseFloat(slider.value);
			const percentage = ((value + 12) / 24) * 100; // Map -12 to +12 => 0 to 100%
			visualBar.style.height = `${percentage}%`;
			
			if (value > 0) {
				visualBar.style.background = 'linear-gradient(to top, #1db954, #1ed760)';
			} else if (value < 0) {
				visualBar.style.background = 'linear-gradient(to top, #ef4444, #dc2626)';
			} else {
				visualBar.style.background = '#555';
			}
		};
		updateVisualBar();
		
		slider.addEventListener('input', () => {
			valueDisplay.textContent = `${slider.value}dB`;
			updateVisualBar();
			
			// Clear preset selection when manually adjusting
			presetsGrid.querySelectorAll('.eq-preset-btn').forEach(btn => btn.classList.remove('active'));
			
			// Apply in real-time if enabled
			if (eqEnableCheckbox.checked && window.player) {
				const currentBands = eqSliders.map(s => parseFloat(s.value));
				window.player.applyEqualizerSettings({ enabled: true, bands: currentBands });
			}
		});
		
		eqSliders.push(slider);
		
		const sliderGroup = el('div', { class: 'eq-slider-group' }, [
			valueDisplay,
			el('div', { class: 'eq-slider-track' }, [
				visualBar,
				slider
			]),
			el('label', { class: 'eq-label' }, [freq])
		]);
		
		eqSlidersContainer.appendChild(sliderGroup);
	});
	
	eqSlidersContainer.prepend(zeroLineContainer);
	
	// EQ enable/disable toggle
	eqEnableCheckbox.addEventListener('change', () => {
		if (eqEnableCheckbox.checked) {
			eqSlidersContainer.style.opacity = '1';
			eqSlidersContainer.style.pointerEvents = 'auto';
			const currentBands = eqSliders.map(s => parseFloat(s.value));
			if (window.player) {
				window.player.applyEqualizerSettings({ enabled: true, bands: currentBands });
			}
		} else {
			eqSlidersContainer.style.opacity = '0.4';
			eqSlidersContainer.style.pointerEvents = 'none';
			if (window.player) {
				window.player.resetEqualizer();
			}
		}
	});
	
	// Set initial state
	eqSlidersContainer.style.opacity = eqEnabled ? '1' : '0.4';
	eqSlidersContainer.style.pointerEvents = eqEnabled ? 'auto' : 'none';
	eqSlidersContainer.style.transition = 'opacity 0.3s';
	
	// Reset button
	const resetEqBtn = el('button', { class: 'btn-secondary eq-reset-btn', type: 'button' }, [
		svgEl('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
			svgEl('path', { d: 'M12 5V2L8 6l4 4V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z' }, [])
		]),
		el('span', {}, ['Reset to Flat'])
	]);
	
	resetEqBtn.addEventListener('click', () => {
		eqSliders.forEach((slider, i) => {
			slider.value = 0;
			const event = new Event('input', { bubbles: true });
			slider.dispatchEvent(event);
		});
		
		// Clear preset selection
		presetsGrid.querySelectorAll('.eq-preset-btn').forEach(btn => btn.classList.remove('active'));
		presetsGrid.querySelector('.eq-preset-btn').classList.add('active'); // Select "Flat"
		
		if (eqEnableCheckbox.checked && window.player) {
			window.player.resetEqualizer();
		}
	});
	
	const eqActionsContainer = el('div', { class: 'eq-actions' }, [resetEqBtn]);
	
	eqSection.appendChild(eqSlidersContainer);
	eqSection.appendChild(eqActionsContainer);
	contentWrapper.appendChild(eqSection);
	
	// Discord Rich Presence Section
	const discordSection = el('div', { class: 'settings-section' }, [
		el('div', { class: 'settings-section-header' }, [
			el('div', { class: 'settings-section-icon discord' }, [
				svgEl('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
					svgEl('path', { d: 'M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.565 18.565 0 0 0-5.487 0 12.733 12.733 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026 13.83 13.83 0 0 0 1.226-1.963.074.074 0 0 0-.041-.104 13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z' }, [])
				])
			]),
			el('div', {}, [
				el('h2', { class: 'settings-section-title' }, ['Discord Rich Presence']),
				el('p', { class: 'settings-section-desc' }, ['Display what you\'re listening to on Discord'])
			])
		])
	]);
	
	// Get Discord settings
	let discordSettings = { enabled: false, clientId: '1355908069091180664', jellyfinUrl: '', jellyfinApiKey: '', jellyfinUsers: [] };
	try {
		const settingsRes = await window.api.discordGetSettings();
		if (settingsRes && settingsRes.ok && settingsRes.settings) {
			discordSettings = settingsRes.settings;
		}
	} catch (error) {
		console.error('Failed to load Discord settings:', error);
	}
	
	// Get current server URL from credentials
	try {
		const creds = await window.api.loadCredentials();
		if (creds && creds.ok && creds.credentials && creds.credentials.serverUrl) {
			if (!discordSettings.jellyfinUrl) {
				discordSettings.jellyfinUrl = creds.credentials.serverUrl.replace(/\/$/, '');
			}
		}
	} catch (error) {
		console.error('Failed to load server URL:', error);
	}
	
	// Discord Enable checkbox
	const discordEnableCheckbox = el('input', { type: 'checkbox', id: 'discord-enable', class: 'settings-checkbox' });
	discordEnableCheckbox.checked = discordSettings.enabled;
	
	const discordEnableGroup = el('div', { class: 'settings-group' }, [
		el('label', { class: 'settings-checkbox-label' }, [
			discordEnableCheckbox,
			el('span', {}, ['Enable Discord Rich Presence'])
		]),
		el('p', { class: 'settings-description' }, ['Show currently playing music on your Discord profile.'])
	]);
	
	discordSection.appendChild(discordEnableGroup);
	
	// Discord Client ID input
	const clientIdInput = el('input', { 
		type: 'text', 
		id: 'discord-client-id', 
		class: 'settings-input',
		placeholder: 'Enter your Discord Application ID',
		value: discordSettings.clientId || '1355908069091180664'
	});
	
	const clientIdGroup = el('div', { class: 'settings-group' }, [
		el('label', { class: 'settings-label' }, ['Discord Application ID']),
		el('p', { class: 'settings-description' }, [
			'Create an application named "Jellify" at ',
			el('a', { href: '#', class: 'settings-link', target: '_blank' }, ['Discord Developer Portal']),
			' and paste your Application ID here. The application name determines what Discord shows (e.g., "Listening to Jellify").'
		]),
		clientIdInput
	]);
	
	// Add click handler for the link
	const discordLink = clientIdGroup.querySelector('.settings-link');
	discordLink.addEventListener('click', (e) => {
		e.preventDefault();
		if (window.require) {
			window.require('electron').shell.openExternal('https://discord.com/developers/applications');
		}
	});
	
	discordSection.appendChild(clientIdGroup);
	
	// Jellyfin API Key input
	const apiKeyInput = el('input', { 
		type: 'password', 
		id: 'discord-jellyfin-api-key', 
		class: 'settings-input',
		placeholder: 'Enter your Jellyfin API key',
		value: discordSettings.jellyfinApiKey || ''
	});
	
	const apiKeyToggle = el('button', { 
		type: 'button',
		class: 'settings-input-toggle',
		style: 'position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #fff; cursor: pointer; padding: 5px;'
	}, ['👁️']);
	
	apiKeyToggle.addEventListener('click', () => {
		const type = apiKeyInput.type === 'password' ? 'text' : 'password';
		apiKeyInput.type = type;
	});
	
	const apiKeyGroup = el('div', { class: 'settings-group' }, [
		el('label', { class: 'settings-label' }, ['Jellyfin API Key']),
		el('p', { class: 'settings-description' }, [
			'Create an API key in your Jellyfin dashboard (Settings → API Keys). This is required for Discord Rich Presence to work.'
		]),
		el('div', { style: 'position: relative;' }, [
			apiKeyInput,
			apiKeyToggle
		])
	]);
	
	discordSection.appendChild(apiKeyGroup);
	
	// Discord status indicator
	const discordStatusDiv = el('div', { class: 'settings-group' }, [
		el('label', { class: 'settings-label' }, ['Connection Status']),
		el('div', { id: 'discord-status', class: 'discord-status-indicator' }, [
			el('span', { class: 'status-dot' }),
			el('span', { class: 'status-text' }, ['Checking...'])
		])
	]);
	
	discordSection.appendChild(discordStatusDiv);
	
	// Check Discord connection status
	if (window.api && window.api.discordIsConnected) {
		window.api.discordIsConnected().then(connected => {
			const statusDot = discordStatusDiv.querySelector('.status-dot');
			const statusText = discordStatusDiv.querySelector('.status-text');
			if (connected) {
				statusDot.style.backgroundColor = '#43b581';
				statusText.textContent = 'Connected';
			} else {
				statusDot.style.backgroundColor = '#f04747';
				statusText.textContent = 'Disconnected (Discord may not be running)';
			}
		});
	}
	
	contentWrapper.appendChild(discordSection);
	
	// Account Section
	const accountSection = el('div', { class: 'settings-section settings-section-danger' }, [
		el('div', { class: 'settings-section-header' }, [
			el('div', { class: 'settings-section-icon' }, [
				svgEl('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
					svgEl('path', { d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z' }, [])
				])
			]),
			el('div', {}, [
				el('h2', { class: 'settings-section-title' }, ['Account']),
				el('p', { class: 'settings-section-desc' }, ['Manage your account preferences'])
			])
		])
	]);
	
	// Get auto-login preference
	const autoLoginEnabled = localStorage.getItem('autoLoginEnabled') !== 'false';
	
	// Auto-login checkbox
	const autoLoginCheckbox = el('input', { type: 'checkbox', id: 'auto-login', class: 'settings-checkbox' });
	autoLoginCheckbox.checked = autoLoginEnabled;
	
	const autoLoginGroup = el('div', { class: 'settings-group' }, [
		el('label', { class: 'settings-checkbox-label' }, [
			autoLoginCheckbox,
			el('span', {}, ['Enable automatic login'])
		]),
		el('p', { class: 'settings-description' }, ['Automatically log in when the app starts using saved credentials.'])
	]);
	
	accountSection.appendChild(autoLoginGroup);
	
	// Logout button
	const logoutBtn = el('button', { class: 'btn-danger settings-logout-btn' }, ['Log Out']);
	logoutBtn.addEventListener('click', () => {
		showLogoutConfirmation();
	});
	
	accountSection.appendChild(logoutBtn);
	contentWrapper.appendChild(accountSection);
	
	// Save button
	const saveBtn = el('button', { class: 'btn-primary settings-save-btn' }, [
		svgEl('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
			svgEl('path', { d: 'M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z' }, [])
		]),
		el('span', {}, ['Save All Settings'])
	]);
	saveBtn.addEventListener('click', async () => {
		saveBtn.disabled = true;
		saveBtn.innerHTML = `
			<svg viewBox="0 0 24 24" fill="currentColor" style="animation: spin 0.8s linear infinite;">
				<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" opacity=".3"/>
				<path d="M12 2C6.48 2 2 6.48 2 12h2c0-4.41 3.59-8 8-8s8 3.59 8 8 3.59 8 8 8c0 5.52-4.48 10-10 10z"/>
			</svg>
			<span>Saving...</span>
		`;
		
		const newSettings = {
			musicStreamingTranscodingBitrate: parseInt(bitrateSelect.value),
			maxStreamingBitrate: settings.maxStreamingBitrate, // Keep existing
			maxStaticBitrate: settings.maxStaticBitrate, // Keep existing
			enableDirectPlay: directPlayCheckbox.checked,
			enableDirectStream: directStreamCheckbox.checked,
			enableTranscoding: transcodingCheckbox.checked,
			crossfadeDuration: parseInt(crossfadeSelect.value),
			equalizer: {
				enabled: eqEnableCheckbox.checked,
				bands: eqSliders.map(s => parseFloat(s.value))
			}
		};
		
		try {
			savePlaybackSettings(newSettings);
			
			// Save auto-login preference
			localStorage.setItem('autoLoginEnabled', autoLoginCheckbox.checked);
			
			// Save Discord settings
			const jellyfinApiKey = apiKeyInput.value.trim();
			const discordClientId = clientIdInput.value.trim() || '1355908069091180664';
			
			// Get current logged-in server URL automatically
			let currentServerUrl = null;
			try {
				const creds = await window.api.loadCredentials();
				if (creds && creds.ok && creds.credentials && creds.credentials.serverUrl) {
					currentServerUrl = creds.credentials.serverUrl.replace(/\/$/, '');
				}
			} catch (err) {
				console.error('Failed to get current server URL for Discord RPC:', err);
			}
			
			// Get current logged-in username automatically
			let currentUsername = null;
			try {
				const userRes = await window.api.getCurrentUser();
				if (userRes.ok && userRes.user && userRes.user.Name) {
					currentUsername = userRes.user.Name;
				}
			} catch (err) {
				console.error('Failed to get current user for Discord RPC:', err);
			}
			
			if (window.api && window.api.discordUpdateSettings) {
				await window.api.discordUpdateSettings(
					currentServerUrl || '',
					jellyfinApiKey,
					currentUsername ? [currentUsername] : [],
					discordClientId,
					discordEnableCheckbox.checked
				);
			}
			
			showToast('Settings saved successfully', 'success');
			saveBtn.innerHTML = `
				<svg viewBox="0 0 24 24" fill="currentColor">
					<path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
				</svg>
				<span>Saved Successfully!</span>
			`;
			setTimeout(() => {
				saveBtn.innerHTML = `
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
					</svg>
					<span>Save All Settings</span>
				`;
				saveBtn.disabled = false;
			}, 2000);
		} catch (error) {
			showToast('Failed to save settings: ' + error.message, 'error');
			saveBtn.innerHTML = `
				<svg viewBox="0 0 24 24" fill="currentColor">
					<path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
				</svg>
				<span>Save All Settings</span>
			`;
			saveBtn.disabled = false;
		}
	});
	
	contentWrapper.appendChild(saveBtn);
	container.appendChild(contentWrapper);
	
	app.replaceChildren(container);
	} catch (error) {
		console.error('Error rendering settings page:', error);
		console.error('Stack trace:', error.stack);
		// Show error to user
		app.innerHTML = `
			<div style="padding: 40px; text-align: center; color: #fff;">
				<h2>Error Loading Settings</h2>
				<p style="color: #ef4444;">${error.message}</p>
				<p style="color: #999; font-size: 14px; margin-top: 20px;">Check the console for more details.</p>
			</div>
		`;
	}
}

// Lyrics Page
let lyricsPageLines = [];
let lyricsPageUpdateInterval = null;

async function renderLyricsPage() {
	const track = window.player.getCurrentTrack();
	
	if (!track) {
		const container = el('div', { class: 'lyrics-page' }, [
			el('div', { class: 'lyrics-page-empty' }, [
				el('h2', {}, ['No track playing']),
				el('p', {}, ['Play a song to view lyrics'])
			])
		]);
		app.replaceChildren(container);
		return;
	}
	
	const container = el('div', { class: 'lyrics-page' });
	const bgGradient = el('div', { class: 'lyrics-page-bg' });
	
	// Set background gradient from album art
	if (track.image) {
		bgGradient.style.background = `
			linear-gradient(180deg, rgba(146, 73, 158, 0.6) 0%, rgba(18, 18, 18, 1) 100%),
			url(${track.image}) center/cover
		`;
		bgGradient.style.filter = 'blur(50px)';
	}
	
	const contentWrapper = el('div', { class: 'lyrics-page-content' });
	const lyricsSection = el('div', { class: 'lyrics-page-main' });
	const sidebarSection = el('div', { class: 'lyrics-page-sidebar' });
	
	// Sidebar - Track info
	const albumArt = el('img', { 
		class: 'lyrics-page-art',
		src: track.image || '',
		alt: track.title
	});
	
	const trackInfo = el('div', { class: 'lyrics-page-track-info' }, [
		el('h2', { class: 'lyrics-page-track-title' }, [track.title]),
		el('p', { class: 'lyrics-page-track-artist' }, [track.artist]),
		el('p', { class: 'lyrics-page-track-album' }, [track.album || ''])
	]);
	
	sidebarSection.appendChild(albumArt);
	sidebarSection.appendChild(trackInfo);
	
	// Lyrics section - loading state
	const lyricsContainer = el('div', { class: 'lyrics-page-lines', id: 'lyrics-page-lines' }, [
		el('div', { class: 'lyrics-loading' }, ['Loading lyrics...'])
	]);
	
	lyricsSection.appendChild(lyricsContainer);
	contentWrapper.appendChild(lyricsSection);
	contentWrapper.appendChild(sidebarSection);
	container.appendChild(bgGradient);
	container.appendChild(contentWrapper);
	
	app.replaceChildren(container);
	
	// Load lyrics
	loadLyricsForPage(track);
	
	// Start update interval
	if (lyricsPageUpdateInterval) {
		clearInterval(lyricsPageUpdateInterval);
	}
	lyricsPageUpdateInterval = setInterval(() => {
		updateLyricsPageHighlight();
	}, 100);
}

async function loadLyricsForPage(track) {
	const container = document.getElementById('lyrics-page-lines');
	if (!container) return;
	
	try {
		console.log('Loading lyrics for track:', track.title, track.id);
		const res = await window.api.getLyrics(track.id);
		console.log('Lyrics response:', res);
		
		if (res && res.ok && res.lyrics) {
			console.log('Renderer - Lyrics type:', typeof res.lyrics);
			console.log('Renderer - Lyrics data:', res.lyrics);
			console.log('Renderer - Lyrics metadata:', res.metadata);
			
			let lyricsText = res.lyrics;
			
			// Ensure we have a string
			if (typeof lyricsText !== 'string') {
				console.error('Renderer - Lyrics is not a string:', lyricsText);
				container.innerHTML = '';
				const errorDiv = document.createElement('div');
				errorDiv.className = 'lyrics-error';
				errorDiv.innerHTML = `
					Invalid lyrics format
					<p style="font-size: 14px; margin-top: 16px; opacity: 0.7;">
						Received ${typeof lyricsText} instead of string
					</p>
				`;
				container.appendChild(errorDiv);
				return;
			}
			
			console.log('Renderer - Valid lyrics text, length:', lyricsText.length);
			console.log('Renderer - Lyrics preview:', lyricsText.substring(0, 200));
			
			parseLyricsForPage(lyricsText, res.metadata, container);
		} else {
			console.log('No lyrics available');
			container.innerHTML = '';
			const errorDiv = document.createElement('div');
			errorDiv.className = 'lyrics-error';
			errorDiv.innerHTML = `
				No lyrics available for this track
				<p style="font-size: 14px; margin-top: 16px; opacity: 0.7;">
					Make sure your Jellyfin server has lyrics files (.lrc) in the same folder as your music files.
				</p>
			`;
			container.appendChild(errorDiv);
		}
	} catch (err) {
		console.error('Failed to load lyrics:', err);
		container.innerHTML = '';
		const errorDiv = document.createElement('div');
		errorDiv.className = 'lyrics-error';
		errorDiv.innerHTML = `
			Failed to load lyrics
			<p style="font-size: 14px; margin-top: 16px; opacity: 0.7;">
				Error: ${err.message || 'Unknown error'}
			</p>
		`;
		container.appendChild(errorDiv);
	}
}

function parseLyricsForPage(lyricsText, metadata, container) {
	lyricsPageLines = [];
	
	// Ensure lyricsText is a string
	if (!lyricsText || typeof lyricsText !== 'string') {
		console.error('Invalid lyrics text:', lyricsText);
		container.innerHTML = '';
		const errorDiv = document.createElement('div');
		errorDiv.className = 'lyrics-error';
		errorDiv.textContent = 'Invalid lyrics format';
		container.appendChild(errorDiv);
		return;
	}
	
	// Try to parse LRC format (synchronized lyrics)
	const lrcPattern = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g;
	let match;
	let hasTimestamps = false;
	
	while ((match = lrcPattern.exec(lyricsText)) !== null) {
		hasTimestamps = true;
		const minutes = parseInt(match[1]);
		const seconds = parseInt(match[2]);
		const milliseconds = parseInt(match[3].padEnd(3, '0'));
		const time = minutes * 60 + seconds + milliseconds / 1000;
		const text = match[4].trim();
		
		if (text) {
			lyricsPageLines.push({ time, text });
		}
	}
	
	if (hasTimestamps) {
		// Sort by time
		lyricsPageLines.sort((a, b) => a.time - b.time);
		displayLyricsPageSynchronized(container);
	} else {
		// Display as plain text
		displayLyricsPagePlain(lyricsText, container);
	}
}

function displayLyricsPageSynchronized(container) {
	container.innerHTML = '';
	
	lyricsPageLines.forEach((line, index) => {
		const lineEl = document.createElement('p');
		lineEl.className = 'lyrics-page-line';
		lineEl.textContent = line.text;
		lineEl.setAttribute('data-index', index);
		lineEl.setAttribute('data-time', line.time);
		
		// Click to seek
		lineEl.addEventListener('click', () => {
			const audio = document.getElementById('audio');
			if (audio) {
				audio.currentTime = line.time;
			}
		});
		
		container.appendChild(lineEl);
	});
}

function displayLyricsPagePlain(text, container) {
	container.innerHTML = '';
	const plainDiv = document.createElement('div');
	plainDiv.className = 'lyrics-page-text';
	plainDiv.textContent = text;
	container.appendChild(plainDiv);
}

function updateLyricsPageHighlight() {
	const audio = document.getElementById('audio');
	if (!audio || !audio.duration) return;
	
	const currentTime = audio.currentTime;
	const lines = document.querySelectorAll('.lyrics-page-line');
	
	if (lines.length === 0 || lyricsPageLines.length === 0) return;
	
	let activeIndex = -1;
	
	// Find the current line
	for (let i = 0; i < lyricsPageLines.length; i++) {
		if (currentTime >= lyricsPageLines[i].time) {
			activeIndex = i;
		} else {
			break;
		}
	}
	
	// Update highlights
	lines.forEach((line, index) => {
		if (index === activeIndex) {
			line.classList.add('active');
			// Auto-scroll to active line
			line.scrollIntoView({ behavior: 'smooth', block: 'center' });
		} else {
			line.classList.remove('active');
		}
	});
}

// Clean up interval when leaving lyrics page
window.addEventListener('hashchange', () => {
	if (!location.hash.includes('lyrics')) {
		if (lyricsPageUpdateInterval) {
			clearInterval(lyricsPageUpdateInterval);
			lyricsPageUpdateInterval = null;
		}
	}
});

function route() {
	const hash = (location.hash || '').replace(/^#/, '');
	
	// Update active navigation state
	if (typeof updateActiveNavigation === 'function') {
		updateActiveNavigation();
	}
	
	if (hash === 'albums') return renderAlbumsPage();
	if (hash === 'playlists') return renderPlaylistsPage();
	if (hash === 'artists') return renderArtistsPage();
	if (hash === 'library') return renderLibrary();
	if (hash === 'liked') return renderLikedSongs();
	if (hash === 'profile') return renderProfile();
	if (hash === 'settings') return renderSettings();
	if (hash === 'lyrics') return renderLyricsPage();
	if (hash === 'search') return renderSearch();
	const mSearch = hash.match(/^search\/(.+)$/);
	if (mSearch) return renderSearch(decodeURIComponent(mSearch[1]));
	const mUser = hash.match(/^user\/(.+)$/);
	if (mUser) return renderProfile(mUser[1]);
	const mAlbum = hash.match(/^album\/(.+)$/);
	if (mAlbum) return renderAlbumDetail(mAlbum[1]);
	const mPl = hash.match(/^playlist\/(.+)$/);
	if (mPl) return renderPlaylistDetail(mPl[1]);
	const mArtist = hash.match(/^artist\/(.+)$/);
	if (mArtist) return renderArtistDetail(mArtist[1]);
	return renderHome();
}

// Setup search button in topbar
function setupSearchButton() {
	const searchBtn = document.querySelector('.search-btn');
	if (searchBtn) {
		searchBtn.addEventListener('click', () => {
			location.hash = 'search';
		});
	}
}

function setupSettingsButton() {
	const settingsBtn = document.getElementById('btn-settings');
	if (settingsBtn) {
		settingsBtn.addEventListener('click', () => {
			location.hash = 'settings';
		});
	}
}

// Load user profile and populate UI
async function loadUserProfile() {
	const res = await window.api.getCurrentUser();
	if (res.ok && res.user) {
		const { Name, imageUrl, Id } = res.user;
		// Set the current user ID for account-specific features
		currentUserId = Id;
		const sidebarAvatar = document.getElementById('sidebar-avatar');
		const sidebarUsername = document.getElementById('sidebar-username');
		const topbarAvatar = document.getElementById('topbar-avatar');
		
		// Set image source if available, otherwise hide
		if (imageUrl && imageUrl !== '') {
			if (sidebarAvatar) {
				sidebarAvatar.src = imageUrl;
				sidebarAvatar.style.display = 'block';
			}
			if (topbarAvatar) {
				topbarAvatar.src = imageUrl;
				topbarAvatar.style.display = 'block';
			}
		} else {
			// Use fallback or hide if no image
			if (sidebarAvatar) sidebarAvatar.style.display = 'none';
			if (topbarAvatar) topbarAvatar.style.display = 'none';
		}
		
		if (sidebarUsername) sidebarUsername.textContent = Name || 'User';
		
		// Make topbar user section clickable
		const topbarUser = document.getElementById('topbar-user');
		if (topbarUser) {
			topbarUser.style.cursor = 'pointer';
			topbarUser.addEventListener('click', () => {
				location.hash = 'profile';
			});
		}
	}
	
	// Load playlists into sidebar (only after userId is set)
	await loadSidebarPlaylists();
	
	// Reload player data (volume, playback state) now that userId is available
	if (window.player && window.player.reloadUserData) {
		window.player.reloadUserData();
	}
}

// Load and populate sidebar with playlists
async function loadSidebarPlaylists() {
	const sidebarPlaylists = document.getElementById('sidebar-playlists');
	if (!sidebarPlaylists) return;
	
	// Ensure we have the user ID before checking pins
	await ensureUserId();
	
	try {
		const res = await window.api.listPlaylists(0, 100);
		if (!res.ok || !res.items) {
			return;
		}
		
		// Clear existing playlists
		sidebarPlaylists.innerHTML = '';
		
		const pinnedIds = getPinnedPlaylists();
		const pinnedPlaylists = res.items.filter(p => pinnedIds.includes(p.id));
		const unpinnedPlaylists = res.items.filter(p => !pinnedIds.includes(p.id));
		
		// Helper to create a playlist nav item
		const createPlaylistItem = (playlist, isPinned = false) => {
			const playlistItem = document.createElement('a');
			playlistItem.href = `#playlist/${playlist.id}`;
			playlistItem.className = 'nav-item';
			if (isPinned) playlistItem.classList.add('pinned-playlist');
			playlistItem.setAttribute('data-nav', `playlist-${playlist.id}`);
			
			// Create SVG icon (pin icon for pinned, music icon for others)
			const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			svg.setAttribute('class', 'icon');
			svg.setAttribute('viewBox', '0 0 24 24');
			svg.setAttribute('fill', 'currentColor');
			
			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			if (isPinned) {
				path.setAttribute('d', 'M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z');
			} else {
				path.setAttribute('d', 'M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z');
			}
			
			svg.appendChild(path);
			
			const span = document.createElement('span');
			span.textContent = playlist.title || 'Untitled Playlist';
			
			playlistItem.appendChild(svg);
			playlistItem.appendChild(span);
			
			// Add context menu handler
		playlistItem.addEventListener('contextmenu', async (e) => {
			e.preventDefault();
			if (window.playlistContextMenu) {
				await window.playlistContextMenu.show(e.clientX, e.clientY, playlist);
			}
		});
			
			return playlistItem;
		};
		
		// Add pinned playlists first
		if (pinnedPlaylists.length > 0) {
			pinnedPlaylists.forEach(playlist => {
				sidebarPlaylists.appendChild(createPlaylistItem(playlist, true));
			});
			
			// Add separator if there are both pinned and unpinned playlists
			if (unpinnedPlaylists.length > 0) {
				const separator = document.createElement('div');
				separator.className = 'sidebar-separator';
				sidebarPlaylists.appendChild(separator);
			}
		}
		
		// Add unpinned playlists
		unpinnedPlaylists.forEach(playlist => {
			sidebarPlaylists.appendChild(createPlaylistItem(playlist, false));
		});
		
		// Update active state
		updateActiveNavigation();
	} catch (error) {
		console.error('Failed to load sidebar playlists:', error);
	}
}

// Update active navigation state based on current route
function updateActiveNavigation() {
	const hash = (location.hash || '').replace(/^#/, '') || 'home';
	
	// Remove active from all nav items
	document.querySelectorAll('.nav-item').forEach(item => {
		item.classList.remove('active');
	});
	
	// Determine which nav item to activate
	let activeSelector = null;
	
	if (!hash || hash === '' || hash === 'home') {
		activeSelector = '[data-nav="home"]';
	} else if (hash === 'search' || hash.startsWith('search/')) {
		activeSelector = '[data-nav="search"]';
	} else if (hash === 'library') {
		activeSelector = '[data-nav="library"]';
	} else if (hash === 'liked') {
		activeSelector = '[data-nav="liked"]';
	} else if (hash.startsWith('playlist/')) {
		const playlistId = hash.replace('playlist/', '');
		activeSelector = `[data-nav="playlist-${playlistId}"]`;
	}
	
	if (activeSelector) {
		const activeItem = document.querySelector(activeSelector);
		if (activeItem) {
			activeItem.classList.add('active');
		}
	}
}

// Window controls
function setupWindowControls() {
	const minBtn = document.getElementById('win-minimize');
	const maxBtn = document.getElementById('win-maximize');
	const closeBtn = document.getElementById('win-close');
	
	if (minBtn) minBtn.addEventListener('click', () => window.api.windowMinimize());
	if (maxBtn) maxBtn.addEventListener('click', () => window.api.windowMaximize());
	if (closeBtn) closeBtn.addEventListener('click', () => window.api.windowClose());
}

function setupLoginWindowControls() {
	const minBtn = document.getElementById('login-win-minimize');
	const maxBtn = document.getElementById('login-win-maximize');
	const closeBtn = document.getElementById('login-win-close');
	
	if (minBtn) minBtn.addEventListener('click', () => window.api.windowMinimize());
	if (maxBtn) maxBtn.addEventListener('click', () => window.api.windowMaximize());
	if (closeBtn) closeBtn.addEventListener('click', () => window.api.windowClose());
}

// Toast notification system
function showToast(message, type = 'success') {
	const container = document.getElementById('toast-container');
	if (!container) return;
	
	const toast = document.createElement('div');
	toast.className = `toast ${type}`;
	
	const icon = document.createElement('div');
	icon.className = 'toast-icon';
	if (type === 'success') {
		icon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
	} else if (type === 'error') {
		icon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
	}
	
	const messageDiv = document.createElement('div');
	messageDiv.className = 'toast-message';
	messageDiv.textContent = message;
	
	toast.appendChild(icon);
	toast.appendChild(messageDiv);
	container.appendChild(toast);
	
	// Auto-hide after 3 seconds
	setTimeout(() => {
		toast.classList.add('hiding');
		setTimeout(() => {
			if (toast.parentNode) toast.parentNode.removeChild(toast);
		}, 300);
	}, 3000);
}

// Make showToast available globally
window.showToast = showToast;

// Expose helper functions globally for context menu
window.isHidden = isHidden;
window.toggleHideSong = toggleHideSong;
window.ensureUserId = ensureUserId;
window.getCurrentUserId = () => currentUserId;
window.isPinned = isPinned;
window.togglePin = togglePin;

// Expose route function for re-rendering current page
window.route = route;

// Create Playlist Modal
function setupCreatePlaylistModal() {
	const modal = document.getElementById('create-playlist-modal');
	const openBtn = document.getElementById('btn-create-playlist');
	const closeBtn = document.getElementById('modal-close');
	const cancelBtn = document.getElementById('btn-cancel-playlist');
	const saveBtn = document.getElementById('btn-save-playlist');
	const nameInput = document.getElementById('playlist-name');
	const overlay = modal.querySelector('.modal-overlay');
	
	function openModal() {
		modal.classList.add('visible');
		nameInput.value = '';
		// Focus the name input after animation
		setTimeout(() => nameInput.focus(), 100);
	}
	
	function closeModal() {
		modal.classList.remove('visible');
	}
	
	async function createPlaylist() {
		const name = nameInput.value.trim();
		if (!name) {
			showToast('Please enter a playlist name', 'error');
			nameInput.focus();
			return;
		}
		
		// Disable button while creating
		saveBtn.disabled = true;
		saveBtn.textContent = 'Creating...';
		
		try {
			// Call the API to create the playlist (description not supported by Jellyfin)
			const res = await window.api.createPlaylist(name, '');
			if (res.ok) {
				closeModal();
				showToast(`Playlist "${name}" created successfully!`, 'success');
				// Refresh sidebar playlists to show the new playlist
				if (typeof loadSidebarPlaylists === 'function') {
					setTimeout(() => loadSidebarPlaylists(), 300);
				}
			} else {
				showToast(`Failed to create playlist: ${res.error || 'Unknown error'}`, 'error');
			}
		} catch (err) {
			showToast(`Error creating playlist: ${err.message || String(err)}`, 'error');
		} finally {
			saveBtn.disabled = false;
			saveBtn.textContent = 'Create';
		}
	}
	
	// Event listeners
	if (openBtn) openBtn.addEventListener('click', openModal);
	if (closeBtn) closeBtn.addEventListener('click', closeModal);
	if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
	if (overlay) overlay.addEventListener('click', closeModal);
	if (saveBtn) saveBtn.addEventListener('click', createPlaylist);
	
	// Allow Enter key to submit
	if (nameInput) {
		nameInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				createPlaylist();
			}
		});
	}
	
	// Escape key to close
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && modal.classList.contains('visible')) {
			closeModal();
		}
	});
}

// Logout Confirmation Modal
function setupLogoutModal() {
	const modal = document.getElementById('logout-modal');
	const closeBtn = document.getElementById('logout-modal-close');
	const cancelBtn = document.getElementById('btn-cancel-logout');
	const confirmBtn = document.getElementById('btn-confirm-logout');
	const overlay = modal.querySelector('.modal-overlay');
	
	function closeModal() {
		modal.classList.remove('visible');
	}
	
	async function performLogout() {
		confirmBtn.disabled = true;
		confirmBtn.textContent = 'Logging out...';
		
		try {
			// Clear saved credentials
			await window.api.clearCredentials();
			
			// Preserve user-specific data that should persist across logouts
			// Save items we want to keep
			const itemsToKeep = {};
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				// Keep all account-specific data (pinned playlists, hidden songs, volume, playback state, settings)
				// and global preferences like autoLoginEnabled
				if (key.startsWith('pinnedPlaylists_') || 
				    key.startsWith('hiddenSongs_') || 
				    key.startsWith('playerVolume_') || 
				    key.startsWith('playbackState_') || 
				    key.startsWith('playbackSettings_') || 
				    key === 'autoLoginEnabled') {
					itemsToKeep[key] = localStorage.getItem(key);
				}
			}
			
			// Clear all localStorage
			localStorage.clear();
			
			// Restore preserved items
			Object.keys(itemsToKeep).forEach(key => {
				localStorage.setItem(key, itemsToKeep[key]);
			});
			
			// Reload the page to show login screen
			window.location.reload();
		} catch (error) {
			console.error('Error logging out:', error);
			showToast('Failed to log out: ' + error.message, 'error');
			confirmBtn.disabled = false;
			confirmBtn.textContent = 'Log Out';
		}
	}
	
	// Event listeners
	if (closeBtn) closeBtn.addEventListener('click', closeModal);
	if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
	if (overlay) overlay.addEventListener('click', closeModal);
	if (confirmBtn) confirmBtn.addEventListener('click', performLogout);
	
	// Escape key to close
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && modal.classList.contains('visible')) {
			closeModal();
		}
	});
}

function showLogoutConfirmation() {
	const modal = document.getElementById('logout-modal');
	if (modal) {
		modal.classList.add('visible');
	}
}

// Navigation history management
let navigationHistory = [];
let historyIndex = -1;
let isNavigatingHistory = false;

function setupNavigation() {
	const backBtn = document.getElementById('nav-back');
	const forwardBtn = document.getElementById('nav-forward');
	
	function updateNavigationButtons() {
		if (backBtn) backBtn.disabled = historyIndex <= 0;
		if (forwardBtn) forwardBtn.disabled = historyIndex >= navigationHistory.length - 1;
	}
	
	function pushHistory(hash) {
		if (isNavigatingHistory) return;
		
		// If we're not at the end of history, remove forward history
		if (historyIndex < navigationHistory.length - 1) {
			navigationHistory = navigationHistory.slice(0, historyIndex + 1);
		}
		
		// Don't add duplicate consecutive entries
		if (navigationHistory[navigationHistory.length - 1] !== hash) {
			navigationHistory.push(hash);
			historyIndex = navigationHistory.length - 1;
		}
		
		updateNavigationButtons();
	}
	
	function navigateBack() {
		if (historyIndex > 0) {
			isNavigatingHistory = true;
			historyIndex--;
			location.hash = navigationHistory[historyIndex];
			updateNavigationButtons();
			setTimeout(() => { isNavigatingHistory = false; }, 100);
		}
	}
	
	function navigateForward() {
		if (historyIndex < navigationHistory.length - 1) {
			isNavigatingHistory = true;
			historyIndex++;
			location.hash = navigationHistory[historyIndex];
			updateNavigationButtons();
			setTimeout(() => { isNavigatingHistory = false; }, 100);
		}
	}
	
	if (backBtn) backBtn.addEventListener('click', navigateBack);
	if (forwardBtn) forwardBtn.addEventListener('click', navigateForward);
	
	// Track hash changes for history
	window.addEventListener('hashchange', () => {
		const hash = location.hash || '#';
		pushHistory(hash);
	});
	
	// Initialize with current hash
	const currentHash = location.hash || '#';
	pushHistory(currentHash);
}

// Favorites management with Jellyfin API
async function toggleFavorite(trackId, currentState) {
	try {
		if (currentState) {
			// Remove from favorites
			const res = await window.api.unmarkFavorite(trackId);
			if (res.ok) {
				return false; // Now unfavorited
			} else {
				throw new Error(res.error || 'Failed to remove favorite');
			}
		} else {
			// Add to favorites
			const res = await window.api.markFavorite(trackId);
			if (res.ok) {
				return true; // Now favorited
			} else {
				throw new Error(res.error || 'Failed to mark favorite');
			}
		}
	} catch (err) {
		console.error('Error toggling favorite:', err);
		showToast(`Error: ${err.message}`, 'error');
		return currentState; // Return unchanged state on error
	}
}

function setupLikeButton() {
	const likeBtn = document.getElementById('likeBtn');
	if (!likeBtn) return;
	
	function updateLikeButton() {
		const currentTrack = window.player?.getCurrentTrack?.();
		if (currentTrack && currentTrack.id) {
			if (currentTrack.isFavorite) {
				likeBtn.classList.add('liked');
				likeBtn.textContent = '♥';
			} else {
				likeBtn.classList.remove('liked');
				likeBtn.textContent = '♡';
			}
		} else {
			likeBtn.classList.remove('liked');
			likeBtn.textContent = '♡';
		}
	}
	
	likeBtn.addEventListener('click', async () => {
		const currentTrack = window.player?.getCurrentTrack?.();
		if (currentTrack && currentTrack.id) {
			const currentState = currentTrack.isFavorite || false;
			
			// Optimistically update UI
			likeBtn.disabled = true;
			
			const newState = await toggleFavorite(currentTrack.id, currentState);
			
			// Update track's favorite state in the queue
			currentTrack.isFavorite = newState;
			updateLikeButton();
			
			if (newState) {
				showToast('Added to Liked Songs', 'success');
			} else {
				showToast('Removed from Liked Songs', 'success');
			}
			
			likeBtn.disabled = false;
		}
	});
	
	// Update like button when track changes
	window.addEventListener('trackChanged', updateLikeButton);
	
	// Initial update
	updateLikeButton();
}

// Simple view routing: start at login then to pages
layout.classList.add('hidden');
renderLogin();
setupLoginWindowControls();
setupWindowControls();
setupCreatePlaylistModal();
setupLogoutModal();
setupNavigation();
setupLikeButton();
setupSearchButton();
setupSettingsButton();
window.addEventListener('hashchange', route);


