const audio = document.getElementById('audio');
const playPauseBtn = document.getElementById('playPause');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const shuffleBtn = document.getElementById('shuffle');
const repeatBtn = document.getElementById('repeat');
const titleEl = document.getElementById('track-title');
const artistEl = document.getElementById('track-artist');
const artEl = document.getElementById('track-art');
const progressFill = document.getElementById('progress-fill');
const progressLine = document.getElementById('progress-line');
const timeCurrent = document.getElementById('time-current');
const timeTotal = document.getElementById('time-total');
const volumeSlider = document.getElementById('volume-slider');
const volumeFill = document.getElementById('volume-fill');

// Web Audio API setup for equalizer
let audioContext = null;
let sourceNode = null;
let gainNode = null;
let analyserNode = null;
let eqBands = [];

function initAudioContext() {
	if (!audioContext) {
		audioContext = new (window.AudioContext || window.webkitAudioContext)();
		sourceNode = audioContext.createMediaElementSource(audio);
		gainNode = audioContext.createGain();
		analyserNode = audioContext.createAnalyser();
		
		// Create 10-band equalizer (frequencies in Hz)
		const frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
		eqBands = frequencies.map(freq => {
			const filter = audioContext.createBiquadFilter();
			filter.type = 'peaking';
			filter.frequency.value = freq;
			filter.Q.value = 1.0;
			filter.gain.value = 0;
			return filter;
		});
		
		// Connect nodes: source -> EQ bands -> gain -> analyser -> destination
		let previousNode = sourceNode;
		eqBands.forEach(band => {
			previousNode.connect(band);
			previousNode = band;
		});
		previousNode.connect(gainNode);
		gainNode.connect(analyserNode);
		analyserNode.connect(audioContext.destination);
	}
}

function applyEqualizerSettings(settings) {
	if (!audioContext) initAudioContext();
	
	if (settings && settings.bands && eqBands.length === settings.bands.length) {
		eqBands.forEach((band, i) => {
			band.gain.value = settings.bands[i];
		});
	}
}

function resetEqualizer() {
	if (eqBands.length > 0) {
		eqBands.forEach(band => {
			band.gain.value = 0;
		});
	}
}

// Progress bar - click and drag support
let isProgressDragging = false;

function updateProgress(e) {
    const rect = progressLine.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    if (audio.duration) {
        audio.currentTime = audio.duration * pct;
        isSeeking = true;
    }
}

if (progressLine) {
    progressLine.addEventListener('mousedown', (e) => {
        isProgressDragging = true;
        updateProgress(e);
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isProgressDragging) {
            updateProgress(e);
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (isProgressDragging) {
            isProgressDragging = false;
            isSeeking = false;
            // Report new position after seeking
            const track = getCurrentTrack();
            if (track && track.id && window.api) {
                const position = audio.currentTime || 0;
                const positionTicks = Math.floor(position * 10000000);
                window.api.reportPlaybackProgress(track.id, positionTicks, audio.paused, false).catch(err => {
                    console.error('Failed to report playback progress after seek:', err);
                });
            }
        }
    });
    
    progressLine.addEventListener('click', (e) => {
        if (!isProgressDragging) {
            updateProgress(e);
            // Report new position after clicking progress bar
            setTimeout(() => {
                const track = getCurrentTrack();
                if (track && track.id && window.api) {
                    const position = audio.currentTime || 0;
                    const positionTicks = Math.floor(position * 10000000);
                    window.api.reportPlaybackProgress(track.id, positionTicks, audio.paused, false).catch(err => {
                        console.error('Failed to report playback progress after click:', err);
                    });
                }
            }, 100);
        }
    });
}

const queue = [];
const originalQueue = []; // Store original order for shuffle toggle
let currentIndex = -1;
let isSeeking = false;
const mediabar = document.getElementById('mediabar');
let recentlyPlayed = [];
let isShuffled = false;
let repeatMode = 'off'; // 'off', 'all', 'one'
let crossfadeInterval = null;
let isCrossfading = false;
let progressReportInterval = null;
let trackStartTime = 0;

// Recently Played persistence
function saveRecentlyPlayed() {
	try {
		const userId = window.getCurrentUserId ? window.getCurrentUserId() : null;
		if (!userId) return;
		
		localStorage.setItem(`recentlyPlayed_${userId}`, JSON.stringify(recentlyPlayed));
	} catch (err) {
		console.error('Failed to save recently played:', err);
	}
}

function loadRecentlyPlayed() {
	try {
		const userId = window.getCurrentUserId ? window.getCurrentUserId() : null;
		if (!userId) return;
		
		const saved = localStorage.getItem(`recentlyPlayed_${userId}`);
		if (saved) {
			const tracks = JSON.parse(saved);
			if (Array.isArray(tracks)) {
				recentlyPlayed.length = 0;
				recentlyPlayed.push(...tracks);
				console.log('Loaded recently played tracks:', recentlyPlayed.length);
			}
		}
	} catch (err) {
		console.error('Failed to load recently played:', err);
	}
}

// Playback state persistence
function savePlaybackState() {
	try {
		const userId = window.getCurrentUserId ? window.getCurrentUserId() : null;
		if (!userId) return;
		
		const state = {
			queue: queue,
			originalQueue: originalQueue,
			currentIndex: currentIndex,
			currentTime: audio.currentTime || 0,
			isShuffled: isShuffled,
			repeatMode: repeatMode,
			timestamp: Date.now()
		};
		localStorage.setItem(`playbackState_${userId}`, JSON.stringify(state));
	} catch (err) {
		console.error('Failed to save playback state:', err);
	}
}

function loadPlaybackState() {
	try {
		const userId = window.getCurrentUserId ? window.getCurrentUserId() : null;
		if (!userId) return false;
		
		const saved = localStorage.getItem(`playbackState_${userId}`);
		if (!saved) return false;
		
		const state = JSON.parse(saved);
		
		// Don't restore if state is older than 24 hours
		const age = Date.now() - (state.timestamp || 0);
		if (age > 24 * 60 * 60 * 1000) {
			localStorage.removeItem(`playbackState_${userId}`);
			return false;
		}
		
		// Restore queue
		if (state.queue && state.queue.length > 0) {
			queue.length = 0;
			queue.push(...state.queue);
			
			originalQueue.length = 0;
			originalQueue.push(...(state.originalQueue || state.queue));
			
			currentIndex = state.currentIndex || 0;
			isShuffled = state.isShuffled || false;
			repeatMode = state.repeatMode || 'off';
			
			// Restore current track
			if (currentIndex >= 0 && currentIndex < queue.length) {
				const track = queue[currentIndex];
				audio.src = track.streamUrl;
				
				// Restore position if it was significant (more than 5 seconds)
				if (state.currentTime && state.currentTime > 5) {
					audio.currentTime = state.currentTime;
				}
				
				updateUiForTrack(track);
				updateShuffleButton();
				updateRepeatButton();
				updateQueueDisplay();
				
				// Don't auto-play, just prepare
				updatePlayPauseButton(true); // Show play button
				
				return true;
			}
		}
		
		return false;
	} catch (err) {
		console.error('Failed to load playback state:', err);
		return false;
	}
}

// Save state periodically during playback
let stateSaveInterval = null;

function startStateSaving() {
	if (stateSaveInterval) clearInterval(stateSaveInterval);
	stateSaveInterval = setInterval(() => {
		if (currentIndex >= 0 && queue.length > 0) {
			savePlaybackState();
		}
	}, 10000); // Save every 10 seconds
}

// Start saving when player is initialized
startStateSaving();

function updateUiForTrack(track) {
	titleEl.textContent = track ? track.title : 'Not Playing';
	artistEl.textContent = track ? track.artist : '';
	
	// Make track title clickable to go to album if albumId is available
	if (track && track.albumId) {
		titleEl.style.cursor = 'pointer';
		titleEl.style.textDecoration = 'none';
		titleEl.onclick = () => {
			location.hash = `album/${track.albumId}`;
		};
		titleEl.onmouseenter = () => {
			titleEl.style.textDecoration = 'underline';
		};
		titleEl.onmouseleave = () => {
			titleEl.style.textDecoration = 'none';
		};
		// Add context menu for song
		titleEl.oncontextmenu = (e) => {
			e.preventDefault();
			if (window.songContextMenu) {
				window.songContextMenu.show(e.clientX, e.clientY, track);
			}
		};
	} else if (track) {
		// If no albumId but we have a track, still allow context menu
		titleEl.style.cursor = 'default';
		titleEl.onclick = null;
		titleEl.onmouseenter = null;
		titleEl.onmouseleave = null;
		titleEl.oncontextmenu = (e) => {
			e.preventDefault();
			if (window.songContextMenu) {
				window.songContextMenu.show(e.clientX, e.clientY, track);
			}
		};
	} else {
		titleEl.style.cursor = 'default';
		titleEl.onclick = null;
		titleEl.onmouseenter = null;
		titleEl.onmouseleave = null;
		titleEl.oncontextmenu = null;
	}
	
	// Make artist name clickable if artistId is available
	if (track && track.artistId) {
		artistEl.style.cursor = 'pointer';
		artistEl.style.textDecoration = 'none';
		artistEl.onclick = () => {
			location.hash = `artist/${track.artistId}`;
		};
		artistEl.onmouseenter = () => {
			artistEl.style.textDecoration = 'underline';
		};
		artistEl.onmouseleave = () => {
			artistEl.style.textDecoration = 'none';
		};
		// Add context menu for artist
		artistEl.oncontextmenu = (e) => {
			e.preventDefault();
			if (window.artistContextMenu) {
				window.artistContextMenu.show(e.clientX, e.clientY, {
					id: track.artistId,
					title: track.artist
				});
			}
		};
	} else {
		artistEl.style.cursor = 'default';
		artistEl.onclick = null;
		artistEl.onmouseenter = null;
		artistEl.onmouseleave = null;
		artistEl.oncontextmenu = null;
	}
	
	// Handle album art with placeholder
	if (track && track.image) {
		artEl.src = track.image;
		artEl.style.display = 'block';
	} else {
		// Use placeholder
		artEl.src = '';
		artEl.style.display = 'none';
		// Create placeholder if it doesn't exist
		let placeholder = artEl.parentElement.querySelector('.track-art-placeholder-player');
		if (!placeholder) {
			placeholder = document.createElement('div');
			placeholder.className = 'track-art-placeholder-player';
			placeholder.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
			artEl.parentElement.insertBefore(placeholder, artEl);
		}
		placeholder.style.display = 'flex';
	}
	
	// Show album art if it exists
	if (track && track.image) {
		const placeholder = artEl.parentElement.querySelector('.track-art-placeholder-player');
		if (placeholder) placeholder.style.display = 'none';
	}
	
	// Show/hide mediabar based on whether there's a track
	const layout = document.getElementById('layout');
	if (track && mediabar) {
		mediabar.classList.add('visible');
		if (layout) layout.classList.add('has-mediabar');
	} else if (mediabar) {
		mediabar.classList.remove('visible');
		if (layout) layout.classList.remove('has-mediabar');
	}
	
	// Update queue display
	updateQueueDisplay();
	
	// Dispatch track changed event for like button and other listeners
	window.dispatchEvent(new CustomEvent('trackChanged', { detail: { track } }));
}

function loadQueue(tracks, startShuffled = false) {
	queue.length = 0;
	originalQueue.length = 0;
	queue.push(...tracks);
	originalQueue.push(...tracks);
	currentIndex = -1;
	isShuffled = false;
	
	if (startShuffled) {
		toggleShuffle();
	} else {
		// Update button state when loading new queue without shuffle
		updateShuffleButton();
	}
	
	updateQueueDisplay();
	savePlaybackState();
}

function playIndex(idx) {
	if (idx < 0 || idx >= queue.length) return;
	
	// Report playback stopped for previous track if exists
	if (currentIndex >= 0 && currentIndex < queue.length) {
		const prevTrack = queue[currentIndex];
		const position = audio.currentTime || 0;
		const positionTicks = Math.floor(position * 10000000); // Convert to ticks
		
		// Report to Jellyfin
		if (window.api && prevTrack.id) {
			window.api.reportPlaybackStopped(prevTrack.id, positionTicks).catch(err => {
				console.error('Failed to report playback stopped:', err);
			});
		}
		
		addToRecentlyPlayed(prevTrack);
	}
	
	// Clear any active crossfade
	if (crossfadeInterval) {
		clearInterval(crossfadeInterval);
		crossfadeInterval = null;
	}
	isCrossfading = false;
	
	// Clear progress report interval
	if (progressReportInterval) {
		clearInterval(progressReportInterval);
		progressReportInterval = null;
	}
	
	// Restore volume if it was reduced by crossfade
	audio.volume = currentVolume;
	if (volumeFill) {
		const sliderPos = volumeToSlider(currentVolume);
		volumeFill.style.width = `${sliderPos * 100}%`;
	}
	
	// Initialize audio context for equalizer on first play
	if (!audioContext) {
		initAudioContext();
		// Apply saved equalizer settings
		const settings = getPlaybackSettings();
		if (settings.equalizer && settings.equalizer.enabled) {
			applyEqualizerSettings(settings.equalizer);
		}
	}
	
	currentIndex = idx;
	const track = queue[currentIndex];
	audio.src = track.streamUrl;
	trackStartTime = Date.now();
	
	// Properly handle audio.play() promise to ensure playback starts
	const playPromise = audio.play();
	if (playPromise !== undefined) {
		playPromise.then(() => {
			// Report playback start to Jellyfin
			if (window.api && track.id) {
				window.api.reportPlaybackStart(track.id, true, false, false).catch(err => {
					console.error('Failed to report playback start:', err);
				});
				
				// Start reporting progress every 10 seconds
				progressReportInterval = setInterval(() => {
					const position = audio.currentTime || 0;
					const positionTicks = Math.floor(position * 10000000);
					window.api.reportPlaybackProgress(track.id, positionTicks, audio.paused, false).catch(err => {
						console.error('Failed to report playback progress:', err);
					});
				}, 10000);
			}
		}).catch(error => {
			console.error('Playback failed:', error);
			// Update UI to reflect paused state if playback fails
			updatePlayPauseButton(true);
		});
	}
	
	updateUiForTrack(track);
	updatePlayPauseButton(false); // false = playing (show pause icon)
	savePlaybackState();
}

function getPlaybackSettings() {
	const userId = window.getCurrentUserId ? window.getCurrentUserId() : null;
	if (!userId) return { equalizer: { enabled: false } };
	
	const stored = localStorage.getItem(`playbackSettings_${userId}`);
	if (stored) {
		try {
			return JSON.parse(stored);
		} catch (e) {
			return { equalizer: { enabled: false } };
		}
	}
	return { equalizer: { enabled: false } };
}

function togglePlayPause() {
	if (audio.paused) {
		if (currentIndex === -1 && queue.length > 0) {
			playIndex(0);
		} else {
			const playPromise = audio.play();
			if (playPromise !== undefined) {
				playPromise.then(() => {
					// Report playback resumed to Jellyfin
					const track = getCurrentTrack();
					if (track && track.id && window.api) {
						const position = audio.currentTime || 0;
						const positionTicks = Math.floor(position * 10000000);
						window.api.reportPlaybackProgress(track.id, positionTicks, false, false).catch(err => {
							console.error('Failed to report playback resumed:', err);
						});
					}
				}).catch(error => {
					console.error('Resume failed:', error);
				});
			}
			updatePlayPauseButton(false);
		}
	} else {
		audio.pause();
		// Report playback paused to Jellyfin immediately
		const track = getCurrentTrack();
		if (track && track.id && window.api) {
			const position = audio.currentTime || 0;
			const positionTicks = Math.floor(position * 10000000);
			window.api.reportPlaybackProgress(track.id, positionTicks, true, false).catch(err => {
				console.error('Failed to report playback paused:', err);
			});
		}
		updatePlayPauseButton(true);
	}
}

function updatePlayPauseButton(isPaused) {
	if (isPaused) {
		// Show play icon
		playIcon.style.opacity = '1';
		playIcon.style.pointerEvents = 'auto';
		pauseIcon.style.opacity = '0';
		pauseIcon.style.pointerEvents = 'none';
	} else {
		// Show pause icon
		playIcon.style.opacity = '0';
		playIcon.style.pointerEvents = 'none';
		pauseIcon.style.opacity = '1';
		pauseIcon.style.pointerEvents = 'auto';
	}
	
}

function next() {
	if (repeatMode === 'one') {
		// Replay current track
		audio.currentTime = 0;
		audio.play();
		return;
	}
	
	if (currentIndex + 1 < queue.length) {
		playIndex(currentIndex + 1);
	} else if (repeatMode === 'all') {
		// Loop back to start
		playIndex(0);
	}
}

function prev() {
	if (currentIndex > 0) playIndex(currentIndex - 1);
}

function toggleShuffle() {
	if (isShuffled) {
		// Un-shuffle: restore original order
		const currentTrack = queue[currentIndex];
		queue.length = 0;
		queue.push(...originalQueue);
		// Find the current track in original order
		currentIndex = queue.findIndex(t => t.id === currentTrack.id);
		isShuffled = false;
	} else {
		// Shuffle
		const currentTrack = currentIndex >= 0 ? queue[currentIndex] : null;
		const shuffled = [...queue];
		
		// Fisher-Yates shuffle algorithm
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		
		// If there's a current track, move it to the front
		if (currentTrack) {
			const currentIdx = shuffled.findIndex(t => t.id === currentTrack.id);
			if (currentIdx > 0) {
				shuffled.splice(currentIdx, 1);
				shuffled.unshift(currentTrack);
			}
			currentIndex = 0;
		}
		
		queue.length = 0;
		queue.push(...shuffled);
		isShuffled = true;
	}
	
	updateShuffleButton();
	updateQueueDisplay();
	savePlaybackState();
}

function toggleRepeat() {
	if (repeatMode === 'off') {
		repeatMode = 'all';
	} else if (repeatMode === 'all') {
		repeatMode = 'one';
	} else {
		repeatMode = 'off';
	}
	updateRepeatButton();
	savePlaybackState();
}

function updateShuffleButton() {
	if (shuffleBtn) {
		if (isShuffled) {
			shuffleBtn.classList.add('active');
		} else {
			shuffleBtn.classList.remove('active');
		}
	}
}

function updateRepeatButton() {
	if (repeatBtn) {
		repeatBtn.classList.remove('repeat-off', 'repeat-all', 'repeat-one', 'active');
		if (repeatMode === 'off') {
			repeatBtn.classList.add('repeat-off');
		} else if (repeatMode === 'all') {
			repeatBtn.classList.add('repeat-all', 'active');
		} else {
			repeatBtn.classList.add('repeat-one', 'active');
		}
	}
}

audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    // Only update progress bar if not currently dragging
    if (progressFill && !isProgressDragging) {
        progressFill.style.width = `${pct}%`;
    }
    if (timeCurrent) timeCurrent.textContent = formatTime(audio.currentTime);
    if (timeTotal) timeTotal.textContent = formatTime(audio.duration);
});

// Crossfade logic - start fading before track ends
audio.addEventListener('timeupdate', () => {
	if (isCrossfading || !audio.duration) return;
	
	// Get crossfade settings
	const userId = window.getCurrentUserId ? window.getCurrentUserId() : null;
	const settingsKey = userId ? `playbackSettings_${userId}` : 'playbackSettings';
	const settings = JSON.parse(localStorage.getItem(settingsKey) || '{}');
	const crossfadeDuration = settings.crossfadeDuration || 0;
	
	if (crossfadeDuration > 0 && !isSeeking) {
		const timeRemaining = audio.duration - audio.currentTime;
		
		// Start crossfade when time remaining equals crossfade duration
		if (timeRemaining > 0 && timeRemaining <= crossfadeDuration && currentIndex + 1 < queue.length) {
			if (repeatMode === 'one') return; // Don't crossfade in repeat-one mode
			
			isCrossfading = true;
			startCrossfade(crossfadeDuration, timeRemaining);
		}
	}
});

function startCrossfade(duration, timeRemaining) {
	const startVolume = audio.volume;
	const steps = Math.ceil(timeRemaining * 10); // 10 steps per second
	const volumeDecrement = startVolume / steps;
	let step = 0;
	
	crossfadeInterval = setInterval(() => {
		step++;
		const newVolume = Math.max(0, startVolume - (volumeDecrement * step));
		audio.volume = newVolume;
		
		// Update volume slider visual during crossfade
		if (volumeFill && !isVolumeDragging) {
			const sliderPos = volumeToSlider(newVolume);
			volumeFill.style.width = `${sliderPos * 100}%`;
		}
		
		if (step >= steps || newVolume <= 0) {
			clearInterval(crossfadeInterval);
			crossfadeInterval = null;
			next();
		}
	}, 100);
}

audio.addEventListener('ended', () => {
	if (!isCrossfading) {
		// Report track as completed
		const track = getCurrentTrack();
		if (track && track.id && window.api) {
			const positionTicks = Math.floor(audio.duration * 10000000); // Report full duration
			window.api.reportPlaybackStopped(track.id, positionTicks).catch(err => {
				console.error('Failed to report playback completion:', err);
			});
			
			// Add to recently played
			addToRecentlyPlayed(track);
			
			// Dispatch event for profile page to refresh if it's open
			window.dispatchEvent(new CustomEvent('trackCompleted', { detail: { track } }));
		}
		
		// Clear progress reporting
		if (progressReportInterval) {
			clearInterval(progressReportInterval);
			progressReportInterval = null;
		}
		
		next();
	}
});

audio.addEventListener('play', () => {
	updatePlayPauseButton(false);
	// Resume equalizer animation
	document.querySelectorAll('.equalizer .bar').forEach(bar => {
		bar.style.animationPlayState = 'running';
	});
	
	// Report playback resumed to Jellyfin
	const track = getCurrentTrack();
	if (track && track.id && window.api) {
		const position = audio.currentTime || 0;
		const positionTicks = Math.floor(position * 10000000);
		window.api.reportPlaybackProgress(track.id, positionTicks, false, false).catch(err => {
			console.error('Failed to report playback resumed:', err);
		});
	}
});

audio.addEventListener('pause', () => {
	updatePlayPauseButton(true);
	// Pause equalizer animation
	document.querySelectorAll('.equalizer .bar').forEach(bar => {
		bar.style.animationPlayState = 'paused';
	});
	
	// Report playback paused to Jellyfin
	const track = getCurrentTrack();
	if (track && track.id && window.api) {
		const position = audio.currentTime || 0;
		const positionTicks = Math.floor(position * 10000000);
		window.api.reportPlaybackProgress(track.id, positionTicks, true, false).catch(err => {
			console.error('Failed to report playback paused:', err);
		});
	}
});

function formatTime(s) {
	const m = Math.floor(s / 60);
	const sec = Math.floor(s % 60).toString().padStart(2, '0');
	return `${m}:${sec}`;
}

playPauseBtn.addEventListener('click', togglePlayPause);
prevBtn.addEventListener('click', prev);
nextBtn.addEventListener('click', next);
if (shuffleBtn) shuffleBtn.addEventListener('click', toggleShuffle);
if (repeatBtn) repeatBtn.addEventListener('click', toggleRepeat);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
	// Don't trigger if user is typing in an input field
	if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
		return;
	}
	
	if (e.code === 'Space') {
		e.preventDefault();
		togglePlayPause();
	}
});

function getCurrentTrack() {
	if (currentIndex >= 0 && currentIndex < queue.length) {
		return queue[currentIndex];
	}
	return null;
}

// Fullscreen Player
const fullscreenPlayer = document.getElementById('fullscreen-player');
const fullscreenClose = document.getElementById('fullscreen-close');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const fullscreenArt = document.getElementById('fullscreen-art');
const fullscreenTitle = document.getElementById('fullscreen-title');
const fullscreenArtist = document.getElementById('fullscreen-artist');
const fullscreenAlbum = document.getElementById('fullscreen-album');
const fullscreenProgressLine = document.getElementById('fullscreen-progress-line');
const fullscreenProgressFill = document.getElementById('fullscreen-progress-fill');
const fullscreenTimeCurrent = document.getElementById('fullscreen-time-current');
const fullscreenTimeTotal = document.getElementById('fullscreen-time-total');
const fullscreenPlayPause = document.getElementById('fullscreen-play-pause');
const fullscreenPlayIcon = document.getElementById('fullscreen-play-icon');
const fullscreenPauseIcon = document.getElementById('fullscreen-pause-icon');
const fullscreenPrev = document.getElementById('fullscreen-prev');
const fullscreenNext = document.getElementById('fullscreen-next');
const fullscreenShuffle = document.getElementById('fullscreen-shuffle');
const fullscreenRepeat = document.getElementById('fullscreen-repeat');
const fullscreenLyricsToggle = document.getElementById('fullscreen-lyrics-toggle');
const fullscreenBody = document.querySelector('.fullscreen-body');
const lyricsContainer = document.getElementById('lyrics-container');

let isFullscreenOpen = false;
let isFullscreenProgressDragging = false;
let currentLyrics = null;
let lyricsLines = [];
let lyricsShowEnabled = false;

async function openFullscreenPlayer() {
	if (!fullscreenPlayer) return;
	
	isFullscreenOpen = true;
	fullscreenPlayer.classList.add('active');
	updateFullscreenUI();
	loadLyrics();
	
	// Set window to fullscreen
	if (window.api && window.api.windowSetFullscreen) {
		try {
			await window.api.windowSetFullscreen(true);
		} catch (err) {
			console.error('Failed to set fullscreen:', err);
		}
	}
}

async function closeFullscreenPlayer() {
	if (!fullscreenPlayer) return;
	
	isFullscreenOpen = false;
	fullscreenPlayer.classList.remove('active');
	
	// Exit window fullscreen
	if (window.api && window.api.windowSetFullscreen) {
		try {
			await window.api.windowSetFullscreen(false);
		} catch (err) {
			console.error('Failed to exit fullscreen:', err);
		}
	}
}

function updateFullscreenUI() {
	const track = queue[currentIndex];
	
	if (track) {
		// Handle album art with placeholder for fullscreen
		if (track.image && fullscreenArt) {
			fullscreenArt.src = track.image;
			fullscreenArt.style.display = 'block';
			// Hide placeholder if exists
			const placeholder = fullscreenArt.parentElement.querySelector('.fullscreen-art-placeholder');
			if (placeholder) placeholder.style.display = 'none';
		} else if (fullscreenArt) {
			fullscreenArt.src = '';
			fullscreenArt.style.display = 'none';
			// Create placeholder if it doesn't exist
			let placeholder = fullscreenArt.parentElement.querySelector('.fullscreen-art-placeholder');
			if (!placeholder) {
				placeholder = document.createElement('div');
				placeholder.className = 'fullscreen-art-placeholder';
				placeholder.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
				fullscreenArt.parentElement.insertBefore(placeholder, fullscreenArt);
			}
			placeholder.style.display = 'flex';
		}
		
		if (fullscreenTitle) fullscreenTitle.textContent = track.title;
		if (fullscreenArtist) fullscreenArtist.textContent = track.artist;
		if (fullscreenAlbum) fullscreenAlbum.textContent = track.album || '';
	}
	
	// Update play/pause state
	updateFullscreenPlayPauseButton(audio.paused);
	
	// Update shuffle/repeat states
	updateFullscreenShuffleState();
	updateFullscreenRepeatState();
}

function updateFullscreenPlayPauseButton(isPaused) {
	if (!fullscreenPlayIcon || !fullscreenPauseIcon) return;
	
	if (isPaused) {
		fullscreenPlayIcon.style.display = 'block';
		fullscreenPauseIcon.style.display = 'none';
	} else {
		fullscreenPlayIcon.style.display = 'none';
		fullscreenPauseIcon.style.display = 'block';
	}
}

function updateFullscreenShuffleState() {
	if (!fullscreenShuffle) return;
	
	if (isShuffled) {
		fullscreenShuffle.classList.add('active');
	} else {
		fullscreenShuffle.classList.remove('active');
	}
}

function updateFullscreenRepeatState() {
	if (!fullscreenRepeat) return;
	
	fullscreenRepeat.classList.remove('active', 'repeat-off', 'repeat-all', 'repeat-one');
	
	if (repeatMode === 'off') {
		fullscreenRepeat.classList.add('repeat-off');
	} else if (repeatMode === 'all') {
		fullscreenRepeat.classList.add('repeat-all', 'active');
	} else if (repeatMode === 'one') {
		fullscreenRepeat.classList.add('repeat-one', 'active');
	}
}

// Progress bar for fullscreen
function updateFullscreenProgress(e) {
	const rect = fullscreenProgressLine.getBoundingClientRect();
	const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
	if (audio.duration) {
		audio.currentTime = audio.duration * pct;
		isSeeking = true;
	}
}

if (fullscreenProgressLine) {
	fullscreenProgressLine.addEventListener('mousedown', (e) => {
		isFullscreenProgressDragging = true;
		updateFullscreenProgress(e);
		e.preventDefault();
	});
	
	document.addEventListener('mousemove', (e) => {
		if (isFullscreenProgressDragging) {
			updateFullscreenProgress(e);
		}
	});
	
	document.addEventListener('mouseup', () => {
		if (isFullscreenProgressDragging) {
			isFullscreenProgressDragging = false;
			isSeeking = false;
			// Report new position after seeking
			const track = getCurrentTrack();
			if (track && track.id && window.api) {
				const position = audio.currentTime || 0;
				const positionTicks = Math.floor(position * 10000000);
				window.api.reportPlaybackProgress(track.id, positionTicks, audio.paused, false).catch(err => {
					console.error('Failed to report playback progress after seek:', err);
				});
			}
		}
	});
}

// Sync fullscreen progress with audio
audio.addEventListener('timeupdate', () => {
	if (!isFullscreenOpen || !audio.duration) return;
	
	const pct = (audio.currentTime / audio.duration) * 100;
	
	if (fullscreenProgressFill && !isFullscreenProgressDragging) {
		fullscreenProgressFill.style.width = `${pct}%`;
	}
	if (fullscreenTimeCurrent) fullscreenTimeCurrent.textContent = formatTime(audio.currentTime);
	if (fullscreenTimeTotal) fullscreenTimeTotal.textContent = formatTime(audio.duration);
	
	// Update lyrics highlight
	if (lyricsShowEnabled && lyricsLines.length > 0) {
		updateLyricsHighlight(audio.currentTime);
	}
});

// Sync fullscreen play/pause with audio
audio.addEventListener('play', () => {
	if (isFullscreenOpen) updateFullscreenPlayPauseButton(false);
});

audio.addEventListener('pause', () => {
	if (isFullscreenOpen) updateFullscreenPlayPauseButton(true);
});

// Fullscreen controls
if (fullscreenBtn) {
	fullscreenBtn.addEventListener('click', openFullscreenPlayer);
}

if (fullscreenClose) {
	fullscreenClose.addEventListener('click', closeFullscreenPlayer);
}

if (fullscreenPlayPause) {
	fullscreenPlayPause.addEventListener('click', togglePlayPause);
}

if (fullscreenPrev) {
	fullscreenPrev.addEventListener('click', prev);
}

if (fullscreenNext) {
	fullscreenNext.addEventListener('click', next);
}

if (fullscreenShuffle) {
	fullscreenShuffle.addEventListener('click', () => {
		toggleShuffle();
		updateFullscreenShuffleState();
	});
}

if (fullscreenRepeat) {
	fullscreenRepeat.addEventListener('click', () => {
		toggleRepeat();
		updateFullscreenRepeatState();
	});
}

// Lyrics functionality
async function loadLyrics() {
	const track = queue[currentIndex];
	if (!track || !track.id) {
		lyricsContainer.innerHTML = '<div class="lyrics-error">No lyrics available</div>';
		return;
	}
	
	lyricsContainer.innerHTML = '<div class="lyrics-loading">Loading lyrics...</div>';
	
	try {
		console.log('Loading lyrics for fullscreen player:', track.title, track.id);
		const res = await window.api.getLyrics(track.id);
		console.log('Fullscreen lyrics response:', res);
		
		if (res && res.ok && res.lyrics) {
			console.log('Fullscreen - Lyrics type:', typeof res.lyrics);
			console.log('Fullscreen - Lyrics data:', res.lyrics);
			
			let lyricsText = res.lyrics;
			
			// Ensure we have a string
			if (typeof lyricsText !== 'string') {
				console.error('Fullscreen - Lyrics is not a string:', lyricsText);
				lyricsContainer.innerHTML = '<div class="lyrics-error">Invalid lyrics format<br><span style="font-size: 12px; opacity: 0.7; margin-top: 8px; display: block;">Received ' + typeof lyricsText + ' instead of string</span></div>';
				return;
			}
			
			console.log('Fullscreen - Valid lyrics text, length:', lyricsText.length);
			console.log('Fullscreen - Lyrics preview:', lyricsText.substring(0, 200));
			
			currentLyrics = lyricsText;
			parseLyrics(lyricsText, res.metadata);
		} else {
			lyricsContainer.innerHTML = '<div class="lyrics-error">No lyrics available for this track<br><span style="font-size: 12px; opacity: 0.7; margin-top: 8px; display: block;">Add .lrc files to enable synchronized lyrics</span></div>';
		}
	} catch (err) {
		console.error('Failed to load lyrics:', err);
		lyricsContainer.innerHTML = `<div class="lyrics-error">Failed to load lyrics<br><span style="font-size: 12px; opacity: 0.7; margin-top: 8px; display: block;">${err.message || 'Unknown error'}</span></div>`;
	}
}

function parseLyrics(lyricsText, metadata) {
	lyricsLines = [];
	
	// Ensure lyricsText is a string
	if (!lyricsText || typeof lyricsText !== 'string') {
		console.error('Invalid lyrics text for fullscreen:', lyricsText);
		lyricsContainer.innerHTML = '<div class="lyrics-error">Invalid lyrics format</div>';
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
			lyricsLines.push({ time, text });
		}
	}
	
	if (hasTimestamps) {
		// Sort by time
		lyricsLines.sort((a, b) => a.time - b.time);
		displaySynchronizedLyrics();
	} else {
		// Display as plain text
		displayPlainLyrics(lyricsText);
	}
}

function displaySynchronizedLyrics() {
	lyricsContainer.innerHTML = '';
	
	lyricsLines.forEach((line, index) => {
		const lineEl = document.createElement('p');
		lineEl.className = 'lyrics-line';
		lineEl.textContent = line.text;
		lineEl.dataset.index = index;
		lineEl.dataset.time = line.time;
		
		// Click to seek
		lineEl.addEventListener('click', () => {
			audio.currentTime = line.time;
		});
		
		lyricsContainer.appendChild(lineEl);
	});
}

function displayPlainLyrics(text) {
	const plainDiv = document.createElement('div');
	plainDiv.className = 'lyrics-text';
	plainDiv.textContent = text;
	lyricsContainer.innerHTML = '';
	lyricsContainer.appendChild(plainDiv);
}

function updateLyricsHighlight(currentTime) {
	const lines = lyricsContainer.querySelectorAll('.lyrics-line');
	let activeIndex = -1;
	
	// Find the current line
	for (let i = 0; i < lyricsLines.length; i++) {
		if (currentTime >= lyricsLines[i].time) {
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

// Lyrics toggle
if (fullscreenLyricsToggle) {
	fullscreenLyricsToggle.addEventListener('click', () => {
		lyricsShowEnabled = !lyricsShowEnabled;
		
		if (lyricsShowEnabled) {
			fullscreenBody.classList.add('show-lyrics');
			fullscreenLyricsToggle.classList.add('active');
		} else {
			fullscreenBody.classList.remove('show-lyrics');
			fullscreenLyricsToggle.classList.remove('active');
		}
	});
}

// Update fullscreen when track changes
window.addEventListener('trackChanged', () => {
	if (isFullscreenOpen) {
		updateFullscreenUI();
		loadLyrics();
	}
});

// Handle ESC key to exit fullscreen
document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape' && isFullscreenOpen) {
		closeFullscreenPlayer();
	}
});

// Handle native fullscreen changes (F11, or OS fullscreen toggle)
if (window.api && window.api.windowIsFullscreen) {
	// Check periodically if window fullscreen state changed externally
	setInterval(async () => {
		if (isFullscreenOpen) {
			try {
				const isWindowFullscreen = await window.api.windowIsFullscreen();
				// If window exited fullscreen but player is still open, close the player
				if (!isWindowFullscreen) {
					closeFullscreenPlayer();
				}
			} catch (err) {
				// Ignore errors
			}
		}
	}, 500);
}

// Add track to queue
function addToQueue(track) {
	queue.push(track);
	originalQueue.push(track);
	updateQueueDisplay();
	savePlaybackState();
}

// Insert track as next in queue
function insertNext(track) {
	const insertIndex = currentIndex + 1;
	queue.splice(insertIndex, 0, track);
	originalQueue.splice(insertIndex, 0, track);
	updateQueueDisplay();
	savePlaybackState();
}

// Get current queue
function getQueue() {
	return queue;
}

window.player = { 
	loadQueue, 
	playIndex, 
	togglePlayPause, 
	next, 
	prev, 
	getCurrentTrack,
	applyEqualizerSettings,
	resetEqualizer,
	getEQBands: () => eqBands,
	openFullscreen: openFullscreenPlayer,
	closeFullscreen: closeFullscreenPlayer,
	addToQueue,
	insertNext,
	getQueue,
	loadPlaybackState
};

// Function to reload user-specific data after login
function reloadUserData() {
	// Load volume
	loadSavedVolume();
	audio.volume = currentVolume;
	if (volumeFill) {
		const sliderPos = volumeToSlider(currentVolume);
		volumeFill.style.width = `${sliderPos * 100}%`;
	}
	
	// Load recently played
	loadRecentlyPlayed();
	
	// Load playback state
	const restored = loadPlaybackState();
	if (restored) {
		console.log('Playback state restored');
	}
}

// Expose to window for renderer to call after login
window.player = window.player || {};
window.player.reloadUserData = reloadUserData;

// Try to restore playback state on load (will work if user is already logged in)
setTimeout(() => {
	loadRecentlyPlayed();
	const restored = loadPlaybackState();
	if (restored) {
		console.log('Playback state restored');
	}
}, 500); // Small delay to ensure UI is ready

// Volume slider - click and drag support with logarithmic scaling
let currentVolume = 0.8; // Default volume
let isVolumeDragging = false;

// Load saved volume - account specific
function loadSavedVolume() {
    const userId = window.getCurrentUserId ? window.getCurrentUserId() : null;
    if (!userId) return;
    
    const saved = localStorage.getItem(`playerVolume_${userId}`);
    if (saved !== null) {
        const volume = parseFloat(saved);
        if (!isNaN(volume) && volume >= 0 && volume <= 1) {
            currentVolume = volume;
        }
    }
}

// Save volume to localStorage - account specific
function saveVolume(volume) {
    const userId = window.getCurrentUserId ? window.getCurrentUserId() : null;
    if (!userId) return;
    localStorage.setItem(`playerVolume_${userId}`, volume.toString());
}

// Convert linear slider position to logarithmic volume
function sliderToVolume(sliderValue) {
    // Use exponential curve for more natural volume control
    // This gives finer control at lower volumes
    return Math.pow(sliderValue, 2);
}

// Convert logarithmic volume to linear slider position
function volumeToSlider(volume) {
    return Math.sqrt(volume);
}

function updateVolume(e) {
    const rect = volumeSlider.getBoundingClientRect();
    const sliderPos = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const volume = sliderToVolume(sliderPos);
    
    currentVolume = volume;
    audio.volume = volume;
    
    if (volumeFill) {
        volumeFill.style.width = `${sliderPos * 100}%`;
    }
    
    // Save volume
    saveVolume(volume);
}

if (volumeSlider) {
    // Load and set initial volume
    loadSavedVolume();
    audio.volume = currentVolume;
    if (volumeFill) {
        const sliderPos = volumeToSlider(currentVolume);
        volumeFill.style.width = `${sliderPos * 100}%`;
    }
    
    volumeSlider.addEventListener('mousedown', (e) => {
        isVolumeDragging = true;
        updateVolume(e);
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isVolumeDragging) {
            updateVolume(e);
        }
    });
    
    document.addEventListener('mouseup', () => {
        isVolumeDragging = false;
    });
    
    volumeSlider.addEventListener('click', (e) => {
        if (!isVolumeDragging) {
            updateVolume(e);
        }
    });
}

// Lyrics Button
const lyricsBtn = document.getElementById('lyricsBtn');
if (lyricsBtn) {
	lyricsBtn.addEventListener('click', () => {
		location.hash = 'lyrics';
	});
}

// Queue Panel Management
const queuePanel = document.getElementById('queue-panel');
const queueBackdrop = document.getElementById('queue-backdrop');
const queueBtn = document.getElementById('queueBtn');
const queueClose = document.getElementById('queue-close');
const tabQueue = document.getElementById('tab-queue');
const tabRecent = document.getElementById('tab-recent');
const queueView = document.getElementById('queue-view');
const recentView = document.getElementById('recent-view');
const clearQueueBtn = document.getElementById('clear-queue');

function openQueue() {
    queuePanel.classList.add('visible');
    if (queueBackdrop) queueBackdrop.classList.add('visible');
    
    // Always default to Queue tab when opening
    if (tabQueue && tabRecent && queueView && recentView) {
        tabQueue.classList.add('active');
        tabRecent.classList.remove('active');
        queueView.classList.remove('hidden');
        recentView.classList.add('hidden');
    }
    
    updateQueueDisplay();
}

function closeQueue() {
    queuePanel.classList.remove('visible');
    if (queueBackdrop) queueBackdrop.classList.remove('visible');
}

// Toggle queue panel
if (queueBtn) {
    queueBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (queuePanel.classList.contains('visible')) {
            closeQueue();
        } else {
            openQueue();
        }
    });
}

if (queueClose) {
    queueClose.addEventListener('click', closeQueue);
}

// Close queue panel when clicking backdrop
if (queueBackdrop) {
    queueBackdrop.addEventListener('click', closeQueue);
}

// Prevent clicks inside queue panel from closing it
if (queuePanel) {
    queuePanel.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

// Tab switching
if (tabQueue) {
    tabQueue.addEventListener('click', () => {
        tabQueue.classList.add('active');
        tabRecent.classList.remove('active');
        queueView.classList.remove('hidden');
        recentView.classList.add('hidden');
    });
}

if (tabRecent) {
    tabRecent.addEventListener('click', () => {
        tabRecent.classList.add('active');
        tabQueue.classList.remove('active');
        recentView.classList.remove('hidden');
        queueView.classList.add('hidden');
        updateRecentlyPlayedDisplay();
    });
}

// Clear queue
if (clearQueueBtn) {
    clearQueueBtn.addEventListener('click', () => {
        if (confirm('Clear the queue?')) {
            // Keep only the current track
            if (currentIndex >= 0 && currentIndex < queue.length) {
                const current = queue[currentIndex];
                queue.length = 0;
                queue.push(current);
                currentIndex = 0;
            } else {
                queue.length = 0;
                currentIndex = -1;
            }
            updateQueueDisplay();
            savePlaybackState();
        }
    });
}

// Helper functions for queue display
function createQueueItemElement(track, index, isNowPlaying = false) {
    const item = document.createElement('div');
    item.className = 'queue-item' + (isNowPlaying ? ' now-playing' : '');
    item.dataset.index = index;
    
    // Make item draggable only if it's not currently playing
    if (!isNowPlaying) {
        item.draggable = true;
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragenter', handleDragEnter);
        item.addEventListener('dragleave', handleDragLeave);
    }
    
    // Drag handle
    const drag = document.createElement('div');
    drag.className = 'queue-item-drag';
    drag.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>';
    
    // Album art with placeholder
    let artContainer;
    if (track.image) {
        const art = document.createElement('img');
        art.className = 'queue-item-art';
        art.src = track.image;
        art.alt = track.title;
        artContainer = art;
    } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'queue-item-art-placeholder';
        placeholder.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
        artContainer = placeholder;
    }
    
    // Track info
    const info = document.createElement('div');
    info.className = 'queue-item-info';
    
    const title = document.createElement('div');
    title.className = 'queue-item-title';
    title.textContent = track.title || 'Untitled';
    
    const artist = document.createElement('div');
    artist.className = 'queue-item-artist';
    artist.textContent = track.artist || 'Unknown Artist';
    
    info.appendChild(title);
    info.appendChild(artist);
    
    // Duration
    const duration = document.createElement('div');
    duration.className = 'queue-item-duration';
    const mins = Math.floor((track.durationMs || 0) / 60000);
    const secs = Math.floor(((track.durationMs || 0) % 60000) / 1000).toString().padStart(2, '0');
    duration.textContent = `${mins}:${secs}`;
    
    // Play button
    const playBtn = document.createElement('button');
    playBtn.className = 'queue-item-play';
    playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        playIndex(index);
    });
    
    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'queue-item-remove';
    removeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFromQueue(index);
    });
    
    item.appendChild(drag);
    item.appendChild(artContainer);
    item.appendChild(info);
    item.appendChild(duration);
    item.appendChild(playBtn);
    item.appendChild(removeBtn);
    
    // Click to play
    item.addEventListener('click', () => {
        if (!isNowPlaying) {
            playIndex(index);
        }
    });
    
    return item;
}

function updateQueueDisplay() {
    const nowPlayingContainer = document.getElementById('now-playing-item');
    const upNextContainer = document.getElementById('up-next-list');
    
    // Update Now Playing
    if (currentIndex >= 0 && currentIndex < queue.length) {
        const currentTrack = queue[currentIndex];
        nowPlayingContainer.replaceChildren(createQueueItemElement(currentTrack, currentIndex, true));
    } else {
        nowPlayingContainer.innerHTML = '<div class="queue-item-placeholder">No track playing</div>';
    }
    
    // Update Up Next
    upNextContainer.replaceChildren();
    const upNextTracks = queue.slice(currentIndex + 1);
    
    if (upNextTracks.length === 0) {
        upNextContainer.innerHTML = '<div class="queue-empty">Queue is empty</div>';
    } else {
        upNextTracks.forEach((track, idx) => {
            const queueIndex = currentIndex + 1 + idx;
            upNextContainer.appendChild(createQueueItemElement(track, queueIndex, false));
        });
    }
}

function removeFromQueue(index) {
    if (index === currentIndex) {
        // Don't allow removing the currently playing track
        return;
    }
    
    queue.splice(index, 1);
    
    // Adjust current index if needed
    if (index < currentIndex) {
        currentIndex--;
    }
    
    updateQueueDisplay();
    savePlaybackState();
}

function addToRecentlyPlayed(track) {
    if (!track || !track.id) return;
    
    // Remove if already exists
    const existingIndex = recentlyPlayed.findIndex(t => t.id === track.id);
    if (existingIndex >= 0) {
        recentlyPlayed.splice(existingIndex, 1);
    }
    
    // Add to beginning
    recentlyPlayed.unshift(track);
    
    // Keep only last 50 tracks
    if (recentlyPlayed.length > 50) {
        recentlyPlayed.pop();
    }
    
    // Save to localStorage
    saveRecentlyPlayed();
    
    console.log('Added to recently played:', track.title, '- Total:', recentlyPlayed.length);
}

function updateRecentlyPlayedDisplay() {
    const recentList = document.getElementById('recent-list');
    if (!recentList) return;
    
    recentList.replaceChildren();
    
    console.log('Updating recently played display, count:', recentlyPlayed.length);
    
    if (recentlyPlayed.length === 0) {
        recentList.innerHTML = '<div class="queue-empty">No recently played tracks yet<br><span style="font-size: 12px; opacity: 0.7; margin-top: 8px; display: block;">Tracks you play will appear here</span></div>';
    } else {
        recentlyPlayed.forEach((track, idx) => {
            const item = createQueueItemElement(track, -1, false);
            // Remove drag handle and remove button for recently played
            const drag = item.querySelector('.queue-item-drag');
            const removeBtn = item.querySelector('.queue-item-remove');
            if (drag) drag.remove();
            if (removeBtn) removeBtn.remove();
            
            // Update grid template
            item.style.gridTemplateColumns = '56px 1fr auto auto';
            
            // Change click behavior to add to queue and play
            item.onclick = () => {
                queue.push(track);
                playIndex(queue.length - 1);
                closeQueue();
            };
            
            recentList.appendChild(item);
        });
    }
}

// Drag and Drop handlers
let draggedItem = null;
let draggedIndex = -1;
let dragOverItem = null;
let dropPosition = 'after'; // 'before' or 'after'
let lastDragOverTime = 0;
const DRAG_THROTTLE = 16; // ~60fps
let autoScrollInterval = null;
const SCROLL_SPEED = 10;
const SCROLL_ZONE = 80; // pixels from edge to trigger scroll

function handleDragStart(e) {
    draggedItem = this;
    draggedIndex = parseInt(this.dataset.index);
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
    
    // Add dragging class to body to prevent text selection globally
    document.body.classList.add('is-dragging');
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.body.classList.remove('is-dragging');
    
    // Clear auto-scroll interval
    if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
    }
    
    // Remove all drag-over indicators
    const items = document.querySelectorAll('.queue-item');
    items.forEach(item => {
        item.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    
    draggedItem = null;
    draggedIndex = -1;
    dragOverItem = null;
    dropPosition = 'after';
    lastDragOverTime = 0;
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    
    e.dataTransfer.dropEffect = 'move';
    
    // Don't allow dropping on currently playing item or on itself
    if (this.classList.contains('now-playing') || this === draggedItem) {
        return false;
    }
    
    // Auto-scroll when dragging near edges
    const queueContent = document.querySelector('.queue-content');
    if (queueContent) {
        const contentRect = queueContent.getBoundingClientRect();
        const distanceFromTop = e.clientY - contentRect.top;
        const distanceFromBottom = contentRect.bottom - e.clientY;
        
        // Clear existing scroll interval
        if (autoScrollInterval) {
            clearInterval(autoScrollInterval);
            autoScrollInterval = null;
        }
        
        // Scroll up if near top
        if (distanceFromTop < SCROLL_ZONE && distanceFromTop > 0) {
            autoScrollInterval = setInterval(() => {
                queueContent.scrollTop -= SCROLL_SPEED;
            }, 20);
        }
        // Scroll down if near bottom
        else if (distanceFromBottom < SCROLL_ZONE && distanceFromBottom > 0) {
            autoScrollInterval = setInterval(() => {
                queueContent.scrollTop += SCROLL_SPEED;
            }, 20);
        }
    }
    
    // Throttle for performance while maintaining responsiveness
    const now = Date.now();
    if (now - lastDragOverTime < DRAG_THROTTLE) {
        return false;
    }
    lastDragOverTime = now;
    
    // Calculate if mouse is in top or bottom half of item
    const rect = this.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const isTopHalf = e.clientY < midpoint;
    
    // Only update if position changed or item changed
    const newPosition = isTopHalf ? 'before' : 'after';
    if (dragOverItem === this && dropPosition === newPosition) {
        return false;
    }
    
    // Remove previous indicators
    const items = document.querySelectorAll('.queue-item');
    items.forEach(item => {
        item.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    
    // Add appropriate indicator
    if (isTopHalf) {
        this.classList.add('drag-over-top');
        dropPosition = 'before';
    } else {
        this.classList.add('drag-over-bottom');
        dropPosition = 'after';
    }
    
    dragOverItem = this;
    
    return false;
}

function handleDragEnter(e) {
    // Handled in dragover for better responsiveness
}

function handleDragLeave(e) {
    // Only remove classes if we're actually leaving the element
    const rect = this.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX >= rect.right ||
        e.clientY < rect.top || e.clientY >= rect.bottom) {
        this.classList.remove('drag-over-top', 'drag-over-bottom');
    }
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    if (e.preventDefault) {
        e.preventDefault();
    }
    
    // Don't allow dropping on currently playing item
    if (this.classList.contains('now-playing') || this === draggedItem) {
        return false;
    }
    
    const dropIndex = parseInt(this.dataset.index);
    
    if (draggedItem !== this && draggedIndex !== dropIndex) {
        // Calculate actual drop position
        let targetIndex = dropIndex;
        if (dropPosition === 'after') {
            targetIndex = dropIndex;
        } else {
            targetIndex = dropIndex;
        }
        
        // Reorder the queue
        reorderQueue(draggedIndex, targetIndex, dropPosition);
    }
    
    return false;
}

function reorderQueue(fromIndex, toIndex, position) {
    // Can't move the currently playing track
    if (fromIndex === currentIndex) {
        return;
    }
    
    // Calculate the actual target index based on position
    let actualToIndex = toIndex;
    
    if (position === 'after') {
        actualToIndex = toIndex + 1;
    }
    
    // If we're moving an item down the list, adjust for the removal
    if (fromIndex < actualToIndex) {
        actualToIndex--;
    }
    
    // Can't drop right after the currently playing track if position is 'before' the next item
    // This effectively means we're trying to insert at currentIndex + 1, which is fine
    
    // Remove the item from its original position
    const [movedTrack] = queue.splice(fromIndex, 1);
    
    // Adjust current index after removal
    let newCurrentIndex = currentIndex;
    if (fromIndex < currentIndex) {
        newCurrentIndex--;
    }
    
    // Adjust target index based on current index position
    let finalIndex = actualToIndex;
    if (fromIndex < currentIndex && actualToIndex > currentIndex) {
        finalIndex = actualToIndex;
    } else if (fromIndex > currentIndex && actualToIndex <= currentIndex) {
        finalIndex = actualToIndex;
        newCurrentIndex++;
    }
    
    // Insert the item at its new position
    queue.splice(finalIndex, 0, movedTrack);
    
    // Update current index
    currentIndex = newCurrentIndex;
    
	// Update the display with a slight delay for smooth transition
	requestAnimationFrame(() => {
		updateQueueDisplay();
		savePlaybackState();
	});
}


