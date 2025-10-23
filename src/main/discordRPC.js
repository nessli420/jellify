const DiscordRPC = require('discord-rpc');
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

class DiscordRPCManager {
	constructor() {
		this.clientId = null;
		this.enabled = false;
		this.rpc = null;
		this.connected = false;
		this.currentActivity = null;
		this.reconnectAttempts = 0;
		this.maxReconnectAttempts = 5;
		this.reconnectDelay = 5000; // 5 seconds
		this.activityUpdateTimeout = null;
		this.settingsPath = path.join(app.getPath('userData'), 'discord-settings.json');
		
		// Load settings on init
		this.loadSettings();
	}
	
	/**
	 * Load Discord settings from file
	 */
	loadSettings() {
		try {
			if (fs.existsSync(this.settingsPath)) {
				const data = fs.readFileSync(this.settingsPath, 'utf8');
				const settings = JSON.parse(data);
				this.clientId = settings.clientId || null;
				this.enabled = settings.enabled || false;
			}
		} catch (error) {
			console.error('Error loading Discord settings:', error);
		}
	}
	
	/**
	 * Save Discord settings to file
	 */
	saveSettings() {
		try {
			const settings = {
				clientId: this.clientId,
				enabled: this.enabled
			};
			fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
		} catch (error) {
			console.error('Error saving Discord settings:', error);
		}
	}
	
	/**
	 * Update client ID and reconnect if needed
	 */
	async updateClientId(clientId, enabled) {
		const oldClientId = this.clientId;
		const oldEnabled = this.enabled;
		
		this.clientId = clientId;
		this.enabled = enabled;
		this.saveSettings();
		
		// If client ID changed or enabled state changed, reconnect
		if (oldClientId !== clientId || oldEnabled !== enabled) {
			// Disconnect if currently connected
			if (this.connected) {
				await this.disconnect();
			}
			
			// Reconnect if enabled and has client ID
			if (this.enabled && this.clientId) {
				await this.connect();
			}
		}
	}

	/**
	 * Initialize and connect to Discord RPC
	 */
	async connect() {
		// Check if Discord is enabled and has client ID
		if (!this.enabled) {
			console.log('Discord RPC is disabled in settings');
			return false;
		}
		
		if (!this.clientId) {
			console.log('Discord RPC: No client ID configured');
			return false;
		}
		
		if (this.connected) {
			console.log('Discord RPC already connected');
			return true;
		}

		try {
			// Create RPC client
			this.rpc = new DiscordRPC.Client({ transport: 'ipc' });

			// Set up event listeners
			this.rpc.on('ready', () => {
				console.log('Discord RPC connected successfully');
				console.log('Logged in as:', this.rpc.user.username);
				this.connected = true;
				this.reconnectAttempts = 0;

				// Set initial presence
				this.setIdlePresence();
			});

			this.rpc.on('disconnected', () => {
				console.log('Discord RPC disconnected');
				this.connected = false;
				this.rpc = null;

				// Attempt to reconnect
				this.attemptReconnect();
			});

			// Login to Discord
			await this.rpc.login({ clientId: this.clientId });
			return true;
		} catch (error) {
			console.error('Failed to connect to Discord RPC:', error);
			this.connected = false;
			this.rpc = null;

			// Attempt to reconnect
			this.attemptReconnect();
			return false;
		}
	}

	/**
	 * Attempt to reconnect to Discord RPC
	 */
	attemptReconnect() {
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			console.log('Max reconnect attempts reached. Giving up on Discord RPC.');
			return;
		}

		this.reconnectAttempts++;
		console.log(`Attempting to reconnect to Discord RPC (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

		setTimeout(() => {
			this.connect();
		}, this.reconnectDelay * this.reconnectAttempts);
	}

	/**
	 * Disconnect from Discord RPC
	 */
	async disconnect() {
		if (!this.rpc) return;

		try {
			await this.rpc.clearActivity();
			await this.rpc.destroy();
			this.connected = false;
			this.rpc = null;
			console.log('Discord RPC disconnected cleanly');
		} catch (error) {
			console.error('Error disconnecting Discord RPC:', error);
		}
	}

	/**
	 * Set idle presence when nothing is playing
	 */
	async setIdlePresence() {
		if (!this.connected || !this.rpc) return;

		try {
			await this.rpc.setActivity({
				details: 'Browsing music',
				state: 'Idle',
				largeImageKey: 'jellify_logo', // You'll need to upload this as an asset in Discord Developer Portal
				largeImageText: 'Jellify',
				smallImageKey: 'jellyfin_logo',
				smallImageText: 'Powered by Jellyfin'
			});
		} catch (error) {
			console.error('Error setting idle presence:', error);
		}
	}

	/**
	 * Update Discord presence with currently playing track
	 * @param {Object} track - Track information
	 * @param {boolean} isPaused - Whether playback is paused
	 * @param {number} currentTime - Current playback position in seconds
	 * @param {number} duration - Total track duration in seconds
	 */
	async updatePresence(track, isPaused = false, currentTime = 0, duration = 0) {
		// Don't update if Discord is disabled
		if (!this.enabled) {
			return;
		}
		
		if (!this.connected || !this.rpc) {
			console.log('Discord RPC not connected, attempting to connect...');
			await this.connect();
			return;
		}

		if (!track) {
			await this.setIdlePresence();
			return;
		}

		try {
			// Build state text with artist
			let stateText = `by ${track.artist || 'Unknown Artist'}`;

			// Build activity object
			const activity = {
				details: track.title || 'Unknown Track',
				state: stateText,
				largeImageKey: 'jellify_logo', // Default image
				largeImageText: track.album || 'Unknown Album',
				smallImageKey: isPaused ? 'pause' : 'play',
				smallImageText: isPaused ? 'Paused' : 'Playing'
			};

			// Add timestamps for real-time display if not paused
			if (!isPaused && duration > 0 && currentTime >= 0) {
				const now = Date.now();
				const startTimestamp = Math.floor(now / 1000) - Math.floor(currentTime);
				const endTimestamp = startTimestamp + Math.floor(duration);
				
				activity.startTimestamp = startTimestamp;
				activity.endTimestamp = endTimestamp;
			}

			// Optional: Add buttons (requires verification from Discord)
			// activity.buttons = [
			// 	{ label: 'Listen on Jellyfin', url: 'https://your-jellyfin-url.com' }
			// ];

			// Clear any pending update
			if (this.activityUpdateTimeout) {
				clearTimeout(this.activityUpdateTimeout);
			}

			// Throttle updates to avoid rate limiting
			this.activityUpdateTimeout = setTimeout(async () => {
				try {
					// Set new activity (no need to clear first with timestamps)
					await this.rpc.setActivity(activity);
					this.currentActivity = JSON.stringify(activity);
					console.log('Discord presence updated:', {
						track: track.title,
						artist: track.artist,
						isPaused,
						hasTimestamps: !isPaused && duration > 0
					});
				} catch (error) {
					console.error('Error updating Discord presence:', error);
				}
			}, 500);
		} catch (error) {
			console.error('Error updating Discord presence:', error);
		}
	}

	/**
	 * Clear the current activity
	 */
	async clearActivity() {
		if (!this.connected || !this.rpc) return;

		try {
			await this.rpc.clearActivity();
			this.currentActivity = null;
			console.log('Discord activity cleared');
		} catch (error) {
			console.error('Error clearing Discord activity:', error);
		}
	}

	/**
	 * Check if Discord RPC is connected
	 */
	isConnected() {
		return this.connected;
	}
}

// Export singleton instance
module.exports = new DiscordRPCManager();

