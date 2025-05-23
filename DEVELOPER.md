# reaction-sync - Developer Documentation

## Introduction

This document provides detailed technical information for developers who want to work on the reaction-sync project. It explains the architecture, code organization, and how different components interact with each other.

## Architecture Overview

reaction-sync follows a modular architecture with clear separation of concerns:

1. **Core Application (app.js)** - Coordinates all components and manages the application state
2. **YouTube Integration (youtube.js)** - Handles all YouTube-specific functionality
3. **Local Video Handling (local-video.js)** - Manages local video playback and synchronization
4. **Utilities (utils.js)** - Provides common utility functions
5. **UI Layer (index.html)** - Defines the user interface and includes CSS styling

## Module Interactions

### Data Flow

1. User interactions trigger events in the UI layer
2. Event handlers in app.js process these events
3. app.js delegates to specialized modules (youtube.js or local-video.js) as needed
4. State changes are reflected back to the UI

## Detailed Module Descriptions

### app.js

#### Key Functions

- **selectVideo(videoX, callBack, forceLink)** - Handles video source selection for both base and reaction videos
  - Parameters:
    - `videoX`: The video element selector ("#videoBase", "#videoBaseLocal", or "#videoReact")
    - `callBack`: Optional callback function to execute after video selection
    - `forceLink`: Boolean flag to force link input instead of file selection

- **trytoSync()** - Synchronizes base and reaction videos based on the current delay
  - Handles both YouTube and local videos
  - Manages play/pause states and seeking to maintain synchronization

- **getBaseVideo()** / **getReactVideo()** - Helper functions to get the appropriate video element (YouTube or local)

- **getBaseCurrentTime()** / **getReactCurrentTime()** - Get current playback time from either YouTube or local video

- **getBaseDuration()** / **getReactDuration()** - Get video duration from either YouTube or local video

- **updatePlayPauseButtons()** - Updates UI button states based on video playback state

- **initializeEventHandlers()** - Sets up all event listeners for UI controls

- **handleWindowResize()** - Manages video container resizing when window size changes

- **initializeApp()** - Entry point that sets up the application

#### Global State Variables

- `isVideosSynced` - Boolean flag indicating if videos are currently synchronized
- `videoReactDelay` - Delay in seconds between base and reaction videos
- `baseYoutubePlayer` / `reactYoutubePlayer` - References to YouTube player objects
- `isBaseYoutubeVideo` / `isReactYoutubeVideo` - Flags indicating if videos are YouTube or local

### youtube.js

#### Key Functions

- **initializeYouTubePlayer(videoId, isReaction, retryCount)** - Creates and initializes a YouTube player
  - Parameters:
    - `videoId`: YouTube video ID
    - `isReaction`: Boolean flag indicating if this is the reaction video
    - `retryCount`: Number of retry attempts (for error recovery)

- **handleYouTubeError(errorCode, isReaction)** - Handles YouTube API errors with retry mechanism

- **onYoutubeStateChange(event, isReaction)** - Event handler for YouTube player state changes

- **onQualityChange(event)** - Event handler for quality change events

- **setupYoutubeQualityMenu()** - Creates and populates the quality selection menu

- **setupYouTubeReactControls()** - Sets up controls specific to YouTube reaction videos

#### YouTube Player Variables

- `baseYoutubePlayer` / `reactYoutubePlayer` - References to YouTube player objects
- `isBaseYoutubePlayerReady` / `isReactYoutubePlayerReady` - Flags indicating player readiness
- `baseYoutubeRetryCount` / `reactYoutubeRetryCount` - Counters for retry attempts
- `qualityLabels` - Mapping of YouTube quality codes to human-readable labels

### local-video.js

#### Key Functions

- **setDelay(delay)** - Sets the delay between base and reaction videos
  - Parameter: `delay` - Delay in seconds

- **selectLocalVideo(videoX, callBack)** - Handles local video file selection
  - Parameters:
    - `videoX`: The video element selector
    - `callBack`: Optional callback function

- **loadSubtitles()** - Loads and processes subtitle files (SRT format)

- **getBaseCurrentTime()** / **getReactCurrentTime()** - Get current time of local videos

- **getBaseDuration()** / **getReactDuration()** - Get duration of local videos

- **trytoSync()** - Synchronizes local videos based on the current delay

- **updateTimeDisplay()** - Updates the time display in the UI

#### Local Video State Variables

- `isVideosSynced` - Boolean flag indicating if videos are synchronized
- `videoReactDelay` - Delay in seconds between base and reaction videos

### utils.js

#### Utility Functions

- **secondsToTime(seconds, prec)** - Converts seconds to formatted time string (MM:SS.s)
  - Parameters:
    - `seconds`: Time in seconds
    - `prec`: Precision for decimal places

- **srt2webvtt(srt)** - Converts SRT subtitle format to WebVTT format
  - Parameter: `srt` - String containing SRT subtitle content

- **getYoutubeId(url)** - Extracts YouTube video ID from various URL formats
  - Parameter: `url` - YouTube URL string

- **checkCodecSupport(file)** - Checks if the browser supports the video codec
  - Parameter: `file` - File object to check
  - Returns: Promise resolving to an object with support status and reason

## Event Flow

### Video Loading Flow

1. User clicks "Add Local Video" or "Add Video Link" button
2. `selectVideo()` function is called in app.js
3. For local files, `selectLocalVideo()` in local-video.js is called
4. For links, URL type is determined (YouTube, Real-Debrid, or direct link)
5. For YouTube links, `initializeYouTubePlayer()` in youtube.js is called
6. Video is loaded and UI is updated

### Synchronization Flow

1. User adjusts delay using controls or delay is extracted from filename
2. `setDelay()` function is called in local-video.js
3. `trytoSync()` function is called periodically via requestAnimationFrame
4. Base video playback is adjusted based on reaction video state and delay

## Adding New Features

### Adding a New Video Source

1. Modify the `selectVideo()` function in app.js to handle the new source type
2. Add appropriate detection logic for the new source URL format
3. Implement source-specific loading and playback functions
4. Update UI elements in index.html as needed

### Adding New Controls

1. Add HTML elements to index.html
2. Add CSS styles for the new controls
3. Add event handlers in initializeEventHandlers() in app.js
4. Implement the control functionality in the appropriate module

## Common Development Tasks

### Debugging Tips

1. Use browser developer tools to inspect the DOM and monitor JavaScript execution
2. Check the console for error messages and debug logs
3. Use breakpoints to step through code execution
4. Test with different video sources to ensure compatibility

### Performance Optimization

1. Use requestAnimationFrame for smooth animations and synchronization
2. Minimize DOM manipulations
3. Use event delegation for UI interactions
4. Optimize video loading and quality selection

### Cross-Browser Compatibility

1. Test in multiple browsers (Chrome, Firefox, Edge)
2. Use feature detection instead of browser detection
3. Provide fallbacks for unsupported features
4. Handle codec compatibility issues gracefully

## API Integrations

### YouTube API

The application uses the YouTube IFrame API for embedding and controlling YouTube videos. Key aspects:

1. API is loaded asynchronously in index.html
2. Player objects are created in initializeYouTubePlayer() in youtube.js
3. Events are handled via callback functions
4. Quality selection is managed through the API

### Real-Debrid Integration

Real-Debrid URLs are handled as direct video sources. The application:

1. Detects Real-Debrid URLs in the selectVideo() function
2. Loads them directly into the video element
3. Applies the same synchronization logic as other direct video links

## Testing Procedures

1. **Functionality Testing**
   - Test all buttons and controls
   - Verify video loading from all sources
   - Check synchronization with various delay values

2. **Compatibility Testing**
   - Test with different video formats (MP4, WebM, etc.)
   - Test in different browsers
   - Test with various YouTube video qualities

3. **Error Handling**
   - Test with invalid URLs
   - Test with unsupported codecs
   - Test with unavailable YouTube videos

## Known Issues and Limitations

1. YouTube videos require serving through a web server (not file:// protocol)
2. Some video codecs (like HEVC/H.265) may not be supported in all browsers
3. YouTube embedding restrictions may prevent some videos from loading
4. Synchronization accuracy depends on browser performance and video loading speed

## Future Development Roadmap

1. **Short-term Improvements**
   - Enhance error handling and user feedback
   - Improve mobile device support
   - Add keyboard shortcuts

2. **Medium-term Features**
   - Support for more subtitle formats
   - Enhanced video controls (speed adjustment, frame navigation)
   - Picture-in-picture mode

3. **Long-term Vision**
   - Recording functionality
   - More streaming service integrations
   - Cloud storage integration

## Conclusion

This developer documentation provides a comprehensive guide to the reaction-sync codebase. By understanding the architecture, module interactions, and key functions, developers can effectively maintain and extend the application's functionality.