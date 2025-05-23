import { checkCodecSupport, srt2webvtt, transcodeToMp4 } from './utils.js'; // srt2webvtt is used in loadSubtitles
import { setDelay } from './sync.js';

async function selectLocalVideo(videoX, callBack) {
  let input = document.createElement("input");
  input.type = "file";
  input.onchange = async (_this) => {
    let files = Array.from(input.files);
    if (files.length === 0) return;

    const file = files[0];
    const support = await checkCodecSupport(file);

    if (!support.supported) {
      console.warn(`Video codec not supported: ${support.reason}`);
      console.log('Attempting to transcode video using FFmpeg...');
      
      try {
        // Show loading indicator
        const originalTitle = document.title;
        document.title = '🔄 Transcoding video...';
        
        // Attempt transcoding
        const transcodedBlob = await transcodeToMp4(file);
        $(videoX).attr("src", URL.createObjectURL(transcodedBlob));
        $(videoX)[0].load();
        document.title = `${file.name} (transcoded)`;

        if (videoX === "#videoBaseLocal") {
          $("#videoBaseLocal").trigger("loadedmetadata");
        } else if (videoX === "#videoReact") {
          $("#videoReact").trigger("loadedmetadata");
          let tokens = file.name.split(".");
          let num = tokens.find(
            (token) => token.split("dt")[0] == "" && !isNaN(token.split("dt")[1])
          );
          if (num) {
            num = num.split("dt")[1];
            setDelay(Number(num) / 10);
          }
        }
        callBack && callBack(file);
        return;
        
      } catch (error) {
        console.error('FFmpeg transcoding failed:', error);
        document.title = originalTitle;
        
        // Fallback to user guidance
        const userChoice = confirm(
          `⚠️ Video Format Not Supported\n\n` +
          `Problem: ${support.reason}\n\n` +
          `Transcoding also failed: ${error.message}\n\n` +
          `Solutions:\n` +
          `1. Convert your video to MP4/H.264 format using:\n` +
          `   • HandBrake (free, recommended)\n` +
          `   • VLC Media Player (free)\n` +
          `   • FFmpeg (command line)\n` +
          `   • Online converters\n\n` +
          `2. Try using Microsoft Edge browser (better codec support)\n\n` +
          `Click OK to open HandBrake download page, or Cancel to choose a different video.`
        );
        
        if (userChoice) {
          window.open('https://handbrake.fr/downloads.php', '_blank');
        }
        return;
      }
    }

    // Video is supported, load normally
    $(videoX).attr("src", URL.createObjectURL(files[0]));
    $(videoX)[0].load();
    document.title = files[0].name;

    if (videoX === "#videoBaseLocal") {
      $("#videoBaseLocal").trigger("loadedmetadata");
    } else if (videoX === "#videoReact") {
      $("#videoReact").trigger("loadedmetadata");
      let tokens = file.name.split(".");
      let num = tokens.find(
        (token) => token.split("dt")[0] == "" && !isNaN(token.split("dt")[1])
      );
      if (num) {
        num = num.split("dt")[1];
        setDelay(Number(num) / 10);
      }
    }
    callBack && callBack(files[0]);
  };
  setTimeout(() => {
    input.click();
  }, 0);
}

function loadSubtitles() {
  let input = document.createElement("input");
  input.type = "file";
  input.onchange = (_this) => {
    let files = Array.from(input.files);
    if (files.length === 0) return;

    let file = files[0];
    let reader = new FileReader();
    reader.onload = (e) => {
      let fileText = e.target.result;
      let webvtt = srt2webvtt(fileText);
      $("#videoBaseLocal").append(
        `<track src="data:text/vtt;base64,${btoa(unescape(encodeURIComponent(webvtt)))}"
        kind="captions" srclang="en" label="English" default>`
      );
    };
    reader.readAsText(file);

    let name = file.name.split(".");
    name.pop();
    name = name.pop() || name[0] || "subtitles";
    $("#addSubBtn").text(name);
  };
  setTimeout(() => {
    input.click();
  }, 0);
}

export {
  selectLocalVideo,
  loadSubtitles
};
