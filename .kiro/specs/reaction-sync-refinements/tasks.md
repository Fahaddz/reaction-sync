# Implementation Plan: Reaction Sync Refinements

## Overview

This plan implements refinements to the reaction-sync video player including file picker improvements, tips screen auto-close, resume prompt bug fix, and UI enhancements.

## Tasks

- [x] 1. Enhance file picker video format support
  - [x] 1.1 Update promptLocalFile to use comprehensive accept attribute
    - Add VIDEO_ACCEPT constant with video/* and explicit extensions (.mkv, .avi, .mov, .wmv, .flv, .m4v, .webm, .ogv, .3gp, .ts, .mts)
    - Apply to input.accept in promptLocalFile function
    - _Requirements: 1.1, 1.2_

- [x] 2. Implement tips screen auto-close on file load
  - [x] 2.1 Export closeTipsScreen and integrate with video loading
    - Ensure closeTipsScreen is exported from ui/index.ts
    - Import closeTipsScreen in video-loading.ts
    - Call closeTipsScreen() at the start of promptLocalFile()
    - Call closeTipsScreen() at the start of selectUrlSource()
    - _Requirements: 2.1, 2.2_

- [x] 3. Fix resume prompt bug for new video pairs
  - [x] 3.1 Add current session pair tracking in storage.ts
    - Add currentSessionPairs Set to track pairs loaded in current session
    - Create markPairAsNew() function to add pair to the set
    - _Requirements: 3.4_
  - [x] 3.2 Update checkForResume to skip current session pairs
    - Add check for currentSessionPairs.has(key) before showing prompt
    - Return early if pair is in currentSessionPairs
    - _Requirements: 3.1, 3.3_
  - [x] 3.3 Call markPairAsNew when loading new videos
    - Call markPairAsNew() in handleLocalFile after setting source
    - Call markPairAsNew() in selectUrlSource after setting source
    - Call markPairAsNew() in loadYouTubeVideo after setting source
    - Call markPairAsNew() in loadUrlVideo after setting source
    - _Requirements: 3.4_
  - [x] 3.4 Write property test for session pair tracking
    - **Property 1: New Video Pairs Never Trigger Resume Prompt**
    - **Property 2: Current Session Pairs Are Tracked**
    - **Validates: Requirements 3.1, 3.3, 3.4**

- [x] 4. Fix base video controls overlap
  - [x] 4.1 Update CSS for base video container spacing
    - Add padding-bottom to #videoBaseContainer to reserve space for controls
    - Update #baseVideoControls with solid background and fixed height
    - Ensure video content is not cut off
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 5. Implement smart react controls positioning
  - [x] 5.1 Add controls position detection and update logic
    - Create updateReactControlsPosition() function in controls.ts
    - Detect when container is near bottom edge of viewport
    - Toggle 'controls-top' class based on position
    - _Requirements: 5.1, 5.2_
  - [x] 5.2 Add CSS for top-positioned controls
    - Add .reactControls.controls-top styles
    - Position controls at top with inverted gradient
    - Add smooth transition for position change
    - _Requirements: 5.2, 5.3_
  - [x] 5.3 Integrate position updates with drag/resize
    - Call updateReactControlsPosition() after drag ends
    - Call updateReactControlsPosition() after resize ends
    - Call updateReactControlsPosition() on window resize
    - _Requirements: 5.1, 5.4_
  - [x] 5.4 Write property test for controls accessibility
    - **Property 3: React Controls Remain Accessible**
    - **Validates: Requirements 5.1, 5.2, 5.3**

- [x] 6. Enhance UI visual design
  - [x] 6.1 Update control bar styling
    - Add solid background with backdrop blur to #baseVideoControls
    - Add subtle top border with accent color
    - Update .control-group with background and border
    - Add hover transform and shadow effects to .compact-btn
    - _Requirements: 6.1, 6.4, 6.5_
  - [x] 6.2 Update react container styling
    - Increase border-radius for softer appearance
    - Add layered box-shadow for depth
    - Enhance hover state with accent glow
    - Improve synced state visual feedback
    - _Requirements: 6.2, 6.3_
  - [x] 6.3 Polish control elements
    - Ensure consistent spacing throughout
    - Add min-height/min-width for touch targets
    - Improve slider thumb visibility
    - Add subtle animations to interactive elements
    - _Requirements: 6.5, 7.3_

- [x] 7. Checkpoint - Verify all changes work together
  - Test file picker shows MKV and other formats
  - Test tips screen closes when loading files
  - Test resume prompt only shows for previously saved sessions
  - Test base video is not cut off by controls
  - Test react controls are accessible at all positions
  - Verify UI looks polished and consistent
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive coverage
- Each task references specific requirements for traceability
- The resume prompt fix requires careful coordination between storage.ts and video-loading.ts
- UI changes should be tested across different viewport sizes
