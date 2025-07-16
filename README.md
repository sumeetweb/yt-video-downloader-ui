# YouTube Video Downloader

A web-based YouTube video downloader that allows users to download individual videos or entire playlists in various quality formats.

## Features

- **Playlist Support**: Download entire YouTube playlists with automatic video extraction
- **Individual Videos**: Download single YouTube videos by URL
- **Quality Selection**: Choose from multiple quality options (360p, 480p, 720p, 1080p)
- **Batch Downloads**: Process multiple videos concurrently (up to 3 simultaneous downloads)
- **Progress Tracking**: Real-time download progress with visual indicators
- **Resume Capability**: Resume interrupted downloads automatically
- **Error Handling**: Robust retry mechanism with server maintenance detection
- **Responsive Design**: Works on desktop and mobile devices

## Usage

1. **Open the Application**: Open `index.html` in your web browser
2. **Add Videos**: 
   - Paste a YouTube playlist URL (e.g., `https://www.youtube.com/playlist?list=...`)
   - Or paste individual video URLs (e.g., `https://www.youtube.com/watch?v=...`)
3. **Select Quality**: Choose your preferred video quality from the dropdown
4. **Start Downloads**: Click "Start All Downloads" to begin processing
5. **Monitor Progress**: Watch real-time progress for each video
6. **Download Files**: Click the download button when videos are ready

## File Structure

```
repo/
├── index.html          # Main HTML interface
├── script.js           # Core application logic
├── constants.js        # API configuration and constants
└── README.md          # This file
```

## Technical Details

### API Configuration
The application uses external APIs for video processing and muxing audio.  
Hidden in this case, due to the sensitive nature of API keys and endpoints.
- **Playlist API**: `https://example.com/getPlaylist`
- **Download API**: `https://example.com/startDownload`

All API configurations are centralized in `constants.js` for easy maintenance.

### Download Process
1. **URL Validation**: Validates YouTube playlist or video URLs
2. **Metadata Extraction**: Fetches video information and thumbnails
3. **Download Initiation**: Sends request to processing server
4. **Progress Monitoring**: Polls server for conversion progress
5. **File Delivery**: Provides download link when ready

### Error Handling
- **Automatic Retries**: Up to 3 retries for failed downloads
- **Server Maintenance**: Extended retry logic (10 attempts) for maintenance periods
- **Progress Timeout**: 30-minute maximum wait time per video
- **Graceful Degradation**: Continues processing other videos if one fails

## Browser Requirements

- Modern web browser with ES6+ support
- JavaScript enabled
- CORS support for external API calls

## Limitations

- Requires active internet connection
- Dependent on external API availability
- Download speeds depend on server processing capacity
- Some videos may be restricted due to copyright or regional limitations

## Development

### Constants Configuration
Sample API URLs and keys are stored in `constants.example.js`:

### Key Functions
- `addUrl()` - Adds videos to download queue
- `startDownloads()` - Initiates batch download process
- `downloadVideo()` - Handles individual video download logic
- `checkProgress()` - Monitors download progress

## License

This project is for educational purposes. Please respect YouTube's Terms of Service and copyright laws when using this tool.