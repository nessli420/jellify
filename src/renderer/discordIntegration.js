/**
 * Discord Rich Presence integration for the renderer process
 * Automatically updates Discord status based on playback state
 */

let updateInterval = null;
let lastTrack = null;
let lastPausedState = null;

/**
 * Start Discord integration
 * This should be called when playback starts
 */
function startDiscordIntegration() {
	// Clear any existing interval
	if (updateInterval) {
		clearInterval(updateInterval);
	}

	// Update Discord presence every 10 seconds as a keepalive
	// (Discord handles real-time elapsed time via timestamps)
	updateInterval = setInterval(() => {
		updateDiscordPresence();
	}, 10000);

	// Initial update
	updateDiscordPresence();
}

/**
 * Stop Discord integration
 */
function stopDiscordIntegration() {
	if (updateInterval) {
		clearInterval(updateInterval);
		updateInterval = null;
	}
	
	// Clear Discord activity
	if (window.api && window.api.discordSetIdlePresence) {
		window.api.discordSetIdlePresence().catch(err => {
			console.error('Failed to set idle Discord presence:', err);
		});
	}
}

/**
 * Update Discord presence with current playback state
 */
async function updateDiscordPresence() {
	try {
		// Check if Discord RPC is available
		if (!window.api || !window.api.discordUpdatePresence) {
			return;
		}

		// Get current track from player
		const track = window.player ? window.player.getCurrentTrack() : null;
		
		if (!track) {
			// No track playing, set idle presence
			await window.api.discordSetIdlePresence();
			lastTrack = null;
			lastPausedState = null;
			return;
		}

		// Get audio element
		const audio = document.getElementById('audio');
		if (!audio) return;

		const isPaused = audio.paused;
		const currentTime = audio.currentTime || 0;
		const duration = audio.duration || 0;

		// Check if we should update (track changed, pause state changed, or time progressed significantly)
		const trackChanged = !lastTrack || lastTrack.id !== track.id;
		const pausedStateChanged = lastPausedState !== isPaused;
		
		// Always update Discord presence with current time
		await window.api.discordUpdatePresence(
			{
				title: track.title,
				artist: track.artist,
				album: track.album
			},
			isPaused,
			currentTime,
			duration
		);

		// Update last states
		if (trackChanged || pausedStateChanged) {
			lastTrack = track;
			lastPausedState = isPaused;

			console.log('Discord presence updated:', {
				track: track.title,
				artist: track.artist,
				isPaused,
				time: `${Math.floor(currentTime)}s / ${Math.floor(duration)}s`
			});
		}
	} catch (err) {
		console.error('Failed to update Discord presence:', err);
	}
}

/**
 * Handle track change
 */
function onTrackChanged() {
	// Force immediate update on track change
	updateDiscordPresence();
}

/**
 * Handle play/pause
 */
function onPlayPauseChanged() {
	// Force immediate update on play/pause
	updateDiscordPresence();
}

/**
 * Handle seeking
 */
function onSeeked() {
	// Force immediate update on seek to recalculate timestamp
	updateDiscordPresence();
}

// Listen for playback events
if (typeof window !== 'undefined') {
	// Track changes
	window.addEventListener('trackChanged', onTrackChanged);
	
	// Play/pause/seek events
	document.addEventListener('DOMContentLoaded', () => {
		const audio = document.getElementById('audio');
		if (audio) {
			audio.addEventListener('play', onPlayPauseChanged);
			audio.addEventListener('pause', onPlayPauseChanged);
			audio.addEventListener('seeked', onSeeked);
		}
	});
}

// Export functions
window.discordIntegration = {
	start: startDiscordIntegration,
	stop: stopDiscordIntegration,
	update: updateDiscordPresence
};

// Sync settings on startup
async function syncDiscordSettings() {
	try {
		// Get settings from localStorage
		const stored = localStorage.getItem('discordSettings');
		if (stored) {
			const settings = JSON.parse(stored);
			
			// Sync with main process
			if (window.api && window.api.discordUpdateClientId) {
				await window.api.discordUpdateClientId(settings.clientId || '', settings.enabled || false);
			}
		}
	} catch (err) {
		console.error('Failed to sync Discord settings:', err);
	}
}

// Auto-start integration when page loads
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', () => {
		setTimeout(() => {
			syncDiscordSettings().then(() => {
				startDiscordIntegration();
			});
		}, 1000);
	});
} else {
	setTimeout(() => {
		syncDiscordSettings().then(() => {
			startDiscordIntegration();
		});
	}, 1000);
}

