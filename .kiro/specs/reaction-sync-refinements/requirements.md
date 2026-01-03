# Requirements Document

## Introduction

This document specifies refinements and improvements to the reaction-sync video player application. The improvements address file picker usability, UI/UX issues with the tips screen and resume prompt, a bug with the resume popup appearing for new videos, and overall UI enhancements for better control accessibility and visual polish.

## Glossary

- **Reaction_Sync**: The video synchronization application that allows users to watch reaction videos alongside base videos
- **Base_Video**: The primary/original video displayed fullscreen in the background
- **React_Video**: The reaction video displayed in a draggable, resizable overlay window
- **Tips_Screen**: The initial information/quick-start dialog shown when the application loads
- **Resume_Prompt**: A dialog that offers to restore a previous viewing session
- **File_Picker**: The browser's native file selection dialog
- **Session**: A saved state containing video sources, playback position, delay, and UI positions
- **Controls_Bar**: The bottom control panel for the base video with playback, seek, delay, and sync controls
- **React_Controls**: The overlay controls on the react video container for playback and volume

## Requirements

### Requirement 1: File Picker Video Format Support

**User Story:** As a user, I want the file picker to show all common video formats by default, so that I can easily select MKV, AVI, MP4, and other video files without manually changing the filter.

#### Acceptance Criteria

1. WHEN the file picker opens for local video selection, THE File_Picker SHALL display files matching common video extensions including mp4, mkv, avi, webm, mov, m4v, wmv, flv, and ogv
2. WHEN the file picker opens, THE File_Picker SHALL use an accept attribute that includes both video/* MIME type and explicit extensions for formats that may not be recognized by video/*

### Requirement 2: Auto-Close Tips Screen on File Load

**User Story:** As a user, I want the tips/info screen to close automatically when I start loading a video, so that I don't have to manually dismiss it every time.

#### Acceptance Criteria

1. WHEN a user initiates loading a local file from the tips screen, THE Tips_Screen SHALL close automatically
2. WHEN a user initiates loading a video via URL/link from the tips screen, THE Tips_Screen SHALL close automatically
3. WHEN a user clicks "Load Last" to restore a session, THE Tips_Screen SHALL close automatically (already implemented)

### Requirement 3: Resume Prompt Only for Previously Saved Sessions

**User Story:** As a user, I want the resume prompt to only appear when I load videos that I have previously watched and saved progress for, so that I don't see it for completely new video pairs.

#### Acceptance Criteria

1. WHEN two videos are loaded for the first time as a pair, THE Resume_Prompt SHALL NOT appear
2. WHEN two videos are loaded that have a previously saved session with meaningful progress (>5 seconds), THE Resume_Prompt SHALL appear offering to restore the session
3. WHEN the session being loaded was created in the current application session (same page load), THE Resume_Prompt SHALL NOT appear
4. THE Reaction_Sync SHALL track which video pairs have been newly loaded in the current session to prevent false resume prompts

### Requirement 4: Base Video Controls Visibility

**User Story:** As a user, I want to see the entire base video without any part being cut off by the controls, so that I don't miss any content.

#### Acceptance Criteria

1. THE Controls_Bar SHALL NOT overlap or obscure any part of the Base_Video content
2. THE Base_Video container SHALL have padding or margin at the bottom to account for the controls height
3. WHEN the controls are visible, THE Base_Video SHALL remain fully visible with proper spacing

### Requirement 5: React Video Controls Accessibility

**User Story:** As a user, I want to be able to access the react video controls even when the react window is positioned at the bottom of the screen, so that I can adjust volume and seek without repositioning the window.

#### Acceptance Criteria

1. WHEN the React_Video container is positioned near the bottom of the viewport, THE React_Controls SHALL remain accessible and not be cut off by the screen edge
2. THE React_Controls SHALL be repositionable to appear above the video when the container is near the bottom edge
3. WHEN the React_Video container is small (compact mode), THE React_Controls SHALL adapt to remain usable
4. THE React_Controls SHALL provide a way to access volume and seek functionality regardless of container position

### Requirement 6: Enhanced UI Visual Design

**User Story:** As a user, I want a polished and refined visual interface, so that the application feels professional and pleasant to use.

#### Acceptance Criteria

1. THE Controls_Bar SHALL have improved visual hierarchy with clear grouping of related controls
2. THE React_Video container SHALL have smooth animations and transitions for hover states
3. THE Reaction_Sync SHALL use consistent spacing, colors, and typography throughout the interface
4. THE Controls_Bar SHALL have a more solid background that provides better contrast while maintaining the modern aesthetic
5. WHEN hovering over interactive elements, THE Reaction_Sync SHALL provide clear visual feedback

### Requirement 7: Improved Control Bar Layout

**User Story:** As a user, I want the control bar to be well-organized and not feel cluttered, so that I can quickly find and use the controls I need.

#### Acceptance Criteria

1. THE Controls_Bar SHALL organize controls into logical groups with clear visual separation
2. THE Controls_Bar SHALL prioritize the most frequently used controls (play/pause, seek, sync)
3. THE Controls_Bar SHALL use appropriate sizing for touch and mouse interaction
4. WHEN the viewport is narrow, THE Controls_Bar SHALL adapt gracefully without breaking layout
