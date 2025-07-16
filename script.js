const videoUrls = [];

let videoData = [];
let downloadingCount = 0;
const maxConcurrentDownloads = 3;
const maxRetries = 3;
const serverMaintenanceRetries = 10; // Extra retries for server maintenance
let nextVideoId = 0;
const activeDownloads = new Map(); // Track active download processes with AbortControllers
const requestIds = new Map(); // Store request IDs for persistence
const MAX_ATTEMPTS = 60 * 6; // 30 minutes max wait for progress tracking

const buildPlaylistApiUrl = (playlistUrl) => {
    return `${API_URLS.PLAYLIST}?format=720&url=${encodeURIComponent(playlistUrl)}&limit=100`;
};

const buildDownloadApiUrl = (videoUrl, quality) => {
    const encodedUrl = encodeURIComponent(videoUrl);
    return `${API_URLS.DOWNLOAD}?copyright=0&format=${quality}&url=${encodedUrl}`;
};

function initializeVideos() {
    videoData = [];
    renderVideoGrid();
}

function isPlaylistUrl(url) {
    return url.includes('playlist?list=') || url.includes('&list=');
}

function isVideoUrl(url) {
    return url.includes('youtube.com/watch?v=') || url.includes('youtu.be/');
}

function extractPlaylistId(url) {
    const match = url.match(/[?&]list=([^&]+)/);
    return match ? match[1] : null;
}

function handleUrlKeyPress(event) {
    if (event.key === 'Enter') {
        addUrl();
    }
}

async function addUrl() {
    const urlInput = document.getElementById('urlInput');
    const addBtn = document.getElementById('addBtn');
    const url = urlInput.value.trim();

    if (!url) {
        alert('Please enter a YouTube URL');
        return;
    }

    if (!isPlaylistUrl(url) && !isVideoUrl(url)) {
        alert('Please enter a valid YouTube playlist or video URL');
        return;
    }

    // Disable button and show loading
    addBtn.disabled = true;
    addBtn.innerHTML = '<span class="loading-spinner"></span>Loading...';

    try {
        if (isPlaylistUrl(url)) {
            await addPlaylist(url);
        } else if (isVideoUrl(url)) {
            addSingleVideo(url);
        }
        
        urlInput.value = '';
        renderVideoGrid();
        
    } catch (error) {
        console.error('Error adding URL:', error);
        alert(`Error adding URL: ${error.message}`);
    } finally {
        // Re-enable button
        addBtn.disabled = false;
        addBtn.innerHTML = '➕ Add to Queue';
    }
}

async function addPlaylist(playlistUrl) {
    const playlistId = extractPlaylistId(playlistUrl);
    if (!playlistId) {
        throw new Error('Could not extract playlist ID from URL');
    }

    const apiUrl = buildPlaylistApiUrl(playlistUrl);
    
    try {
        const response = await fetch(apiUrl, {
            method: 'GET',
            mode: 'cors',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error('Invalid playlist response from API');
        }

        if (data.length === 0) {
            throw new Error('No videos found in playlist');
        }

        // Add all videos from playlist
        let addedCount = 0;
        data.forEach(video => {
            if (video.url && video.info) {
                // Check if video already exists
                const exists = videoData.some(v => v.url === video.url);
                if (!exists) {
                    videoData.push({
                        id: nextVideoId++,
                        url: video.url,
                        status: 'pending',
                        progress: 0,
                        title: video.info.title || `Video ${nextVideoId}`,
                        downloadUrl: null,
                        error: null,
                        progressUrl: null,
                        retryCount: 0,
                        maintenanceRetries: 0,
                        thumbnail: video.info.thumbnail_url || null,
                        author: video.info.author_name || 'Unknown',
                        progressText: 'Pending',
                        isPaused: false,
                        requestId: null
                    });
                    addedCount++;
                }
            }
        });

        alert(`Added ${addedCount} videos from playlist! (${data.length - addedCount} were already in queue)`);
        
    } catch (error) {
        // If CORS fails, try alternative approach or fallback
        if (error.message.includes('CORS') || error.message.includes('fetch')) {
            throw new Error('Unable to fetch playlist due to CORS restrictions. Please add videos individually or try a different playlist.');
        }
        throw error;
    }
}

function addSingleVideo(videoUrl) {
    // Check if video already exists
    const exists = videoData.some(v => v.url === videoUrl);
    if (exists) {
        alert('This video is already in the queue');
        return;
    }

    // Extract video ID for title
    const videoId = videoUrl.match(/(?:watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    const title = videoId ? `Video ${videoId[1]}` : `Video ${nextVideoId + 1}`;

    videoData.push({
        id: nextVideoId++,
        url: videoUrl,
        status: 'pending',
        progress: 0,
        title: title,
        downloadUrl: null,
        error: null,
        progressUrl: null,
        retryCount: 0,
        maintenanceRetries: 0,
        thumbnail: null,
        author: 'Unknown',
        progressText: 'Pending',
        isPaused: false,
        requestId: null
    });

    console.log('Added video:', videoUrl);
    alert('Video added to queue!');
}

function renderVideoGrid() {
    const grid = document.getElementById('videoGrid');
    grid.innerHTML = '';

    if (videoData.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: #6c757d;">
                <div style="font-size: 3rem; margin-bottom: 20px;">📝</div>
                <h3>No videos in queue</h3>
                <p>Add a YouTube playlist or video URL above to get started!</p>
            </div>
        `;
        updateStats();
        return;
    }

    videoData.forEach(video => {
        const card = document.createElement('div');
        card.className = `video-card ${video.status}`;
        card.innerHTML = `
            <div class="video-header">
                <div class="video-title">${video.title}</div>
                ${video.author && video.author !== 'Unknown' ? 
                    `<div style="font-size: 0.85rem; color: #6c757d; margin-bottom: 5px;">by ${video.author}</div>` : ''
                }
                <div class="video-url">${video.url}</div>
            </div>
            <div class="video-body">
                <div class="status ${video.status}">${video.progressText || video.status}</div>
                <div class="progress-container">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${video.progress / 10}%"></div>
                    </div>
                    <div class="progress-text">${video.progress / 10}%</div>
                </div>
                ${video.downloadUrl ? 
                    `<button class="download-btn" onclick="downloadVideo('${video.downloadUrl}', '${video.title}')">
                        📥 Download Video
                    </button>` : 
                    video.status === 'pending' ?
                    `<button class="download-btn" onclick="startSingleVideo(${video.id})" style="background: #28a745;">
                        ▶️ Start Download
                    </button>` :
                    video.status === 'processing' ?
                    `<button class="download-btn" onclick="pauseSingleVideo(${video.id})" style="background: #ffc107; color: #212529;">
                        ⏸️ Pause (${video.progressText || 'Processing'})
                    </button>` :
                    video.status === 'error' && (video.retryCount < maxRetries || video.maintenanceRetries < serverMaintenanceRetries) ?
                    `<button class="download-btn" onclick="retryVideo(${video.id})" style="background: #ffc107; color: #212529;">
                        🔄 Retry (${video.retryCount}/${maxRetries}${video.maintenanceRetries > 0 ? ` + ${video.maintenanceRetries} maintenance` : ''})
                    </button>` :
                    video.status === 'maintenance' ?
                    `<button class="download-btn" onclick="retryVideo(${video.id})" style="background: #17a2b8; color: white;">
                        ⏳ Server Maintenance - Retry (${video.maintenanceRetries}/${serverMaintenanceRetries})
                    </button>` :
                    video.status === 'paused' ?
                    `<button class="download-btn" onclick="startSingleVideo(${video.id})" style="background: #28a745;">
                        ▶️ Resume Download
                    </button>` :
                    `<button class="download-btn" disabled>
                        ${video.status === 'error' ? '❌ Max Retries Reached' : '⏸️ Pending'}
                    </button>`
                }
                ${video.error ? `<div class="error-message">❌ ${video.error}</div>` : ''}
                <button onclick="removeVideo(${video.id})" style="width: 100%; margin-top: 10px; padding: 8px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 0.85rem;">
                    🗑️ Remove from Queue
                </button>
            </div>
        `;
        grid.appendChild(card);
    });

    updateStats();
}

function removeVideo(videoId) {
    const index = videoData.findIndex(v => v.id === videoId);
    if (index !== -1) {
        const video = videoData[index];
        const wasProcessing = video.status === 'processing';
        
        // If video is actively downloading, pause it first
        if (wasProcessing) {
            console.log(`Pausing video ${videoId} before removal`);
            pauseSingleVideo(videoId);
            
            // Wait a moment for pause to complete, then proceed with removal
            setTimeout(() => {
                completeVideoRemoval(videoId);
            }, 100);
        } else {
            // Video is not active, remove immediately
            completeVideoRemoval(videoId);
        }
    }
}

function completeVideoRemoval(videoId) {
    const index = videoData.findIndex(v => v.id === videoId);
    if (index !== -1) {
        // Ensure any active download is completely cancelled
        if (activeDownloads.has(videoId)) {
            const downloadInfo = activeDownloads.get(videoId);
            downloadInfo.abortController.abort();
            downloadInfo.userRemoved = true;
            activeDownloads.delete(videoId);
        }
        
        // Clear stored request ID
        requestIds.delete(videoId);
        
        // Remove from video data
        videoData.splice(index, 1);
        renderVideoGrid();
        
        console.log(`Removed video ${videoId} from queue - no auto-start of next video`);
    }
}

function updateStats() {
    const completed = videoData.filter(v => v.status === 'completed').length;
    const processing = videoData.filter(v => v.status === 'processing').length;
    const error = videoData.filter(v => v.status === 'error').length;
    const maintenance = videoData.filter(v => v.status === 'maintenance').length;
    const paused = videoData.filter(v => v.status === 'paused').length;

    document.getElementById('totalVideos').textContent = videoData.length;
    document.getElementById('completedVideos').textContent = completed;
    document.getElementById('processingVideos').textContent = processing + maintenance;
    document.getElementById('errorVideos').textContent = error;
}

async function startDownloads() {
    const quality = document.getElementById('quality').value;
    
    for (const video of videoData) {
        if (video.status === 'pending') {
            if (downloadingCount < maxConcurrentDownloads) {
                processVideo(video, quality);
            }
        }
    }
}

function startSingleVideo(videoId) {
    const video = videoData.find(v => v.id === videoId);
    if (video && (video.status === 'pending' || video.status === 'paused') && downloadingCount < maxConcurrentDownloads) {
        // Don't start if already processing
        if (activeDownloads.has(videoId)) {
            console.log(`Video ${videoId} is already being processed`);
            return;
        }
        
        video.isPaused = false;
        const quality = document.getElementById('quality').value;
        processVideo(video, quality);
    } else if (downloadingCount >= maxConcurrentDownloads) {
        alert('Maximum concurrent downloads reached. Please wait for some downloads to finish.');
    }
}

function pauseSingleVideo(videoId) {
    const video = videoData.find(v => v.id === videoId);
    if (video && video.status === 'processing') {
        // Immediately update UI state
        video.status = 'paused';
        video.progressText = 'Paused by user';
        video.error = null;
        video.isPaused = true;
        
        // Cancel the ongoing request
        if (activeDownloads.has(videoId)) {
            const downloadInfo = activeDownloads.get(videoId);
            downloadInfo.abortController.abort();
            downloadInfo.isPaused = true;
            downloadInfo.userPaused = true; // Mark as manually paused by user
            console.log(`Cancelled request for video ${videoId}`);
        }
        
        // Store request ID for potential resume
        if (video.progressUrl) {
            requestIds.set(videoId, video.progressUrl);
        }
        
        renderVideoGrid();
        console.log(`Video ${videoId} paused successfully`);
    }
}

function pauseAllDownloads() {
    videoData.forEach(video => {
        if (video.status === 'processing') {
            // Mark each as manually paused
            if (activeDownloads.has(video.id)) {
                const downloadInfo = activeDownloads.get(video.id);
                downloadInfo.userPaused = true;
            }
            pauseSingleVideo(video.id);
        }
    });
}

async function processVideo(video, quality) {
    // Check if already processing this video
    if (activeDownloads.has(video.id)) {
        console.log(`Video ${video.id} is already being processed`);
        return;
    }

    downloadingCount++;
    video.status = 'processing';
    video.progress = 0;
    video.error = null;
    video.progressText = 'Starting...';
    video.isPaused = false;
    
    // Create AbortController for this download
    const abortController = new AbortController();
    activeDownloads.set(video.id, { 
        abortController, 
        isPaused: false,
        userPaused: false, // Track if user manually paused
        userRemoved: false // Track if user manually removed
    });
    
    renderVideoGrid();
    console.log(`Started processing video ${video.id}`);

    try {
        // Check if we have a stored request ID (resume case)
        let progressUrl = requestIds.get(video.id);
        
        if (!progressUrl) {
            // Step 1: Initiate new download
            const downloadApiUrl = buildDownloadApiUrl(video.url, quality);
            
            const response = await fetch(downloadApiUrl, {
                signal: abortController.signal
            });
            
            if (abortController.signal.aborted) {
                console.log(`Request aborted for video ${video.id}`);
                return;
            }
            
            const data = await response.json();

            if (!data.success) {
                // Check if it's server maintenance
                if (data.message && data.message.toLowerCase().includes('server is being worked on')) {
                    throw new Error('SERVER_MAINTENANCE');
                }
                throw new Error(data.message || 'Failed to initiate download');
            }
            
            video.id = data.id;
            video.title = data.info.title || video.title;
            video.progressUrl = API_URLS.PROGRESS + `?id=${video.id}`;
            video.requestId = data.id;
            
            // Store request ID for persistence
            requestIds.set(video.id, video.progressUrl);
            
            video.progress = 50;
            video.progressText = 'Initialising';
            renderVideoGrid();
        } else {
            // Resume case - we already have progressUrl
            video.progressUrl = progressUrl;
            video.progressText = 'Resuming...';
            renderVideoGrid();
            console.log(`Resuming video ${video.id} with stored progress URL`);
        }

        // Step 2: Track progress
        await trackProgress(video, abortController);

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log(`Download aborted for video ${video.id}`);
            return;
        }
        
        const isServerMaintenance = error.message === 'SERVER_MAINTENANCE';
        
        if (isServerMaintenance) {
            video.maintenanceRetries++;
            video.status = 'maintenance';
            video.progressText = 'Server Maintenance';
            video.error = `Server maintenance detected (Attempt ${video.maintenanceRetries}/${serverMaintenanceRetries})`;
            
            if (video.maintenanceRetries < serverMaintenanceRetries) {
                console.log(`Server maintenance - retrying video ${video.id} in 10 seconds...`);
                renderVideoGrid();
                
                setTimeout(() => {
                    if (downloadingCount < maxConcurrentDownloads && !video.isPaused) {
                        activeDownloads.delete(video.id);
                        processVideo(video, quality);
                        return;
                    } else {
                        video.status = 'pending';
                        video.progressText = 'Pending';
                        activeDownloads.delete(video.id);
                        renderVideoGrid();
                        downloadingCount--; // Decrement here since we're not continuing
                    }
                }, 10000);
                return;
            } else {
                video.status = 'error';
                video.progressText = 'Error';
                video.error = 'Server maintenance - max retries exceeded';
            }
        } else {
            video.retryCount++;
            video.status = 'error';
            video.progressText = 'Error';
            video.error = `${error.message} (Attempt ${video.retryCount}/${maxRetries})`;
            
            if (video.retryCount < maxRetries) {
                console.log(`Auto-retrying video ${video.id} in 3 seconds...`);
                renderVideoGrid();
                
                setTimeout(() => {
                    if (downloadingCount < maxConcurrentDownloads && !video.isPaused) {
                        activeDownloads.delete(video.id);
                        processVideo(video, quality);
                        return;
                    } else {
                        video.status = 'pending';
                        video.progressText = 'Pending';
                        activeDownloads.delete(video.id);
                        renderVideoGrid();
                        downloadingCount--; // Decrement here since we're not continuing
                    }
                }, 3000);
                return;
            }
        }
        
        renderVideoGrid();
    } finally {
        downloadingCount--;
        const wasUserPaused = activeDownloads.get(video.id)?.userPaused || false;
        const wasUserRemoved = activeDownloads.get(video.id)?.userRemoved || false;
        activeDownloads.delete(video.id);
        
        // Only start next pending download if this wasn't manually paused or removed by user
        if (!wasUserPaused && !wasUserRemoved) {
            const nextPending = videoData.find(v => v.status === 'pending');
            if (nextPending && downloadingCount < maxConcurrentDownloads) {
                const currentQuality = document.getElementById('quality').value;
                processVideo(nextPending, currentQuality);
            }
        } else {
            console.log(`Not starting next video - user manually ${wasUserPaused ? 'paused' : 'removed'} video ${video.id}`);
        }
    }
}

async function trackProgress(video, abortController) {
    const maxAttempts = MAX_ATTEMPTS; // 30 minutes max wait
    let attempts = 0;

    while (attempts < maxAttempts) {
        // Check if request was aborted
        if (abortController.signal.aborted) {
            console.log(`Progress tracking aborted for video ${video.id}`);
            return;
        }

        // Check if video was paused
        if (video.isPaused) {
            console.log(`Progress tracking stopped for video ${video.id} - paused`);
            return;
        }

        try {
            const progressUrl = API_URLS.PROGRESS + `?id=${video.id}`;
            const response = await fetch(progressUrl, {
                signal: abortController.signal
            });
            
            if (abortController.signal.aborted) {
                console.log(`Progress request aborted for video ${video.id}`);
                return;
            }

            const progressData = await response.json();

            // Check again if paused after API call
            if (video.isPaused || abortController.signal.aborted) {
                console.log(`Progress tracking stopped for video ${video.id} - paused after API response`);
                return;
            }

            video.progress = progressData.progress;
            video.progressText = progressData.text || 'Processing';
            
            if (progressData.success === 1) {
                video.status = 'completed';
                video.progressText = 'Finished';
                video.downloadUrl = progressData.download_url;
                video.progress = 1000;
                
                // Clear stored request ID when completed
                requestIds.delete(video.id);
                
                renderVideoGrid();
                return;
            }

            if (progressData.success === -1) {
                throw new Error('Download failed');
            }

            renderVideoGrid();
            
            // Wait 5 seconds before next check
            await new Promise((resolve, reject) => {
                const timeoutId = setTimeout(resolve, 5000);
                
                // If aborted during wait, cancel timeout and reject
                if (abortController.signal.aborted) {
                    clearTimeout(timeoutId);
                    reject(new Error('Aborted'));
                    return;
                }
                
                abortController.signal.addEventListener('abort', () => {
                    clearTimeout(timeoutId);
                    reject(new Error('Aborted'));
                });
            });
            
            attempts++;

        } catch (error) {
            if (error.name === 'AbortError' || error.message === 'Aborted') {
                console.log(`Progress tracking aborted for video ${video.id}`);
                return;
            }
            throw new Error(`Progress tracking failed: ${error.message}`);
        }
    }

    throw new Error('Download timeout');
}

function retryVideo(videoId) {
    const video = videoData.find(v => v.id === videoId);
    if (video && (video.retryCount < maxRetries || video.maintenanceRetries < serverMaintenanceRetries)) {
        // Cancel any existing active download for this video
        if (activeDownloads.has(videoId)) {
            const downloadInfo = activeDownloads.get(videoId);
            downloadInfo.abortController.abort();
            activeDownloads.delete(videoId);
        }
        
        video.status = 'pending';
        video.progressText = 'Pending';
        video.error = null;
        video.progress = 0;
        video.downloadUrl = null;
        video.progressUrl = null;
        video.isPaused = false;
        
        renderVideoGrid();
        
        // Start processing if slot available
        if (downloadingCount < maxConcurrentDownloads) {
            const quality = document.getElementById('quality').value;
            processVideo(video, quality);
        } else {
            alert('Maximum concurrent downloads reached. Video queued for retry.');
        }
    }
}

function retryAllFailed() {
    const failedVideos = videoData.filter(v => 
        (v.status === 'error' && v.retryCount < maxRetries) || 
        (v.status === 'maintenance' && v.maintenanceRetries < serverMaintenanceRetries) ||
        (v.status === 'paused')
    );
    
    failedVideos.forEach(video => {
        // Cancel any existing active download for this video
        if (activeDownloads.has(video.id)) {
            const downloadInfo = activeDownloads.get(video.id);
            downloadInfo.abortController.abort();
            activeDownloads.delete(video.id);
        }
        
        video.status = 'pending';
        video.progressText = 'Pending';
        video.error = null;
        video.progress = 0;
        video.downloadUrl = null;
        video.progressUrl = null;
        video.isPaused = false;
    });
    
    renderVideoGrid();
    
    // Start processing failed videos
    const quality = document.getElementById('quality').value;
    failedVideos.slice(0, maxConcurrentDownloads - downloadingCount).forEach(video => {
        processVideo(video, quality);
    });
}

function downloadVideo(url, title) {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title}.mp4`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function clearAll() {
    // Ask for confirmation before clearing everything
    const totalVideos = videoData.length;
    const processingVideos = videoData.filter(v => v.status === 'processing').length;
    
    let confirmMessage = `Are you sure you want to remove all ${totalVideos} videos from the queue?`;
    if (processingVideos > 0) {
        confirmMessage += `\n\n⚠️ Warning: ${processingVideos} video(s) are currently downloading and will be paused then removed.`;
    }
    confirmMessage += '\n\nThis action cannot be undone.';
    
    if (!confirm(confirmMessage)) {
        return; // User cancelled
    }
    
    // First pause all active downloads
    const activeVideoIds = [];
    videoData.forEach(video => {
        if (video.status === 'processing') {
            activeVideoIds.push(video.id);
            pauseSingleVideo(video.id);
        }
    });
    
    // Wait a moment for all pauses to complete, then clear everything
    setTimeout(() => {
        // Cancel any remaining active downloads (safety measure)
        activeDownloads.forEach((downloadInfo, videoId) => {
            downloadInfo.abortController.abort();
            console.log(`Cancelled download for video ${videoId}`);
        });
        activeDownloads.clear();
        
        // Clear all stored request IDs
        requestIds.clear();
        
        // Remove all videos from queue
        videoData.length = 0; // Clear the array
        downloadingCount = 0;
        
        renderVideoGrid();
        console.log(`All videos removed from queue (${activeVideoIds.length} were paused first)`);
    }, processingVideos > 0 ? 200 : 0); // Wait 200ms if there were active downloads
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initializeVideos);
