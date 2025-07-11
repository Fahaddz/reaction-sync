# reaction-sync - Video Reaction Synchronization Tool

## Overview

reaction-sync is a web application that allows users to synchronize and display two videos simultaneously - a base video and a reaction video. It's designed for content creators who want to create reaction videos where their reaction is perfectly timed with the original content. The application supports both local video files and YouTube videos, as well as direct video links and Real-Debrid streams.

## Features

- Synchronize a base video with a reaction video
- Support for multiple video sources:
  - Local video files
  - YouTube videos
  - Direct video links
  - Real-Debrid streams
- Adjustable delay between videos
- Subtitle support (SRT format)
- Resizable and draggable reaction video window
- Video quality selection for YouTube videos
- Volume controls for both videos
- Automatic codec compatibility checking
- + Universal codec support via ffmpeg.wasm fallback (transcodes any container/codec to MP4/H.264 client-side)
  - Universal codec support via ffmpeg.wasm fallback (transcodes any container/codec to MP4/H.264 client-side)

## Project Structure

### Main Files

- **index.html**: The main HTML file that defines the UI structure and loads all necessary scripts.
- **js/app.js**: The main application file that integrates all components and handles the core functionality.
- **js/youtube.js**: Handles all YouTube-specific functionality.
- **js/local-video.js**: Manages local video file handling and synchronization.
- **js/utils.js**: Contains utility functions used throughout the application.

## Detailed File Descriptions

### index.html

This is the main HTML file that defines the structure of the application. It includes:

- Basic HTML structure and meta tags
- YouTube API loading script
- jQuery and jQuery UI loading
- CSS styles for the application UI
- Video containers for both base and reaction videos
- Control elements (buttons, sliders, etc.)
- Modal dialogs for settings and information

The file is structured to create a full-screen base video with a smaller, draggable reaction video overlay. It also includes various control elements for video playback, synchronization, and other features.

### js/app.js

This is the main application file that integrates all components and handles the core functionality. Key features include:

- Importing functions from other modules
- Managing global state variables
- Providing helper functions for video access that work with both YouTube and local videos
- Handling video source selection (local file, YouTube, or direct link)
- Synchronizing base and reaction videos
- Initializing event handlers for UI elements
- Managing playback controls
- Handling window resize events
- Initializing the application

The file serves as the central hub that connects all the different components of the application.

### js/youtube.js

This file handles all YouTube-specific functionality, including:

- YouTube player initialization with retry mechanism
- Error handling for YouTube videos
- State change handling for YouTube players
- Quality change handling
- Setting up YouTube quality menu
- Setting up YouTube reaction controls
- Handling YouTube iframe API ready event

It provides a robust integration with the YouTube API, including features like quality selection and error recovery.

### js/local-video.js

This file manages local video file handling and synchronization, including:

- Setting delay between base and reaction videos
- Handling local video file selection
- Loading subtitles for base video
- Getting current time and duration of videos
- Synchronizing base and reaction videos
- Updating time displays
- Handling playback controls for local videos

It provides the core functionality for working with local video files and ensuring they stay in sync.

### js/utils.js

This file contains utility functions used throughout the application, including:

- Converting seconds to formatted time string
- Converting SRT subtitle format to WebVTT format
- Extracting YouTube video ID from URL
- Checking codec support for video files

These functions provide common functionality that is used by multiple components of the application.

## How to Use the Application

### Basic Setup

1. Open the application in a web browser (preferably served through a local web server, not via file:// protocol)
2. Add a base video using either:
   - The "Add Local Video" button to select a local file
   - The "Add Video Link" button to enter a YouTube URL, direct video link, or Real-Debrid URL
3. Add a reaction video using either:
   - The "Add Local Video" button in the reaction section
   - The "Add Video Link" button in the reaction section
4. Adjust the delay between videos using the delay controls
5. Use the playback controls to play, pause, and navigate through the videos

### Working with Subtitles

1. Click the "Add Subtitles" button
2. Select an SRT subtitle file
3. The subtitles will be loaded and displayed on the base video

### Adjusting Video Quality

For YouTube videos, you can adjust the quality by:

1. Clicking the quality button in the controls
2. Selecting the desired quality from the dropdown menu

## Development Guide

### Adding New Features

When adding new features to the application, consider the following:

1. Determine which module the feature belongs to (app.js, youtube.js, local-video.js, or utils.js)
2. Add the necessary code to the appropriate module
3. If the feature requires UI elements, add them to index.html
4. If the feature requires new utility functions, add them to utils.js
5. Update the main application logic in app.js to integrate the new feature

### Modifying Existing Features

When modifying existing features:

1. Identify the module that contains the feature
2. Make the necessary changes to the code
3. Test the changes thoroughly to ensure they don't break existing functionality
4. Update any related UI elements in index.html if necessary

### Code Style Guidelines

- Use camelCase for variable and function names
- Use clear and descriptive names for variables and functions
- Add comments to explain complex logic
- Use ES6 features like arrow functions, template literals, and destructuring
- Keep functions small and focused on a single task
- Use try-catch blocks for error handling

### Testing

To test the application:

1. Test with different types of video sources (local files, YouTube, direct links, Real-Debrid)
2. Test with different video codecs to ensure compatibility
3. Test with different browsers to ensure cross-browser compatibility
4. Test with different screen sizes to ensure responsive design
5. Test error handling by intentionally causing errors (e.g., invalid URLs, unsupported codecs)

## Troubleshooting

### Common Issues

- **YouTube videos don't load**: Ensure you're serving the application through a web server, not via file:// protocol
- **Video codec not supported**: Try using Microsoft Edge browser or convert the video to H.264 format
- **Subtitles don't display**: Ensure the subtitle file is in SRT format and properly formatted
- **Videos don't stay in sync**: Adjust the delay between videos and ensure both videos are playing properly

### Browser Compatibility

The application works best in modern browsers like Chrome, Firefox, and Edge. For codec support, Microsoft Edge often has the best compatibility with various video formats.

## Future Enhancements

Potential future enhancements for the application include:

- Support for more subtitle formats
- Enhanced video controls (speed adjustment, frame-by-frame navigation)
- Picture-in-picture mode
- Recording functionality
- More streaming service integrations
- Mobile device support
- Keyboard shortcuts for common actions

## Contributing

Contributions to the project are welcome. To contribute:

1. Fork the repository
2. Create a new branch for your feature
3. Make your changes
4. Test your changes thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Debug Mode
To enable verbose console logs and on-screen debug overlay, open the app URL with `?debug=true` (e.g., `index.html?debug=true`). Detailed logs appear in the browser console, and a debug panel displays real-time sync variables.