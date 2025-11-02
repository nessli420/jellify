const os = require('os');
const crypto = require('crypto');

class JellyfinClient {
	constructor() {
		this.serverUrl = '';
		this.userId = '';
		this.token = '';
		this.deviceId = this.generateDeviceId();
		this.clientName = 'Jellify';
		this.version = '1.0.0';
	}

	generateDeviceId() {
		return crypto.randomUUID ? crypto.randomUUID() : crypto.createHash('sha1').update(String(Math.random())).digest('hex');
	}

	getAuthHeader() {
		const parts = [
			`Client=${this.clientName}`,
			`Device=${os.hostname()}`,
			`DeviceId=${this.deviceId}`,
			`Version=${this.version}`
		];
		return `MediaBrowser ${parts.join(', ')}`;
	}

	assertLoggedIn() {
		if (!this.serverUrl || !this.userId || !this.token) {
			throw new Error('Not authenticated');
		}
	}

	async login({ serverUrl, username, password }) {
		if (!serverUrl || !username || !password) throw new Error('Missing credentials');
		this.serverUrl = serverUrl.replace(/\/$/, '');
		const url = `${this.serverUrl}/Users/AuthenticateByName`;
		const res = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Emby-Authorization': this.getAuthHeader()
			},
			body: JSON.stringify({ Username: username, Pw: password })
		});
		if (!res.ok) {
			throw new Error(`Login failed: ${res.status} ${res.statusText}`);
		}
		const data = await res.json();
		this.userId = data?.User?.Id || '';
		this.token = data?.AccessToken || '';
		if (!this.userId || !this.token) throw new Error('Invalid login response');
		return { user: data.User, token: this.token };
	}

	async apiGet(pathname, query = {}) {
		this.assertLoggedIn();
		const search = new URLSearchParams(query);
		const url = `${this.serverUrl}${pathname}?${search.toString()}`;
		const res = await fetch(url, {
			headers: {
				'X-Emby-Authorization': this.getAuthHeader(),
				'X-Emby-Token': this.token
			}
		});
		if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
		return res.json();
	}

	async apiPost(pathname, body = {}) {
		this.assertLoggedIn();
		const url = `${this.serverUrl}${pathname}`;
		const res = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Emby-Authorization': this.getAuthHeader(),
				'X-Emby-Token': this.token
			},
			body: JSON.stringify(body)
		});
		if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
		// POST may return empty response
		const text = await res.text();
		return text ? JSON.parse(text) : {};
	}

	async apiDelete(pathname) {
		this.assertLoggedIn();
		const url = `${this.serverUrl}${pathname}`;
		const res = await fetch(url, {
			method: 'DELETE',
			headers: {
				'X-Emby-Authorization': this.getAuthHeader(),
				'X-Emby-Token': this.token
			}
		});
		if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
		// DELETE may return empty response
		const text = await res.text();
		return text ? JSON.parse(text) : {};
	}

	async getAlbums({ limit = 30 } = {}) {
		const data = await this.apiGet(`/Users/${this.userId}/Items`, {
			IncludeItemTypes: 'MusicAlbum',
			Recursive: 'true',
			SortBy: 'SortName',
			Limit: String(limit),
			Fields: 'PrimaryImageAspectRatio,UserData'
		});
		return data?.Items || [];
	}

	async getAlbumsPaged({ startIndex = 0, limit = 60 } = {}) {
		const data = await this.apiGet(`/Users/${this.userId}/Items`, {
			IncludeItemTypes: 'MusicAlbum',
			Recursive: 'true',
			SortBy: 'SortName',
			StartIndex: String(startIndex),
			Limit: String(limit),
			Fields: 'PrimaryImageAspectRatio'
		});
		return { items: data?.Items || [], total: data?.TotalRecordCount || 0 };
	}

	async getArtists({ limit = 30 } = {}) {
		const data = await this.apiGet(`/Users/${this.userId}/Items`, {
			IncludeItemTypes: 'MusicArtist',
			Recursive: 'true',
			SortBy: 'SortName',
			Limit: String(limit),
			Fields: 'UserData'
		});
		return data?.Items || [];
	}

	async getArtistsPaged({ startIndex = 0, limit = 60 } = {}) {
		const data = await this.apiGet(`/Users/${this.userId}/Items`, {
			IncludeItemTypes: 'MusicArtist',
			Recursive: 'true',
			SortBy: 'SortName',
			StartIndex: String(startIndex),
			Limit: String(limit)
		});
		return { items: data?.Items || [], total: data?.TotalRecordCount || 0 };
	}

	async getPlaylists({ limit = 30 } = {}) {
		const data = await this.apiGet(`/Users/${this.userId}/Items`, {
			IncludeItemTypes: 'Playlist',
			Recursive: 'true',
			SortBy: 'SortName',
			Limit: String(limit),
			Fields: 'UserData'
		});
		return data?.Items || [];
	}

	async getPlaylistsPaged({ startIndex = 0, limit = 60 } = {}) {
		const data = await this.apiGet(`/Users/${this.userId}/Items`, {
			IncludeItemTypes: 'Playlist',
			Recursive: 'true',
			SortBy: 'SortName',
			StartIndex: String(startIndex),
			Limit: String(limit),
			Fields: 'UserData'
		});
		return { items: data?.Items || [], total: data?.TotalRecordCount || 0 };
	}

	async getAlbumTracks(albumId) {
		if (!albumId) throw new Error('albumId required');
		// Fetch tracks within album via user-scoped Items query
		const data = await this.apiGet(`/Users/${this.userId}/Items`, {
			ParentId: albumId,
			IncludeItemTypes: 'Audio',
			Recursive: 'true',
			SortBy: 'IndexNumber,SortName',
			Limit: '10000'
		});
		return data?.Items || [];
	}

	async getPlaylistTracks(playlistId) {
		if (!playlistId) throw new Error('playlistId required');
		const data = await this.apiGet(`/Playlists/${playlistId}/Items`, { 
			Recursive: 'true', 
			SortBy: 'SortName',
			Limit: '10000'
		});
		return data?.Items || [];
	}

	async getArtistSongs(artistId, { limit = 10000 } = {}) {
		if (!artistId) throw new Error('artistId required');
		const data = await this.apiGet(`/Users/${this.userId}/Items`, {
			IncludeItemTypes: 'Audio',
			Recursive: 'true',
			ArtistIds: artistId,
			SortBy: 'Album,IndexNumber,SortName',
			Limit: String(limit)
		});
		return data?.Items || [];
	}

	async getArtistAlbums(artistId, { limit = 10000 } = {}) {
		if (!artistId) throw new Error('artistId required');
		const data = await this.apiGet(`/Users/${this.userId}/Items`, {
			IncludeItemTypes: 'MusicAlbum',
			Recursive: 'true',
			ArtistIds: artistId,
			SortBy: 'ProductionYear,SortName',
			SortOrder: 'Descending',
			Limit: String(limit),
			Fields: 'PrimaryImageAspectRatio,UserData'
		});
		return data?.Items || [];
	}

	async getItem(itemId) {
		if (!itemId) throw new Error('itemId required');
		const data = await this.apiGet(`/Items/${itemId}`, { Fields: 'UserData,OwnerUserId' });
		
		// If it's a playlist, try to fetch the owner's name and image
		if (data.Type === 'Playlist') {
			const ownerId = data.OwnerUserId || data.UserId;
			if (ownerId) {
				try {
					const user = await this.apiGet(`/Users/${ownerId}`);
					data.OwnerUserId = ownerId; // Ensure OwnerUserId is set
					data.OwnerName = user.Name || '';
					data.OwnerImage = this.getImageUrl(user, 'Primary', 40);
				} catch (err) {
					console.error('Failed to fetch playlist owner:', err);
				}
			} else {
				// If no owner ID, assume it's the current user
				try {
					const user = await this.apiGet(`/Users/${this.userId}`);
					data.OwnerUserId = this.userId; // Set current user as owner
					data.OwnerName = user.Name || '';
					data.OwnerImage = this.getImageUrl(user, 'Primary', 40);
				} catch (err) {
					console.error('Failed to fetch current user:', err);
				}
			}
		}
		
		return data;
	}

	getImageUrl(item, type = 'Primary', maxWidth = 300) {
		if (!item?.Id) return '';
		// Check if the item has the specified image type
		if (item.ImageTags && item.ImageTags[type]) {
			return `${this.serverUrl}/Items/${item.Id}/Images/${type}?maxWidth=${maxWidth}&quality=90&tag=${encodeURIComponent(item.ImageTags[type])}&api_key=${this.token}`;
		}
		// For users, use Users endpoint
		if (item.Type === 'User' || !item.Type) {
			return `${this.serverUrl}/Users/${item.Id}/Images/${type}?maxWidth=${maxWidth}&quality=90&api_key=${this.token}`;
		}
		return '';
	}

	getAudioImageUrl(item, maxWidth = 140) {
		if (!item) return '';
		// Prefer album artwork for audio items
		if (item.AlbumId) {
			return `${this.serverUrl}/Items/${item.AlbumId}/Images/Primary?maxWidth=${maxWidth}&quality=90&X-Emby-Token=${this.token}`;
		}
		return this.getImageUrl(item, 'Primary', maxWidth);
	}

	getStreamUrl(itemId) {
		this.assertLoggedIn();
		// Prefer a progressive MP3 stream for broad audio <audio> support
		const params = new URLSearchParams({
			static: 'true',
			api_key: this.token,
			audioCodec: 'mp3',
			maxAudioChannels: '2',
			transcodingProtocol: 'progressive',
			maxStreamingBitrate: '192000'
		});
		return `${this.serverUrl}/Audio/${itemId}/stream.mp3?${params.toString()}`;
	}

	async getLyrics(itemId) {
		this.assertLoggedIn();
		
		try {
			console.log('Fetching lyrics for item:', itemId);
			
			// First, get item details to check for lyrics
			const item = await this.apiGet(`/Users/${this.userId}/Items/${itemId}`);
			console.log('Item details:', { 
				name: item?.Name, 
				hasMediaStreams: !!item?.MediaStreams,
				streamCount: item?.MediaStreams?.length 
			});
			
			// Check if item has lyric streams
			if (item && item.MediaStreams) {
				console.log('Media streams:', item.MediaStreams.map(s => ({ Type: s.Type, Codec: s.Codec, Index: s.Index })));
				const lyricsStream = item.MediaStreams.find(s => s.Type === 'Lyric' || s.Codec === 'lrc' || s.Codec === 'srt');
				
				if (lyricsStream) {
					console.log('Found lyrics stream:', lyricsStream);
					
					// Try to get lyrics via the item's lyric endpoint
					try {
						const lyricsUrl = `${this.serverUrl}/Audio/${itemId}/Lyrics?api_key=${this.token}`;
						console.log('Trying lyrics endpoint:', lyricsUrl);
						const response = await fetch(lyricsUrl);
						console.log('Lyrics endpoint response:', response.status);
						
						if (response.ok) {
							const lyricsData = await response.json();
							console.log('Lyrics data received:', lyricsData);
							
							// Handle different response formats
							let lyricsText = null;
							
							// Check if Lyrics property exists
							if (lyricsData.Lyrics) {
								const lyrics = lyricsData.Lyrics;
								
								// If it's an array of objects with Text property
								if (Array.isArray(lyrics)) {
									lyricsText = lyrics
										.map(l => l.Text || l.Line || '')
										.filter(text => text.trim() !== '')
										.join('\n');
								} 
								// If it's already a string
								else if (typeof lyrics === 'string') {
									lyricsText = lyrics;
								}
							} 
							// If the whole response is an array
							else if (Array.isArray(lyricsData)) {
								lyricsText = lyricsData
									.map(l => l.Text || l.Line || '')
									.filter(text => text.trim() !== '')
									.join('\n');
							}
							// If it's a string response
							else if (typeof lyricsData === 'string') {
								lyricsText = lyricsData;
							}
							
							if (lyricsText) {
								console.log('Extracted lyrics text, length:', lyricsText.length);
								return {
									lyrics: lyricsText,
									metadata: lyricsData.Metadata || {}
								};
							}
						}
					} catch (e) {
						console.log('Lyrics endpoint failed:', e.message);
					}
					
					// Fallback: try delivery URL
					if (lyricsStream.DeliveryUrl) {
						const deliveryUrl = lyricsStream.DeliveryUrl.startsWith('http') 
							? lyricsStream.DeliveryUrl 
							: `${this.serverUrl}${lyricsStream.DeliveryUrl}`;
						console.log('Trying delivery URL:', deliveryUrl);
						
						try {
							const response = await fetch(deliveryUrl, {
								headers: { 'X-Emby-Token': this.token }
							});
							console.log('Delivery URL response:', response.status);
							
						if (response.ok) {
							const contentType = response.headers.get('content-type');
							let lyricsText;
							
							// Handle JSON or text response
							if (contentType && contentType.includes('application/json')) {
								const data = await response.json();
								console.log('Delivery URL JSON response:', data);
								
								// If it's an array of objects with Text property
								if (Array.isArray(data)) {
									lyricsText = data
										.map(l => l.Text || l.Line || '')
										.filter(text => text.trim() !== '')
										.join('\n');
								}
								// If it has a Lyrics property
								else if (data.Lyrics) {
									if (Array.isArray(data.Lyrics)) {
										lyricsText = data.Lyrics
											.map(l => l.Text || l.Line || '')
											.filter(text => text.trim() !== '')
											.join('\n');
									} else {
										lyricsText = data.Lyrics;
									}
								}
								// Fallback to string representation
								else {
									lyricsText = data.lyrics || JSON.stringify(data);
								}
							} else {
								lyricsText = await response.text();
								
								// Check if the text is actually JSON
								try {
									const parsed = JSON.parse(lyricsText);
									if (Array.isArray(parsed)) {
										lyricsText = parsed
											.map(l => l.Text || l.Line || '')
											.filter(text => text.trim() !== '')
											.join('\n');
									}
								} catch (e) {
									// Not JSON, keep as plain text
								}
							}
							
							console.log('Lyrics text received, length:', lyricsText.length);
							return {
								lyrics: lyricsText,
								metadata: { format: lyricsStream.Codec || 'txt' }
							};
						}
						} catch (e) {
							console.log('Delivery URL failed:', e.message);
						}
					}
				} else {
					console.log('No lyric streams found in MediaStreams');
				}
			}
			
			// Try the direct lyrics API endpoint
			try {
				console.log('Trying direct API endpoint');
				const data = await this.apiGet(`/Audio/${itemId}/Lyrics`);
				console.log('Direct API response:', { hasData: !!data, hasLyrics: !!data?.Lyrics });
				
				if (data && data.Lyrics) {
					return {
						lyrics: data.Lyrics,
						metadata: data.Metadata || {}
					};
				}
			} catch (e) {
				console.log('Direct API endpoint failed:', e.message);
			}
			
			console.log('No lyrics found via any method');
			return null;
		} catch (err) {
			console.error('Error fetching lyrics:', err);
			return null;
		}
	}

	async createPlaylist(name, description = '') {
		if (!name) throw new Error('Playlist name required');
		this.assertLoggedIn();
		
		const data = await this.apiPost('/Playlists', {
			Name: name,
			Description: description,
			UserId: this.userId,
			MediaType: 'Audio'
		});
		
		return data;
	}

	async markFavorite(itemId) {
		if (!itemId) throw new Error('Item ID required');
		this.assertLoggedIn();
		
		await this.apiPost(`/Users/${this.userId}/FavoriteItems/${itemId}`, {});
		return { success: true };
	}

	async unmarkFavorite(itemId) {
		if (!itemId) throw new Error('Item ID required');
		this.assertLoggedIn();
		
		await this.apiDelete(`/Users/${this.userId}/FavoriteItems/${itemId}`);
		return { success: true };
	}

	async getFavoriteSongs({ limit = 10000 } = {}) {
		this.assertLoggedIn();
		
		const data = await this.apiGet(`/Users/${this.userId}/Items`, {
			IncludeItemTypes: 'Audio',
			Recursive: 'true',
			Filters: 'IsFavorite',
			SortBy: 'DateCreated',
			SortOrder: 'Descending',
			Limit: String(limit)
		});
		
		return data?.Items || [];
	}

	async search(query, { limit = 50 } = {}) {
		if (!query) return { Albums: [], Artists: [], Songs: [], Playlists: [], Users: [] };
		this.assertLoggedIn();
		
		const data = await this.apiGet(`/Users/${this.userId}/Items`, {
			SearchTerm: query,
			Recursive: 'true',
			Limit: String(limit),
			Fields: 'PrimaryImageAspectRatio'
		});
		
		const items = data?.Items || [];
		
		// Search users separately
		const users = await this.searchUsers(query);
		
		// Categorize results
		const results = {
			Albums: items.filter(i => i.Type === 'MusicAlbum'),
			Artists: items.filter(i => i.Type === 'MusicArtist'),
			Songs: items.filter(i => i.Type === 'Audio'),
			Playlists: items.filter(i => i.Type === 'Playlist'),
			Users: users
		};
		
		return results;
	}

	async searchUsers(query) {
		this.assertLoggedIn();
		
		try {
			const data = await this.apiGet('/Users');
			const allUsers = data || [];
			
			// Filter users by name matching query (case-insensitive)
			const searchLower = query.toLowerCase();
			return allUsers.filter(user => 
				user.Name && user.Name.toLowerCase().includes(searchLower)
			);
		} catch (err) {
			console.error('Failed to search users:', err);
			return [];
		}
	}

	async getUserById(userId) {
		this.assertLoggedIn();
		
		const data = await this.apiGet(`/Users/${userId}`);
		return data || null;
	}

	async getUserRecentlyPlayed(userId, { limit = 20 } = {}) {
		this.assertLoggedIn();
		
		const data = await this.apiGet(`/Users/${userId}/Items`, {
			SortBy: 'DatePlayed',
			SortOrder: 'Descending',
			IncludeItemTypes: 'Audio',
			Filters: 'IsPlayed',
			Recursive: 'true',
			Limit: String(limit),
			Fields: 'PrimaryImageAspectRatio,DateCreated'
		});
		
		return data?.Items || [];
	}

	async getLibrary({ type = 'all', sortBy = 'SortName', limit = 50, startIndex = 0 } = {}) {
		this.assertLoggedIn();
		
		// Use existing working methods instead of a single API call
		let items = [];
		let totalCounts = { albums: 0, artists: 0, playlists: 0, songs: 0 };
		
		if (type === 'all') {
		// For "all" type, fetch each type separately with pagination
		// Use full limit for each type to get more items
		const itemsPerType = limit; // Use full limit per type instead of dividing
		const startPerType = Math.floor(startIndex / 3);
		
		const [albumsData, artistsData, playlistsData] = await Promise.all([
			this.apiGet(`/Users/${this.userId}/Items`, {
				IncludeItemTypes: 'MusicAlbum',
				Recursive: 'true',
				SortBy: sortBy,
				StartIndex: String(startPerType),
				Limit: String(itemsPerType),
				Fields: 'PrimaryImageAspectRatio,Genres,UserData'
			}),
			this.apiGet(`/Users/${this.userId}/Items`, {
				IncludeItemTypes: 'MusicArtist',
				Recursive: 'true',
				SortBy: sortBy,
				StartIndex: String(startPerType),
				Limit: String(itemsPerType),
				Fields: 'PrimaryImageAspectRatio,Genres,UserData'
			}),
			this.apiGet(`/Items`, {
			IncludeItemTypes: 'Playlist',
			Recursive: 'true',
			SortBy: sortBy,
			StartIndex: String(startPerType),
			Limit: String(itemsPerType),
			Fields: 'PrimaryImageAspectRatio,Genres,UserData,Path',
			UserId: this.userId
			})
		]);
			items = [
				...(albumsData?.Items || []),
				...(artistsData?.Items || []),
				...(playlistsData?.Items || [])
			];
			totalCounts.albums = albumsData?.TotalRecordCount || 0;
			totalCounts.artists = artistsData?.TotalRecordCount || 0;
			totalCounts.playlists = playlistsData?.TotalRecordCount || 0;
		} else if (type === 'albums') {
			const data = await this.apiGet(`/Users/${this.userId}/Items`, {
				IncludeItemTypes: 'MusicAlbum',
				Recursive: 'true',
				SortBy: sortBy,
				StartIndex: String(startIndex),
				Limit: String(limit),
				Fields: 'PrimaryImageAspectRatio,Genres,UserData'
			});
			items = data?.Items || [];
			totalCounts.albums = data?.TotalRecordCount || 0;
		} else if (type === 'artists') {
			const data = await this.apiGet(`/Users/${this.userId}/Items`, {
				IncludeItemTypes: 'MusicArtist',
				Recursive: 'true',
				SortBy: sortBy,
				StartIndex: String(startIndex),
				Limit: String(limit),
				Fields: 'PrimaryImageAspectRatio,Genres,UserData'
			});
			items = data?.Items || [];
			totalCounts.artists = data?.TotalRecordCount || 0;
	} else if (type === 'playlists') {
		const data = await this.apiGet(`/Items`, {
			IncludeItemTypes: 'Playlist',
			Recursive: 'true',
			SortBy: sortBy,
			StartIndex: String(startIndex),
			Limit: String(limit),
			Fields: 'PrimaryImageAspectRatio,Genres,UserData',
			UserId: this.userId
		});
		items = data?.Items || [];
		totalCounts.playlists = data?.TotalRecordCount || 0;
		} else if (type === 'songs') {
			const data = await this.apiGet(`/Users/${this.userId}/Items`, {
				IncludeItemTypes: 'Audio',
				Recursive: 'true',
				SortBy: sortBy,
				StartIndex: String(startIndex),
				Limit: String(limit),
				Fields: 'PrimaryImageAspectRatio,Genres,UserData'
			});
			items = data?.Items || [];
			totalCounts.songs = data?.TotalRecordCount || 0;
		}
		
		console.log(`getLibrary(type="${type}", startIndex=${startIndex}, limit=${limit}) returned ${items.length} items`);
		return { items, totalCounts };
	}

	async getGenres() {
		this.assertLoggedIn();
		
		const data = await this.apiGet('/MusicGenres', {
			UserId: this.userId,
			SortBy: 'SortName',
			SortOrder: 'Ascending'
		});
		
		return data?.Items || [];
	}

	async getUserProfile() {
		this.assertLoggedIn();
		
		const data = await this.apiGet(`/Users/${this.userId}`);
		return data || {};
	}

	async getAllUsers() {
		this.assertLoggedIn();
		const data = await this.apiGet('/Users');
		return data || [];
	}

	async getRecentlyPlayed({ limit = 20 } = {}) {
		this.assertLoggedIn();
		
		const data = await this.apiGet(`/Users/${this.userId}/Items`, {
			SortBy: 'DatePlayed',
			SortOrder: 'Descending',
			IncludeItemTypes: 'Audio',
			Filters: 'IsPlayed',
			Recursive: 'true',
			Limit: String(limit),
			Fields: 'PrimaryImageAspectRatio,DateCreated'
		});
		
		return data?.Items || [];
	}

	async getSessions() {
		this.assertLoggedIn();
		
		const data = await this.apiGet('/Sessions', {
			ControllableByUserId: this.userId
		});
		
		return data || [];
	}

	async getPlaybackInfo() {
		this.assertLoggedIn();
		
		const sessions = await this.getSessions();
		// Find the current user's session with active playback
		const userSession = sessions.find(s => s.UserId === this.userId && s.NowPlayingItem);
		
		return userSession || null;
	}

	async addToPlaylist(playlistId, itemId) {
		if (!playlistId || !itemId) throw new Error('Playlist ID and Item ID required');
		this.assertLoggedIn();
		
		// Jellyfin expects Ids and UserId as query parameters, not in body
		const url = `${this.serverUrl}/Playlists/${playlistId}/Items?ids=${itemId}&userId=${this.userId}`;
		const res = await fetch(url, {
			method: 'POST',
			headers: {
				'X-Emby-Authorization': this.getAuthHeader(),
				'X-Emby-Token': this.token
			}
		});
		
		if (!res.ok) {
			const errorText = await res.text();
			throw new Error(`Failed to add to playlist: ${res.status} ${res.statusText} - ${errorText}`);
		}
		
		// Response may be empty
		const text = await res.text();
		return text ? JSON.parse(text) : { success: true };
	}

	async removeFromPlaylist(playlistId, entryId) {
		if (!playlistId || !entryId) throw new Error('Playlist ID and Entry ID required');
		this.assertLoggedIn();
		
		// Note: Jellyfin expects the EntryId (playlist item ID), not the item ID itself
		// For simplicity, we'll try to find the entry by item ID
		try {
			const playlist = await this.getPlaylistTracks(playlistId);
			const entry = playlist.find(item => item.Id === entryId);
			
			if (!entry || !entry.PlaylistItemId) {
				throw new Error('Item not found in playlist');
			}
			
			await this.apiDelete(`/Playlists/${playlistId}/Items?EntryIds=${entry.PlaylistItemId}`);
			return { success: true };
		} catch (error) {
			console.error('Error removing from playlist:', error);
			throw error;
		}
	}

	async updatePlaylist(playlistId, data) {
		if (!playlistId) throw new Error('Playlist ID required');
		this.assertLoggedIn();
		
		console.log('updatePlaylist called with:', { playlistId, data });
		
		// For renaming, we only need to send the Name field
		// DO NOT send Ids field as that would modify the playlist contents
		const requestBody = {
			Name: data.name
		};
		
		// Only include Ids if explicitly provided (for other operations like reordering)
		if (data.ids !== undefined) {
			requestBody.Ids = data.ids;
		}
		
		console.log('Request body:', requestBody);
		
		const url = `${this.serverUrl}/Playlists/${playlistId}`;
		console.log('Update URL:', url);
		
		const res = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Emby-Authorization': this.getAuthHeader(),
				'X-Emby-Token': this.token
			},
			body: JSON.stringify(requestBody)
		});
		
		console.log('Update response status:', res.status);
		
		if (!res.ok) {
			const errorText = await res.text();
			console.error('Update failed:', res.status, errorText);
			throw new Error(`Failed to update playlist: ${res.status} ${res.statusText} - ${errorText}`);
		}
		
		const responseText = await res.text();
		console.log('Update response:', responseText);
		
		return { success: true };
	}

	async updatePlaylistCover(playlistId, imageData) {
		if (!playlistId || !imageData) throw new Error('Playlist ID and image data required');
		this.assertLoggedIn();
		
		console.log('updatePlaylistCover called for playlist:', playlistId);
		
		// Note: Jellyfin playlists don't support custom cover images through the API
		// The playlist cover is automatically generated from the first items in the playlist
		// This is a limitation of Jellyfin, not our application
		
		throw new Error('Jellyfin does not support custom cover art for playlists. Playlist covers are automatically generated from the songs within them. To change the cover, modify which song appears first in the playlist.');
	}

	async removePlaylistCover(playlistId) {
		if (!playlistId) throw new Error('Playlist ID required');
		this.assertLoggedIn();
		
		await this.apiDelete(`/Items/${playlistId}/Images/Primary`);
		return { success: true };
	}

	async deletePlaylist(playlistId) {
		if (!playlistId) throw new Error('Playlist ID required');
		this.assertLoggedIn();
		
		await this.apiDelete(`/Items/${playlistId}`);
		return { success: true };
	}

	// Playback reporting methods
	async reportPlaybackStart(itemId, canSeek = true, isMuted = false, isPaused = false) {
		this.assertLoggedIn();
		
		const data = {
			ItemId: itemId,
			CanSeek: canSeek,
			IsMuted: isMuted,
			IsPaused: isPaused,
			PlayMethod: 'DirectStream',
			PlaySessionId: this.deviceId
		};
		
		try {
			await this.apiPost(`/Sessions/Playing`, data);
			return { success: true };
		} catch (err) {
			console.error('Failed to report playback start:', err);
			return { success: false, error: err.message };
		}
	}
	
	async reportPlaybackProgress(itemId, positionTicks, isPaused = false, isMuted = false) {
		this.assertLoggedIn();
		
		const data = {
			ItemId: itemId,
			PositionTicks: positionTicks,
			IsPaused: isPaused,
			IsMuted: isMuted,
			PlayMethod: 'DirectStream',
			PlaySessionId: this.deviceId
		};
		
		try {
			await this.apiPost(`/Sessions/Playing/Progress`, data);
			return { success: true };
		} catch (err) {
			console.error('Failed to report playback progress:', err);
			return { success: false, error: err.message };
		}
	}
	
	async reportPlaybackStopped(itemId, positionTicks) {
		this.assertLoggedIn();
		
		const data = {
			ItemId: itemId,
			PositionTicks: positionTicks,
			PlaySessionId: this.deviceId
		};
		
		try {
			const response = await this.apiPost(`/Sessions/Playing/Stopped`, data);
			console.log(`Playback stopped reported for item ${itemId} at position ${positionTicks}`);
			return { success: true };
		} catch (err) {
			console.error('Failed to report playback stopped:', err);
			return { success: false, error: err.message };
		}
	}
	
	async stopAllSessions() {
		this.assertLoggedIn();
		
		try {
			const sessions = await this.getSessions();
			const deviceSessions = sessions.filter(s => s.DeviceId === this.deviceId || s.Client === this.clientName);
			
			for (const session of deviceSessions) {
				if (session.NowPlayingItem) {
					try {
						const positionTicks = session.PlayState?.PositionTicks || 0;
						await this.reportPlaybackStopped(session.NowPlayingItem.Id, positionTicks);
						console.log(`Stopped session ${session.Id} for device ${this.deviceId}`);
					} catch (err) {
						console.error(`Failed to stop session ${session.Id}:`, err);
					}
				}
			}
			
			return { success: true };
		} catch (err) {
			console.error('Failed to stop all sessions:', err);
			return { success: false, error: err.message };
		}
	}
	
	async getUserItemData(itemId) {
		this.assertLoggedIn();
		
		try {
			const data = await this.apiGet(`/Users/${this.userId}/Items/${itemId}`);
			return data?.UserData || null;
		} catch (err) {
			console.error('Failed to get user item data:', err);
			return null;
		}
	}

	// Note: Playback settings are stored locally as Jellyfin API doesn't allow client modification
	// of user configuration. These settings are used client-side for playback decisions.
}

module.exports = JellyfinClient;


