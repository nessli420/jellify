const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const JellyfinClient = require('./jellyfinClient');

/**
 * Single shared Jellyfin client per app instance.
 */
const jellyfin = new JellyfinClient();

const credentialsPath = path.join(app.getPath('userData'), 'credentials.enc');

function createMainWindow() {
	const mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		backgroundColor: '#000000',
		frame: false,
		titleBarStyle: 'hidden',
		webPreferences: {
			preload: path.join(__dirname, '..', 'preload', 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true
		}
	});

	mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
	
	// Store reference for window controls
	global.mainWindow = mainWindow;
}

app.whenReady().then(() => {
	createMainWindow();

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});

// Store current user info
let currentUser = null;

// IPC handlers
ipcMain.handle('jellyfin:login', async (_event, { serverUrl, username, password }) => {
	try {
		const { user, token } = await jellyfin.login({ serverUrl, username, password });
		currentUser = user;
		return { ok: true, user, token };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:getCurrentUser', async () => {
	try {
		if (!currentUser) return { ok: false, error: 'Not logged in' };
		const imageUrl = jellyfin.getImageUrl(currentUser, 'Primary', 80);
		return { ok: true, user: { ...currentUser, imageUrl } };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:getHome', async () => {
	try {
		const [albums, artists, playlists] = await Promise.all([
			jellyfin.getAlbums({ limit: 50 }),
			jellyfin.getArtists({ limit: 30 }),
			jellyfin.getPlaylists({ limit: 30 })
		]);
		const withImages = (items) => items.map((it) => ({
			id: it.Id,
			title: it.Name,
			subtitle: (it.AlbumArtist || (it.Artists && it.Artists[0]) || ''),
			image: jellyfin.getImageUrl(it)
		}));
		return { ok: true, albums: withImages(albums), artists: withImages(artists), playlists: withImages(playlists) };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:getAlbumTracks', async (_event, albumId) => {
	try {
		const tracks = await jellyfin.getAlbumTracks(albumId);
		const playable = tracks.map((t) => ({
			id: t.Id,
			title: t.Name,
			album: t.Album || '',
			artist: (t.Artists && t.Artists[0]) || (t.AlbumArtists && t.AlbumArtists[0] && t.AlbumArtists[0].Name) || '',
			durationMs: (t.RunTimeTicks || 0) / 10000,
			streamUrl: jellyfin.getStreamUrl(t.Id),
			image: jellyfin.getAudioImageUrl(t),
			isFavorite: t.UserData ? t.UserData.IsFavorite : false
		}));
		return { ok: true, tracks: playable };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:list:albums', async (_e, { startIndex = 0, limit = 60 } = {}) => {
	try {
		const { items, total } = await jellyfin.getAlbumsPaged({ startIndex, limit });
		const albums = items.map((it) => ({ id: it.Id, title: it.Name, subtitle: (it.AlbumArtist || ''), image: jellyfin.getImageUrl(it) }));
		return { ok: true, items: albums, total };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:list:playlists', async (_e, { startIndex = 0, limit = 60 } = {}) => {
	try {
		const { items, total } = await jellyfin.getPlaylistsPaged({ startIndex, limit });
		const playlists = items.map((it) => ({ id: it.Id, title: it.Name, subtitle: '', image: jellyfin.getImageUrl(it) }));
		return { ok: true, items: playlists, total };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:list:artists', async (_e, { startIndex = 0, limit = 60 } = {}) => {
	try {
		const { items, total } = await jellyfin.getArtistsPaged({ startIndex, limit });
		const artists = items.map((it) => ({ id: it.Id, title: it.Name, subtitle: '', image: jellyfin.getImageUrl(it) }));
		return { ok: true, items: artists, total };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:getPlaylistTracks', async (_e, playlistId) => {
	try {
		const tracks = await jellyfin.getPlaylistTracks(playlistId);
		const playable = tracks.map((t) => ({
			id: t.Id,
			title: t.Name,
			album: t.Album || '',
			artist: (t.Artists && t.Artists[0]) || (t.AlbumArtists && t.AlbumArtists[0] && t.AlbumArtists[0].Name) || '',
			durationMs: (t.RunTimeTicks || 0) / 10000,
			streamUrl: jellyfin.getStreamUrl(t.Id),
			image: jellyfin.getAudioImageUrl(t),
			isFavorite: t.UserData ? t.UserData.IsFavorite : false
		}));
		return { ok: true, tracks: playable };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:getArtistSongs', async (_e, artistId) => {
	try {
		const tracks = await jellyfin.getArtistSongs(artistId, { limit: 400 });
		const playable = tracks.map((t) => ({
			id: t.Id,
			title: t.Name,
			album: t.Album || '',
			artist: (t.Artists && t.Artists[0]) || (t.AlbumArtists && t.AlbumArtists[0] && t.AlbumArtists[0].Name) || '',
			durationMs: (t.RunTimeTicks || 0) / 10000,
			streamUrl: jellyfin.getStreamUrl(t.Id),
			image: jellyfin.getAudioImageUrl(t),
			isFavorite: t.UserData ? t.UserData.IsFavorite : false
		}));
		return { ok: true, tracks: playable };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:getItem', async (_e, itemId) => {
	try {
		const item = await jellyfin.getItem(itemId);
		const enriched = { ...item, image: jellyfin.getImageUrl(item, 'Primary', 300) };
		return { ok: true, item: enriched };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:createPlaylist', async (_e, { name, description }) => {
	try {
		const playlist = await jellyfin.createPlaylist(name, description);
		return { ok: true, playlist };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:markFavorite', async (_e, itemId) => {
	try {
		await jellyfin.markFavorite(itemId);
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:unmarkFavorite', async (_e, itemId) => {
	try {
		await jellyfin.unmarkFavorite(itemId);
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:getLyrics', async (_e, itemId) => {
	try {
		const result = await jellyfin.getLyrics(itemId);
		console.log('Main process - lyrics result:', result);
		if (result && result.lyrics) {
			// Ensure lyrics is a string
			let lyricsText = result.lyrics;
			if (typeof lyricsText === 'object') {
				// If it's an object, try to extract the text
				lyricsText = lyricsText.Lyrics || JSON.stringify(lyricsText);
			}
			console.log('Main process - sending lyrics, type:', typeof lyricsText, 'length:', lyricsText?.length);
			return { ok: true, lyrics: lyricsText, metadata: result.metadata || {} };
		}
		return { ok: false, error: 'No lyrics available' };
	} catch (err) {
		console.error('Main process - lyrics error:', err);
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:getFavoriteSongs', async () => {
	try {
		const tracks = await jellyfin.getFavoriteSongs({ limit: 1000 });
		const playable = tracks.map((t) => ({
			id: t.Id,
			title: t.Name,
			album: t.Album || '',
			artist: (t.Artists && t.Artists[0]) || (t.AlbumArtists && t.AlbumArtists[0] && t.AlbumArtists[0].Name) || '',
			durationMs: (t.RunTimeTicks || 0) / 10000,
			streamUrl: jellyfin.getStreamUrl(t.Id),
			image: jellyfin.getAudioImageUrl(t),
			isFavorite: true
		}));
		return { ok: true, tracks: playable };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:addToPlaylist', async (_e, { playlistId, itemId }) => {
	try {
		await jellyfin.addToPlaylist(playlistId, itemId);
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:removeFromPlaylist', async (_e, { playlistId, entryId }) => {
	try {
		await jellyfin.removeFromPlaylist(playlistId, entryId);
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:search', async (_e, query) => {
	try {
		const results = await jellyfin.search(query, { limit: 50 });
		
		// Format albums
		const albums = results.Albums.map((it) => ({ 
			id: it.Id, 
			title: it.Name, 
			subtitle: (it.AlbumArtist || ''), 
			image: jellyfin.getImageUrl(it) 
		}));
		
		// Format artists
		const artists = results.Artists.map((it) => ({ 
			id: it.Id, 
			title: it.Name, 
			subtitle: '', 
			image: jellyfin.getImageUrl(it) 
		}));
		
		// Format songs
		const songs = results.Songs.map((t) => ({
			id: t.Id,
			title: t.Name,
			album: t.Album || '',
			artist: (t.Artists && t.Artists[0]) || (t.AlbumArtists && t.AlbumArtists[0] && t.AlbumArtists[0].Name) || '',
			durationMs: (t.RunTimeTicks || 0) / 10000,
			streamUrl: jellyfin.getStreamUrl(t.Id),
			image: jellyfin.getAudioImageUrl(t),
			isFavorite: t.UserData ? t.UserData.IsFavorite : false
		}));
		
		// Format playlists
		const playlists = results.Playlists.map((it) => ({ 
			id: it.Id, 
			title: it.Name, 
			subtitle: '', 
			image: jellyfin.getImageUrl(it) 
		}));
		
		// Format users
		const users = results.Users.map((u) => ({
			id: u.Id,
			name: u.Name,
			lastLoginDate: u.LastLoginDate,
			lastActivityDate: u.LastActivityDate,
			image: jellyfin.getImageUrl(u, 'Primary', 200),
			isAdministrator: u.Policy?.IsAdministrator || false
		}));
		
		return { ok: true, albums, artists, songs, playlists, users };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:getLibrary', async (_e, options) => {
	try {
		const items = await jellyfin.getLibrary(options);
		
		// Categorize and format items
		const albums = [];
		const artists = [];
		const playlists = [];
		const songs = [];
		
		items.forEach((it) => {
			if (it.Type === 'MusicAlbum') {
				albums.push({
					id: it.Id,
					title: it.Name,
					subtitle: (it.AlbumArtist || ''),
					image: jellyfin.getImageUrl(it),
					type: 'album',
					genres: it.Genres || []
				});
			} else if (it.Type === 'MusicArtist') {
				artists.push({
					id: it.Id,
					title: it.Name,
					subtitle: '',
					image: jellyfin.getImageUrl(it),
					type: 'artist',
					genres: it.Genres || []
				});
			} else if (it.Type === 'Playlist') {
				playlists.push({
					id: it.Id,
					title: it.Name,
					subtitle: '',
					image: jellyfin.getImageUrl(it),
					type: 'playlist',
					genres: []
				});
			} else if (it.Type === 'Audio') {
				songs.push({
					id: it.Id,
					title: it.Name,
					album: it.Album || '',
					artist: (it.Artists && it.Artists[0]) || (it.AlbumArtists && it.AlbumArtists[0] && it.AlbumArtists[0].Name) || '',
					durationMs: (it.RunTimeTicks || 0) / 10000,
					streamUrl: jellyfin.getStreamUrl(it.Id),
					image: jellyfin.getAudioImageUrl(it),
					isFavorite: it.UserData ? it.UserData.IsFavorite : false,
					type: 'song',
					genres: it.Genres || []
				});
			}
		});
		
		return { ok: true, albums, artists, playlists, songs };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:getGenres', async () => {
	try {
		const genres = await jellyfin.getGenres();
		const formatted = genres.map((g) => ({ id: g.Id, name: g.Name }));
		return { ok: true, genres: formatted };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:getUserProfile', async () => {
	try {
		const profile = await jellyfin.getUserProfile();
		
		return {
			ok: true,
			profile: {
				id: profile.Id,
				name: profile.Name,
				serverId: profile.ServerId,
				lastLoginDate: profile.LastLoginDate,
				lastActivityDate: profile.LastActivityDate,
				hasPassword: profile.HasPassword,
				hasConfiguredPassword: profile.HasConfiguredPassword,
				hasConfiguredEasyPassword: profile.HasConfiguredEasyPassword,
				enableAutoLogin: profile.EnableAutoLogin,
				imageUrl: jellyfin.getImageUrl(profile, 'Primary', 300),
				policy: {
					isAdministrator: profile.Policy?.IsAdministrator || false,
					isHidden: profile.Policy?.IsHidden || false,
					isDisabled: profile.Policy?.IsDisabled || false,
					enableAllFolders: profile.Policy?.EnableAllFolders || false,
					enableContentDeletion: profile.Policy?.EnableContentDeletion || false,
					enableContentDownloading: profile.Policy?.EnableContentDownloading || false,
					enableMediaPlayback: profile.Policy?.EnableMediaPlayback || false,
					enablePublicSharing: profile.Policy?.EnablePublicSharing || false
				}
			}
		};
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:getRecentlyPlayed', async (_e, options) => {
	try {
		const items = await jellyfin.getRecentlyPlayed(options);
		
		const tracks = items.map((t) => ({
			id: t.Id,
			title: t.Name,
			album: t.Album || '',
			artist: (t.Artists && t.Artists[0]) || (t.AlbumArtists && t.AlbumArtists[0] && t.AlbumArtists[0].Name) || '',
			durationMs: (t.RunTimeTicks || 0) / 10000,
			streamUrl: jellyfin.getStreamUrl(t.Id),
			image: jellyfin.getAudioImageUrl(t),
			isFavorite: t.UserData ? t.UserData.IsFavorite : false,
			playCount: t.UserData ? t.UserData.PlayCount || 0 : 0,
			lastPlayedDate: t.UserData ? t.UserData.LastPlayedDate : null
		}));
		
		return { ok: true, tracks };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:getPlaybackInfo', async () => {
	try {
		const session = await jellyfin.getPlaybackInfo();
		
		if (!session || !session.NowPlayingItem) {
			return { ok: true, playing: null };
		}
		
		const item = session.NowPlayingItem;
		return {
			ok: true,
			playing: {
				id: item.Id,
				title: item.Name,
				type: item.Type,
				album: item.Album || '',
				artist: (item.Artists && item.Artists[0]) || '',
				image: jellyfin.getAudioImageUrl(item),
				isPaused: session.PlayState?.IsPaused || false,
				positionTicks: session.PlayState?.PositionTicks || 0,
				canSeek: session.PlayState?.CanSeek || false
			}
		};
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:getUserById', async (_e, userId) => {
	try {
		const user = await jellyfin.getUserById(userId);
		
		if (!user) {
			return { ok: false, error: 'User not found' };
		}
		
		return {
			ok: true,
			profile: {
				id: user.Id,
				name: user.Name,
				serverId: user.ServerId,
				lastLoginDate: user.LastLoginDate,
				lastActivityDate: user.LastActivityDate,
				hasPassword: user.HasPassword,
				hasConfiguredPassword: user.HasConfiguredPassword,
				hasConfiguredEasyPassword: user.HasConfiguredEasyPassword,
				enableAutoLogin: user.EnableAutoLogin,
				imageUrl: jellyfin.getImageUrl(user, 'Primary', 300),
				policy: {
					isAdministrator: user.Policy?.IsAdministrator || false,
					isHidden: user.Policy?.IsHidden || false,
					isDisabled: user.Policy?.IsDisabled || false,
					enableAllFolders: user.Policy?.EnableAllFolders || false,
					enableContentDeletion: user.Policy?.EnableContentDeletion || false,
					enableContentDownloading: user.Policy?.EnableContentDownloading || false,
					enableMediaPlayback: user.Policy?.EnableMediaPlayback || false,
					enablePublicSharing: user.Policy?.EnablePublicSharing || false
				}
			}
		};
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

ipcMain.handle('jellyfin:getUserRecentlyPlayed', async (_e, userId, options) => {
	try {
		const items = await jellyfin.getUserRecentlyPlayed(userId, options);
		
		const tracks = items.map((t) => ({
			id: t.Id,
			title: t.Name,
			album: t.Album || '',
			artist: (t.Artists && t.Artists[0]) || (t.AlbumArtists && t.AlbumArtists[0] && t.AlbumArtists[0].Name) || '',
			durationMs: (t.RunTimeTicks || 0) / 10000,
			streamUrl: jellyfin.getStreamUrl(t.Id),
			image: jellyfin.getAudioImageUrl(t),
			isFavorite: t.UserData ? t.UserData.IsFavorite : false,
			playCount: t.UserData ? t.UserData.PlayCount || 0 : 0,
			lastPlayedDate: t.UserData ? t.UserData.LastPlayedDate : null
		}));
		
		return { ok: true, tracks };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

// Settings are stored in localStorage on the renderer side
// These handlers are kept for future server-side settings if needed

// Auto-login: save credentials
ipcMain.handle('auth:saveCredentials', async (_e, { serverUrl, username, password }) => {
	try {
		if (!safeStorage.isEncryptionAvailable()) {
			return { ok: false, error: 'Encryption not available' };
		}
		const data = JSON.stringify({ serverUrl, username, password });
		const encrypted = safeStorage.encryptString(data);
		fs.writeFileSync(credentialsPath, encrypted);
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

// Auto-login: load credentials
ipcMain.handle('auth:loadCredentials', async () => {
	try {
		if (!fs.existsSync(credentialsPath)) return { ok: false };
		const encrypted = fs.readFileSync(credentialsPath);
		const data = safeStorage.decryptString(encrypted);
		const creds = JSON.parse(data);
		return { ok: true, credentials: creds };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

// Auto-login: clear credentials
ipcMain.handle('auth:clearCredentials', async () => {
	try {
		if (fs.existsSync(credentialsPath)) fs.unlinkSync(credentialsPath);
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err && err.message ? err.message : String(err) };
	}
});

// Window controls
ipcMain.handle('window:minimize', () => {
	if (global.mainWindow) global.mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
	if (global.mainWindow) {
		if (global.mainWindow.isMaximized()) {
			global.mainWindow.unmaximize();
		} else {
			global.mainWindow.maximize();
		}
	}
});

ipcMain.handle('window:close', () => {
	if (global.mainWindow) global.mainWindow.close();
});

ipcMain.handle('window:setFullscreen', (_e, flag) => {
	if (global.mainWindow) {
		global.mainWindow.setFullScreen(flag);
	}
});

ipcMain.handle('window:isFullscreen', () => {
	if (global.mainWindow) {
		return global.mainWindow.isFullScreen();
	}
	return false;
});


