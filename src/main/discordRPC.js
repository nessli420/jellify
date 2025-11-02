const net = require('net');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { DateTime } = require('luxon');
const { z } = require('zod');

// Session schema - made more lenient to handle edge cases
const SessionSchema = z.object({
	UserName: z.string(),
	NowPlayingItem: z.object({
		Id: z.string(),
		Type: z.enum(['Audio']),
		Album: z.string().optional(),
		AlbumId: z.string().optional(),
		Artists: z.array(z.string()).optional(),
		Name: z.string(),
		ProductionYear: z.number().optional(),
		RunTimeTicks: z.number(),
	}),
	PlayState: z.object({
		IsPaused: z.boolean(),
		PositionTicks: z.number(),
	}),
});

const ACTIVITY_TYPE = {
	PLAYING: 0,
	STREAMING: 1,
	LISTENING: 2,
	WATCHING: 3,
	CUSTOM: 4,
	COMPETING: 5,
};

const opCodes = {
	HANDSHAKE: 0,
	FRAME: 1,
	CLOSE: 2,
	PING: 3,
	PONG: 4,
};

class DiscordRPCManager {
	constructor() {
		// Note: The "Listening to [App Name]" text in Discord is determined by the Discord Application name,
		// not the client ID. To show "Listening to Jellify" instead of "Jellyfin", you need to:
		// 1. Go to https://discord.com/developers/applications
		// 2. Create a new application named "Jellify" (or rename an existing one)
		// 3. Copy the Application ID
		// 4. Paste it into the Discord Client ID field in Jellify settings
		this.clientId = '1355908069091180664'; // Default client ID - change to your own Discord application ID for "Jellify"
		this.enabled = false;
		this.socket = null;
		this.connected = false;
		this.handshakeSent = false;
		this.isConnecting = false;
		this.updateInterval = null;
		this.jellyfinUrl = '';
		this.jellyfinApiKey = '';
		this.jellyfinUsers = [];
		this.settingsPath = path.join(app.getPath('userData'), 'discord-rpc-settings.json');
		
		// Track last activity to detect changes
		this.lastActivityHash = null;
		
		const migrated = this.loadSettings();
		
		// If client ID was migrated and RPC is enabled, we'll reconnect after app is ready
		if (migrated && this.enabled) {
			console.log('Client ID was migrated, will reconnect Discord RPC after app is ready');
		}
	}

	/**
	 * Get Discord IPC pipe path based on platform
	 */
	getDiscordPipe() {
		switch (process.platform) {
			case 'win32':
				return '\\\\.\\pipe\\discord-ipc-0';
			case 'linux':
				return `/run/user/${os.userInfo().uid}/discord-ipc-0`;
			case 'darwin':
				return `${process.env.TMPDIR || '/tmp'}/discord-ipc-0`;
			default:
				throw new Error(`Unsupported platform: ${process.platform}`);
		}
	}

	/**
	 * Create a packet for Discord IPC
	 */
	createPacket(opCode, payload) {
		const data = JSON.stringify(payload);
		const length = Buffer.byteLength(data);
		const packet = Buffer.alloc(8 + length);
		
		packet.writeInt32LE(opCode, 0);
		packet.writeInt32LE(length, 4);
		packet.write(data, 8);
		
		return packet;
	}

	/**
	 * Write to socket
	 */
	writeSocket(opCode, payload) {
		return new Promise((resolve, reject) => {
			if (!this.socket || !this.socket.writable) {
				reject(new Error('Socket not connected'));
				return;
			}

			const packet = this.createPacket(opCode, payload);
			this.socket.write(packet, (error) => {
				if (error) {
					reject(error);
				} else {
					resolve();
				}
			});
		});
	}

	/**
	 * Send handshake to Discord
	 */
	async sendHandshake() {
		if (!this.enabled) return;

		const handshakePayload = {
			v: 1,
			client_id: this.clientId
		};

		console.log(`Sending Discord RPC handshake with client ID: ${this.clientId}`);

		try {
			await this.writeSocket(opCodes.HANDSHAKE, handshakePayload);
			this.handshakeSent = true;
			console.log('Discord RPC handshake sent successfully');
		} catch (error) {
			console.error('Failed to send Discord RPC handshake:', error);
			throw error;
		}
	}

	/**
	 * Send activity frame to Discord
	 */
	async sendActivityFrame(activity) {
		// Allow sending null activity even if disabled (for cleanup)
		if (!this.enabled && activity !== null) return;

		// If socket is not connected, skip (unless we're explicitly clearing)
		if (!this.socket || !this.connected) {
			if (activity === null) {
				// If clearing and not connected, that's fine - nothing to clear
				return;
			}
			return;
		}

		const activityPayload = {
			cmd: 'SET_ACTIVITY',
			args: {
				pid: process.pid,
				activity: activity
			},
			nonce: Math.random().toString(36).substring(2)
		};

		try {
			await this.writeSocket(opCodes.FRAME, activityPayload);
			if (activity === null) {
				console.log('Discord RPC activity cleared');
			}
		} catch (error) {
			console.error('Failed to send Discord RPC activity:', error);
		}
	}

	/**
	 * Fetch first matching session from Jellyfin API
	 */
	async fetchFirstSession(usernames) {
		if (!this.jellyfinUrl || !this.jellyfinApiKey) {
			return null;
		}

		try {
			const headers = new Headers();
			headers.set('X-Emby-Token', this.jellyfinApiKey);

			const response = await fetch(`${this.jellyfinUrl}/Sessions`, {
				headers
			});

			if (!response.ok) {
				console.error(`Failed to fetch sessions: ${response.status} ${response.statusText}`);
				return null;
			}

			const responseJson = await response.json();
			const rawSessions = z.array(z.unknown()).parse(responseJson);

			// Track seen session IDs to avoid duplicates
			const seenSessionIds = new Set();

			for (const rawSession of rawSessions) {
				// Parse individually so one session having unexpected fields doesn't tank the whole application
				const sessionParseResult = SessionSchema.safeParse(rawSession);

				if (!sessionParseResult.success) {
					// Log parse errors for debugging
					if (rawSession.NowPlayingItem && rawSession.NowPlayingItem.Type === 'Audio') {
						console.log('Session parse failed:', sessionParseResult.error.errors);
						console.log('Session data:', JSON.stringify(rawSession, null, 2));
					}
					continue;
				}

				const session = sessionParseResult.data;

				if (!usernames.includes(session.UserName)) {
					continue;
				}

				if (session.NowPlayingItem.Type !== 'Audio') {
					continue;
				}

				// Ensure we have required fields
				if (!session.NowPlayingItem.Name) {
					console.log('Session missing track name, skipping');
					continue;
				}

				// Skip if we've already seen this session ID (prevents duplicates)
				const sessionId = rawSession.Id || rawSession.SessionId;
				if (sessionId && seenSessionIds.has(sessionId)) {
					continue;
				}
				if (sessionId) {
					seenSessionIds.add(sessionId);
				}

				// Prefer non-paused sessions, but take the first one if all are paused
				return session;
			}

			return null;
		} catch (error) {
			console.error('Error fetching sessions:', error);
			return null;
		}
	}

	/**
	 * Set activity based on current Jellyfin session
	 */
	async setActivity() {
		if (!this.enabled) return;

		// Ensure socket is connected and handshake is sent
		if (!this.socket || !this.connected) {
			console.log('Socket not connected, skipping activity update');
			return;
		}

		if (!this.handshakeSent) {
			console.log('Handshake not sent yet, skipping activity update');
			return;
		}

		// Get session
		const session = await this.fetchFirstSession(this.jellyfinUsers);

		// Show idle activity
		if (session == null) {
			// Only clear if we had an activity before
			if (this.lastActivityHash !== null) {
				console.log('No session. Clearing activity...');
				this.lastActivityHash = null;
				return await this.sendActivityFrame(null);
			}
			return;
		}

		if (session.PlayState.IsPaused) {
			// Only clear if we had an activity before
			if (this.lastActivityHash !== null) {
				console.log('Paused. Clearing activity...');
				this.lastActivityHash = null;
				return await this.sendActivityFrame(null);
			}
			return;
		}

		// Show playing activity
		const albumId = session.NowPlayingItem.AlbumId;
		const albumArtUrl = albumId ? `${this.jellyfinUrl}/Items/${albumId}/Images/Primary` : undefined;
		const positionSeconds = session.PlayState.PositionTicks / 10_000_000;
		const runtimeSeconds = session.NowPlayingItem.RunTimeTicks / 10_000_000;

		const startDateTime = DateTime.utc().minus({ seconds: positionSeconds });
		const endDateTime = startDateTime.plus({ seconds: runtimeSeconds });

		const artists = session.NowPlayingItem.Artists && session.NowPlayingItem.Artists.length > 0
			? session.NowPlayingItem.Artists.map((artist) => artist.trim()).join(', ')
			: 'Unknown Artist';

		const albumName = session.NowPlayingItem.Album || 'Unknown Album';
		
		// Check if album is "Unknown" or "Unknown Album" - don't show album art if so
		const isUnknownAlbum = !albumName || 
			albumName.trim().toLowerCase() === 'unknown' || 
			albumName.trim().toLowerCase() === 'unknown album';

		// Create a hash of the current activity to detect changes (excluding position for song changes)
		// We only care about song/album/artist changes, not position updates
		const activityHash = JSON.stringify({
			song: session.NowPlayingItem.Name,
			artists: artists,
			album: albumName,
			albumId: albumId
		});

		// Only update if the activity actually changed
		if (this.lastActivityHash === activityHash) {
			return; // No change, skip update
		}

		this.lastActivityHash = activityHash;

		console.log(`Setting activity to ${session.NowPlayingItem.Name} by ${artists}...`);

		const activity = {
			type: ACTIVITY_TYPE.LISTENING,
			details: session.NowPlayingItem.Name,
			state: artists,
			timestamps: {
				start: startDateTime.toMillis(),
				end: endDateTime.toMillis(),
			},
		};

		// Add album art if available (always show cover art)
		// Only include album name text if it's not "Unknown"
		if (albumArtUrl && albumId) {
			activity.assets = {
				large_image: albumArtUrl,
			};
			// Only add album name text if it's not "Unknown"
			if (!isUnknownAlbum) {
				activity.assets.large_text = albumName;
			}
		}

		await this.sendActivityFrame(activity);
	}

	/**
	 * Connect to Discord IPC and start polling
	 */
	async connect() {
		if (!this.enabled) {
			return false;
		}

		if (!this.jellyfinUrl || !this.jellyfinApiKey || this.jellyfinUsers.length === 0) {
			console.log('Discord RPC: Missing configuration (server URL, API key, or users)');
			return false;
		}

		// Prevent multiple simultaneous connection attempts
		if (this.isConnecting) {
			console.log('Discord RPC: Already connecting, skipping...');
			return false;
		}

		// If already connected, don't reconnect
		if (this.socket && this.connected && this.handshakeSent) {
			console.log('Discord RPC: Already connected, skipping...');
			return true;
		}

		// Clean up any existing connection first
		this.disconnect();

		this.isConnecting = true;

		try {
			const pipePath = this.getDiscordPipe();
			this.socket = net.createConnection(pipePath);

			this.socket.on('connect', async () => {
				console.log('Discord RPC socket connected');
				this.connected = true;
				this.handshakeSent = false;
				this.isConnecting = false;
				
				try {
					await this.sendHandshake();
					// Start polling immediately
					await this.setActivity();
					// Then poll every 500ms for very fast updates
					if (this.updateInterval) {
						clearInterval(this.updateInterval);
						this.updateInterval = null;
					}
					this.updateInterval = setInterval(() => {
						this.setActivity();
					}, 500); // Poll every 500ms for very fast updates
				} catch (error) {
					console.error('Failed to handshake:', error);
					this.disconnect();
				}
			});

			this.socket.on('error', (error) => {
				// Discord might not be running, that's okay
				console.log('Discord RPC socket error (Discord may not be running):', error.message);
				this.connected = false;
				this.isConnecting = false;
				
				// Clean up socket
				if (this.socket) {
					try {
						this.socket.destroy();
					} catch (e) {
						// Ignore errors during cleanup
					}
					this.socket = null;
				}
				
				// Try to reconnect after a delay
				if (this.enabled) {
					setTimeout(() => {
						if (this.enabled && !this.socket && !this.isConnecting) {
							this.connect();
						}
					}, 5000);
				}
			});

			this.socket.on('close', () => {
				console.log('Discord RPC socket closed');
				this.connected = false;
				this.handshakeSent = false;
				this.isConnecting = false;
				
				// Clean up socket
				if (this.socket) {
					this.socket = null;
				}
				
				// Try to reconnect after a delay
				if (this.enabled) {
					setTimeout(() => {
						if (this.enabled && !this.socket && !this.isConnecting) {
							this.connect();
						}
					}, 5000);
				}
			});

			// Handle incoming data (responses from Discord)
			this.socket.on('data', (data) => {
				// Discord may send responses, but we don't need to handle them for basic functionality
			});

			return true;
		} catch (error) {
			console.error('Failed to connect to Discord RPC:', error);
			this.connected = false;
			this.isConnecting = false;
			this.socket = null;
			return false;
		}
	}

	/**
	 * Disconnect from Discord IPC
	 */
	async disconnect() {
		// Clear update interval
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
			this.updateInterval = null;
		}

		// Clear activity before disconnecting to prevent stale RPC
		if (this.socket && this.connected) {
			try {
				console.log('Clearing Discord RPC activity before disconnect...');
				// Send clear activity even if handshake wasn't sent (might have been sent before)
				await this.sendActivityFrame(null);
				// Wait a bit to ensure the message is sent before closing socket
				await new Promise(resolve => setTimeout(resolve, 100));
			} catch (error) {
				console.error('Error clearing Discord RPC activity:', error);
			}
		}

		// Close socket
		if (this.socket) {
			try {
				// Remove all event listeners to prevent memory leaks
				this.socket.removeAllListeners();
				this.socket.end();
			} catch (error) {
				console.error('Error closing Discord RPC socket:', error);
			}
			this.socket = null;
		}

		this.connected = false;
		this.handshakeSent = false;
		this.isConnecting = false;
		this.lastActivityHash = null; // Reset activity hash
	}

	/**
	 * Load Discord RPC settings from file
	 */
	loadSettings() {
		let migrated = false;
		try {
			if (fs.existsSync(this.settingsPath)) {
				const data = fs.readFileSync(this.settingsPath, 'utf8');
				const settings = JSON.parse(data);
				// Check if using old default client ID and update to new one
				if (settings.clientId === '1313877917134229524') {
					console.log('Detected old Discord client ID, updating to new default...');
					settings.clientId = '1355908069091180664';
					// Save the updated settings
					fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
					migrated = true;
				}
				this.clientId = settings.clientId || '1355908069091180664';
				this.enabled = settings.enabled || false;
				this.jellyfinUrl = settings.jellyfinUrl || '';
				this.jellyfinApiKey = settings.jellyfinApiKey || '';
				this.jellyfinUsers = settings.jellyfinUsers || [];
				console.log(`Discord RPC settings loaded - Client ID: ${this.clientId}, Enabled: ${this.enabled}`);
			} else {
				console.log(`Discord RPC settings file not found, using defaults - Client ID: ${this.clientId}`);
			}
		} catch (error) {
			console.error('Error loading Discord RPC settings:', error);
			console.log(`Using default Client ID: ${this.clientId}`);
		}
		return migrated;
	}

	/**
	 * Save Discord RPC settings to file
	 */
	saveSettings() {
		try {
			const settings = {
				clientId: this.clientId,
				enabled: this.enabled,
				jellyfinUrl: this.jellyfinUrl,
				jellyfinApiKey: this.jellyfinApiKey,
				jellyfinUsers: this.jellyfinUsers
			};
			fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
		} catch (error) {
			console.error('Error saving Discord RPC settings:', error);
		}
	}

	/**
	 * Update settings
	 */
	updateSettings(jellyfinUrl, jellyfinApiKey, jellyfinUsers, discordClientId, enabled) {
		const wasEnabled = this.enabled;
		const configChanged = this.jellyfinUrl !== jellyfinUrl || 
			this.jellyfinApiKey !== jellyfinApiKey || 
			JSON.stringify(this.jellyfinUsers) !== JSON.stringify(jellyfinUsers) ||
			this.clientId !== discordClientId;
		
		this.jellyfinUrl = jellyfinUrl || '';
		this.jellyfinApiKey = jellyfinApiKey || '';
		this.jellyfinUsers = Array.isArray(jellyfinUsers) ? jellyfinUsers : [];
		const oldClientId = this.clientId;
		this.clientId = discordClientId || this.clientId;
		this.enabled = enabled || false;
		this.saveSettings();

		console.log(`Discord RPC settings updated - Client ID: ${this.clientId} (was: ${oldClientId})`);

		if (this.enabled && !wasEnabled) {
			// Enabling for the first time
			this.connect();
		} else if (!this.enabled && wasEnabled) {
			// Disabling
			this.disconnect();
		} else if (this.enabled && configChanged) {
			// Configuration changed while enabled, restart connection
			console.log('Discord RPC configuration changed, reconnecting...');
			this.disconnect();
			// Wait a bit before reconnecting to ensure cleanup is complete
			setTimeout(() => {
				if (this.enabled) {
					this.connect();
				}
			}, 100);
		}
		// If enabled and config didn't change, do nothing (already running)
	}

	/**
	 * Check if connected
	 */
	isConnected() {
		return this.connected && this.handshakeSent;
	}

	/**
	 * Get current settings
	 */
	getSettings() {
		return {
			clientId: this.clientId,
			enabled: this.enabled,
			jellyfinUrl: this.jellyfinUrl,
			jellyfinApiKey: this.jellyfinApiKey,
			jellyfinUsers: this.jellyfinUsers
		};
	}
}

module.exports = new DiscordRPCManager();
